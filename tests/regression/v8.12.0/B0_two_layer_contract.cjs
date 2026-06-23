#!/usr/bin/env node
'use strict';

// =============================================================================
// B0 (v8.12.0) — T0.1 — TWO-LAYER CONTRACT (RED, TDD).
// Spec 006-enforcement-fail-closed-arming. Satisfies: R8.3, NFR1, NFR6.
//
// Pins the SUBTLEST correctness property of the spec: LAYER A and LAYER B are
// COMPLEMENTARY and DISTINCT, and neither converts into the other.
//
//   (a) LAYER A still HARD-blocks substantive work in the governed window
//       (armPending && !runActive): Edit/Write/Bash non-pipeline-aligned →
//       DENY by DEFAULT; PIPELINE_ARM_ENFORCEMENT=warn → allow+warn; no marker
//       → allow. Exercised via the REAL hook (spawnSync) AND the pure brain
//       (decideArmGate) — these parts pass TODAY (LAYER A already ships).
//   (b) An in-execution ErrorSignal NEVER halts the run (fire-and-continue):
//       the corrective dispatcher API returns immediately / non-blocking, no
//       synchronous wait. References lib/corrective-dispatch.cjs → RED (module
//       does not exist yet).
//   (c) N observers of one defect → exactly 1 corrective (idempotency dedup
//       key run_id+agent_ref+invariant_id+occurrence_window). RED against
//       lib/corrective-dispatch.cjs.
//   (d) DISTINCTNESS (R8.3): arming still hard-blocks; the in-execution error
//       never halts — asserted as two separately-wired layers (mirror T5.5).
//
// EXPECTED RED REASON: lib/corrective-dispatch.cjs is missing, so every test
// that touches the corrective dispatcher (b/c/d-LAYER-B half) fails because the
// require() returns a stub with the API absent — NOT a harness/syntax error.
// The LAYER-A half (a / d-LAYER-A half) is GREEN today and stays GREEN: it pins
// that Batch 1+ must not relax the arming hard block.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b0-two-layer-contract-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs');
const armGate = require(path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs'));
const { writeArmPending } = require(path.join(ROOT, 'lib/pipeline-arm.cjs'));

// The module under construction (Batch 4/5 will create it). Optional require so
// a missing module degrades to an empty stub — the assertions below then fail on
// the missing API (a clean RED), never an uncaught require() crash.
let dispatch = null;
try { dispatch = require(path.join(ROOT, 'lib/corrective-dispatch.cjs')); } catch { dispatch = {}; }

// ---- helpers ----------------------------------------------------------------
// Arm the governed window the way the real front door does: a signed marker
// written by code (no run active yet → armPending && !runActive). The marker
// carries a TTL (default 30 min), so it MUST be timestamped "now" or the gate
// reads it as expired → fail-open. A fixed past date would silently disarm.
function armGovernedWindow(root) {
  writeArmPending(root, '/pipeline-orchestrator:feature add a share button', new Date().toISOString());
}
function run(payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_ARM_ENFORCEMENT; // force the embedded default unless a test sets it
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) },
  });
}
function pre(root, toolName, toolInput) {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput || {}, cwd: root };
}
function denyReason(r) { try { const o = JSON.parse(r.stdout || '{}'); return o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny' ? o.hookSpecificOutput.permissionDecisionReason : null; } catch { return null; } }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b0-2layer-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}
function unitTest(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== B0 v8.12.0 — two-layer contract (LAYER A hard-blocks; LAYER B never halts) ===');

// ===========================================================================
// (a) LAYER A — arming still HARD-blocks substantive work in the governed window
// ===========================================================================

// --- (a.1) real hook: Edit non-pipeline-aligned in the governed window → DENY by default
liveTest('B0-A1 [layerA/hook] Edit (non-aligned) DENIES by default in the governed window', (root) => {
  armGovernedWindow(root);
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  const reason = denyReason(r);
  assert.ok(reason && /PIPELINE_NOT_ARMED/.test(reason),
    'substantive work in the governed window must be DENIED by default (LAYER A fail-closed)');
});

// --- (a.2) real hook: Bash in the governed window → DENY by default
liveTest('B0-A2 [layerA/hook] Bash (non-aligned) DENIES by default in the governed window', (root) => {
  armGovernedWindow(root);
  const r = run(pre(root, 'Bash', { command: 'rm -rf build' }));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(denyReason(r), 'Bash substantive work must be DENIED by default in the governed window');
});

// --- (a.3) real hook: PIPELINE_ARM_ENFORCEMENT=warn → allow + warn (documented escape)
liveTest('B0-A3 [layerA/hook] PIPELINE_ARM_ENFORCEMENT=warn downgrades the deny to allow', (root) => {
  armGovernedWindow(root);
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }), { PIPELINE_ARM_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'the warn escape must NOT deny — it allows with a warning');
});

// --- (a.4) real hook: no marker present → allow (ungoverned work untouched)
liveTest('B0-A4 [layerA/hook] no governed marker → allow (fail-open for ungoverned work)', (root) => {
  // deliberately do NOT arm
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'ungoverned work must never be interfered with');
});

