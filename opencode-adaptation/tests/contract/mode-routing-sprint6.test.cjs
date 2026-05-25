'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const {
  classifyModeRoute,
  confirmModeRoute,
  MODE_ROUTE_FAMILIES,
  readJsonl,
} = require('../../src/opencode/mode-routing.cjs');
const {
  validateGateDecisionRecord,
  validateProtocolEventSequence,
  validateQuestionDecisionLink,
  validateUiQuestionRecord,
} = require('../../src/validators/contract-validator.cjs');

function createRun(prompt) {
  const tmpRoot = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });
  const stateRoot = fs.mkdtempSync(path.join(tmpRoot, 'po-open-code-sprint6-'));
  const run = startRun({
    stateRoot,
    prompt: 'sprint 6 route classification fixture',
    batchId: 'batch-006',
    sliceId: 'sprint-6-mode-routing',
    observableOutcome: 'Mode routing proposes and confirms a canonical route without executing mode flows',
    allowedSurfaces: ['../opencode-adaptation/src/**', '../opencode-adaptation/tests/**'],
  });
  return { stateRoot, runId: run.runId, prompt };
}

assert.deepEqual(MODE_ROUTE_FAMILIES, ['bugfix', 'feature', 'audit', 'ux', 'spec', 'pipeline-full']);

const familyCases = [
  ['bugfix', 'Corrija erro reproduzivel simples no login', 'light', ['RED_REPRODUCTION', 'GREEN_REGRESSION']],
  ['feature', 'Implementar um painel novo com integracao completa', 'heavy', ['VERTICAL_SLICE', 'INTEGRATION_GATE']],
  ['audit', 'Auditar seguranca do modulo de login sem alterar arquivos', 'light', ['READ_ONLY_SCOPE', 'FINDINGS_EVIDENCE']],
  ['ux', 'Revisar UX da jornada de cadastro com persona definida', 'light', ['PERSONA_JOURNEY_GATE']],
  ['spec', 'Criar SPEC com requisitos design tasks e criterios de aceite', 'heavy', ['SPEC_ARTIFACT_MISSING', 'SPEC_AC_TRACEABILITY_GAP']],
  ['pipeline-full', 'Execute o pipeline full para escolher o modo correto', 'heavy', ['CLASSIFICATION_CONFIRMATION', 'COMPLEXITY_GATE']],
];

for (const [family, prompt, variant, expectedGates] of familyCases) {
  const route = classifyModeRoute(prompt);
  assert.equal(route.status, 'proposed', `${family} must be proposed`);
  assert.equal(route.family, family);
  assert.equal(route.variant, variant);
  assert.ok(expectedGates.every((gate) => route.gatesExpected.includes(gate)), `${family} expected gates missing`);
  assert.ok(route.reason.length > 0);
  assert.ok(Array.isArray(route.risks) && route.risks.length > 0);
  assert.ok(Array.isArray(route.agentsExpected) && route.agentsExpected.length > 0);
  if (family === 'audit') assert.equal(route.readOnly, true);
  if (family === 'spec') assert.equal(route.executesSpec, false);
}

const ambiguous = classifyModeRoute('Me ajuda com isso quando puder');
assert.equal(ambiguous.status, 'pending');
assert.equal(ambiguous.family, null);
assert.equal(ambiguous.variant, null);
assert.match(ambiguous.reason, /ambiguous/i);


for (const [family, prompt] of familyCases) {
  const runCase = createRun(prompt);
  const confirmed = confirmModeRoute({
    stateRoot: runCase.stateRoot,
    runId: runCase.runId,
    prompt: runCase.prompt,
    askQuestion: (question) => ({ ok: true, selectedOptionId: question.recommendedOptionId }),
  });
  assert.equal(confirmed.ok, true, `${family} must confirm through UI`);
  assert.equal(confirmed.route.family, family);
  assert.equal(confirmed.decision.decision, 'APPROVED');
  assert.equal(confirmed.decision.selectedOptionId, 'approve-route');
}
const approvedRun = createRun('Corrija erro reproduzivel simples no login');
const approved = confirmModeRoute({
  stateRoot: approvedRun.stateRoot,
  runId: approvedRun.runId,
  prompt: approvedRun.prompt,
  askQuestion: (question) => ({ ok: true, selectedOptionId: question.recommendedOptionId }),
});
assert.equal(approved.ok, true);
assert.equal(approved.route.family, 'bugfix');
assert.equal(approved.route.variant, 'light');
assert.equal(approved.decision.gate, 'STEP_1_7_ROUTING');
assert.equal(approved.decision.decision, 'APPROVED');
assert.equal(approved.decision.selectedOptionId, 'approve-route');
assert.equal(validateUiQuestionRecord(approved.question).ok, true);
assert.equal(validateGateDecisionRecord(approved.decision).ok, true);
assert.equal(validateQuestionDecisionLink(approved.question, approved.decision).ok, true);

const approvedEvents = readJsonl(path.join(approvedRun.stateRoot, 'runs', approvedRun.runId, 'protocol-events.jsonl'));
assert.deepEqual(approvedEvents.map((event) => event.eventType), ['ui_question_emitted', 'step_1_7_routing_decided']);
assert.equal(validateProtocolEventSequence(approvedEvents).ok, true);
for (let i = 1; i < approvedEvents.length; i += 1) {
  assert.equal(approvedEvents[i].parentEventId, approvedEvents[i - 1].eventId);
}
const approvedDecisions = readJsonl(path.join(approvedRun.stateRoot, 'runs', approvedRun.runId, 'gate-decisions.jsonl'));
assert.equal(approvedDecisions.length, 1);
assert.equal(approvedDecisions[0].family, 'bugfix');
assert.equal(approvedDecisions[0].variant, 'light');
assert.equal(approvedDecisions[0].detail.includes(approvedRun.prompt), false);
assert.equal(approvedEvents.some((event) => String(event.payloadRef).includes(approvedRun.prompt)), false);

