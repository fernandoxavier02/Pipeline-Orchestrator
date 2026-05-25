'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const {
  GATE_PROTOCOL_EVENTS,
  SENTINEL_CHECKPOINTS,
  runGateRequest,
  runPlanModeRequest,
  runDispatchRequest,
  applySentinelCheckpoint,
  validateFinalSentinel,
  readJsonl,
} = require('../../src/opencode/gate-protocol-sentinel.cjs');
const {
  validateGateDecisionRecord,
  validateProtocolEventSequence,
  validateSentinelState,
} = require('../../src/validators/contract-validator.cjs');

function createRun(prompt) {
  const tmpRoot = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });
  const stateRoot = fs.mkdtempSync(path.join(tmpRoot, 'po-open-code-sprint5-'));
  const run = startRun({
    stateRoot,
    prompt,
    batchId: 'batch-005',
    sliceId: 'sprint-5-gate-protocol-sentinel',
    observableOutcome: 'Gate protocol and sentinel block unsafe phase transitions',
    allowedSurfaces: ['../opencode-adaptation/src/**', '../opencode-adaptation/tests/**'],
  });
  return { stateRoot, runId: run.runId };
}

assert.deepEqual(GATE_PROTOCOL_EVENTS, {
  GATE_REQUEST: 'GATE_REQUEST',
  DISPATCH_REQUEST: 'DISPATCH_REQUEST',
  PLAN_MODE_REQUEST: 'PLAN_MODE_REQUEST',
});
assert.deepEqual(SENTINEL_CHECKPOINTS, [
  'post_orchestrator',
  'phase_0_to_1',
  'phase_1_to_2',
  'phase_2_to_3',
  'post_final_validator',
]);

const outsideRoot = path.join(process.cwd(), '..', 'po-open-code-sprint5-outside-negative');
assert.throws(() => runPlanModeRequest({ stateRoot: outsideRoot, runId: '001-safe-run', phase: 'phase_1', planMode: 'feature' }), /stateRoot must be inside adaptation tmp/);
const srcStateRoot = path.join(process.cwd(), 'src', 'po-open-code-sprint5-protected');
assert.throws(() => runPlanModeRequest({ stateRoot: srcStateRoot, runId: '001-safe-run', phase: 'phase_1', planMode: 'feature' }), /stateRoot must be inside adaptation tmp/);

const missing = createRun('sprint 5 missing gate blocks');
const missingGate = applySentinelCheckpoint({
  stateRoot: missing.stateRoot,
  runId: missing.runId,
  checkpointName: 'phase_0_to_1',
  now: '2026-05-24T10:00:00.000Z',
});
assert.equal(missingGate.ok, false);
assert.equal(missingGate.blocked, true);
assert.equal(missingGate.gateDecision.gate, 'CHECKPOINT_FAIL');
assert.equal(missingGate.gateDecision.hardness, 'HARD');
assert.equal(missingGate.sentinelState.checkpoints.phase_0_to_1.status, 'BLOCK');
assert.equal(validateGateDecisionRecord(missingGate.gateDecision).ok, true);
assert.equal(validateSentinelState(missingGate.sentinelState).ok, true);
assert.match(missingGate.gateDecision.detail, /Required gate missing/);

const timeout = createRun('sprint 5 timeout blocks dispatch');
const timeoutResult = runDispatchRequest({
  stateRoot: timeout.stateRoot,
  runId: timeout.runId,
  phase: 'phase_1_to_2',
  dispatchTarget: 'pipeline-implementer token=dispatch-secret',
  handshakes: [{
    schemaVersion: 'PROTOCOL_HANDSHAKE_TIMEOUT/v1',
    runId: timeout.runId,
    handshakeId: 'hs-dispatch-timeout',
    actorType: 'agent',
    actorName: 'pipeline-implementer',
    expectedEventType: 'agent_completed',
    startedAt: '2026-05-24T10:00:00.000Z',
    timeoutMs: 1000,
    onTimeout: 'BLOCK',
    recoveryOptions: ['stop'],
  }],
  now: '2026-05-24T10:00:02.001Z',
});
assert.equal(timeoutResult.ok, false);
assert.equal(timeoutResult.blocked, true);
assert.equal(timeoutResult.timeout.gateDecision.gate, 'PROTOCOL_HANDSHAKE_TIMEOUT');
assert.equal(timeoutResult.timeout.gateDecision.hardness, 'HARD');
assert.equal(timeoutResult.timeout.protocolEvent.eventType, 'handshake_timeout');
assert.equal(timeoutResult.sentinelState.blocked, true);
assert.equal(timeoutResult.sentinelState.checkpoints.phase_1_to_2.status, 'BLOCK');

