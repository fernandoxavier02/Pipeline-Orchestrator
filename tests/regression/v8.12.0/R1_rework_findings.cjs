#!/usr/bin/env node
'use strict';

// =============================================================================
// R1 (v8.12.0) — SPEC 006 Phase 3->2 REWORK — final cross-batch adversarial fixes.
// Run: 2026-06-23-spec006-batch4-7. Evidence:
//   .pipeline/docs/Pre-Complexa-action/2026-06-23-spec006-batch4-7/08-final-adversarial-report.md
// =============================================================================
// TDD RED→GREEN for the 3 findings that needed real assertions (H1/H2/M1). H2/M1
// are pure-engine; H1 is the producer/consumer wiring (REAL arm-gate deny → trigger
// artifact → consumer drain → on-disk corrective_redispatch record).
//
//   H1 (HIGH, design §2.6 LAYER A→B bridge) — the Batch-4 deny-trigger was dead-wired:
//       it keyed off a PostToolUse tool_response shape that NEVER fires in production
//       (the arm-gate denies at PreToolUse, which PREVENTS the tool from running, so
//       no PostToolUse event for that tool carries the deny). FIX: the arm-gate, on a
//       REAL governed deny, additively writes a SIGNED corrective-trigger artifact; the
//       consumer (corrective-dispatch-gate) drains that artifact through the engine →
//       an on-disk corrective_redispatch record (NFR5). The gate's deny/allow decision
//       is UNCHANGED — the artifact is a pure additive side-effect on the deny path.
//       RED on OLD code: a real arm-gate deny leaves NO corrective_redispatch record
//       (the consumer only watched the phantom tool_response). GREEN on the fix: the
//       real deny → trigger → drain → record.
//
//   H2 (HIGH, design §2.6 step2 + §2.8) — occurrence_window was trusted from the
//       SubagentStop payload, so an attacker pinning a FIXED window collapsed distinct
//       real failures to ONE dedup key (self-healing falls silent). FIX: the engine
//       derives occurrence_window from ON-DISK run state and IGNORES the payload value
//       for dedup-key purposes. RED on OLD code: N distinct in-exec failures with an
//       attacker-fixed payload window dedup to 1. GREEN on the fix: the on-disk state
//       advancing yields N distinct correctives regardless of the payload window.
//
//   M1 (MEDIUM) — the circuit breaker was per dedup_key only; a varied-key storm was
//       unbounded. FIX: a per-RUN global corrective ceiling on top of the per-key
//       breaker; on exceeding it the engine ESCALATES and stops writing fresh records.
//       RED on OLD code: a varied-key sequence is unbounded. GREEN: it is bounded.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'r1-rework-findings-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const ARM_GATE = path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs');
const DISPATCH_GATE = path.join(ROOT, '.claude/hooks/corrective-dispatch-gate.cjs');

const engine = require(path.join(ROOT, 'lib/corrective-dispatch.cjs'));
const { writeArmPending } = require(path.join(ROOT, 'lib/pipeline-arm.cjs'));

// Optional require so a missing export degrades to a clean RED (not a crash).
let armGate = {};
try { armGate = require(ARM_GATE); } catch { armGate = {}; }
let dispatchGate = {};
try { dispatchGate = require(DISPATCH_GATE); } catch { dispatchGate = {}; }

const TRIGGER_REL = '.pipeline/state/corrective-triggers.jsonl';
const REDISPATCH_REL = '.pipeline/state/corrective-redispatch.jsonl';

// ---- helpers (mirror B0_two_layer_contract.cjs / B4 / B5) -------------------
function armGovernedWindow(root) {
  writeArmPending(root, '/pipeline-orchestrator:feature add a share button', new Date().toISOString());
}
function runArmGate(payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_ARM_ENFORCEMENT; // force the embedded default unless a test sets it
  return spawnSync(process.execPath, [ARM_GATE], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) },
  });
}
function pre(root, toolName, toolInput) {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput || {}, cwd: root };
}
function denyReason(r) {
  try {
    const o = JSON.parse(r.stdout || '{}');
    return o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny'
      ? o.hookSpecificOutput.permissionDecisionReason : null;
  } catch { return null; }
}
function readLines(cwd, rel) {
  const p = path.join(cwd, rel);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
}
function readRedispatch(cwd) { return readLines(cwd, REDISPATCH_REL); }
function readTriggers(cwd) { return readLines(cwd, TRIGGER_REL); }

