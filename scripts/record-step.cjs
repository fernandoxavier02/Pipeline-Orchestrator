#!/usr/bin/env node
'use strict';

// scripts/record-step.cjs (v8.7.0) — generic step-ledger stamping.
//
// Records a completed workflow step into a run's HMAC-signed sentinel-state.json
// by read-merge-resigning state.step_ledger (append-if-absent → idempotent). The
// step-ledger-gate (PreToolUse:Agent) reads step_ledger to enforce phase order.
// Mirrors scripts/record-spec-step.cjs (same signer, same path-traversal guard,
// same corrupt-state refusal). Step vocabulary = the union of all workflow
// manifests in lib/step-ledger.cjs (anti-invention guard).
//
// Usage (called deterministically by the PostToolUse:Agent stamp hook, or by a
// controller, after a governed agent completes):
//   node record-step.cjs <pipelineDocPath> <step>

const fs = require('node:fs');
const path = require('node:path');
const { writeSignedState, verifyState, readHmacKey } = require(path.join(__dirname, '..', 'lib', 'sentinel-state-signer.cjs'));
const { STEP_MANIFESTS } = require(path.join(__dirname, '..', 'lib', 'step-ledger.cjs'));

const STEP_VOCAB = new Set(Object.values(STEP_MANIFESTS).flat());

function capped(x) { return String(x).slice(0, 64); }

function resolveSafeStatePath(pipelineDocPath) {
  const segments = String(pipelineDocPath).split(/[\\/]+/);
  if (segments.includes('..')) return { ok: false, error: 'pipelineDocPath outside allowed run root' };
  const resolvedDoc = path.resolve(pipelineDocPath);
  const statePath = path.resolve(resolvedDoc, 'sentinel-state.json');
  if (path.dirname(statePath) !== resolvedDoc) return { ok: false, error: 'pipelineDocPath outside allowed run root' };
  return { ok: true, statePath, resolvedDoc };
}

function readState(statePath) {
  let raw;
  try { raw = fs.readFileSync(statePath, 'utf8'); } catch (_) { return {}; }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (_) {
    throw new Error('refusing to overwrite corrupt sentinel-state.json (JSON parse failed)');
  }
  if (!obj || typeof obj !== 'object') return {};
  // SEC-1: before TRUSTING/MERGING/RE-SIGNING, verify the existing signature.
  // A PRESENT-but-INVALID signature means a forged/tampered state — refuse to
  // launder it into a validly-signed one. Unsigned/key-unavailable stays
  // tolerated (migration). Verify-failure (throw) is tolerated.
  let v;
  try { v = verifyState(obj, { key: readHmacKey() }); }
  catch (_) { v = { valid: true }; }
  if (v && v.valid === false && v.unsigned !== true && v.key_unavailable !== true) {
    throw new Error('refusing to write over an invalidly-signed state');
  }
  return obj;
}

function recordStep(pipelineDocPath, step) {
  if (typeof pipelineDocPath !== 'string' || !pipelineDocPath) return { ok: false, error: 'pipelineDocPath required' };
  if (typeof step !== 'string' || !STEP_VOCAB.has(step)) return { ok: false, error: `unknown step: ${capped(step)}` };

  const safe = resolveSafeStatePath(pipelineDocPath);
  if (!safe.ok) return safe;

  let state;
  try { state = readState(safe.statePath); } catch (err) { return { ok: false, error: err.message }; }

  if (Object.keys(state).length === 0 && !fs.existsSync(safe.statePath)) {
    const manifestPath = path.join(safe.resolvedDoc, 'manifest.yaml');
    if (fs.existsSync(manifestPath)) return { ok: false, error: 'sentinel-state.json missing from an initialized run dir' };
  }

  const prev = Array.isArray(state.step_ledger) ? state.step_ledger : [];
  const ledger = prev.includes(step) ? prev.slice() : [...prev, step]; // idempotent append

  const merged = { ...state, step_ledger: ledger, updated_at: new Date().toISOString() };
  try { writeSignedState(safe.statePath, merged); }
  catch (err) { return { ok: false, error: `failed to write signed state: ${err.message}` }; }

  return { ok: true, step, step_ledger: ledger };
}

// Increments state.fix_loop_attempts (signed). Called by the stamp hook on each
// executor-fix completion so the fix-loop gate can deny the (max+1)th attempt.
function recordFixAttempt(pipelineDocPath) {
  if (typeof pipelineDocPath !== 'string' || !pipelineDocPath) return { ok: false, error: 'pipelineDocPath required' };
  const safe = resolveSafeStatePath(pipelineDocPath);
  if (!safe.ok) return safe;
  let state;
  try { state = readState(safe.statePath); } catch (err) { return { ok: false, error: err.message }; }
  const prev = Number.isFinite(state.fix_loop_attempts) ? state.fix_loop_attempts : 0;
  const merged = { ...state, fix_loop_attempts: prev + 1, updated_at: new Date().toISOString() };
  try { writeSignedState(safe.statePath, merged); }
  catch (err) { return { ok: false, error: `failed to write signed state: ${err.message}` }; }
  return { ok: true, fix_loop_attempts: prev + 1 };
}

module.exports = { recordStep, recordFixAttempt, STEP_VOCAB };

if (require.main === module) {
  const [docPath, step] = process.argv.slice(2);
  if (!docPath || !step) {
    process.stderr.write('usage: record-step.cjs <pipelineDocPath> <step>\n');
    process.exit(2);
  }
  const res = recordStep(docPath, step);
  if (res.ok) { process.stdout.write(JSON.stringify(res) + '\n'); process.exit(0); }
  process.stderr.write('record-step error: ' + res.error + '\n');
  process.exit(1);
}