const outOfOrder = createRun('sprint 5 out of order sentinel blocks');
const orderBlock = applySentinelCheckpoint({ stateRoot: outOfOrder.stateRoot, runId: outOfOrder.runId, checkpointName: 'phase_2_to_3', now: '2026-05-24T10:00:10.000Z' });
assert.equal(orderBlock.ok, false);
assert.equal(orderBlock.sentinelState.checkpoints.phase_2_to_3.status, 'BLOCK');
assert.match(orderBlock.gateDecision.detail, /Previous checkpoint missing/);

const noPost = createRun('sprint 5 phase zero requires post orchestrator');
runGateRequest({
  stateRoot: noPost.stateRoot,
  runId: noPost.runId,
  gate: 'INFO_GATE_BLOCKED',
  hardness: 'HARD',
  phase: 'phase_0_to_1',
  decision: 'APPROVED',
  decidedBy: 'test-harness',
  detail: 'approved',
  confidenceImpact: 5,
  now: '2026-05-24T10:00:11.000Z',
});
const noPostBlock = applySentinelCheckpoint({ stateRoot: noPost.stateRoot, runId: noPost.runId, checkpointName: 'phase_0_to_1', now: '2026-05-24T10:00:12.000Z' });
assert.equal(noPostBlock.ok, false);
assert.match(noPostBlock.gateDecision.detail, /Previous checkpoint missing: post_orchestrator/);

const blockedPrevious = createRun('sprint 5 blocked previous checkpoint blocks next');
assert.equal(applySentinelCheckpoint({ stateRoot: blockedPrevious.stateRoot, runId: blockedPrevious.runId, checkpointName: 'post_orchestrator', now: '2026-05-24T10:00:19.000Z' }).ok, true);
const blockedPhase0 = applySentinelCheckpoint({ stateRoot: blockedPrevious.stateRoot, runId: blockedPrevious.runId, checkpointName: 'phase_0_to_1', now: '2026-05-24T10:00:20.000Z' });
assert.equal(blockedPhase0.ok, false);
const blockedNext = applySentinelCheckpoint({ stateRoot: blockedPrevious.stateRoot, runId: blockedPrevious.runId, checkpointName: 'phase_1_to_2', now: '2026-05-24T10:00:21.000Z' });
assert.equal(blockedNext.ok, false);
assert.match(blockedNext.gateDecision.detail, /Previous checkpoint blocked/);

const mismatch = createRun('sprint 5 handshake run mismatch records block');
const mismatchResult = runDispatchRequest({
  stateRoot: mismatch.stateRoot,
  runId: mismatch.runId,
  phase: 'phase_1_to_2',
  dispatchTarget: 'pipeline-implementer',
  handshakes: [{
    schemaVersion: 'PROTOCOL_HANDSHAKE_TIMEOUT/v1',
    runId: 'other-run',
    handshakeId: 'hs-run-mismatch',
    actorType: 'agent',
    actorName: 'pipeline-implementer',
    expectedEventType: 'agent_completed',
    startedAt: '2026-05-24T10:00:00.000Z',
    timeoutMs: 1000,
    onTimeout: 'BLOCK',
    recoveryOptions: ['stop'],
  }],
  now: '2026-05-24T10:00:22.000Z',
});
assert.equal(mismatchResult.ok, false);
assert.equal(mismatchResult.blocked, true);
assert.equal(mismatchResult.gateDecision.gate, 'PROTOCOL_HANDSHAKE_TIMEOUT');
assert.match(mismatchResult.gateDecision.detail, /runId/i);
assert.equal(readJsonl(path.join(mismatch.stateRoot, 'runs', mismatch.runId, 'protocol-events.jsonl')).some((event) => event.eventType === 'handshake_timeout'), true);


