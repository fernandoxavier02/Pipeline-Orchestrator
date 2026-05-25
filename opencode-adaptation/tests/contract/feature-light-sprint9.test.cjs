
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { runModeQualitySprint, readModeQualityJsonl } = require('../../src/opencode/mode-quality.cjs');
const { validateEvidenceSequence } = require('../../src/validators/contract-validator.cjs');
function runCase(name) { const stateRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp', `po-open-code-${name}-`)); const run = startRun({ stateRoot, prompt: `${name} fixture`, batchId: `batch-${name}`, sliceId: `slice-${name}`, observableOutcome: `${name} outcome`, allowedSurfaces: ['../opencode-adaptation/src/**', '../opencode-adaptation/tests/**', '../opencode-adaptation/tmp/**'] }); return { stateRoot, runId: run.runId }; }
function writeArtifact(run, name, content) { const file = path.join(run.stateRoot, 'runs', run.runId, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
function ev(run, name, content, summary) { return { command: `node ${name}.cjs token=secret-value`, artifactRef: writeArtifact(run, `${name}.log`, content), summary }; }
function red(run, name, pattern) { return { command: `node ${name}.test.cjs`, artifactRef: writeArtifact(run, `${name}.log`, `FAIL ${pattern}`), expectedFailurePattern: pattern, observedFailure: `FAIL ${pattern}`, summary: `RED failed for ${pattern}.` }; }
function evidenceFor(stateRoot, runId) { return readModeQualityJsonl(path.join(stateRoot, 'runs', runId, 'evidence.jsonl')); }
function assertStrongEvidence(run) { const evidence = evidenceFor(run.stateRoot, run.runId); assert.equal(validateEvidenceSequence(evidence).ok, true); assert.equal(evidence.every((record) => fs.existsSync(path.join(run.stateRoot, record.artifactRef))), true); assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('secret-value')), false); assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('REDACTED')), true); assert.equal(evidence.some((record) => fs.readFileSync(path.join(run.stateRoot, record.artifactRef), 'utf8').includes('Generated evidence placeholder')), false); }

function validInput(run) { return { scenarioApproved: ev(run,'scenario','APPROVED scenario','Scenario approved.'), atdd: ev(run,'atdd','ATDD scenarios','ATDD recorded.'), red: red(run,'feature-red','missing integration behavior'), green: ev(run,'green','PASS vertical slice','Vertical slice passed.'), integration: ev(run,'integration','PASS integration','Integration passed.'), nonRegression: ev(run,'non-regression','PASS non regression','Non regression passed.') }; }
{ const run = runCase('sprint9-boolean-integration'); const input = validInput(run); input.integration = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '9', mode: 'feature-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'INTEGRATION_GATE'); }
{ const run = runCase('sprint9-missing-artifact'); const input = validInput(run); input.scenarioApproved.artifactRef = path.join(run.stateRoot, 'runs', run.runId, 'missing.log'); const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '9', mode: 'feature-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'TDD_APPROVAL'); }
{ const run = runCase('sprint9-wrong-red'); const input = validInput(run); input.red.observedFailure = 'FAIL other'; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '9', mode: 'feature-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'RED_REPRODUCTION'); }
{ const run = runCase('sprint9'); const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '9', mode: 'feature-light', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.gates.includes('INTEGRATION_GATE'), true); assertStrongEvidence(run); }
console.log('feature light sprint9 OK');
