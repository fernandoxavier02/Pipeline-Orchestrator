'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { appendEvidence } = require('../../src/state/evidence-writer.cjs');
const {
  validateBeforeImplementation,
  validateBeforePrompt,
  validateBeforeNextSlice,
} = require('../../src/validators/slice-validator.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-slice-'));
const run = startRun({
  stateRoot,
  prompt: 'slice validator',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Validate cycle',
  allowedSurfaces: ['../opencode-adaptation/src/validators/**'],
});

let result = validateBeforeImplementation({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, false);
assert.equal(result.blockers[0].code, 'ACCEPTANCE_MISSING');

appendEvidence({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  type: 'acceptance.recorded',
  artifactOrigin: 'adaptation-owned',
  payload: {
    initialState: 'planned',
    triggeringAction: 'implementation requested',
    expectedObservableResult: 'blocked until RED',
    author: 'test',
  },
});

result = validateBeforeImplementation({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, false);
assert.equal(result.blockers[0].code, 'RED_MISSING');

appendEvidence({
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

result = validateBeforeImplementation({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, true);

result = validateBeforePrompt({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, false);
assert.equal(result.blockers[0].code, 'GREEN_MISSING');

appendEvidence({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  type: 'test.green',
  artifactOrigin: 'adaptation-owned',
  payload: {
    command: 'node test.cjs',
    output: 'pass',
    exitCode: 0,
    changedFilesSinceRed: ['src/validators/slice-validator.cjs'],
  },
});

result = validateBeforePrompt({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, true);

appendEvidence({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  type: 'finding.recorded',
  artifactOrigin: 'adaptation-owned',
  payload: { id: 'finding-1', severity: 'blocking', summary: 'scope violation' },
});

result = validateBeforeNextSlice({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, false);
assert.equal(result.blockers[0].code, 'BLOCKING_FINDING_OPEN');

appendEvidence({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  type: 'finding.resolved',
  artifactOrigin: 'adaptation-owned',
  payload: { findingId: 'finding-1', resolution: 'fixed in same slice' },
});

result = validateBeforeNextSlice({ stateRoot, runId: run.runId, sliceId: 'slice-001' });
assert.equal(result.ok, true);

console.log('slice validator OK');