// Write a signed on-disk sentinel-state with an arbitrary phase/batch marker so the
// engine can derive an authoritative occurrence_window from it (H2). Returns nothing.
function writeRunState(root, docName, fields) {
  let signer = null;
  try { signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs')); } catch { signer = null; }
  const docPath = path.join(root, '.pipeline', 'docs', docName);
  fs.mkdirSync(docPath, { recursive: true });
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true });
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docPath }, null, 2));
  let state = Object.assign({ pipeline_active: true }, fields);
  if (signer && typeof signer.signState === 'function') {
    try {
      const key = signer.getOrCreateHmacKey ? signer.getOrCreateHmacKey() : null;
      if (key) state = signer.signState(state, key);
    } catch { /* unsigned tolerated */ }
  }
  fs.writeFileSync(path.join(docPath, 'sentinel-state.json'), JSON.stringify(state, null, 2));
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-')); fn(tmp); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}
function unit(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== R1 v8.12.0 — Phase 3->2 rework (H1 real-deny-trigger / H2 attacker-window / M1 run-ceiling) ===');

// ===========================================================================
// H1 — a REAL arm-gate governed DENY drives a corrective on disk (design §2.6).
// ===========================================================================

// H1-1 PRODUCER: a real PreToolUse governed DENY additively writes a SIGNED
//   corrective-trigger artifact, WITHOUT changing the deny decision itself.
check('H1-1 PRODUCER: a real governed DENY writes a signed corrective-trigger artifact (deny unchanged)', (tmp) => {
  armGovernedWindow(tmp);
  const r = runArmGate(pre(tmp, 'Edit', { file_path: path.join(tmp, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  // The deny decision MUST be identical to today (LAYER A still hard-blocks).
  const reason = denyReason(r);
  assert.ok(reason && /PIPELINE_NOT_ARMED/.test(reason),
    'the governed DENY decision must be UNCHANGED (the artifact is a pure additive side-effect)');
  // The additive side-effect: a corrective-trigger artifact on disk.
  const triggers = readTriggers(tmp);
  assert.equal(triggers.length, 1, `a real governed deny must write exactly ONE corrective-trigger, got ${triggers.length}`);
  const t = JSON.parse(triggers[0]);
  assert.equal(t.kind, 'corrective_trigger', 'the artifact kind must be "corrective_trigger"');
  assert.equal(t.invariant_id, 'NOT_ARMED', 'the trigger must carry the failed invariant_id NOT_ARMED');
  assert.ok(t.corrective && typeof t.corrective === 'object',
    'the trigger must carry the buildCorrectiveDescriptor payload the consumer routes');
});

// H1-2 PRODUCER: an ALLOW (no governed deny) writes NO trigger artifact.
check('H1-2 PRODUCER: an allowed action writes NO corrective-trigger artifact', (tmp) => {
  // No marker → ungoverned → allow → no trigger.
  const r = runArmGate(pre(tmp, 'Edit', { file_path: path.join(tmp, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'ungoverned work must be allowed');
  assert.equal(readTriggers(tmp).length, 0, 'an allow must write NO corrective-trigger');
});

// H1-3 CONSUMER: the consumer drains the on-disk trigger (NOT a phantom
//   tool_response) → an on-disk corrective_redispatch record (NFR5). This is the
//   load-bearing end-to-end: REAL deny → trigger → drain → record.
check('H1-3 E2E: real governed DENY → trigger → consumer drain → corrective_redispatch record on disk', (tmp) => {
  assert.equal(typeof dispatchGate.handlePostToolUse, 'function',
    'corrective-dispatch-gate must export handlePostToolUse(payload)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; // on-disk fallback path

  // 1) REAL deny writes the trigger.
  armGovernedWindow(tmp);
  const r = runArmGate(pre(tmp, 'Edit', { file_path: path.join(tmp, 'src', 'app.js') }));
  assert.ok(denyReason(r), 'precondition: the governed deny fired');
  assert.equal(readTriggers(tmp).length, 1, 'precondition: the deny wrote a trigger');
  assert.equal(readRedispatch(tmp).length, 0, 'precondition: NO corrective record exists from the deny alone');

  // 2) The consumer runs (a later PostToolUse event drains the pending trigger).
  const out = dispatchGate.handlePostToolUse({ cwd: tmp, tool_name: 'Read', tool_response: {} });
  assert.ok(out && typeof out === 'object', 'the consumer must return a descriptor');

  // 3) The corrective lands on disk for the real deny (the whole point of H1).
  const records = readRedispatch(tmp);
  assert.equal(records.length, 1,
    `a REAL arm-gate deny must produce exactly ONE corrective_redispatch record after the drain, got ${records.length} (H1: no longer dead-wired)`);
  const rec = JSON.parse(records[0]);
  assert.equal(rec.kind, 'corrective_redispatch', 'the drained record kind must be "corrective_redispatch"');
  assert.equal(rec.invariant_id, 'NOT_ARMED', 'the drained record invariant_id must be "NOT_ARMED"');
});

// H1-4 CONSUMER idempotency: draining twice does NOT double-fire the corrective.
check('H1-4 E2E: the consumer drains a trigger exactly once (no double-fire on a second drain)', (tmp) => {
  assert.equal(typeof dispatchGate.handlePostToolUse, 'function', 'handlePostToolUse missing');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  armGovernedWindow(tmp);
  runArmGate(pre(tmp, 'Edit', { file_path: path.join(tmp, 'src', 'app.js') }));
  dispatchGate.handlePostToolUse({ cwd: tmp, tool_name: 'Read', tool_response: {} });
  dispatchGate.handlePostToolUse({ cwd: tmp, tool_name: 'Read', tool_response: {} });
  const records = readRedispatch(tmp);
  assert.equal(records.length, 1,
    `draining the same trigger twice must yield exactly ONE corrective record, got ${records.length}`);
});

// ===========================================================================
// H2 — occurrence_window is derived from ON-DISK run state; the payload value is
//   IGNORED for dedup-key purposes (design §2.6 step2 + §2.8).
// ===========================================================================

// H2-1 the engine exposes the on-disk window resolver.
unit('H2-1 engine derives occurrence_window from on-disk run state (resolver exported)', () => {
  assert.equal(typeof engine.resolveOccurrenceWindow, 'function',
    'lib/corrective-dispatch.cjs must export resolveOccurrenceWindow(cwd, signal) — derives the window from disk');
});

// H2-2 ATTACKER-FIXED payload window: N distinct real failures (the on-disk state
//   advances each fix-cycle) MUST still produce N distinct correctives even though
//   the attacker pins occurrence_window to a single fixed value in the payload.
check('H2-2 attacker-fixed payload occurrence_window still yields N distinct correctives (on-disk wins)', (tmp) => {
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  const ATTACK_WINDOW = 'attacker-pinned-constant';
  const N = 3;
  let dispatched = 0;
  for (let i = 1; i <= N; i++) {
    // Each genuine failure happens in a NEW run state phase/batch (the run advanced),
    // but the hostile payload pins occurrence_window to one fixed string.
    writeRunState(tmp, `run-phase-${i}`, { current_phase: '2-execute', current_batch: i, fix_cycle: i });
    const res = engine.dispatchCorrective({
      run_id: 'rH2', observer: 'corrective-error-signal-gate', invariant_id: 'SUBAGENTSTOP_RESULT_MISSING',
      agent_ref: 'executor-controller', detail: `genuine failure ${i}`,
      detected_at: new Date().toISOString(),
      occurrence_window: ATTACK_WINDOW, // attacker-controlled, MUST be ignored for dedup
      blocking: false,
    }, { cwd: tmp });
    if (res && res.dispatched === true) dispatched++;
  }
  assert.equal(dispatched, N,
    `${N} genuine failures across advancing on-disk run state must yield ${N} distinct correctives even with an attacker-fixed payload window, got ${dispatched} (H2: payload window must NOT be trusted)`);
  const records = readRedispatch(tmp);
  assert.equal(records.length, N,
    `expected ${N} corrective records (one per genuine failure), got ${records.length}`);
});

// H2-3 SAME on-disk window → still deduped (a same-fix-cycle re-observation collapses).
check('H2-3 same on-disk run state (one fix-cycle) → re-observations still dedup to ONE corrective', (tmp) => {
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  writeRunState(tmp, 'run-stable', { current_phase: '2-execute', current_batch: 1, fix_cycle: 1 });
  let dispatched = 0;
  for (let i = 0; i < 4; i++) {
    const res = engine.dispatchCorrective({
      run_id: 'rH2b', observer: `observer-${i}`, invariant_id: 'SUBAGENTSTOP_RESULT_MISSING',
      agent_ref: 'executor-controller', detail: 'same defect', detected_at: new Date().toISOString(),
      occurrence_window: `payload-window-${i}`, // even VARYING the payload window must not split the key
      blocking: false,
    }, { cwd: tmp });
    if (res && res.dispatched === true) dispatched++;
  }
  assert.equal(dispatched, 1,
    `4 re-observations within ONE on-disk fix-cycle must dedup to exactly 1 corrective, got ${dispatched} (the payload window is irrelevant; the on-disk window governs)`);
});

// ===========================================================================
// M1 — a per-RUN global corrective ceiling bounds a varied-key storm (escalate).
// ===========================================================================

// M1-1 the engine exposes the per-run ceiling constant.
unit('M1-1 engine exposes a per-run corrective ceiling constant', () => {
  assert.equal(typeof engine.RUN_CORRECTIVE_CEILING, 'number',
    'lib/corrective-dispatch.cjs must export a numeric RUN_CORRECTIVE_CEILING (per-run global bound)');
  assert.ok(engine.RUN_CORRECTIVE_CEILING >= 1, 'the ceiling must be a positive bound');
});

// M1-2 a VARIED-KEY storm (distinct dedup keys, defeating the per-key breaker) is
//   BOUNDED by the per-run ceiling: beyond it, the engine ESCALATES and stops
//   writing fresh corrective_redispatch records.
check('M1-2 a varied-key storm is bounded by the per-run ceiling (escalates, stops writing fresh records)', (tmp) => {
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  writeRunState(tmp, 'run-storm', { current_phase: '2-execute', current_batch: 1, fix_cycle: 1 });
  const ceiling = engine.RUN_CORRECTIVE_CEILING;
  const STORM = ceiling + 10; // well past the bound
  let dispatched = 0, escalatedCeiling = 0;
  for (let i = 0; i < STORM; i++) {
    // Every iteration uses a DISTINCT invariant_id → a DISTINCT dedup key, defeating
    // the per-key 3-correction breaker entirely. Only a per-RUN ceiling can bound this.
    const res = engine.dispatchCorrective({
      run_id: 'rM1-storm', observer: 'attacker', invariant_id: `VARIED_INVARIANT_${i}`,
      agent_ref: `varied-agent-${i}`, detail: 'storm', detected_at: new Date().toISOString(),
      blocking: false,
    }, { cwd: tmp });
    if (res && res.dispatched === true) dispatched++;
    if (res && res.run_ceiling_exceeded === true) escalatedCeiling++;
  }
  assert.ok(dispatched <= ceiling,
    `a varied-key storm must be bounded by the per-run ceiling (${ceiling}); got ${dispatched} dispatched (M1: per-run global bound)`);
  assert.ok(escalatedCeiling > 0,
    'beyond the per-run ceiling the engine must report run_ceiling_exceeded:true (escalate, never silent unbounded)');
  const records = readRedispatch(tmp);
  assert.ok(records.length <= ceiling,
    `the on-disk corrective records must be bounded by the per-run ceiling (${ceiling}), got ${records.length} (no unbounded disk amplification)`);
});

// M1-3 under the ceiling, normal correctives still flow (the bound must not break
//   the happy path).
check('M1-3 under the per-run ceiling, distinct correctives still dispatch normally', (tmp) => {
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  writeRunState(tmp, 'run-normal', { current_phase: '2-execute', current_batch: 1, fix_cycle: 1 });
  // Two distinct defects, well under any sane ceiling → both dispatch.
  const a = engine.dispatchCorrective({
    run_id: 'rM1-ok', observer: 'o', invariant_id: 'DEFECT_A', agent_ref: 'agent-a',
    detail: 'a', detected_at: new Date().toISOString(), blocking: false,
  }, { cwd: tmp });
  const b = engine.dispatchCorrective({
    run_id: 'rM1-ok', observer: 'o', invariant_id: 'DEFECT_B', agent_ref: 'agent-b',
    detail: 'b', detected_at: new Date().toISOString(), blocking: false,
  }, { cwd: tmp });
  assert.equal(a.dispatched, true, 'the first distinct defect under the ceiling must dispatch');
  assert.equal(b.dispatched, true, 'the second distinct defect under the ceiling must dispatch');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