const missingHandshake = createRun('sprint 5 missing handshake blocks dispatch');
const missingHandshakeResult = runDispatchRequest({
  stateRoot: missingHandshake.stateRoot,
  runId: missingHandshake.runId,
  phase: 'phase_1_to_2',
  dispatchTarget: 'pipeline-implementer',
  now: '2026-05-24T10:00:23.000Z',
});
assert.equal(missingHandshakeResult.ok, false);
assert.equal(missingHandshakeResult.blocked, true);
assert.equal(missingHandshakeResult.gateDecision.gate, 'PROTOCOL_HANDSHAKE_TIMEOUT');
assert.match(missingHandshakeResult.gateDecision.detail, /handshake/i);
assert.equal(missingHandshakeResult.protocolEvent.eventType, 'handshake_timeout');

const emptyHandshake = createRun('sprint 5 empty handshake blocks dispatch');
const emptyHandshakeResult = runDispatchRequest({
  stateRoot: emptyHandshake.stateRoot,
  runId: emptyHandshake.runId,
  phase: 'phase_1_to_2',
  dispatchTarget: 'pipeline-implementer',
  handshakes: [],
  now: '2026-05-24T10:00:24.000Z',
});
assert.equal(emptyHandshakeResult.ok, false);
assert.equal(emptyHandshakeResult.blocked, true);
assert.equal(emptyHandshakeResult.gateDecision.gate, 'PROTOCOL_HANDSHAKE_TIMEOUT');

const invalidHandshake = createRun('sprint 5 invalid handshake records block');
const invalidHandshakeResult = runDispatchRequest({
  stateRoot: invalidHandshake.stateRoot,
  runId: invalidHandshake.runId,
  phase: 'phase_1_to_2',
  dispatchTarget: 'pipeline-implementer',
  handshakes: [{ schemaVersion: 'PROTOCOL_HANDSHAKE_TIMEOUT/v1', runId: invalidHandshake.runId, actorName: 'pipeline-implementer', timeoutMs: 0 }],
  now: '2026-05-24T10:00:25.000Z',
});
assert.equal(invalidHandshakeResult.ok, false);
assert.equal(invalidHandshakeResult.blocked, true);
assert.equal(invalidHandshakeResult.gateDecision.gate, 'PROTOCOL_HANDSHAKE_TIMEOUT');
assert.match(invalidHandshakeResult.gateDecision.detail, /invalid/i);

const happy = createRun('sprint 5 happy gate protocol');
const gate = runGateRequest({
  stateRoot: happy.stateRoot,
  runId: happy.runId,
  gate: 'INFO_GATE_BLOCKED',
  hardness: 'HARD',
  phase: 'phase_0_to_1',
  decision: 'APPROVED',
  decidedBy: 'test-harness',
  detail: 'Approve sanitized detail with password=super-secret and token abc.',
  confidenceImpact: 10,
  now: '2026-05-24T10:01:00.000Z',
});
assert.equal(gate.ok, true);
assert.equal(validateGateDecisionRecord(gate.gateDecision).ok, true);
assert.equal(gate.gateDecision.detail.includes('super-secret'), false);
assert.equal(gate.gateDecision.detail.includes('token abc'), false);
assert.match(gate.gateDecision.detail, /REDACTED/);

const plan = runPlanModeRequest({
  stateRoot: happy.stateRoot,
  runId: happy.runId,
  phase: 'phase_1',
  planMode: 'feature-heavy token=plan-secret',
  now: '2026-05-24T10:01:01.000Z',
});
assert.equal(plan.ok, true);

