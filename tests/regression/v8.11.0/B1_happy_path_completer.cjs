#!/usr/bin/env node
'use strict';

// =============================================================================
// B1 (v8.11.0) — REQ-HAPPY-PATH-COMPLETER: stop-gate-hook persists a terminal
// 'completed' on the HAPPY PATH so arming the Stop block (B5) cannot deadlock a
// run that actually finished. TDD RED phase — the hook does NOT yet write
// 'completed' (today it only ever writes 'hard_failed').
//
// CONTRACT under test:
//   On the Stop event, when the active governed run carries a REAL success
//   completion signal (sentinel.final_decision GO, OR a CLOSEOUT_CONFIRM /
//   PA_DE_CAL gate-decisions line whose decision maps to GO), persist
//   terminal_state='completed' into the SIGNED sentinel-state (locked re-read →
//   verify → bump → re-sign), then allow.
//   NEVER mark 'completed' on SessionEnd / StopFailure (recovery path — never
//   declare success). NEVER mark 'completed' on a NO-GO / absent signal.
//
// Hook-as-process: spawn the real hook with a Stop payload on stdin; assert the
// state side effect (terminal_state) + signature integrity. Default-OFF arming
// is irrelevant here — writeCompleted is independent of PIPELINE_STOP_BLOCK_ENFORCEMENT.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b1-happy-path-completer-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

const GO_CLOSEOUT = { gate: 'CLOSEOUT_CONFIRM', hardness: 'SOFT', decision: 'CONFIRMED', decided_by: 'spec-closer', timestamp: '2026-06-21T01:00:00.000Z' };
const GO_PADECAL = { gate: 'PA_DE_CAL', hardness: 'HARD', decision: 'APPROVED', decided_by: 'final-validator', timestamp: '2026-06-21T01:00:00.000Z' };
const NOGO_PADECAL = { gate: 'PA_DE_CAL', hardness: 'HARD', decision: 'BLOCKED', decided_by: 'final-validator', timestamp: '2026-06-21T01:00:00.000Z' };

