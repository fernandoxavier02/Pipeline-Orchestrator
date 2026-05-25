'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const {
  UI_QUESTION_MATRIX,
  runUiGateInteraction,
  readJsonl,
} = require('../../src/opencode/ui-gate-interaction.cjs');
const {
  validateQuestionDecisionLink,
  validateProtocolEventSequence,
  validateUiQuestionRecord,
} = require('../../src/validators/contract-validator.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-ui-gate-'));
const run = startRun({
  stateRoot,
  prompt: 'classify sprint 4',
  batchId: 'batch-004',
  sliceId: 'sprint-4-ui-gate',
  observableOutcome: 'UI question records gate decision',
  allowedSurfaces: ['../opencode-adaptation/src/opencode/**'],
});

assert.deepEqual(
  Object.keys(UI_QUESTION_MATRIX).sort(),
  ['bypass', 'classification', 'closeout', 'third_attempt', 'tracing'].sort()
);
for (const [key, question] of Object.entries(UI_QUESTION_MATRIX)) {
  assert.ok(question.options.some((option) => option.id === question.recommendedOptionId), `${key} recommendation must exist`);
}
assert.equal(UI_QUESTION_MATRIX.classification.recommendedOptionId, 'feature-heavy');

const result = runUiGateInteraction({
  stateRoot,
  runId: run.runId,
  questionKey: 'classification',
  selectedOptionId: 'feature-heavy',
  phase: 'phase_0_to_1',
  flowPoint: 'classification_confirmation',
  askQuestion: (question) => ({ ok: true, selectedOptionId: question.recommendedOptionId }),
});

assert.equal(result.ok, true);
assert.equal(result.fallbackUsed, false);
assert.equal(result.question.schemaVersion, 'UI_QUESTION_RECORD/v1');
assert.equal(result.decision.schemaVersion, 'GATE_DECISION_RECORD/v1');
assert.equal(result.decision.questionId, result.question.questionId);
assert.equal(result.decision.selectedOptionId, 'feature-heavy');
assert.equal(validateQuestionDecisionLink(result.question, result.decision).ok, true);

const questions = readJsonl(path.join(stateRoot, 'runs', run.runId, 'ui-questions.jsonl'));
assert.equal(questions.length, 1);
assert.equal(questions[0].questionId, result.question.questionId);
assert.equal(validateUiQuestionRecord(questions[0]).ok, true);

const protocolEvents = readJsonl(path.join(stateRoot, 'runs', run.runId, 'protocol-events.jsonl'));
assert.equal(protocolEvents.map((event) => event.eventType).join(','), 'ui_question_emitted,gate_decision_recorded');
assert.equal(validateProtocolEventSequence(protocolEvents).ok, true);

const decisions = readJsonl(path.join(stateRoot, 'runs', run.runId, 'gate-decisions.jsonl'));
assert.equal(decisions.length, 1);
assert.equal(decisions[0].decision, 'APPROVED');
assert.equal(decisions[0].selectedOptionId, 'feature-heavy');

const fallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-ui-gate-fallback-'));
const fallbackRun = startRun({
  stateRoot: fallbackRoot,
  prompt: 'question ui failure',
  batchId: 'batch-004',
  sliceId: 'sprint-4-ui-fallback',
  observableOutcome: 'UI failure blocks safely',
  allowedSurfaces: ['../opencode-adaptation/src/opencode/**'],
});

const fallback = runUiGateInteraction({
  stateRoot: fallbackRoot,
  runId: fallbackRun.runId,
  questionKey: 'closeout',
  phase: 'phase_3_closeout',
  flowPoint: 'closeout_score',
  askQuestion: () => { throw new Error('question unavailable'); },
});

assert.equal(fallback.ok, false);
assert.equal(fallback.fallbackUsed, true);
assert.equal(fallback.decision.decision, 'BLOCKED');
assert.equal(fallback.decision.selectedOptionId, 'keep-open');
assert.equal(validateQuestionDecisionLink(fallback.question, fallback.decision).ok, true);
assert.match(fallback.decision.detail, /Question UI unavailable/);
const fallbackEvents = readJsonl(path.join(fallbackRoot, 'runs', fallbackRun.runId, 'protocol-events.jsonl'));
assert.equal(fallbackEvents.some((event) => event.eventType === 'question_ui_failed'), true);

const missingUiRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-ui-gate-missing-'));
const missingUiRun = startRun({
  stateRoot: missingUiRoot,
  prompt: 'missing question ui',
  batchId: 'batch-004',
  sliceId: 'sprint-4-ui-missing',
  observableOutcome: 'Missing UI blocks safely',
  allowedSurfaces: ['../opencode-adaptation/src/opencode/**'],
});
const missingUi = runUiGateInteraction({
  stateRoot: missingUiRoot,
  runId: missingUiRun.runId,
  questionKey: 'classification',
  phase: 'phase_0_to_1',
  flowPoint: 'classification_confirmation',
});
assert.equal(missingUi.ok, false);
assert.equal(missingUi.fallbackUsed, true);
assert.equal(missingUi.decision.decision, 'BLOCKED');
assert.equal(missingUi.decision.selectedOptionId, 'block');
assert.equal(validateQuestionDecisionLink(missingUi.question, missingUi.decision).ok, true);

const invalidUiRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-ui-gate-invalid-'));
const invalidUiRun = startRun({
  stateRoot: invalidUiRoot,
  prompt: 'invalid question ui option',
  batchId: 'batch-004',
  sliceId: 'sprint-4-ui-invalid',
  observableOutcome: 'Invalid UI option blocks with valid fallback',
  allowedSurfaces: ['../opencode-adaptation/src/opencode/**'],
});
const invalidUi = runUiGateInteraction({
  stateRoot: invalidUiRoot,
  runId: invalidUiRun.runId,
  questionKey: 'classification',
  phase: 'phase_0_to_1',
  flowPoint: 'classification_confirmation',
  askQuestion: () => ({ ok: true, selectedOptionId: 'not-in-menu' }),
});
assert.equal(invalidUi.ok, false);
assert.equal(invalidUi.fallbackUsed, true);
assert.equal(invalidUi.decision.decision, 'BLOCKED');
assert.equal(invalidUi.decision.selectedOptionId, 'block');
assert.equal(validateQuestionDecisionLink(invalidUi.question, invalidUi.decision).ok, true);
assert.throws(
  () => runUiGateInteraction({
    stateRoot,
    runId: '..\\escape',
    questionKey: 'classification',
    phase: 'phase_0_to_1',
    flowPoint: 'classification_confirmation',
    askQuestion: () => ({ ok: true, selectedOptionId: 'feature-heavy' }),
  }),
  /runId contains unsafe path characters/
);

console.log('ui gate sprint4 OK');