const cp0 = applySentinelCheckpoint({
  stateRoot: happy.stateRoot,
  runId: happy.runId,
  checkpointName: 'post_orchestrator',
  now: '2026-05-24T10:01:02.000Z',
});
assert.equal(cp0.ok, true);
const cp1 = applySentinelCheckpoint({
  stateRoot: happy.stateRoot,
  runId: happy.runId,
  checkpointName: 'phase_0_to_1',
  requiredGates: ['INFO_GATE_BLOCKED'],
  now: '2026-05-24T10:01:03.000Z',
});
assert.equal(cp1.ok, true);
const cp2 = applySentinelCheckpoint({ stateRoot: happy.stateRoot, runId: happy.runId, checkpointName: 'phase_1_to_2', now: '2026-05-24T10:01:04.000Z' });
assert.equal(cp2.ok, true);
const dispatch = runDispatchRequest({
  stateRoot: happy.stateRoot,
  runId: happy.runId,
  phase: 'phase_1_to_2',
  dispatchTarget: 'pipeline-implementer token=dispatch-secret',
  handshakes: [{
    schemaVersion: 'PROTOCOL_HANDSHAKE_TIMEOUT/v1',
    runId: happy.runId,
    handshakeId: 'hs-dispatch-ok',
    actorType: 'agent',
    actorName: 'pipeline-implementer',
    expectedEventType: 'agent_completed',
    startedAt: '2026-05-24T10:01:00.000Z',
    timeoutMs: 120000,
    onTimeout: 'BLOCK',
    recoveryOptions: ['retry_once', 'stop'],
  }],
  now: '2026-05-24T10:01:05.000Z',
});
assert.equal(dispatch.ok, true);
const cp3 = applySentinelCheckpoint({ stateRoot: happy.stateRoot, runId: happy.runId, checkpointName: 'phase_2_to_3', now: '2026-05-24T10:01:06.000Z' });
assert.equal(cp3.ok, true);
const finalMissing = validateFinalSentinel({ stateRoot: happy.stateRoot, runId: happy.runId, now: '2026-05-24T10:01:07.000Z' });
assert.equal(finalMissing.ok, false);
assert.match(finalMissing.message, /post_final_validator/);
const cpf = applySentinelCheckpoint({ stateRoot: happy.stateRoot, runId: happy.runId, checkpointName: 'post_final_validator', now: '2026-05-24T10:01:08.000Z' });
assert.equal(cpf.ok, true);
const finalOk = validateFinalSentinel({ stateRoot: happy.stateRoot, runId: happy.runId, now: '2026-05-24T10:01:09.000Z' });
assert.equal(finalOk.ok, true);
assert.equal(validateSentinelState(finalOk.sentinelState, { phase: 'final' }).ok, true);

const events = readJsonl(path.join(happy.stateRoot, 'runs', happy.runId, 'protocol-events.jsonl'));
assert.equal(validateProtocolEventSequence(events).ok, true);
assert.equal(events.some((event) => String(event.payloadRef).includes('plan-secret')), false);
assert.equal(events.some((event) => String(event.payloadRef).includes('dispatch-secret')), false);
assert.equal(events.some((event) => String(event.payloadRef).includes('REDACTED')), true);
assert.deepEqual(events.map((event) => event.eventType), [
  'GATE_REQUEST',
  'gate_decision_recorded',
  'PLAN_MODE_REQUEST',
  'sentinel_checkpoint_applied',
  'sentinel_checkpoint_applied',
  'sentinel_checkpoint_applied',
  'DISPATCH_REQUEST',
  'sentinel_checkpoint_applied',
  'final_sentinel_validation_failed',
  'sentinel_checkpoint_applied',
  'final_sentinel_validated',
]);
for (let i = 1; i < events.length; i += 1) {
  assert.equal(events[i].parentEventId, events[i - 1].eventId);
}

console.log('gate protocol sentinel sprint5 OK');
