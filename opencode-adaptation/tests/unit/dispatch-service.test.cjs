'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { readEvidence } = require('../../src/state/evidence-writer.cjs');
const { buildImplementerContext } = require('../../src/runtime/context-packet.cjs');
const { dispatchSubagent } = require('../../src/runtime/dispatch-service.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-dispatch-'));
const run = startRun({
  stateRoot,
  prompt: 'dispatch service',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Dispatch records result',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
});

let result = dispatchSubagent({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  agentName: 'pipeline-implementer',
  role: 'implementer',
  contextPacket: null,
  invoke: () => ({ ok: true }),
});
assert.equal(result.ok, false);
assert.equal(result.code, 'CONTEXT_PACKET_REQUIRED');

const contextPacket = buildImplementerContext({
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  scope: { allowedSurfaces: ['../opencode-adaptation/src/runtime/**'] },
  gates: [],
  evidence: [],
  implementerRationale: 'minimal',
});

result = dispatchSubagent({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  agentName: 'pipeline-implementer',
  role: 'implementer',
  contextPacket,
  invoke: (packet) => ({ ok: true, receivedKind: packet.kind }),
});

assert.equal(result.ok, true);
assert.equal(result.output.receivedKind, 'implementer');

const events = readEvidence({ stateRoot, runId: run.runId });
assert.equal(events.length, 1);
assert.equal(events[0].type, 'dispatch.recorded');
assert.equal(events[0].payload.agentName, 'pipeline-implementer');
assert.equal(events[0].payload.role, 'implementer');
assert.equal(events[0].payload.contextKind, 'implementer');
assert.deepEqual(events[0].payload.contextPacket.scope, contextPacket.scope);
assert.deepEqual(events[0].payload.contextPacket.gates, contextPacket.gates);
assert.deepEqual(events[0].payload.contextPacket.evidence, contextPacket.evidence);
assert.equal(events[0].payload.result.ok, true);

console.log('dispatch service OK');
