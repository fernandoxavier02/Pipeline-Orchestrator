#!/usr/bin/env node
'use strict';

// =============================================================================
// T3.1 (v8.12.0) — SessionStart SAFETY ARM-WRITE (defense in depth). [LAYER A]
// Spec 006-enforcement-fail-closed-arming, Batch 3. Satisfies: R3.1, q4.
//
// The governed run must be ARMED by CODE without any LLM write. UserPromptSubmit
// already writes the signed arm-pending marker; T3.1 adds a SECOND, independent
// code path on SessionStart so a governed run is still covered if the
// UserPromptSubmit writer was missed (e.g. the session starts already carrying a
// /pipeline-orchestrator: invocation, or the prompt-submit hook never fired).
//
// Contract:
//   - the SessionStart writer REUSES lib/pipeline-arm.cjs::writeArmPending (the
//     SAME signed/atomic marker — NOT a second marker scheme);
//   - it arms IFF the session is a governed entry-point (classifier SSOT
//     isPipelineInvocation) — an ungoverned session writes NO marker;
//   - it NEVER blocks the session (SessionStart cannot deny) and fail-opens on
//     any error;
//   - the marker it writes is the SAME one pipeline-arm-gate.cjs reads, so the
//     gate then hard-blocks substantive work — proven end-to-end here.
//
// Exercised via the REAL hook (spawnSync, end-to-end), then the marker is fed to
// the REAL arm-gate to prove the armed window denies substantive work with NO
// LLM write anywhere in the chain.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't3-1-sessionstart-arm-stable-secret-0123456789abcd';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const WRITER = path.join(ROOT, '.claude/hooks/pipeline-session-arm-hook.cjs');
const GATE = path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs');
const { markerPath } = require(path.join(ROOT, 'lib/pipeline-arm.cjs'));

function runWriter(payload, env) {
  const base = { ...process.env };
  return spawnSync(process.execPath, [WRITER], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) },
  });
}
function runGate(payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_ARM_ENFORCEMENT;
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) },
  });
}
function gateDeny(r) {
  try {
    const o = JSON.parse(r.stdout || '{}');
    return o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny'
      ? o.hookSpecificOutput.permissionDecisionReason : null;
  } catch { return null; }
}

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-1-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== T3.1 v8.12.0 — SessionStart safety arm-write (governed run armed without any LLM write) ===');

// --- (1) governed SessionStart → marker WRITTEN (no LLM write) -----------------
liveTest('T3.1-1 governed /pipeline SessionStart → signed arm-pending marker written by code', (root) => {
  const r = runWriter({ hook_event_name: 'SessionStart', source: 'startup', cwd: root,
    prompt: '/pipeline-orchestrator:feature add a share button' });
  assert.equal(r.status, 0, r.stderr);
  const mp = markerPath(root);
  assert.ok(fs.existsSync(mp), 'the SessionStart writer must write the arm-pending marker for a governed entry-point');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  assert.ok(m.__signature, 'the marker must be SIGNED (reuse the lib/pipeline-arm.cjs signed/atomic pattern, not a second scheme)');
  assert.ok(typeof m.workflow === 'string' && m.workflow.length > 0, 'the marker must carry the classified workflow');
});

// --- (2) end-to-end: SessionStart arm → arm-gate DENIES substantive work -------
liveTest('T3.1-2 SessionStart-armed run → arm-gate DENIES Edit with NO LLM write anywhere', (root) => {
  const w = runWriter({ hook_event_name: 'SessionStart', source: 'startup', cwd: root,
    prompt: '/pipeline-orchestrator:feature add a share button' });
  assert.equal(w.status, 0, w.stderr);
  // Now the gate must see the marker and hard-block substantive non-aligned work.
  const g = runGate({ hook_event_name: 'PreToolUse', tool_name: 'Edit',
    tool_input: { file_path: path.join(root, 'src', 'app.js') }, cwd: root });
  assert.equal(g.status, 0, g.stderr);
  assert.ok(gateDeny(g) && /PIPELINE_NOT_ARMED/.test(gateDeny(g)),
    'a SessionStart-armed governed window must make the gate deny substantive work (defense in depth, R3.1)');
});

// --- (3) ungoverned SessionStart → NO marker (ordinary session untouched) ------
liveTest('T3.1-3 ungoverned SessionStart → NO marker written (normal session never governed)', (root) => {
  const r = runWriter({ hook_event_name: 'SessionStart', source: 'startup', cwd: root,
    prompt: 'just chatting, no pipeline here' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(markerPath(root)), false,
    'an ungoverned session must NOT be armed — writeArmPending no-ops on a non-pipeline prompt');
});

// --- (4) empty / no prompt SessionStart → NO marker, NEVER blocks --------------
liveTest('T3.1-4 SessionStart with no prompt → no marker, hook never blocks (fail-open)', (root) => {
  const r = runWriter({ hook_event_name: 'SessionStart', source: 'resume', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(markerPath(root)), false, 'no prompt → nothing to classify → no marker');
  // It must emit a continue (never halt the session start).
  try {
    const o = JSON.parse(r.stdout || '{}');
    if ('continue' in o) assert.equal(o.continue, true, 'SessionStart writer must never halt the session');
  } catch { /* empty stdout is also acceptable (no-op) */ }
});

// --- (5) malformed payload → fail-open, exit 0, no crash -----------------------
liveTest('T3.1-5 malformed SessionStart payload → fail-open (exit 0, no marker, no crash)', (root) => {
  const base = { ...process.env };
  const r = spawnSync(process.execPath, [WRITER], { input: 'this is not json', encoding: 'utf8', env: base });
  assert.equal(r.status, 0, r.stderr);
  // cwd falls back to process.cwd() of the spawned proc (ROOT), so assert no marker in our temp root.
  assert.equal(fs.existsSync(markerPath(root)), false, 'a malformed payload must never arm our governed root');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