const adjustRun = createRun('Implementar relatorio simples');
const adjusted = confirmModeRoute({
  stateRoot: adjustRun.stateRoot,
  runId: adjustRun.runId,
  prompt: adjustRun.prompt,
  askQuestion: () => ({ ok: true, selectedOptionId: 'adjust-heavy' }),
});
assert.equal(adjusted.ok, true);
assert.equal(adjusted.adjusted, true);
assert.equal(adjusted.route.family, 'feature');
assert.equal(adjusted.route.variant, 'heavy');
assert.equal(adjusted.decision.selectedOptionId, 'adjust-heavy');
assert.match(adjusted.decision.detail, /adjusted/i);

const invalidRun = createRun('Auditar seguranca do modulo');
const invalid = confirmModeRoute({
  stateRoot: invalidRun.stateRoot,
  runId: invalidRun.runId,
  prompt: invalidRun.prompt,
  askQuestion: () => ({ ok: true, selectedOptionId: 'execute-anyway' }),
});
assert.equal(invalid.ok, false);
assert.equal(invalid.fallbackUsed, true);
assert.equal(invalid.decision.decision, 'BLOCKED');
assert.equal(invalid.decision.selectedOptionId, 'block-route');
assert.equal(validateQuestionDecisionLink(invalid.question, invalid.decision).ok, true);

const pendingRun = createRun('Me ajuda com isso quando puder');
const pending = confirmModeRoute({
  stateRoot: pendingRun.stateRoot,
  runId: pendingRun.runId,
  prompt: pendingRun.prompt,
  askQuestion: () => ({ ok: true, selectedOptionId: 'approve-route' }),
});
assert.equal(pending.ok, false);
assert.equal(pending.pending, true);
assert.equal(pending.route.status, 'pending');
assert.equal(validateUiQuestionRecord(pending.question).ok, true);
assert.equal(pending.question.flowPoint, 'information_gate');
assert.equal(pending.decision.gate, 'INFO_GATE_BLOCKED');
assert.equal(pending.decision.decision, 'BLOCKED');
assert.equal(validateGateDecisionRecord(pending.decision).ok, true);
assert.equal(validateQuestionDecisionLink(pending.question, pending.decision).ok, true);
const pendingEvents = readJsonl(path.join(pendingRun.stateRoot, 'runs', pendingRun.runId, 'protocol-events.jsonl'));
assert.deepEqual(pendingEvents.map((event) => event.eventType), ['gate_request_emitted', 'information_gate_decided']);
assert.equal(validateProtocolEventSequence(pendingEvents).ok, true);
const pendingDecisions = readJsonl(path.join(pendingRun.stateRoot, 'runs', pendingRun.runId, 'gate-decisions.jsonl'));
assert.equal(pendingDecisions.length, 1);
assert.equal(pendingDecisions[0].gate, 'INFO_GATE_BLOCKED');


const missingSelectionRun = createRun('Implementar relatorio simples');
const missingSelection = confirmModeRoute({
  stateRoot: missingSelectionRun.stateRoot,
  runId: missingSelectionRun.runId,
  prompt: missingSelectionRun.prompt,
  askQuestion: () => ({ ok: true }),
});
assert.equal(missingSelection.ok, false);
assert.equal(missingSelection.fallbackUsed, true);
assert.equal(missingSelection.decision.decision, 'BLOCKED');
assert.equal(missingSelection.decision.selectedOptionId, 'block-route');

const recursionRun = createRun('Implementar relatorio simples');
const recursion = confirmModeRoute({
  stateRoot: recursionRun.stateRoot,
  runId: recursionRun.runId,
  prompt: recursionRun.prompt,
  routeHistory: ['feature-light', 'feature-heavy', 'feature-light'],
  askQuestion: () => ({ ok: true, selectedOptionId: 'approve-route' }),
});
assert.equal(recursion.ok, false);
assert.equal(recursion.recursionBlocked, true);
assert.equal(recursion.decision.gate, 'STEP_1_7_RECURSION_GUARD');
assert.equal(recursion.decision.decision, 'BLOCKED');
const recursionEvents = readJsonl(path.join(recursionRun.stateRoot, 'runs', recursionRun.runId, 'protocol-events.jsonl'));
assert.equal(recursionEvents.some((event) => event.eventType === 'step_1_7_recursion_guard'), true);
assert.equal(validateProtocolEventSequence(recursionEvents).ok, true);
const noUiRun = createRun('Criar SPEC com requisitos e tasks');
const noUi = confirmModeRoute({
  stateRoot: noUiRun.stateRoot,
  runId: noUiRun.runId,
  prompt: noUiRun.prompt,
});
assert.equal(noUi.ok, false);
assert.equal(noUi.fallbackUsed, true);
assert.equal(noUi.decision.decision, 'BLOCKED');
assert.equal(noUi.decision.selectedOptionId, 'block-route');

const outsideRoot = path.join(process.cwd(), '..', 'po-open-code-sprint6-outside-negative');
assert.throws(() => confirmModeRoute({
  stateRoot: outsideRoot,
  runId: '001-safe-run',
  prompt: 'Auditar modulo',
  askQuestion: () => ({ ok: true, selectedOptionId: 'approve-route' }),
}), /stateRoot must be inside adaptation tmp/);

console.log('mode routing sprint6 OK');
