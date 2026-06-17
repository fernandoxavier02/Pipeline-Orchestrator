// tests/unit/record-plan-gate.test.cjs — Batch A wiring of the Plan-Mode gate state.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { recordPlanGate, planRequiredFor } = require('../../scripts/record-plan-gate.cjs');
const signer = require('../../lib/sentinel-state-signer.cjs');

function setupRun(extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recplan-'));
  const docPath = path.join(tmp, 'run');
  fs.mkdirSync(docPath, { recursive: true });
  fs.writeFileSync(path.join(docPath, 'sentinel-state.json'),
    JSON.stringify({ schema_version: 1, run_id: 'r', orchestrator_decision: { type: 'Bug Fix' }, pipeline_active: true, ...extra }));
  return { tmp, docPath };
}

test('planRequiredFor: code-writing types require plan; read-only do not; unknown fail-safe', () => {
  assert.strictEqual(planRequiredFor('Bug Fix'), true);
  assert.strictEqual(planRequiredFor('Feature'), true);
  assert.strictEqual(planRequiredFor('User Story'), true);
  assert.strictEqual(planRequiredFor('Spec'), true);
  assert.strictEqual(planRequiredFor('Audit'), false);
  assert.strictEqual(planRequiredFor('UX Simulation'), false);
  assert.strictEqual(planRequiredFor(''), true);
});

test('arm: sets required + approved=false and PRESERVES other state', () => {
  const { tmp, docPath } = setupRun();
  const plan = recordPlanGate(docPath, 'arm', { type: 'Bug Fix' });
  assert.strictEqual(plan.required, true);
  assert.strictEqual(plan.approved, false);
  const state = JSON.parse(fs.readFileSync(path.join(docPath, 'sentinel-state.json'), 'utf8'));
  assert.strictEqual(state.phase_1_5_plan.required, true);
  assert.strictEqual(state.phase_1_5_plan.approved, false);
  assert.strictEqual(state.orchestrator_decision.type, 'Bug Fix', 'rest of state preserved');
  assert.strictEqual(state.schema_version, 2);
  fs.rmSync(tmp, { recursive: true });
});

test('arm: read-only type → required=false', () => {
  const { tmp, docPath } = setupRun();
  const plan = recordPlanGate(docPath, 'arm', { type: 'Audit' });
  assert.strictEqual(plan.required, false);
  fs.rmSync(tmp, { recursive: true });
});

test('approve: sets approved=true + decision APPROVED; state stays HMAC-valid', () => {
  const { tmp, docPath } = setupRun();
  recordPlanGate(docPath, 'arm', { type: 'Bug Fix' });
  const plan = recordPlanGate(docPath, 'approve');
  assert.strictEqual(plan.approved, true);
  assert.strictEqual(plan.decision, 'APPROVED');
  const state = JSON.parse(fs.readFileSync(path.join(docPath, 'sentinel-state.json'), 'utf8'));
  const v = signer.verifyState(state);
  assert.strictEqual(v.valid, true, `state must remain signature-valid after approve (reason=${v.reason})`);
  fs.rmSync(tmp, { recursive: true });
});

test('reject: keeps approved=false + decision REJECTED', () => {
  const { tmp, docPath } = setupRun();
  recordPlanGate(docPath, 'arm', { type: 'Feature' });
  const plan = recordPlanGate(docPath, 'reject');
  assert.strictEqual(plan.approved, false);
  assert.strictEqual(plan.decision, 'REJECTED');
  fs.rmSync(tmp, { recursive: true });
});

test('approve WITHOUT prior arm THROWS (no forging/disarming a never-armed gate) — CORR-3/SEC-3', () => {
  const { tmp, docPath } = setupRun(); // state has no phase_1_5_plan
  assert.throws(() => recordPlanGate(docPath, 'approve'), /never armed/i);
  assert.throws(() => recordPlanGate(docPath, 'reject'), /never armed/i);
  fs.rmSync(tmp, { recursive: true });
});

test('arm on CORRUPT state THROWS (refuses to clobber) — RISK-1', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recplan-'));
  const docPath = path.join(tmp, 'run');
  fs.mkdirSync(docPath, { recursive: true });
  fs.writeFileSync(path.join(docPath, 'sentinel-state.json'), 'not json {{');
  assert.throws(() => recordPlanGate(docPath, 'arm', { type: 'Bug Fix' }), /corrupt/i);
  fs.rmSync(tmp, { recursive: true });
});
