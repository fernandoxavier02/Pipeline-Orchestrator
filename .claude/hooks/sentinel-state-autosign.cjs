#!/usr/bin/env node
'use strict';

// =============================================================================
// sentinel-state-autosign.cjs — v8.20.0 (PostToolUse Write|Edit|MultiEdit|NotebookEdit)
// =============================================================================
// Hook-side signing for the Bash-less controller. The pipeline-controller runs
// as a subagent with NO Bash tool, yet its spec tells it to write
// sentinel-state.json "via the signer" (agents/core/pipeline-controller.md
// STEP 3) — impossible by construction. The state landed UNSIGNED, producing
// STATE_FILE_INIT_FAIL events and most of the corrective-loop noise (telemetry
// audit 2026-07-02). This hook signs a FRESHLY-WRITTEN, UNSIGNED
// sentinel-state.json inside a run dir, so the controller's plain Write is
// enough.
//
// POSTURE GUARDS (F5 v8.20.0):
//   - NEVER touches a file that already carries __signature — a present-but-
//     INVALID signature is tamper EVIDENCE and preserving it is the point.
//   - SKIPS under PIPELINE_HMAC_STRICT=true — the strict posture must not gain
//     an auto-launder path.
//   - Only run-dir sentinel-state.json files (.pipeline/docs/** or
//     pipeline-runs/**); everything else untouched.
//   - Fail-open silent on any error (PostToolUse cannot deny anyway).
//
// SECURITY DELTA vs the shipped default: none. Unsigned state is already
// UNSIGNED-TOLERATED by every verifier (two-tier convention); this only turns
// "tolerated" into "actually signed" on the legitimate write path.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }
let lock = null;
try { lock = require('../../lib/exclusive-lock.cjs'); } catch { lock = null; }

const TOOL_RE = /^(Write|Edit|MultiEdit|NotebookEdit)$/;

// A run-dir sentinel-state.json: inside a .pipeline/docs/** run dir (FULL et al.)
// or a pipeline-runs/** run dir (spec authoring).
function isRunDirStatePath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (path.basename(p) !== 'sentinel-state.json') return false;
  const norm = p.replace(/\\/g, '/');
  return /\/\.pipeline\/docs\//.test(norm) || /\/pipeline-runs\//.test(norm);
}

function autosign(filePath) {
  if (String(process.env.PIPELINE_HMAC_STRICT || '') === 'true') return; // strict never auto-launders
  if (!signer || typeof signer.signState !== 'function') return;
  const doSign = () => {
    let raw;
    try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return; }
    let state;
    try { state = JSON.parse(raw); } catch { return; } // not JSON → not ours to fix
    if (!state || typeof state !== 'object' || Array.isArray(state)) return;
    // A PRESENT signature — valid or not — is never touched: invalid = evidence.
    if (Object.prototype.hasOwnProperty.call(state, '__signature')) return;
    let key = null;
    try { key = typeof signer.getOrCreateHmacKey === 'function' ? signer.getOrCreateHmacKey() : null; }
    catch { key = null; }
    if (!key) return; // no durable key → stays unsigned-tolerated (same convention as signState)
    let signed;
    try { signed = signer.signState(state, key); } catch { return; }
    const tmp = `${filePath}.${process.pid}.autosign.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(signed, null, 2));
      fs.renameSync(tmp, filePath);
    } catch {
      try { fs.unlinkSync(tmp); } catch { /* */ }
    }
  };
  try {
    if (lock && typeof lock.withLock === 'function') lock.withLock(filePath, doSign);
    else doSign();
  } catch { /* fail-open */ }
}

function handlePostToolUse(payload) {
  if (!payload || typeof payload !== 'object') return;
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  if (!TOOL_RE.test(tool)) return;
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const filePath = typeof input.file_path === 'string' ? input.file_path
    : (typeof input.notebook_path === 'string' ? input.notebook_path : '');
  if (!isRunDirStatePath(filePath)) return;
  autosign(filePath);
}

if (require.main === module) {
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try { handlePostToolUse(JSON.parse(String(s).trim() || '{}')); } catch { /* fail-open */ }
    process.exit(0);
  });
}

module.exports = { isRunDirStatePath, autosign, handlePostToolUse };
