'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateGateDecisionRecord,
  validateProtocolEventRecord,
  validateProtocolEventSequence,
  validateQuestionDecisionLink,
  validateUiQuestionRecord,
} = require('../validators/contract-validator.cjs');

const MODE_ROUTE_FAMILIES = Object.freeze(['bugfix', 'feature', 'audit', 'ux', 'spec', 'pipeline-full']);
const SAFE_BLOCK_OPTION = 'block-route';

const FAMILY_CONFIG = Object.freeze({
  bugfix: Object.freeze({
    label: 'Bugfix',
    agentsExpected: Object.freeze(['pipeline-pre-tester', 'pipeline-implementer', 'pipeline-validator']),
    gatesExpected: Object.freeze(['RED_REPRODUCTION', 'TDD_APPROVAL', 'GREEN_REGRESSION', 'COMPLEXITY_GATE']),
    risks: Object.freeze(['Exigir reproducao, teste vermelho e regressao antes de executar correcao.']),
  }),
  feature: Object.freeze({
    label: 'Feature/implement',
    agentsExpected: Object.freeze(['pipeline-planner', 'pipeline-pre-tester', 'pipeline-implementer', 'pipeline-validator']),
    gatesExpected: Object.freeze(['VERTICAL_SLICE', 'TDD_APPROVAL', 'INTEGRATION_GATE', 'COMPLEXITY_GATE']),
    risks: Object.freeze(['Definir slice vertical e prova de integracao antes de implementar.']),
  }),
  audit: Object.freeze({
    label: 'Audit',
    agentsExpected: Object.freeze(['pipeline-adversarial-security', 'pipeline-adversarial-architecture', 'pipeline-adversarial-quality']),
    gatesExpected: Object.freeze(['READ_ONLY_SCOPE', 'FINDINGS_EVIDENCE', 'COMPLEXITY_GATE']),
    risks: Object.freeze(['Manter modo somente leitura e registrar achados com evidencia.']),
    readOnly: true,
  }),
  ux: Object.freeze({
    label: 'UX',
    agentsExpected: Object.freeze(['pipeline-planner', 'pipeline-validator']),
    gatesExpected: Object.freeze(['PERSONA_JOURNEY_GATE', 'ACCESSIBILITY_GATE', 'COMPLEXITY_GATE']),
    risks: Object.freeze(['Confirmar persona e jornada antes de validar experiencia.']),
  }),
  spec: Object.freeze({
    label: 'SPEC',
    agentsExpected: Object.freeze(['pipeline-information-gate', 'pipeline-planner', 'pipeline-validator']),
    gatesExpected: Object.freeze(['SPEC_ARTIFACT_MISSING', 'SPEC_FORMAT_GATE_FAIL', 'SPEC_AC_TRACEABILITY_GAP', 'COMPLEXITY_GATE']),
    risks: Object.freeze(['Exigir requisitos, design, tarefas e rastreio de aceite sem executar a SPEC agora.']),
    executesSpec: false,
  }),
  'pipeline-full': Object.freeze({
    label: 'Pipeline full',
    agentsExpected: Object.freeze(['pipeline-run-orchestrator', 'pipeline-information-gate']),
    gatesExpected: Object.freeze(['CLASSIFICATION_CONFIRMATION', 'STEP_1_7_ROUTING', 'COMPLEXITY_GATE']),
    risks: Object.freeze(['Confirmar rota antes de despachar qualquer fluxo de modo.']),
  }),
});

const SIGNALS = Object.freeze({
  bugfix: [/\bbug\b/i, /erro/i, /falha/i, /corrig/i, /consert/i, /quebr/i, /reprodu/i, /regress/i],
  feature: [/implement/i, /feature/i, /funcionalidade/i, /adicionar/i, /criar/i, /constru/i, /entregar/i],
  audit: [/audit/i, /auditar/i, /revis[aã]o/i, /revisar/i, /seguran[cç]a/i, /read[- ]?only/i, /somente leitura/i],
  ux: [/\bux\b/i, /experi[eê]ncia/i, /jornada/i, /persona/i, /acessibilidade/i, /interface/i, /fluxo/i],
  spec: [/\bspec\b/i, /especifica/i, /requisit/i, /design/i, /tasks?/i, /tarefas?/i, /crit[eé]rios? de aceite/i],
  'pipeline-full': [/pipeline/i, /classificador/i, /roteamento/i, /modo correto/i, /full/i, /orchestrator/i],
});

