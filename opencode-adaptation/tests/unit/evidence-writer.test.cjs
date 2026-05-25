'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { appendEvidence, readEvidence } = require('../../src/state/evidence-writer.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-evidence-'));
const run = startRun({
  stateRoot,
  prompt: 'evidence test',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Evidence append',
  allowedSurfaces: ['../opencode-adaptation/src/state/**'],
});

const first = appendEvidence({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  type: 'acceptance.recorded',
  artifactOrigin: 'adaptation-owned',
  payload: {
    initialState: 'run exists',
    triggeringAction: 'event appended',
    expectedObservableResult: 'evidence persists',
    author: 'test',
  },
});

const second = appendEvidence({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  type: 'test.red',
  artifactOrigin: 'adaptation-owned',
  payload: {
    command: 'node test.cjs',
    output: 'expected failure',
    exitCode: 1,
    changedFilesSinceRed: [],
  },
});

assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.notEqual(first.eventId, second.eventId);

const events = readEvidence({ stateRoot, runId: run.runId });
assert.equal(events.length, 2);
assert.equal(events[0].type, 'acceptance.recorded');
assert.equal(events[1].type, 'test.red');
assert.equal(events[0].artifactOrigin, 'adaptation-owned');
assert.equal(events[1].payload.exitCode, 1);
assert.match(events[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);

assert.throws(
  () => appendEvidence({
    stateRoot,
    runId: run.runId,
    type: 'gate.decided',
    artifactOrigin: 'original-protected',
    payload: {},
  }),
  /artifactOrigin must not be original-protected/
);

assert.throws(
  () => appendEvidence({
    stateRoot,
    runId: run.runId,
    batchId: 'batch-001',
    sliceId: 'slice-001',
    type: 'acceptance.recorded',
    artifactOrigin: 'adaptation-owned',
    payload: { initialState: 'missing required fields' },
  }),
  /acceptance.recorded payload missing triggeringAction/
);

assert.throws(
  () => appendEvidence({
    stateRoot,
    runId: run.runId,
    batchId: 'batch-001',
    sliceId: 'slice-001',
    type: 'prompt.recorded',
    artifactOrigin: 'adaptation-owned',
    payload: { prompt: 'missing evidence' },
  }),
  /prompt.recorded payload missing expectedOutput/
);

assert.throws(
  () => appendEvidence({
    stateRoot,
    runId: run.runId,
    batchId: 'batch-001',
    sliceId: 'slice-001',
    type: 'review.recorded',
    artifactOrigin: 'adaptation-owned',
    payload: { reviewerIdentity: 'security' },
  }),
  /review.recorded payload missing reviewContextId/
);

assert.throws(
  () => appendEvidence({
    stateRoot,
    runId: run.runId,
    batchId: 'batch-001',
    type: 'gate.decided',
    artifactOrigin: 'adaptation-owned',
    payload: { gateName: 'install' },
  }),
  /gate.decided payload missing phase/
);

assert.throws(
  () => appendEvidence({
    stateRoot,
    runId: run.runId,
    batchId: 'batch-001',
    type: 'batch.verdict',
    artifactOrigin: 'adaptation-owned',
    payload: { completedSlices: [] },
  }),
  /batch.verdict payload missing blockedSlices/
);

console.log('evidence writer OK');
