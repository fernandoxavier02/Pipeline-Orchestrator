'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateUiQuestionRecord,
  validateGateDecisionRecord,
  validateProtocolEventRecord,
  validateQuestionDecisionLink,
} = require('../validators/contract-validator.cjs');

const SAFE_FALLBACK_OPTION = Object.freeze({
  classification: 'block',
  bypass: 'block',
  tracing: 'local-only',
  third_attempt: 'stop-and-review',
  closeout: 'keep-open',
});

const UI_QUESTION_MATRIX = Object.freeze({
  classification: Object.freeze({
    gate: 'CLASSIFICATION_CONFIRMATION',
    questionText: 'Confirmar a rota da execucao?',
    recommendedOptionId: 'feature-heavy',
    reason: 'Mantem plano, testes, revisao e fechamento para trabalho de sprint.',
    options: Object.freeze([
      { id: 'feature-heavy', label: 'Feature heavy (Recomendado)', effect: 'Aprova execucao completa com batches, TDD e revisao.' },
      { id: 'feature-light', label: 'Feature light', effect: 'Reduz escopo e mantem prova minima.' },
      { id: 'block', label: 'Bloquear', effect: 'Interrompe ate a classificacao ser corrigida.' },
    ]),
  }),
  bypass: Object.freeze({
    gate: 'BYPASS_CONFIRMATION',
    questionText: 'Autorizar bypass deste bloqueio?',
    recommendedOptionId: 'block',
    reason: 'Bloquear e mais seguro quando uma regra de protecao falha.',
    options: Object.freeze([
      { id: 'block', label: 'Bloquear (Recomendado)', effect: 'Mantem o bloqueio e pede correcao.' },
      { id: 'bypass-once', label: 'Bypass unico', effect: 'Permite uma excecao registrada com impacto de confianca.' },
    ]),
  }),
  tracing: Object.freeze({
    gate: 'TRACING_CONSENT',
    questionText: 'Ativar envio externo de rastros?',
    recommendedOptionId: 'local-only',
    reason: 'Local-only evita envio externo sem necessidade comprovada.',
    options: Object.freeze([
      { id: 'local-only', label: 'Somente local (Recomendado)', effect: 'Registra eventos em disco, sem envio externo.' },
      { id: 'external-tracing', label: 'Ativar tracing externo', effect: 'Permite envio externo de metadados autorizados.' },
    ]),
  }),
  third_attempt: Object.freeze({
    gate: 'THIRD_ATTEMPT_APPROVAL',
    questionText: 'Permitir terceira tentativa de correcao?',
    recommendedOptionId: 'stop-and-review',
    reason: 'A terceira tentativa aumenta risco de mexer demais sem nova analise.',
    options: Object.freeze([
      { id: 'stop-and-review', label: 'Parar e revisar (Recomendado)', effect: 'Bloqueia nova tentativa ate revisar a causa.' },
      { id: 'allow-third', label: 'Permitir terceira tentativa', effect: 'Autoriza mais uma tentativa registrada.' },
    ]),
  }),
  closeout: Object.freeze({
    gate: 'CLOSEOUT_CONFIRMATION',
    questionText: 'Fechar a sprint como pronta?',
    recommendedOptionId: 'close-ready',
    reason: 'So fecha quando todas as evidencias obrigatorias existem.',
    options: Object.freeze([
      { id: 'close-ready', label: 'Fechar como pronta (Recomendado)', effect: 'Registra fechamento aprovado.' },
      { id: 'keep-open', label: 'Manter aberta', effect: 'Bloqueia fechamento e registra pendencias.' },
    ]),
  }),
});

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path`);
  }
}

function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  if (/[\\/]|\.\./.test(runId)) throw new Error('runId contains unsafe path characters');
}

function runDirFor(stateRoot, runId) {
  assertSafeRunId(runId);
  const runsRoot = path.resolve(stateRoot, 'runs');
  const resolved = path.resolve(runsRoot, runId);
  const relative = path.relative(runsRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('runId contains unsafe path characters');
  }
  return resolved;
}

function appendJsonl(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + '\n');
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function buildQuestion({ runId, questionKey, phase, flowPoint, now }) {
  const matrix = UI_QUESTION_MATRIX[questionKey];
  if (!matrix) throw new Error(`Unknown question key: ${questionKey}`);
  return {
    schemaVersion: 'UI_QUESTION_RECORD/v1',
    runId,
    questionId: newId('question'),
    phase,
    flowPoint,
    questionText: matrix.questionText,
    options: matrix.options.map((option) => ({ ...option })),
    recommendedOptionId: matrix.recommendedOptionId,
    reason: matrix.reason,
    emittedAt: now,
    emittedBy: 'ui-gate-interaction',
    writesProtocolEvent: true,
    linkedGateId: matrix.gate,
  };
}

function optionFor(question, selectedOptionId) {
  return question.options.find((option) => option.id === selectedOptionId) || null;
}

function buildProtocolEvent({ runId, eventType, phase, actor, payloadRef, parentEventId, severity = 'info', now }) {
  return {
    schemaVersion: 'PROTOCOL_EVENT_RECORD/v1',
    runId,
    eventId: newId('evt'),
    eventType,
    phase,
    timestamp: now,
    actor,
    payloadRef,
    parentEventId,
    severity,
  };
}

function buildDecision({ runId, question, selectedOptionId, decision, detail, now, confidenceImpact }) {
  return {
    schemaVersion: 'GATE_DECISION_RECORD/v1',
    runId,
    gate: question.linkedGateId,
    hardness: 'HARD',
    phase: question.phase,
    decision,
    decided_by: 'question-ui',
    timestamp: now,
    detail,
    confidence_impact: confidenceImpact,
    questionId: question.questionId,
    selectedOptionId,
  };
}

function chooseOption({ question, selectedOptionId, askQuestion }) {
  if (typeof askQuestion !== 'function') throw new Error('Question UI unavailable');
  const answer = askQuestion(question);
  if (!answer || answer.ok === false) throw new Error('Question UI unavailable');
  return answer.selectedOptionId || selectedOptionId || question.recommendedOptionId;
}

function runUiGateInteraction({ stateRoot, runId, questionKey, phase, flowPoint, selectedOptionId, askQuestion }) {
  assertAbsolute('stateRoot', stateRoot);
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  const now = new Date().toISOString();
  const question = buildQuestion({ runId, questionKey, phase, flowPoint, now });
  const questionValidation = validateUiQuestionRecord(question);
  if (!questionValidation.ok) throw new Error(questionValidation.message);

  const runDir = runDirFor(stateRoot, runId);
  const protocolPath = path.join(runDir, 'protocol-events.jsonl');
  const decisionPath = path.join(runDir, 'gate-decisions.jsonl');
  const questionPath = path.join(runDir, 'ui-questions.jsonl');
  const questionEvent = buildProtocolEvent({
    runId,
    eventType: 'ui_question_emitted',
    phase,
    actor: 'ui-gate-interaction',
    payloadRef: question.questionId,
    parentEventId: null,
    now,
  });
  validateProtocolEventRecord(questionEvent);
  appendJsonl(questionPath, question);
  appendJsonl(protocolPath, questionEvent);

  let chosen;
  try {
    chosen = chooseOption({ question, selectedOptionId, askQuestion });
    const option = optionFor(question, chosen);
    if (!option || chosen === 'block' || chosen === 'stop-and-review' || chosen === 'keep-open') {
      const fallbackUsed = !option;
      const blockedOptionId = fallbackUsed ? (SAFE_FALLBACK_OPTION[questionKey] || question.recommendedOptionId) : chosen;
      const blockedOption = optionFor(question, blockedOptionId);
      const detail = fallbackUsed
        ? 'Question UI returned an option outside the matrix; safe fallback blocked the gate.'
        : option.effect;
      const decision = buildDecision({
        runId,
        question,
        selectedOptionId: blockedOptionId,
        decision: 'BLOCKED',
        detail,
        now,
        confidenceImpact: fallbackUsed ? -30 : -20,
      });
      const event = buildProtocolEvent({
        runId,
        eventType: fallbackUsed ? 'question_ui_failed' : 'gate_decision_recorded',
        phase,
        actor: 'ui-gate-interaction',
        payloadRef: question.questionId,
        parentEventId: questionEvent.eventId,
        severity: fallbackUsed ? 'critical' : 'high',
        now,
      });
      validateProtocolEventRecord(event);
      validateGateDecisionRecord(decision);
      const linkValidation = validateQuestionDecisionLink(question, decision);
      if (!blockedOption || !linkValidation.ok) throw new Error('Safe fallback option is not valid for this question');
      appendJsonl(protocolPath, event);
      appendJsonl(decisionPath, decision);
      return { ok: false, fallbackUsed, question, decision, protocolEvent: event };
    }

    const decision = buildDecision({
      runId,
      question,
      selectedOptionId: chosen,
      decision: 'APPROVED',
      detail: option.effect,
      now,
      confidenceImpact: 5,
    });
    const decisionValidation = validateGateDecisionRecord(decision);
    if (!decisionValidation.ok) throw new Error(decisionValidation.message);
    const linkValidation = validateQuestionDecisionLink(question, decision);
    if (!linkValidation.ok) throw new Error(linkValidation.message);
    const event = buildProtocolEvent({
      runId,
      eventType: 'gate_decision_recorded',
      phase,
      actor: 'ui-gate-interaction',
      payloadRef: decision.gate,
      parentEventId: questionEvent.eventId,
      now,
    });
    validateProtocolEventRecord(event);
    appendJsonl(protocolPath, event);
    appendJsonl(decisionPath, decision);
    return { ok: true, fallbackUsed: false, question, decision, protocolEvent: event };
  } catch (error) {
    const decision = buildDecision({
      runId,
      question,
      selectedOptionId: SAFE_FALLBACK_OPTION[questionKey] || question.recommendedOptionId,
      decision: 'BLOCKED',
      detail: 'Question UI unavailable; safe fallback blocked the gate.',
      now,
      confidenceImpact: -30,
    });
    const event = buildProtocolEvent({
      runId,
      eventType: 'question_ui_failed',
      phase,
      actor: 'ui-gate-interaction',
      payloadRef: question.questionId,
      parentEventId: questionEvent.eventId,
      severity: 'critical',
      now,
    });
    validateProtocolEventRecord(event);
    validateGateDecisionRecord(decision);
    const linkValidation = validateQuestionDecisionLink(question, decision);
    if (!linkValidation.ok) throw new Error(linkValidation.message);
    validateProtocolEventRecord(event);
    appendJsonl(protocolPath, event);
    appendJsonl(decisionPath, decision);
    return { ok: false, fallbackUsed: true, error: error.message, question, decision, protocolEvent: event };
  }
}

module.exports = {
  UI_QUESTION_MATRIX,
  runUiGateInteraction,
  readJsonl,
};
