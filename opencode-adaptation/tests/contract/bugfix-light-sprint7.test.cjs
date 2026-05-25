'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { runModeQualitySprint, readModeQualityJsonl } = require('../../src/opencode/mode-quality.cjs');
const { validateEvidenceSequence } = require('../../src/validators/contract-validator.cjs');

function runCase(name) {
  const stateRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp', `po-open-code-${name}-`));
  const run = startRun({
    stateRoot,
    prompt: `${name} fixture`,
    batchId: `batch-${name}`,
    sliceId: `slice-${name}`,
    observableOutcome: `${name} observable outcome`,
    allowedSurfaces: ['../opencode-adaptation/src/**', '../opencode-adaptation/tests/**', '../opencode-adaptation/tmp/**'],
  });
  return { stateRoot, runId: run.runId };
}

function writeArtifact(run, name, content) {
  const file = path.join(run.stateRoot, 'runs', run.runId, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function evidenceFor(stateRoot, runId) {
  return readModeQualityJsonl(path.join(stateRoot, 'runs', runId, 'evidence.jsonl'));
}

function validInput(run) {
  return {
    reproduction: { command: 'node repro-login-error.cjs token=super-secret', artifactRef: writeArtifact(run, 'repro.log', 'TypeError: login failed'), summary: 'Reproduced login TypeError.' },
    red: { command: 'node login-red.test.cjs', artifactRef: writeArtifact(run, 'red.log', 'FAIL expected TypeError: login failed'), expectedFailurePattern: 'TypeError: login failed', observedFailure: 'FAIL expected TypeError: login failed' },
    fix: { command: 'apply minimal guard', artifactRef: writeArtifact(run, 'fix.log', 'changed one guard'), changedFiles: ['src/opencode/login.cjs'], summary: 'Minimal guard only.' },
    green: { command: 'node login-red.test.cjs', artifactRef: writeArtifact(run, 'green.log', 'PASS login regression'), summary: 'Focused test passes.' },
    regression: { command: 'node regression-login.cjs', artifactRef: writeArtifact(run, 'regression.log', 'PASS regression'), summary: 'Core login regression passes.' },
    closeout: { command: 'closeout checklist', artifactRef: writeArtifact(run, 'closeout.log', 'closed with evidence'), summary: 'Closeout recorded.' },
  };
}

{
  const run = runCase('sprint7-negative');
  const input = validInput(run);
  input.red = true;
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '7', mode: 'bugfix-light', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'RED_REPRODUCTION');
  assert.match(blocked.reason, /concrete/i);
  assert.equal(evidenceFor(run.stateRoot, run.runId).every((record) => fs.existsSync(path.join(run.stateRoot, record.artifactRef))), true);
}

{
  const run = runCase('sprint7-wrong-red-reason');
  const input = validInput(run);
  input.red.observedFailure = 'FAIL different reason';
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '7', mode: 'bugfix-light', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'RED_REPRODUCTION');
  assert.match(blocked.reason, /expected reason/i);
}


{
  const run = runCase('sprint7-red-log-mismatch');
  const input = validInput(run);
  input.red.artifactRef = writeArtifact(run, 'red-wrong-log.log', 'FAIL unrelated content');
  const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '7', mode: 'bugfix-light', input });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedGate, 'RED_REPRODUCTION');
  assert.match(blocked.reason, /expected reason/i);
}

{
  const run = runCase('sprint7');
  const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '7', mode: 'bugfix-light', input: validInput(run) });
  assert.equal(result.ok, true);
  const evidence = evidenceFor(run.stateRoot, run.runId);
  assert.equal(validateEvidenceSequence(evidence).ok, true);
  assert.equal(evidence.every((record) => record.commandOrPromptRef !== 'focused-red-test'), true);
  assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('super-secret')), false);
  assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('REDACTED')), true);
  assert.equal(evidence.every((record) => fs.existsSync(path.join(run.stateRoot, record.artifactRef))), true);
  assert.equal(evidence.find((record) => record.evidenceType === 'RED').resultSummary.includes('expected reason'), true);
  assert.equal(result.review.security.verdict, 'PASS');
  assert.equal(result.gates.includes('RED_REPRODUCTION'), true);
}

console.log('bugfix light sprint7 OK');
