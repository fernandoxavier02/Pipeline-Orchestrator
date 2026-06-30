#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.19.1) — Stop gate consumes the arm-pending marker on a deliberate close.
// =============================================================================
// BUG: the arm-pending marker (.pipeline/pipeline-arm-pending.json) is enforcement
// CONTROL state written by the UserPromptSubmit wiring the instant a /pipeline command
// is submitted. Nothing CONSUMED it when a run ended deliberately — only TTL expiry
// (30 min) or a session restart (v8.18.0 session isolation) cleared it. So a finished
// code-mutating run left its still-live marker in place, and the arm-gate kept blocking
// the NEXT non-pipeline task in the SAME session with PIPELINE_NOT_ARMED for up to 30 min
// (the live deadlock: a REVIEW-ONLY run does NOT arm — see lib/pipeline-arm.cjs — so the
// real trigger is a FULL/code run that armed, completed, and was never disarmed).
//
// FIX: the stop-gate-hook (the authoritative Stop-event owner of the terminal state)
// clears the marker on the closed-run ALLOW paths (completed / hard_failed / sealed /
// inactive) — NEVER on a block, NEVER on SessionEnd/StopFailure recovery, NEVER on corrupt
// state, and NEVER a marker that belongs to a DIFFERENT session (concurrent-run safety).
//
// EXPECTED RED (before the fix): S1/S2/S5 fail (marker still present after a clean close).
// EXPECTED GREEN (after the fix): every scenario passes.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f1-arm-consume-on-close-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const signer = require('../../../lib/sentinel-state-signer.cjs');
const { writeSignedState } = signer;
const arm = require('../../../lib/pipeline-arm.cjs');

// Seed a run dir + signed sentinel + active pointer (mirrors F4 v8.19.0).
function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r1', pipeline_active: false, pipeline_doc_path: docDir,
    state_version: 1, current_phase: '3-closure', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r1', updated_at: '2026-06-30T00:00:00.000Z' }, null, 2));
  return { docDir, statePath };
}

