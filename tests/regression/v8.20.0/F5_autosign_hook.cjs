#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.20.0) — sentinel-state-autosign: hook-side signing for the controller.
// =============================================================================
// PROBLEM (telemetry 2026-07-02): the pipeline-controller runs as a subagent
// with NO Bash tool, yet its spec tells it to write sentinel-state.json "via the
// signer" (agents/core/pipeline-controller.md:449) — impossible by construction.
// The state lands UNSIGNED, producing STATE_FILE_INIT_FAIL events and most of
// the corrective-loop noise (the biggest structural generator found).
//
// FIX: a PostToolUse (Write|Edit) hook signs a FRESHLY-WRITTEN, UNSIGNED
// sentinel-state.json inside a run dir. Posture guards:
//   - NEVER touches a file that already carries __signature (a present-but-
//     INVALID signature is tamper EVIDENCE — preserving it is the point);
//   - SKIPS under PIPELINE_HMAC_STRICT=true (strict posture must not gain an
//     auto-launder path);
//   - only run-dir sentinel-state.json files; anything else untouched;
//   - fail-open silent on any error (PostToolUse cannot deny anyway).
// Security delta vs today: none — unsigned is already TOLERATED by default;
// this only turns "tolerated" into "actually signed" on the legitimate path.
//
// EXPECTED RED: the hook file does not exist. GREEN after implementation.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f5-autosign-hook-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/sentinel-state-autosign.cjs');
const HOOKS_JSON = path.resolve(__dirname, '../../../hooks/hooks.json');
const signer = require('../../../lib/sentinel-state-signer.cjs');

function seedUnsigned(root, rel) {
  const p = path.join(root, ...rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    run_id: 'r1', pipeline_active: true, pipeline_doc_path: path.dirname(p), state_version: 1,
  }, null, 2));
  return p;
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}
function postWrite(root, filePath) {
  return { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: filePath }, cwd: root };
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f5-autosign-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } }
}

console.log('=== F5 v8.20.0 — sentinel-state-autosign (hook-side signing for the Bash-less controller) ===');

test('F5-S0 [NEW] the hook exists and is registered in hooks/hooks.json (PostToolUse)', () => {
  assert.equal(fs.existsSync(HOOK), true, 'hook file missing (RED today)');
  const manifest = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const post = manifest.hooks.PostToolUse || [];
  const registered = post.some((entry) => (entry.hooks || []).some(
    (h) => typeof h.command === 'string' && h.command.includes('sentinel-state-autosign.cjs')));
  assert.equal(registered, true, 'the hook must be wired into the PostToolUse manifest');
});

test('F5-S1 [NEW] an unsigned run-dir sentinel-state.json gets a VALID signature after Write', (root) => {
  const p = seedUnsigned(root, ['.pipeline', 'docs', 'run', 'sentinel-state.json']);
  const r = run(postWrite(root, p));
  assert.equal(r.status, 0, r.stderr);
  const st = readJson(p);
  assert.ok(st.__signature, 'the autosign hook must add __signature');
  const v = signer.verifyState(st, { key: signer.readHmacKey() });
  assert.equal(v.valid, true, 'the added signature must verify');
  assert.equal(st.run_id, 'r1', 'signed content preserves the state fields');
});

test('F5-S2 [NEW] a SIGNED file — valid or tampered — is NEVER touched (tamper evidence preserved)', (root) => {
  const p = path.join(root, '.pipeline', 'docs', 'run', 'sentinel-state.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const signed = signer.signState({ run_id: 'r1', pipeline_active: true }, signer.getOrCreateHmacKey());
  signed.run_id = 'tampered-after-signing'; // now INVALID on purpose
  fs.writeFileSync(p, JSON.stringify(signed, null, 2));
  const before = fs.readFileSync(p, 'utf8');
  const r = run(postWrite(root, p));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(p, 'utf8'), before, 'a present signature (even invalid) must be left as-is');
});

test('F5-S3 [NEW] PIPELINE_HMAC_STRICT=true skips the autosign (no laundering under strict)', (root) => {
  const p = seedUnsigned(root, ['.pipeline', 'docs', 'run', 'sentinel-state.json']);
  const before = fs.readFileSync(p, 'utf8');
  const r = run(postWrite(root, p), { PIPELINE_HMAC_STRICT: 'true' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(p, 'utf8'), before, 'strict posture must not gain an auto-sign path');
});

test('F5-S4 [NEW] files outside a run dir / other names are untouched; garbage JSON is fail-open', (root) => {
  const other = seedUnsigned(root, ['src', 'sentinel-state.json']);
  const beforeOther = fs.readFileSync(other, 'utf8');
  let r = run(postWrite(root, other));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(other, 'utf8'), beforeOther, 'a sentinel-state.json outside .pipeline/pipeline-runs is not signed');

  const notState = path.join(root, '.pipeline', 'docs', 'run', 'notes.json');
  fs.mkdirSync(path.dirname(notState), { recursive: true });
  fs.writeFileSync(notState, '{"a":1}');
  r = run(postWrite(root, notState));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(notState, 'utf8'), '{"a":1}', 'other filenames untouched');

  const garbage = path.join(root, '.pipeline', 'docs', 'run', 'sentinel-state.json');
  fs.writeFileSync(garbage, '{not json');
  r = run(postWrite(root, garbage));
  assert.equal(r.status, 0, 'garbage input must fail open (exit 0)');
  assert.equal(fs.readFileSync(garbage, 'utf8'), '{not json', 'garbage content untouched');
});

test('F5-S5 [NEW] a pipeline-runs/ (spec authoring) run dir is also covered', (root) => {
  const p = seedUnsigned(root, ['pipeline-runs', '001-abc-spec', 'sentinel-state.json']);
  const r = run(postWrite(root, p));
  assert.equal(r.status, 0, r.stderr);
  const st = readJson(p);
  assert.ok(st.__signature, 'spec-authoring run dirs get the same treatment');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
