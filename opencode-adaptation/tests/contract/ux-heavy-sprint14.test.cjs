
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

function validInput(run) { return { personasApproved: ev(run,'personas','APPROVED personas','Personas approved.'), journeys: [ev(run,'journey-1','journey one','Journey one.'), ev(run,'journey-2','journey two','Journey two.')], bddScenarios: ev(run,'bdd','BDD scenarios','BDD recorded.'), visualValidation: ev(run,'visual-validation','PASS visual','Visual validation passed.'), accessibilityExpanded: { ...ev(run,'a11y-expanded','PASS expanded','Expanded accessibility passed.'), critical:false }, review: ev(run,'ux-review','PASS review','UX review passed.') }; }
{ const run = runCase('sprint14-critical-a11y'); const input = validInput(run); input.accessibilityExpanded.critical = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '14', mode: 'ux-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'ACCESSIBILITY_GATE'); }
{ const run = runCase('sprint14-journey-boolean'); const input = validInput(run); input.journeys[0] = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '14', mode: 'ux-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'PERSONA_JOURNEY_GATE'); }

{ const run = runCase('sprint14-missing-visual'); const input = validInput(run); input.visualValidation.artifactRef = path.join(run.stateRoot, 'missing-visual-heavy.log'); const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '14', mode: 'ux-heavy', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'FINDINGS_EVIDENCE'); }
{ const run = runCase('sprint14'); const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '14', mode: 'ux-heavy', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.gates.includes('PERSONA_JOURNEY_GATE'), true); assertStrongEvidence(run); }
console.log('ux heavy sprint14 OK');
