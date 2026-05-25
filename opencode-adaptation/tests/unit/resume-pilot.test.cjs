'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeResumeSnapshot } = require('../../src/state/resume-snapshot.cjs');
const { validateResumePilot } = require('../../src/pilot/resume-pilot.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-resume-pilot-'));
writeResumeSnapshot({
  stateRoot,
  snapshot: {
    runId: 'run-001',
    activeBatchId: 'batch-001',
    activeSliceId: 'slice-001',
    lastCompletedStep: 'review.recorded',
    pendingGateDecisions: [],
    latestRedEvidence: { eventId: 'red-1' },
    latestGreenEvidence: { eventId: 'green-1' },
    latestPromptRunEvidence: { eventId: 'prompt-1' },
    latestAdversarialFindings: [],
  },
});

let result = validateResumePilot({ stateRoot, runId: 'run-001' });
assert.equal(result.ok, true);
assert.equal(result.canResume, true);
assert.equal(result.activeBatchId, 'batch-001');
assert.equal(result.activeSliceId, 'slice-001');

const corruptDir = path.join(stateRoot, 'runs', 'run-corrupt');
fs.mkdirSync(corruptDir, { recursive: true });
fs.writeFileSync(path.join(corruptDir, 'resume-snapshot.json'), JSON.stringify({
  runId: 'run-corrupt',
  activeBatchId: 'batch-001',
}));

result = validateResumePilot({ stateRoot, runId: 'run-corrupt' });
assert.equal(result.ok, false);
assert.equal(result.canResume, false);
assert.equal(result.code, 'RESUME_SNAPSHOT_INCOMPLETE');
assert.match(result.explanation, /activeSliceId/);

console.log('resume pilot OK');