function seedRun(root, extra, gateLines) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rB1', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1, current_phase: 'phase-3-closeout', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rB1', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  if (gateLines && gateLines.length) {
    fs.writeFileSync(path.join(docDir, 'gate-decisions.jsonl'), gateLines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
  return { docDir, statePath };
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}
function stopPayload(root, event) { return { hook_event_name: event || 'Stop', cwd: root }; }
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function terminalOf(p) { const s = readState(p) || {}; return s.terminal_state || s.status || null; }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b1-happy-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== B1 v8.11.0 — happy-path completer (RED until stop-gate-hook writes terminal_state=completed) ===');

// ---- B1-S1: Stop + CLOSEOUT_CONFIRM GO → terminal_state='completed' ----------
liveTest('B1-S1 [happy] Stop with a CLOSEOUT_CONFIRM=GO signal persists terminal_state=completed', (root) => {
  const { docDir, statePath } = seedRun(root, {}, [GO_CLOSEOUT]);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(terminalOf(statePath), 'completed', 'a GO completion signal on Stop must persist terminal_state=completed');
});

// ---- B1-S2: Stop + sentinel.final_decision='GO' → completed ------------------
liveTest('B1-S2 [happy] Stop with sentinel.final_decision=GO persists terminal_state=completed', (root) => {
  const { docDir, statePath } = seedRun(root, { final_decision: 'GO' });
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(terminalOf(statePath), 'completed', 'a GO in sentinel.final_decision on Stop must persist completed');
});

// ---- B1-S3: Stop + NO success signal → NOT completed -------------------------
liveTest('B1-S3 [no-signal] Stop with no completion signal must NOT mark completed', (root) => {
  const { docDir, statePath } = seedRun(root, {});
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(terminalOf(statePath), 'completed', 'no signal must leave the run un-completed (recoverable)');
});

// ---- B1-S4: SessionEnd + GO signal → NOT completed (recovery never succeeds) --
liveTest('B1-S4 [recovery] SessionEnd with a GO signal must NOT declare completed', (root) => {
  const { docDir, statePath } = seedRun(root, {}, [GO_CLOSEOUT]);
  const r = run(stopPayload(root, 'SessionEnd'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(terminalOf(statePath), 'completed', 'SessionEnd is the recovery path — it must NEVER declare success');
});

// ---- B1-S5: StopFailure + GO signal → NOT completed --------------------------
liveTest('B1-S5 [recovery] StopFailure with a GO signal must NOT declare completed', (root) => {
  const { docDir, statePath } = seedRun(root, {}, [GO_PADECAL]);
  const r = run(stopPayload(root, 'StopFailure'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(terminalOf(statePath), 'completed', 'StopFailure is the recovery path — it must NEVER declare success');
});

// ---- B1-S6: Stop + NO-GO signal → NOT completed ------------------------------
liveTest('B1-S6 [no-go] Stop with a NO-GO Pa de Cal must NOT mark completed', (root) => {
  const { docDir, statePath } = seedRun(root, {}, [NOGO_PADECAL]);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(terminalOf(statePath), 'completed', 'a NO-GO verdict is not a success — must not be marked completed');
});

// ---- B1-S7: integrity — completed write keeps a valid signature + bumps version
liveTest('B1-S7 [integrity] the completed write re-signs the state and bumps state_version', (root) => {
  const { docDir, statePath } = seedRun(root, {}, [GO_CLOSEOUT]);
  const before = readState(statePath) || {};
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const after = readState(statePath) || {};
  assert.equal(after.terminal_state, 'completed');
  assert.ok(Number(after.state_version) > Number(before.state_version || 0), 'state_version must bump on the completed write');
  const v = verifyState(after, { key: readHmacKey() });
  assert.ok(v.valid, 'the completed state must remain HMAC-valid (no integrity break)');
});

// ---- B1-S8 [lost-update] an already-terminal state is NEVER overwritten with completed
liveTest('B1-S8 [lost-update] a run already terminal (aborted_by_user) + GO signal must NOT be overwritten to completed', (root) => {
  const { docDir, statePath } = seedRun(root, { terminal_state: 'aborted_by_user', status: 'aborted_by_user' }, [GO_CLOSEOUT]);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(terminalOf(statePath), 'aborted_by_user', 'an existing terminal must win — never silently overwritten with completed');
});

// ---- B1-S9 [idempotency] a second Stop teardown does not re-write / re-bump --------
liveTest('B1-S9 [idempotency] a second Stop with the same GO signal does not re-write the completed terminal', (root) => {
  const { docDir, statePath } = seedRun(root, {}, [GO_CLOSEOUT]);
  const r1 = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r1.status, 0, r1.stderr);
  const v1 = Number((readState(statePath) || {}).state_version);
  assert.equal(terminalOf(statePath), 'completed');
  const r2 = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r2.status, 0, r2.stderr);
  const v2 = Number((readState(statePath) || {}).state_version);
  assert.equal(v2, v1, 'a second teardown must not re-write the already-completed terminal (no version bump)');
});

// ---- B1-S10 [tail-bound] a large ledger with a recent GO is still detected ---------
liveTest('B1-S10 [tail-bound] a large gate-decisions ledger with a recent GO line is detected without reading the whole file', (root) => {
  const noise = [];
  for (let i = 0; i < 400; i++) noise.push({ gate: 'STEP_1_7_ROUTING', hardness: 'AUDIT', decision: 'TRIGGERED', detail: 'x'.repeat(200), n: i });
  noise.push(GO_PADECAL);
  const { docDir, statePath } = seedRun(root, {}, noise);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(terminalOf(statePath), 'completed', 'the recent GO at the tail must be found via the bounded tail read');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until stop-gate-hook persists terminal_state=completed on the happy path):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
