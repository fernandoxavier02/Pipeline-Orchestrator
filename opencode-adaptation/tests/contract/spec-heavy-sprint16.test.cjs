
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

function validInput(run) { return { requirements: ev(run,'requirements','requirements','Requirements file.'), ddd: ev(run,'ddd','bounded contexts','DDD file.'), contracts: ev(run,'contracts','contracts','Contracts file.'), testStrategy: ev(run,'test-strategy','test strategy','Test strategy.'), risks: ev(run,'risks','risks','Risks file.'), postImplementationGates: ev(run,'post-gates','post gates','Post gates.'), acceptanceTraceability: ev(run,'traceability','AC traced','Traceability.'), adversarialSpecReview: ev(run,'spec-review','PASS review','Spec review passed.') }; }
{ const run = runCase('sprint16-boolean-contract'); const input = validInput(run); input.contracts = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '16', mode: 'spec-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'SPEC_ARTIFACT_MISSING'); }
{ const run = runCase('sprint16-missing-review'); const input = validInput(run); input.adversarialSpecReview.artifactRef = path.join(run.stateRoot, 'missing-review.log'); const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '16', mode: 'spec-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'SPEC_CONTENT_REVIEW_NOGO'); }
{ const run = runCase('sprint16'); const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '16', mode: 'spec-heavy', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.gates.includes('SPEC_CONTENT_REVIEW_NOGO'), true); assertStrongEvidence(run); }
console.log('spec heavy sprint16 OK');
