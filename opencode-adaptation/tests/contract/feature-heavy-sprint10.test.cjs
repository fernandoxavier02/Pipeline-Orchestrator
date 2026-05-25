
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

function slice(run, n) { return { red: red(run,`slice-${n}-red`,'feature contract missing'), green: ev(run,`slice-${n}-green`,'PASS slice green','Slice green passed.'), checkpoint: { ...ev(run,`slice-${n}-checkpoint`,'checkpoint PASS','Checkpoint passed.'), status: 'PASS' } }; }
function validInput(run) { return { planApproved: ev(run,'plan','APPROVED plan','Plan approved.'), slices: [slice(run,1), slice(run,2)], integration: ev(run,'integration','PASS slice integration','Slices integrated.'), finalReview: ev(run,'final-review','PASS review','Final review passed.') }; }
{ const run = runCase('sprint10-boolean-plan'); const input = validInput(run); input.planApproved = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '10', mode: 'feature-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'PLAN_REJECTED'); }
{ const run = runCase('sprint10-missing-checkpoint'); const input = validInput(run); input.slices[1].checkpoint = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '10', mode: 'feature-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'MICRO_GATE_GAP'); }

{ const run = runCase('sprint10-wrong-red'); const input = validInput(run); input.slices[0].red.observedFailure = 'FAIL unrelated'; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '10', mode: 'feature-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'RED_REPRODUCTION'); }
{ const run = runCase('sprint10'); const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '10', mode: 'feature-heavy', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.gates.includes('MICRO_GATE_GAP'), true); assertStrongEvidence(run); }
console.log('feature heavy sprint10 OK');