const HEAVY_SIGNALS = Object.freeze([
  /complex/i,
  /cr[ií]tic/i,
  /produ[cç][aã]o/i,
  /arquitet/i,
  /integra[cç][aã]o/i,
  /completa?/i,
  /v[aá]rios?/i,
  /m[uú]ltipl/i,
  /sprint/i,
  /end[- ]?to[- ]?end/i,
  /seguran[cç]a/i,
  /contrat/i,
]);

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`);
}

function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  if (!/^[A-Za-z0-9._-]+$/.test(runId) || /[\\/]|\.\./.test(runId)) throw new Error('runId contains unsafe path characters');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function assertStateRootInsideAdaptation(stateRoot) {
  const tmpRoot = path.resolve(__dirname, '..', '..', 'tmp');
  const resolvedStateRoot = path.resolve(stateRoot);
  if (!isInside(tmpRoot, resolvedStateRoot)) throw new Error('stateRoot must be inside adaptation tmp');
  if (!fs.existsSync(tmpRoot) || !fs.existsSync(resolvedStateRoot)) throw new Error('stateRoot must be inside adaptation tmp');
  const realTmpRoot = fs.realpathSync(tmpRoot);
  const realStateRoot = fs.realpathSync(resolvedStateRoot);
  if (!isInside(realTmpRoot, realStateRoot)) throw new Error('stateRoot must be inside adaptation tmp');
}

function runDirFor(stateRoot, runId) {
  assertAbsolute('stateRoot', stateRoot);
  assertStateRootInsideAdaptation(stateRoot);
  assertSafeRunId(runId);
  const runsRoot = path.resolve(stateRoot, 'runs');
  const resolved = path.resolve(runsRoot, runId);
  const relative = path.relative(runsRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('runId contains unsafe path characters');
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

function pathsFor(stateRoot, runId) {
  const runDir = runDirFor(stateRoot, runId);
  return {
    protocolEvents: path.join(runDir, 'protocol-events.jsonl'),
    gateDecisions: path.join(runDir, 'gate-decisions.jsonl'),
    questions: path.join(runDir, 'ui-questions.jsonl'),
  };
}

function scoreFamilies(prompt) {
  const text = String(prompt || '');
  return Object.fromEntries(MODE_ROUTE_FAMILIES.map((family) => {
    const score = SIGNALS[family].reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
    return [family, score];
  }));
}

function complexityFor(prompt, family) {
  const text = String(prompt || '');
  let score = HEAVY_SIGNALS.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
  if (family === 'spec') {
    if (/requisit/i.test(text)) score += 1;
    if (/design/i.test(text)) score += 1;
    if (/tasks?/i.test(text) || /tarefas?/i.test(text)) score += 1;
  }
  if (family === 'pipeline-full') score += 2;
  if (family === 'feature' && /integra[cç][aã]o/i.test(text)) score += 1;
  return { score, variant: score >= 2 ? 'heavy' : 'light' };
}

function classifyModeRoute(prompt) {
  const scores = scoreFamilies(prompt);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [family, score] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : 0;
  if (score === 0 || (score === second && score < 2)) {
    return {
      status: 'pending',
      family: null,
      variant: null,
      complexity: 'unknown',
      risks: ['Pedido ambiguo: falta sinal forte de familia ou complexidade.'],
      gatesExpected: ['INFO_GATE_BLOCKED'],
      agentsExpected: ['pipeline-information-gate'],
      reason: 'ambiguous route signals; user confirmation cannot approve an invented route',
    };
  }
  const complexity = complexityFor(prompt, family);
  const config = FAMILY_CONFIG[family];
  return {
    status: 'proposed',
    family,
    variant: complexity.variant,
    complexity: complexity.variant,
    risks: [...config.risks],
    gatesExpected: [...config.gatesExpected],
    agentsExpected: [...config.agentsExpected],
    reason: `${config.label} matched ${score} route signal(s); complexity score ${complexity.score}.`,
    readOnly: config.readOnly === true,
    executesSpec: config.executesSpec === false ? false : undefined,
  };
}

function lastEventId(eventsPath) {
  const events = readJsonl(eventsPath);
  return events.length ? events[events.length - 1].eventId : null;
}

function appendProtocolEvent(paths, event) {
  const nextEvents = [...readJsonl(paths.protocolEvents), event];
  const sequence = validateProtocolEventSequence(nextEvents);
  if (!sequence.ok) throw new Error(sequence.message);
  appendJsonl(paths.protocolEvents, event);
}


function buildInformationGateQuestion(runId, route, now) {
  const question = {
    schemaVersion: 'UI_QUESTION_RECORD/v1',
    runId,
    questionId: newId('question'),
    phase: 'phase_0_to_1',
    flowPoint: 'information_gate',
    questionText: 'Falta informa??o para continuar. Escolha como resolver.',
    options: [
      { id: 'use-recommended', label: 'Usar op??o recomendada', effect: 'Registrar bloqueio seguro ate haver informacao suficiente.' },
      { id: 'provide-adjustment', label: 'Fornecer ajuste', effect: 'Pedir nova classificacao com informacao adicional.' },
      { id: SAFE_BLOCK_OPTION, label: 'Bloquear por falta cr?tica', effect: 'Bloquear rota por falta critica.' },
    ],
    recommendedOptionId: SAFE_BLOCK_OPTION,
    reason: route.reason || 'Pedido ambiguo exige information-gate antes de inventar rota.',
    emittedAt: now,
    emittedBy: 'mode-routing',
    writesProtocolEvent: true,
    linkedGateId: 'INFO_GATE_BLOCKED',
  };
  const validation = validateUiQuestionRecord(question);
  if (!validation.ok) throw new Error(validation.message);
  return question;
}

function buildQuestion(runId, route, now) {
  const opposite = route.variant === 'heavy' ? 'light' : 'heavy';
  const question = {
    schemaVersion: 'UI_QUESTION_RECORD/v1',
    runId,
    questionId: newId('question'),
    phase: 'phase_0_to_1',
    flowPoint: 'classification_confirmation',
    questionText: 'Confirmar modo, complexidade e rota propostos?',
    options: [
      { id: 'approve-route', label: 'Aprovar rota proposta (Recomendado)', effect: 'Confirmar rota sem executar ainda o fluxo do modo.' },
      { id: `adjust-${opposite}`, label: `Ajustar para ${opposite}`, effect: `Confirmar a mesma familia com variante ${opposite}.` },
      { id: SAFE_BLOCK_OPTION, label: 'Bloquear', effect: 'Bloquear ate a classificacao ser corrigida.' },
    ],
    recommendedOptionId: 'approve-route',
    reason: route.reason,
    emittedAt: now,
    emittedBy: 'mode-routing',
    writesProtocolEvent: true,
    linkedGateId: 'STEP_1_7_ROUTING',
  };
  const validation = validateUiQuestionRecord(question);
  if (!validation.ok) throw new Error(validation.message);
  return question;
}

function buildEvent({ runId, eventType, phase, actor, payloadRef, parentEventId, severity = 'info', now }) {
  const event = {
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
  const validation = validateProtocolEventRecord(event);
  if (!validation.ok) throw new Error(validation.message);
  return event;
}

function buildDecision({ runId, question, selectedOptionId, decision, detail, now, confidenceImpact, route, gate }) {
  const record = {
    schemaVersion: 'GATE_DECISION_RECORD/v1',
    runId,
    gate: gate || 'STEP_1_7_ROUTING',
    hardness: 'HARD',
    phase: question.phase,
    decision,
    decided_by: 'question-ui',
    timestamp: now,
    detail,
    confidence_impact: confidenceImpact,
    questionId: question.questionId,
    selectedOptionId,
    family: route.family,
    variant: route.variant,
    complexity: route.complexity,
    mode: `${route.family}-${route.variant}`,
    gatesExpected: route.gatesExpected,
    agentsExpected: route.agentsExpected,
  };
  const validation = validateGateDecisionRecord(record);
  if (!validation.ok) throw new Error(validation.message);
  if (record.gate === question.linkedGateId) {
    const link = validateQuestionDecisionLink(question, record);
    if (!link.ok) throw new Error(link.message);
  }
  return record;
}

function selectedRoute(route, selectedOptionId) {
  const adjusted = selectedOptionId.startsWith('adjust-');
  if (!adjusted) return { route: { ...route }, adjusted: false };
  const variant = selectedOptionId.replace('adjust-', '');
  return { route: { ...route, variant, complexity: variant }, adjusted: true };
}

function confirmModeRoute({ stateRoot, runId, prompt, askQuestion, routeHistory = [] }) {
  const route = classifyModeRoute(prompt);
  const now = new Date().toISOString();
  const paths = pathsFor(stateRoot, runId);
  if (route.status !== 'proposed') {
    const question = buildInformationGateQuestion(runId, route, now);
    appendJsonl(paths.questions, question);
    const questionEvent = buildEvent({
      runId,
      eventType: 'gate_request_emitted',
      phase: question.phase,
      actor: 'mode-routing',
      payloadRef: question.questionId,
      parentEventId: lastEventId(paths.protocolEvents),
      severity: 'high',
      now,
    });
    appendProtocolEvent(paths, questionEvent);
    const decision = buildDecision({
      runId,
      question,
      selectedOptionId: SAFE_BLOCK_OPTION,
      decision: 'BLOCKED',
      detail: 'Information-gate blocked ambiguous request; canonical question, event and gate decision were recorded.',
      now,
      confidenceImpact: -30,
      route: { family: 'unknown', variant: 'unknown', complexity: 'unknown', gatesExpected: ['INFO_GATE_BLOCKED'], agentsExpected: ['pipeline-information-gate'] },
      gate: 'INFO_GATE_BLOCKED',
    });
    const decisionEvent = buildEvent({
      runId,
      eventType: 'information_gate_decided',
      phase: question.phase,
      actor: 'mode-routing',
      payloadRef: decision.gate,
      parentEventId: questionEvent.eventId,
      severity: 'high',
      now,
    });
    appendProtocolEvent(paths, decisionEvent);
    appendJsonl(paths.gateDecisions, decision);
    return { ok: false, pending: true, route, question, decision, protocolEvent: decisionEvent };
  }

  if (Array.isArray(routeHistory) && routeHistory.length >= 3) {
    const decision = {
      schemaVersion: 'GATE_DECISION_RECORD/v1',
      runId,
      gate: 'STEP_1_7_RECURSION_GUARD',
      hardness: 'CIRCUIT_BREAKER',
      phase: 'phase_0_to_1',
      decision: 'BLOCKED',
      decided_by: 'mode-routing',
      timestamp: now,
      detail: 'Route history exceeded safe reclassification limit; blocked before another route approval.',
      confidence_impact: -40,
      family: route.family,
      variant: route.variant,
      complexity: route.complexity,
    };
    const validation = validateGateDecisionRecord(decision);
    if (!validation.ok) throw new Error(validation.message);
    const guardEvent = buildEvent({
      runId,
      eventType: 'step_1_7_recursion_guard',
      phase: 'phase_0_to_1',
      actor: 'mode-routing',
      payloadRef: 'STEP_1_7_RECURSION_GUARD',
      parentEventId: lastEventId(paths.protocolEvents),
      severity: 'critical',
      now,
    });
    appendProtocolEvent(paths, guardEvent);
    appendJsonl(paths.gateDecisions, decision);
    return { ok: false, recursionBlocked: true, route, decision, protocolEvent: guardEvent };
  }
  const question = buildQuestion(runId, route, now);
  appendJsonl(paths.questions, question);
  const questionEvent = buildEvent({
    runId,
    eventType: 'ui_question_emitted',
    phase: question.phase,
    actor: 'mode-routing',
    payloadRef: question.questionId,
    parentEventId: lastEventId(paths.protocolEvents),
    now,
  });
  appendProtocolEvent(paths, questionEvent);

  let selectedOptionId;
  let uiFallback = false;
  try {
    if (typeof askQuestion !== 'function') throw new Error('Question UI unavailable');
    const answer = askQuestion(question);
    if (!answer || answer.ok === false) throw new Error('Question UI unavailable');
    if (typeof answer.selectedOptionId !== 'string' || answer.selectedOptionId.length === 0) throw new Error('Question UI did not return an explicit menu option');
    selectedOptionId = answer.selectedOptionId;
  } catch (error) {
    selectedOptionId = SAFE_BLOCK_OPTION;
    uiFallback = true;
  }

  const option = question.options.find((item) => item.id === selectedOptionId);
  const invalidOption = !option;
  const blocked = invalidOption || selectedOptionId === SAFE_BLOCK_OPTION;
  const safeOptionId = invalidOption ? SAFE_BLOCK_OPTION : selectedOptionId;
  const safeRoute = selectedRoute(route, safeOptionId);
  const detail = invalidOption
    ? 'Question UI returned an option outside the matrix; safe fallback blocked route approval.'
    : blocked
      ? 'Route confirmation was blocked by UI decision or unavailable question UI.'
      : safeRoute.adjusted
        ? `Route adjusted by UI to ${safeRoute.route.family}-${safeRoute.route.variant}.`
        : `Route confirmed as ${safeRoute.route.family}-${safeRoute.route.variant}; mode flow not executed.`;
  const decision = buildDecision({
    runId,
    question,
    selectedOptionId: safeOptionId,
    decision: blocked ? 'BLOCKED' : 'APPROVED',
    detail,
    now,
    confidenceImpact: blocked ? -30 : 10,
    route: blocked ? route : safeRoute.route,
  });
  const decisionEvent = buildEvent({
    runId,
    eventType: blocked && invalidOption ? 'question_ui_failed' : 'step_1_7_routing_decided',
    phase: question.phase,
    actor: 'mode-routing',
    payloadRef: decision.gate,
    parentEventId: questionEvent.eventId,
    severity: blocked ? 'high' : 'info',
    now,
  });
  appendProtocolEvent(paths, decisionEvent);
  appendJsonl(paths.gateDecisions, decision);
  return {
    ok: !blocked,
    pending: false,
    fallbackUsed: invalidOption || uiFallback,
    adjusted: !blocked && safeRoute.adjusted,
    route: blocked ? route : safeRoute.route,
    question,
    decision,
    protocolEvent: decisionEvent,
  };
}

module.exports = {
  MODE_ROUTE_FAMILIES,
  classifyModeRoute,
  confirmModeRoute,
  readJsonl,
};