// --- (a.5) pure brain: decideArmGate DENIES substantive work by default in the governed window
unitTest('B0-A5 [layerA/brain] decideArmGate blocks WORK by default (armPending && !runActive)', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: false, pipelineAligned: false, enforce: undefined,
  });
  assert.equal(out.decision, 'block', 'the pure brain must DEFAULT to block for non-aligned substantive work');
});

// --- (a.6) pure brain: warn escape downgrades to allow+warn
unitTest('B0-A6 [layerA/brain] decideArmGate warn escape → allow+warn', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: false, pipelineAligned: false, enforce: 'warn',
  });
  assert.equal(out.decision, 'allow');
  assert.equal(out.warn, true, 'warn escape must allow WITH the warn flag set');
});

// ===========================================================================
// (b) LAYER B — an in-execution ErrorSignal NEVER halts the run (fire-and-continue)
// ===========================================================================

// --- (b.1) the corrective dispatcher exposes a NON-BLOCKING dispatch API
unitTest('B0-B1 [layerB] corrective-dispatch exposes a non-blocking dispatchCorrective() API', () => {
  assert.equal(typeof dispatch.dispatchCorrective, 'function',
    'lib/corrective-dispatch.cjs must export dispatchCorrective() (NON-BLOCKING in-execution corrector) — RED until Batch 5');
});

// --- (b.2) dispatchCorrective returns immediately and does NOT halt (NFR6 / R8.2):
//     it must return synchronously WITHOUT waiting on the corrective's outcome,
//     reporting blocking:false (fire-and-continue). No synchronous wait permitted.
liveTest('B0-B2 [layerB/NFR6] dispatchCorrective is fire-and-continue (returns now, blocking:false, run NOT halted)', (root) => {
  assert.equal(typeof dispatch.dispatchCorrective, 'function', 'dispatchCorrective() missing — RED');
  const signal = {
    run_id: 'rB0', observer: 'spec-reviewer', invariant_id: 'AC_DEVIATION',
    agent_ref: 'feature-implementer', detail: 'slice 2 contract drift', detected_at: '2026-06-22T00:00:00.000Z',
  };
  const t0 = Date.now();
  const res = dispatch.dispatchCorrective(signal, { cwd: root });
  const elapsed = Date.now() - t0;
  // Fire-and-continue: it must return promptly (no synchronous wait on the
  // corrective outcome). A generous ceiling still catches a blocking impl.
  assert.ok(elapsed < 2000, `dispatchCorrective must NOT synchronously wait (took ${elapsed}ms) — NFR6`);
  assert.ok(res && typeof res === 'object', 'dispatchCorrective must return a result descriptor');
  assert.equal(res.halted, false, 'the run must NOT be halted by an in-execution corrective (LAYER B is non-blocking)');
  assert.equal(res.blocking, false, 'an in-execution (R8) corrective is blocking:false (fire-and-continue)');
});

// ===========================================================================
// (c) IDEMPOTENCY — N observers of one defect → exactly 1 corrective
// ===========================================================================

// --- (c.1) the dedup key collapses duplicate detections of the SAME defect
unitTest('B0-C1 [idempotency] dedup key = run_id+agent_ref+invariant_id+occurrence_window', () => {
  assert.equal(typeof dispatch.dedupKey, 'function',
    'lib/corrective-dispatch.cjs must export dedupKey() — RED until Batch 5 (R8.4)');
  const base = { run_id: 'rB0', agent_ref: 'feature-implementer', invariant_id: 'AC_DEVIATION', occurrence_window: 'w1' };
  const k1 = dispatch.dedupKey(base);
  const k2 = dispatch.dedupKey({ ...base, observer: 'a-different-observer' });
  assert.equal(k1, k2, 'the dedup key must NOT depend on which observer reported it (N observers → 1 key)');
  const k3 = dispatch.dedupKey({ ...base, invariant_id: 'OTHER' });
  assert.notEqual(k1, k3, 'a different invariant must yield a different dedup key');
});

