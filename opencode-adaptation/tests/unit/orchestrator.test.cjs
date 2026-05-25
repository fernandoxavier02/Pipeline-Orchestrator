'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readEvidence } = require('../../src/state/evidence-writer.cjs');
const { runMinimalSlice } = require('../../src/runtime/orchestrator.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-orchestrator-'));

let result = runMinimalSlice({
  stateRoot,
  prompt: 'orchestrate slice',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Slice reaches verdict',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
  phaseValidator: () => ({ ok: true }),
});

assert.equal(result.ok, true);
assert.equal(result.finalState, 'verdict');

let events = readEvidence({ stateRoot, runId: result.runId });
assert.deepEqual(events.map((event) => event.type), [
  'run.started',
  'slice.planned',
  'test.red',
  'test.green',
  'prompt.recorded',
  'review.recorded',
  'batch.verdict',
]);

const blockedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-orchestrator-block-'));
result = runMinimalSlice({
  stateRoot: blockedRoot,
  prompt: 'orchestrate blocked slice',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Slice blocks before prompt',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
  phaseValidator: (phase) => phase === 'prompt'
    ? { ok: false, blockers: [{ code: 'GREEN_MISSING' }] }
    : { ok: true },
});

assert.equal(result.ok, false);
assert.equal(result.blockedPhase, 'prompt');
assert.equal(result.blockers[0].code, 'GREEN_MISSING');

events = readEvidence({ stateRoot: blockedRoot, runId: result.runId });
assert.equal(events.some((event) => event.type === 'prompt.recorded'), false);
const blockedVerdict = events.find((event) => event.type === 'batch.verdict');
assert.equal(blockedVerdict.payload.blockedSlices[0], 'slice-001');
assert.equal(blockedVerdict.payload.nextActions[0], 'Resolve blockers before continuing.');

console.log('orchestrator OK');
