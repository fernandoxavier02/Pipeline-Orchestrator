
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { readModeQualityJsonl } = require('../../src/opencode/mode-quality.cjs');
const { validateEvidenceSequence } = require('../../src/validators/contract-validator.cjs');
function runCase(name) { const stateRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp', `po-open-code-${name}-`)); const run = startRun({ stateRoot, prompt: `${name} fixture`, batchId: `batch-${name}`, sliceId: `slice-${name}`, observableOutcome: `${name} outcome`, allowedSurfaces: ['../opencode-adaptation/src/**', '../opencode-adaptation/tests/**', '../opencode-adaptation/tmp/**'] }); return { stateRoot, runId: run.runId }; }
function writeArtifact(run, name, content) { const file = path.join(run.stateRoot, 'runs', run.runId, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
function ev(run, name, content, summary) { return { command: `node ${name}.cjs token=secret-value`, artifactRef: writeArtifact(run, `${name}.log`, content), summary }; }
function assertEvidence(run) { const evidence = readModeQualityJsonl(path.join(run.stateRoot, 'runs', run.runId, 'evidence.jsonl')); assert.equal(evidence.length >= 6, true); assert.equal(validateEvidenceSequence(evidence).ok, true); assert.equal(evidence.every((record) => fs.existsSync(path.join(run.stateRoot, record.artifactRef))), true); assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('secret-value')), false); assert.equal(evidence.some((record) => record.commandOrPromptRef.includes('REDACTED')), true); assert.equal(evidence.some((record) => fs.readFileSync(path.join(run.stateRoot, record.artifactRef), 'utf8').includes('Generated evidence placeholder')), false); }

const { runFinalValidation } = require('../../src/opencode/mode-quality.cjs');
function modeMap(run, prefix) { return { bugfix: ev(run,`${prefix}-bugfix`,'PASS bugfix','Bugfix proof.'), feature: ev(run,`${prefix}-feature`,'PASS feature','Feature proof.'), audit: ev(run,`${prefix}-audit`,'PASS audit','Audit proof.'), ux: ev(run,`${prefix}-ux`,'PASS ux','UX proof.'), spec: ev(run,`${prefix}-spec`,'PASS spec','Spec proof.') }; }
function validInput(run) { return { sanityByMode: modeMap(run,'sanity'), verifyCompletionByMode: modeMap(run,'verify'), confidenceScore: 88, paDeCalStrict: ev(run,'pa-de-cal','PASS strict','Strict Pa de Cal passed.'), evidenceCeilings: { allRequiredGatesPresent: true, redPresent: true, highFindingOpen: false, criticalFindingOpen: false } }; }
{ const run = runCase('sprint17-boolean-mode'); const input = validInput(run); input.sanityByMode.bugfix = true; const blocked = runFinalValidation({ stateRoot: run.stateRoot, runId: run.runId, sprint: '17', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'SPEC_POST_IMPL_FAIL'); }
{ const run = runCase('sprint17-score-ceiling'); const input = validInput(run); input.evidenceCeilings.allRequiredGatesPresent = false; input.confidenceScore = 90; const blocked = runFinalValidation({ stateRoot: run.stateRoot, runId: run.runId, sprint: '17', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'CONFIDENCE_EVIDENCE_CEILING'); }
{ const run = runCase('sprint17-pa-boolean'); const input = validInput(run); input.paDeCalStrict = true; const blocked = runFinalValidation({ stateRoot: run.stateRoot, runId: run.runId, sprint: '17', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'STOP_BEFORE_PA_DE_CAL'); }
{ const run = runCase('sprint17'); const result = runFinalValidation({ stateRoot: run.stateRoot, runId: run.runId, sprint: '17', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.confidence.score, 88); assertEvidence(run); }
console.log('final validation sprint17 OK');