// --- (c.2) N observers reporting the SAME defect produce exactly ONE corrective
liveTest('B0-C2 [idempotency] 5 observers of one defect → exactly 1 corrective dispatched', (root) => {
  assert.equal(typeof dispatch.dispatchCorrective, 'function', 'dispatchCorrective() missing — RED');
  const observers = ['gate', 'sentinel', 'adversarial-reviewer', 'checkpoint-validator', 'self'];
  const results = observers.map((observer) => dispatch.dispatchCorrective({
    run_id: 'rB0', observer, invariant_id: 'AC_DEVIATION', agent_ref: 'feature-implementer',
    detail: 'same defect', detected_at: '2026-06-22T00:00:00.000Z', occurrence_window: 'w1',
  }, { cwd: root }));
  const emitted = results.filter((r) => r && r.dispatched === true).length;
  assert.equal(emitted, 1, `N observers of ONE defect must yield exactly 1 corrective, got ${emitted} (R8.4 anti-spam)`);
});

// ===========================================================================
// (d) DISTINCTNESS (R8.3) — the two layers are wired & asserted SEPARATELY
// ===========================================================================

// --- (d.1) LAYER A half: arming still hard-blocks (gate trip is blocking:true)
unitTest('B0-D1 [distinct/A] a gate-trip corrective is blocking:true (LAYER A hard block stays in force)', () => {
  assert.equal(typeof dispatch.buildCorrectivePayload, 'function',
    'lib/corrective-dispatch.cjs must export buildCorrectivePayload() — RED until Batch 4');
  const payload = dispatch.buildCorrectivePayload({
    invariant_id: 'NOT_ARMED', what_failed: 'no run armed', what_is_missing: 'arm the run',
    fix_instruction: 'dispatch a pipeline agent', resume_instruction: 'resume after arming',
    agent_ref: 'controller', run_id: 'rB0', observer: 'arm-gate', blocking: true,
  });
  assert.equal(payload.blocking, true, 'R4 gate-trip correctives keep blocking:true — the arming hard block does NOT soften');
});

// --- (d.2) LAYER B half: an in-execution error corrective is blocking:false (never halts)
unitTest('B0-D2 [distinct/B] an in-execution corrective is blocking:false (LAYER B never halts)', () => {
  assert.equal(typeof dispatch.buildCorrectivePayload, 'function', 'buildCorrectivePayload() missing — RED');
  const payload = dispatch.buildCorrectivePayload({
    invariant_id: 'AC_DEVIATION', what_failed: 'slice drift', what_is_missing: 'fix the slice',
    fix_instruction: 'align to AC', resume_instruction: 'resume', agent_ref: 'feature-implementer',
    run_id: 'rB0', observer: 'spec-reviewer', blocking: false,
  });
  assert.equal(payload.blocking, false, 'R8 in-execution correctives are blocking:false — they fire-and-continue');
});

// --- (d.3) the two layers do not collapse: a LAYER-A block and a LAYER-B
//     corrective for the SAME run coexist without one converting the other.
liveTest('B0-D3 [distinct] LAYER A still blocks while LAYER B fires non-blocking (no conversion)', (root) => {
  // LAYER A: the arming front door still denies substantive work.
  armGovernedWindow(root);
  const blocked = run(pre(root, 'Write', { file_path: path.join(root, 'src', 'x.js') }));
  assert.ok(denyReason(blocked), 'LAYER A must STILL hard-block substantive work even when LAYER B is active');

  // LAYER B: an in-execution corrective fires WITHOUT halting and WITHOUT
  // relaxing the LAYER-A block.
  assert.equal(typeof dispatch.dispatchCorrective, 'function', 'dispatchCorrective() missing — RED');
  const res = dispatch.dispatchCorrective({
    run_id: 'rB0', observer: 'sentinel', invariant_id: 'AC_DEVIATION', agent_ref: 'feature-implementer',
    detail: 'drift', detected_at: '2026-06-22T00:00:00.000Z',
  }, { cwd: root });
  assert.equal(res.halted, false, 'LAYER B must not halt');
  assert.equal(res.blocking, false, 'LAYER B corrective stays non-blocking even alongside a live LAYER-A block');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
