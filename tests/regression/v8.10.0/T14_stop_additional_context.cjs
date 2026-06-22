#!/usr/bin/env node
'use strict';

// =============================================================================
// T14 (v8.10.0) — REQ-STOP-RECOVER: additive additionalContext on the stop-gate
// block. TDD RED phase. EXTENDS the SHIPPED .claude/hooks/stop-gate-hook.cjs so
// that where it returns { decision:'block', reason } it ALSO emits
// hookSpecificOutput.additionalContext = the exact reachable next action. Covers
// user-APPROVED scenarios T14-S1..S5.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The SHIPPED hook emits ONLY { decision:'block', reason } on a block
// (stop-gate-hook.cjs:196 → process.stdout.write(JSON.stringify({ decision:'block',
// reason }))). It carries NO hookSpecificOutput.additionalContext. So:
//   T14-S1 — FAILS: the armed-incomplete block has a reason but additionalContext
//            is absent — a real behavioral assertion (block shipped, context not).
//   T14-S2 — PASSES today (unarmed allows) and must keep passing after the addition
//            — the guard that the additionalContext change did NOT arm the gate.
//   T14-S3/S4/S5 — REGRESSION PINS expressed as "the shipped F5 scenario still
//            holds": cleanup-reorder/H3 (S3), 3-cap→hard_failed (S4), SessionEnd/
//            StopFailure recovery (S5). These re-assert the SHIPPED behaviors that
//            the additive change must not disturb — they pass today and must keep
//            passing. We DO NOT rewrite the shipped F5 tests; we re-pin the exact
//            properties here against the same hook so a regression in this task is
//            caught locally too.
// The hook EXISTS, so S1's failure is a real assertion (missing additionalContext),
// never an ImportError — a valid behavioral RED.
//
// Q3 / AC-3:
//   deny-bad   : T14-S1 (armed incomplete → block; now must carry additionalContext).
//   allow-good : T14-S2 (unarmed default → allow, additionalContext didn't arm it).
//   recovery   : T14-S4 (3-cap → hard_failed pass-through unchanged).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't14-stop-additional-context-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '../../../.claude/hooks');
const GATE = path.join(HOOKS, 'stop-gate-hook.cjs');
const CLEANUP = path.join(HOOKS, 'session-cleanup-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

const ARMED = { PIPELINE_STOP_BLOCK_ENFORCEMENT: 'deny' };

function gateExists() { return fs.existsSync(GATE); }
function cleanupExists() { return fs.existsSync(CLEANUP); }

function seedRun(root, state) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  }, state || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}
function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}
function run(payload, env) {
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}
function runCleanup(payload, env) {
  return spawnSync(process.execPath, [CLEANUP], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}
function seedSessionLock(root, sessionId) {
  const sessionsDir = path.join(root, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const lockPath = path.join(sessionsDir, `${sessionId}.lock`);
  fs.writeFileSync(lockPath, JSON.stringify({ session_id: sessionId, status: 'active', acquired_at: Date.now() }, null, 2));
  return lockPath;
}
function readLock(lockPath) { try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return null; } }

function decisionOf(r) {
  try { const out = JSON.parse(r.stdout || '{}'); return out.decision || (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision); }
  catch { return undefined; }
}
function reasonOf(r) {
  try { const out = JSON.parse(r.stdout || '{}'); return out.reason || ''; } catch { return ''; }
}
function additionalContextOf(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    return (out.hookSpecificOutput && out.hookSpecificOutput.additionalContext) || out.additionalContext || '';
  } catch { return ''; }
}

const stopPayload = (root) => ({ hook_event_name: 'Stop', cwd: root });
const stopWithSession = (root, sessionId) => ({ hook_event_name: 'Stop', cwd: root, session_id: sessionId });
const sessionEndPayload = (root) => ({ hook_event_name: 'SessionEnd', reason: 'user_interrupt', cwd: root });
const stopFailurePayload = (root) => ({ hook_event_name: 'StopFailure', cwd: root });

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-context-t14-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T14 v8.10.0 — additionalContext on stop-gate block (RED until stop-gate-hook.cjs adds additionalContext) ===');

