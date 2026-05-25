'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { runModeQualitySprint, readModeQualityJsonl } = require('../../src/opencode/mode-quality.cjs');
const { validateEvidenceSequence } = require('../../src/validators/contract-validator.cjs');

function runCase(name) {
  const stateRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp', `po-open-code-${name}-`));
  const run = startRun({ stateRoot, prompt: `${name} fixture`, batchId: `batch-${name}`, sliceId: `slice-${name}`, observableOutcome: `${name} outcome`, allowedSurfaces: ['../opencode-adaptation/src/**', '../opencode-adaptation/tests/**', '../opencode-adaptation/tmp/**'] });
  return { stateRoot, runId: run.runId };
}
function writeArtifact(run, name, content) { const file = path.join(run.stateRoot, 'runs', run.runId, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
function evidenceFor(stateRoot, runId) { return readModeQualityJsonl(path.join(stateRoot, 'runs', runId, 'evidence.jsonl')); }
function batch(run, index) {
  return {
    red: { command: `node batch-${index}-red.test.cjs token=batch-secret`, artifactRef: writeArtifact(run, `batch-${index}-red.log`, 'FAIL root cause race condition'), expectedFailurePattern: 'race condition', observedFailure: 'FAIL root cause race condition' },
    green: { command: `node batch-${index}-green.test.cjs`, artifactRef: writeArtifact(run, `batch-${index}-green.log`, 'PASS batch green'), summary: 'Batch green passes.' },
    adversarial: { command: `review batch ${index}`, artifactRef: writeArtifact(run, `batch-${index}-review.log`, 'PASS no high findings'), verdict: 'PASS' },
    checkpoint: { command: `checkpoint batch ${index}`, artifactRef: writeArtifact(run, `batch-${index}-checkpoint.log`, 'checkpoint PASS'), status: 'PASS' },
  };
}
function validInput(run) { return { rootCause: { command: 'root-cause-analysis', artifactRef: writeArtifact(run, 'root-cause.log', 'race condition root cause'), summary: 'Root cause found.' }, planApproved: { command: 'plan gate approved', artifactRef: writeArtifact(run, 'plan.log', 'APPROVED'), summary: 'Plan approved.' }, batches: [batch(run, 1), batch(run, 2)], verifyCompletion: { command: 'verify completion', artifactRef: writeArtifact(run, 'verify.log', 'PASS verified'), summary: 'Verified.' } }; }

{
  const run = runCase('sprint8-negative');
  const input = validInput(run);
  input.highFindingOpen = true;
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '8', mode: 'bugfix-heavy', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'ADVERSARIAL_BLOCK');
}
{
  const run = runCase('sprint8-missing-checkpoint');
  const input = validInput(run);
  delete input.batches[1].checkpoint;
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '8', mode: 'bugfix-heavy', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'MICRO_GATE_GAP');
  assert.match(blocked.reason, /checkpoint/i);
  assert.equal(evidenceFor(run.stateRoot, run.runId).every((record) => fs.existsSync(path.join(run.stateRoot, record.artifactRef))), true);
}
{
  const run = runCase('sprint8-wrong-red-reason');
  const input = validInput(run);
  input.batches[0].red.observedFailure = 'FAIL unrelated';
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '8', mode: 'bugfix-heavy', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'RED_REPRODUCTION');
}

{
  const run = runCase('sprint8-red-log-mismatch');
  const input = validInput(run);
  input.batches[0].red.artifactRef = writeArtifact(run, 'batch-1-red-wrong.log', 'FAIL unrelated content');
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '8', mode: 'bugfix-heavy', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'RED_REPRODUCTION');
}
{
  const run = runCase('sprint8');
  const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '8', mode: 'bugfix-heavy', input: validInput(run) });
  assert.equal(result.ok, true);
  assert.equal(result.gates.includes('PLAN_REJECTED'), true);
  assert.equal(result.gates.includes('ADVERSARIAL_GATE_MANDATORY'), true);
  assert.equal(result.gates.includes('MICRO_GATE_GAP'), true);
  const evidence = evidenceFor(run.stateRoot, run.runId);
  assert.equal(validateEvidenceSequence(evidence).ok, true);
  assert.equal(evidence.every((record) => fs.existsSync(path.join(run.stateRoot, record.artifactRef))), true);
  assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('batch-secret')), false);
  assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('REDACTED')), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-1.red'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-2.red'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-1.green'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-2.green'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-1.checkpoint'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-2.checkpoint'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-1.adversarial'), true);
  assert.equal(evidence.some((record) => record.slice === '8.batch-2.adversarial'), true);
}
console.log('bugfix heavy sprint8 OK');
