
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

function validInput(run) { return { persona: ev(run,'persona','persona record','Persona recorded.'), flow: ev(run,'flow','main flow','Main flow recorded.'), accessibilityBasic: ev(run,'a11y-basic','PASS contrast','Accessibility passed.'), visualEvidence: ev(run,'visual','screenshot exists','Visual evidence recorded.') }; }
{ const run = runCase('sprint13-string-persona'); const input = validInput(run); input.persona = 'operator'; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '13', mode: 'ux-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'PERSONA_JOURNEY_GATE'); }
{ const run = runCase('sprint13-missing-visual'); const input = validInput(run); input.visualEvidence.artifactRef = path.join(run.stateRoot, 'missing-visual.log'); const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '13', mode: 'ux-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'FINDINGS_EVIDENCE'); }
{ const run = runCase('sprint13'); const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '13', mode: 'ux-light', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.gates.includes('ACCESSIBILITY_GATE'), true); assertStrongEvidence(run); }
console.log('ux light sprint13 OK');