// ---- T14-S1 [main] armed incomplete block carries reason AND additionalContext
liveTest('T14-S1 [main] armed + incomplete governed run → block carries BOTH reason AND hookSpecificOutput.additionalContext', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE}`);
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', r.stdout || '(armed + incomplete must block)');
  assert.ok(reasonOf(r).trim().length > 0, 'the shipped reason must still be present');
  const ac = additionalContextOf(r);
  assert.ok(ac.trim().length > 0,
    'the block must ALSO carry hookSpecificOutput.additionalContext describing a reachable next action ' +
    '(which pending dispatch to resolve / what step is incomplete) — absent today, this is the RED');
});

// ---- T14-S2 [allow-good / default unarmed] no env → still allows -------------
liveTest('T14-S2 [allow-good] no enforcement env (default) → incomplete run still ALLOWS; additionalContext did not arm the gate', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE}`);
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  const r = run(stopPayload(root), { PIPELINE_DOC_PATH: docDir }); // no arm
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'the additionalContext addition must NOT change the unarmed default — an unconfigured operator still stops freely');
});

// ---- T14-S3 [regression — H3 cleanup-reorder] -------------------------------
liveTest('T14-S3 [regression/H3] incomplete governed run → session-cleanup still does NOT mark the lock completed', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE}`);
  assert.ok(cleanupExists(), `cleanup hook missing: ${CLEANUP}`);
  const sessionId = 'sess-T14-S3';
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  const lockPath = seedSessionLock(root, sessionId);
  const r = runCleanup(stopWithSession(root, sessionId), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const lockAfter = readLock(lockPath) || {};
  assert.notEqual(lockAfter.status, 'completed',
    'H3 reorder must hold after the additive change: an incomplete governed run leaves the lock NOT completed');
});

// ---- T14-S4 [regression — 3-cap → hard_failed] ------------------------------
liveTest('T14-S4 [regression] armed continuity cap → still writes hard_failed terminal and ALLOWS (cap path unchanged)', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE}`);
  const { docDir, statePath } = seedRun(root, { status: 'running', continuity_attempts: 2 });
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'the 3rd continuity must convert to hard_failed, not a 3rd block');
  const after = readState(statePath) || {};
  assert.equal(after.terminal_state || after.status, 'hard_failed',
    'the 3-cap hard_failed terminal write must be unchanged by the additionalContext addition');
});

// ---- T14-S5 [regression — SessionEnd / StopFailure recovery] ----------------
liveTest('T14-S5 [regression] SessionEnd + StopFailure → still allow, never mark completed, never delete evidence', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE}`);
  const { docDir, statePath } = seedRun(root, { status: 'running' });
  const evidence = path.join(docDir, 'gate-decisions.jsonl');
  fs.writeFileSync(evidence, '{"gate":"X"}\n');

  const rEnd = run(sessionEndPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(rEnd.status, 0, rEnd.stderr);
  assert.notEqual(decisionOf(rEnd), 'block', 'SessionEnd must never block teardown');
  let after = readState(statePath) || {};
  assert.notEqual(after.status, 'completed', 'SessionEnd must not mark the run completed');
  assert.ok(fs.existsSync(evidence), 'SessionEnd must keep evidence recoverable');

  const rFail = run(stopFailurePayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(rFail.status, 0, rFail.stderr);
  assert.notEqual(decisionOf(rFail), 'block', 'StopFailure must never block teardown');
  after = readState(statePath) || {};
  assert.notEqual(after.status, 'completed', 'StopFailure must never declare success');
  assert.ok(fs.existsSync(evidence), 'StopFailure must keep evidence recoverable');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until stop-gate-hook.cjs emits additionalContext on block):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