// Seed the arm-pending marker. `sid` stamps a session_id (omit → legacy/sessionless).
function seedMarker(root, sid) {
  const p = path.join(root, '.pipeline', 'pipeline-arm-pending.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const m = { requested_at: '2026-06-30T11:59:00.000Z', workflow: 'FULL', mode: 'FULL' };
  if (sid) m.session_id = sid;
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
  return p;
}

// A signed-then-corrupted marker: the signature no longer verifies → markerIsTampered.
function seedTamperedMarker(root) {
  const p = path.join(root, '.pipeline', 'pipeline-arm-pending.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const key = signer.getOrCreateHmacKey();
  const signed = signer.signState({ requested_at: '2026-06-30T11:59:00.000Z', workflow: 'FULL' }, key);
  signed.workflow = 'TAMPERED-AFTER-SIGNING'; // corrupt a signed field
  fs.writeFileSync(p, JSON.stringify(signed, null, 2));
  return p;
}

function run(payload, env) {
  const base = { ...process.env }; delete base.PIPELINE_STOP_BLOCK_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function stopPayload(root, event, sid) {
  const p = { hook_event_name: event || 'Stop', cwd: root };
  if (sid) p.session_id = sid;
  return p;
}
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-armclose-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F1 v8.19.1 — Stop gate consumes the arm marker on a deliberate close ===');

// ---- S1: completed (terminal) run → marker consumed --------------------------
liveTest('F1-S1 [completed] a terminal completed run clears the arm marker on Stop', (root) => {
  seedRun(root, { status: 'completed', terminal_state: 'completed' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(p), false, 'a completed run must consume the arm marker (RED today: still present)');
});

// ---- S2: inactive non-spec run (the user's exact scenario) → marker consumed --
liveTest('F1-S2 [inactive] an inactive FULL run clears the marker so the next non-pipeline task is not blocked', (root) => {
  seedRun(root, { pipeline_active: false, workflow: 'FULL' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'an inactive non-spec run closes cleanly');
  assert.equal(fs.existsSync(p), false, 'the live marker must be consumed on a deliberate inactive close (RED today: still present)');
});

// ---- S3: incomplete ARMED active run that BLOCKS → marker PRESERVED -----------
liveTest('F1-S3 [block-preserves] a blocking incomplete active run does NOT clear the marker (no un-govern)', (root) => {
  seedRun(root, { pipeline_active: true, current_phase: '2-execution' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'an incomplete armed active run blocks');
  assert.equal(fs.existsSync(p), true, 'a blocked (still-live) run must KEEP its marker — clearing would un-govern it');
});

// ---- S4: marker from a DIFFERENT session → PRESERVED (concurrent-run safety) --
liveTest('F1-S4 [cross-session] an inactive close does NOT clear a marker stamped with another session_id', (root) => {
  seedRun(root, { pipeline_active: false, workflow: 'FULL' });
  const p = seedMarker(root, 'session-OTHER');
  const r = run(stopPayload(root, 'Stop', 'session-THIS'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(p), true, 'a marker belonging to another session must be left untouched');
});

// ---- S5: marker with MATCHING session → consumed -----------------------------
liveTest('F1-S5 [same-session] an inactive close clears a marker stamped with THIS session_id', (root) => {
  seedRun(root, { pipeline_active: false, workflow: 'FULL' });
  const p = seedMarker(root, 'session-THIS');
  const r = run(stopPayload(root, 'Stop', 'session-THIS'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(p), false, 'a same-session marker must be consumed on a deliberate close');
});

// ---- S6: SessionEnd recovery → marker PRESERVED (recovery never disarms) ------
liveTest('F1-S6 [recovery] SessionEnd does NOT clear the marker (recovery path; session-iso + TTL handle it)', (root) => {
  seedRun(root, { pipeline_active: false, workflow: 'FULL' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'SessionEnd'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(p), true, 'SessionEnd is recovery — the marker is left for session-isolation / TTL to handle');
});

// ---- S7: direct unit check — POSITIVE-OWNERSHIP + tamper semantics -----------
liveTest('F1-S7 [unit] clearArmPendingForSession requires PROVABLE ownership and preserves tampered/ambiguous', (root) => {
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true });
  // both sessionless → cleared (no session model in use)
  let p = seedMarker(root);
  assert.equal(arm.clearArmPendingForSession(root, undefined), true, 'both-sessionless marker is clearable');
  assert.equal(fs.existsSync(p), false);
  // sessionless marker + caller WITH a session → AMBIGUOUS → preserved (cannot prove ownership)
  p = seedMarker(root);
  assert.equal(arm.clearArmPendingForSession(root, 'whatever'), false, 'sessionless marker + session caller is ambiguous → preserved');
  assert.equal(fs.existsSync(p), true);
  fs.rmSync(p);
  // stamped 'A' + caller 'B' → preserved
  p = seedMarker(root, 'A');
  assert.equal(arm.clearArmPendingForSession(root, 'B'), false, 'cross-session marker is preserved');
  assert.equal(fs.existsSync(p), true);
  // stamped 'A' + caller absent → AMBIGUOUS → preserved
  assert.equal(arm.clearArmPendingForSession(root, undefined), false, 'stamped marker + sessionless caller is ambiguous → preserved');
  assert.equal(fs.existsSync(p), true);
  // stamped 'A' + caller 'A' → cleared
  assert.equal(arm.clearArmPendingForSession(root, 'A'), true, 'same-session marker is cleared');
  assert.equal(fs.existsSync(p), false);
  // tampered (signed-but-invalid) marker → preserved (stays governed)
  p = seedTamperedMarker(root);
  assert.equal(arm.clearArmPendingForSession(root, undefined), false, 'tampered marker is preserved (parity with verify-on-read)');
  assert.equal(fs.existsSync(p), true, 'a tampered marker must stay on disk so the window stays governed');
  fs.rmSync(p);
  // absent marker → false (nothing to clear)
  assert.equal(arm.clearArmPendingForSession(root, 'A'), false, 'absent marker is a no-op');
});

// ---- S8: GO completion signal (B1 happy-path completer) → marker consumed -----
liveTest('F1-S8 [go-completer] a GO completion signal closes the run and consumes the marker', (root) => {
  seedRun(root, { pipeline_active: true, final_decision: 'GO' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a GO signal closes the run cleanly');
  assert.equal(fs.existsSync(p), false, 'the GO-completer path must consume the marker');
});

// ---- S9: sealed spec run (spec-seal completer) → marker consumed --------------
liveTest('F1-S9 [spec-seal] a sealed spec run consumes the marker', (root) => {
  seedRun(root, { spec_authoring_progress: { intake: 'done' }, final_decision: 'SEALED', current_phase: '9-seal' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a sealed spec run closes cleanly');
  assert.equal(fs.existsSync(p), false, 'the spec-seal path must consume the marker');
});

// ---- S10: continuity cap → hard_failed terminal → marker consumed -------------
liveTest('F1-S10 [hard-failed-cap] the continuity cap converts to hard_failed and consumes the marker', (root) => {
  seedRun(root, { pipeline_active: true, continuity_attempts: 2, current_phase: '2-execution' });
  const p = seedMarker(root);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: path.join(root, '.pipeline', 'docs', 'run') });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'at the cap the gate must not block a 3rd time');
  assert.equal(fs.existsSync(p), false, 'the hard_failed cap path must consume the marker');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
