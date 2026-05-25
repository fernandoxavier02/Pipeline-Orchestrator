'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { writeResumeSnapshot, validateResumeSnapshot, readResumeSnapshot } = require('../../src/state/resume-snapshot.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-resume-'));
const run = startRun({
  stateRoot,
  prompt: 'resume test',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Resume snapshot',
  allowedSurfaces: ['../opencode-adaptation/src/state/**'],
});

const snapshot = {
  runId: run.runId,
  activeBatchId: 'batch-001',
  activeSliceId: 'slice-001',
  lastCompletedStep: 'test.red',
  pendingGateDecisions: [{ gateName: 'continue', phase: 'review' }],
  latestRedEvidence: { eventId: 'red-1' },
  latestGreenEvidence: { eventId: 'green-1' },
  latestPromptRunEvidence: { eventId: 'prompt-1' },
  latestAdversarialFindings: [{ id: 'finding-1' }],
};

const writeResult = writeResumeSnapshot({ stateRoot, snapshot });
assert.equal(writeResult.ok, true);

const loaded = readResumeSnapshot({ stateRoot, runId: run.runId });
assert.equal(loaded.runId, run.runId);
assert.equal(loaded.activeBatchId, 'batch-001');
assert.equal(validateResumeSnapshot(loaded).ok, true);

const invalid = validateResumeSnapshot({
  runId: run.runId,
  activeBatchId: 'batch-001',
});
assert.equal(invalid.ok, false);
assert.equal(invalid.missing[0], 'activeSliceId');

const corruptRunId = '001-corrupt-run';
const corruptDir = path.join(stateRoot, 'runs', corruptRunId);
fs.mkdirSync(corruptDir, { recursive: true });
fs.writeFileSync(
  path.join(corruptDir, 'resume-snapshot.json'),
  JSON.stringify({ runId: corruptRunId, activeBatchId: 'batch-001' })
);
assert.throws(
  () => readResumeSnapshot({ stateRoot, runId: corruptRunId }),
  /resume snapshot missing activeSliceId/
);

assert.throws(
  () => writeResumeSnapshot({ stateRoot: 'relative-state', snapshot }),
  /stateRoot must be an absolute path/
);

console.log('resume snapshot OK');
