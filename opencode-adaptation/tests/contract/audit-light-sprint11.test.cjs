
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

function validInput(run) { const source = ev(run,'finding-source','finding source','Source exists.'); return { readOnlyProof: ev(run,'read-only','no writes observed','Read-only proof.'), findings: [{ id:'F1', sourceArtifact: source, severity:'HIGH', severityJustification:'Exploit path is reachable.', summary:'Finding with evidence.' }], closeout: ev(run,'audit-closeout','closed','Audit closeout.') }; }
{ const run = runCase('sprint11-write'); const input = validInput(run); input.writeAttempt = true; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '11', mode: 'audit-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'READ_ONLY_SCOPE'); }
{ const run = runCase('sprint11-finding-boolean'); const input = validInput(run); input.findings[0] = { id:'F1', evidence:true, severityJustified:true }; const blocked = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '11', mode: 'audit-light', input }); assert.equal(blocked.ok, false); assert.equal(blocked.blockedGate, 'FINDINGS_EVIDENCE'); }
{ const run = runCase('sprint11'); const result = runModeQualitySprint({ stateRoot: run.stateRoot, runId: run.runId, sprint: '11', mode: 'audit-light', input: validInput(run) }); assert.equal(result.ok, true); assert.equal(result.gates.includes('READ_ONLY_SCOPE'), true); assertStrongEvidence(run); }
console.log('audit light sprint11 OK');
