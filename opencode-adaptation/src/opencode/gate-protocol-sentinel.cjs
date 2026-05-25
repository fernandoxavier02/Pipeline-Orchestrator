'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateGateDecisionRecord,
  validateProtocolEventRecord,
  validateProtocolEventSequence,
  validateSentinelState,
  validateProtocolHandshakeTimeout,
  evaluateHandshakeTimeout,
} = require('../validators/contract-validator.cjs');

const GATE_PROTOCOL_EVENTS = Object.freeze({
  GATE_REQUEST: 'GATE_REQUEST',
  DISPATCH_REQUEST: 'DISPATCH_REQUEST',
  PLAN_MODE_REQUEST: 'PLAN_MODE_REQUEST',
});

const SENTINEL_CHECKPOINTS = Object.freeze([
  'post_orchestrator',
  'phase_0_to_1',
  'phase_1_to_2',
  'phase_2_to_3',
  'post_final_validator',
]);

const CHECKPOINT_PREREQUISITES = Object.freeze({
  phase_0_to_1: ['post_orchestrator'],
  phase_1_to_2: ['phase_0_to_1'],
  phase_2_to_3: ['phase_0_to_1', 'phase_1_to_2'],
  post_final_validator: ['post_orchestrator', 'phase_0_to_1', 'phase_1_to_2', 'phase_2_to_3'],
});

const DEFAULT_REQUIRED_GATES = Object.freeze({
  phase_0_to_1: ['INFO_GATE_BLOCKED'],
});

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`);
}

function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  if (/[\\/]|\.\./.test(runId)) throw new Error('runId contains unsafe path characters');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function assertStateRootInsideAdaptation(stateRoot) {
  const tmpRoot = path.resolve(__dirname, '..', '..', 'tmp');
  const resolvedStateRoot = path.resolve(stateRoot);
  if (!isInside(tmpRoot, resolvedStateRoot)) {
    throw new Error('stateRoot must be inside adaptation tmp');
  }
  if (fs.existsSync(tmpRoot) && fs.existsSync(resolvedStateRoot)) {
    const realTmpRoot = fs.realpathSync(tmpRoot);
    const realStateRoot = fs.realpathSync(resolvedStateRoot);
    if (!isInside(realTmpRoot, realStateRoot)) {
      throw new Error('stateRoot must be inside adaptation tmp');
    }
  }
}

function runDirFor(stateRoot, runId) {
  assertAbsolute('stateRoot', stateRoot);
  assertStateRootInsideAdaptation(stateRoot);
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function sanitizeDetail(detail) {
  return String(detail || 'No detail provided.')
    .replace(/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=REDACTED')
    .replace(/\b(token)\s+[^\s,;]+/gi, '$1 REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer REDACTED');
}

function pathsFor(stateRoot, runId) {
  const runDir = runDirFor(stateRoot, runId);
  return {
    runDir,
    protocolEvents: path.join(runDir, 'protocol-events.jsonl'),
    gateDecisions: path.join(runDir, 'gate-decisions.jsonl'),
    sentinelState: path.join(runDir, 'sentinel-state.json'),
  };
}

function lastEventId(protocolPath) {
  const events = readJsonl(protocolPath);
  return events.length ? events[events.length - 1].eventId : null;
}

function buildEvent({ stateRoot, runId, eventType, phase, actor, payloadRef, severity = 'info', now }) {
  const paths = pathsFor(stateRoot, runId);
  const event = {
    schemaVersion: 'PROTOCOL_EVENT_RECORD/v1',
    runId,
    eventId: newId('evt'),
    eventType,
    phase,
    timestamp: now || new Date().toISOString(),
    actor,
    payloadRef: sanitizeDetail(payloadRef),
    parentEventId: lastEventId(paths.protocolEvents),
    severity,
  };
  const validation = validateProtocolEventRecord(event);
  if (!validation.ok) throw new Error(validation.message);
  return event;
}

function appendEvent(stateRoot, runId, event) {
  const paths = pathsFor(stateRoot, runId);
  const nextEvents = [...readJsonl(paths.protocolEvents), event];
  const sequence = validateProtocolEventSequence(nextEvents);
  if (!sequence.ok) throw new Error(sequence.message);
  appendJsonl(paths.protocolEvents, event);
}

function loadSentinel(stateRoot, runId, now) {
  const paths = pathsFor(stateRoot, runId);
  if (fs.existsSync(paths.sentinelState)) return readJson(paths.sentinelState);
  return {
    schemaVersion: 'SENTINEL_STATE/v1',
    runId,
    currentPhase: 'session_start',
    checkpoints: {},
    blocked: false,
    stopRuleTriggered: false,
    lastValidEventId: null,
    updatedAt: now || new Date().toISOString(),
  };
}

function saveSentinel(stateRoot, runId, sentinel) {
  const validation = validateSentinelState(sentinel, sentinel.currentPhase === 'closed' ? { phase: 'final' } : {});
  if (!validation.ok) throw new Error(validation.message);
  writeJson(pathsFor(stateRoot, runId).sentinelState, sentinel);
}

function appendGateDecision(stateRoot, runId, decision) {
  const validation = validateGateDecisionRecord(decision);
  if (!validation.ok) throw new Error(validation.message);
  appendJsonl(pathsFor(stateRoot, runId).gateDecisions, decision);
}

function gateDecisionRecord({ runId, gate, hardness, phase, decision, decidedBy, detail, confidenceImpact, now }) {
  const record = {
    schemaVersion: 'GATE_DECISION_RECORD/v1',
    runId,
    gate,
    hardness,
    phase,
    decision,
    decided_by: decidedBy || 'system',
    timestamp: now || new Date().toISOString(),
    detail: sanitizeDetail(detail),
    confidence_impact: confidenceImpact,
  };
  const validation = validateGateDecisionRecord(record);
  if (!validation.ok) throw new Error(validation.message);
  return record;
}

function approvedGateSet(stateRoot, runId) {
  return new Set(readJsonl(pathsFor(stateRoot, runId).gateDecisions)
    .filter((record) => validateGateDecisionRecord(record).ok && record.decision === 'APPROVED')
    .map((record) => record.gate));
}

function runGateRequest({ stateRoot, runId, gate, hardness, phase, decision, decidedBy, detail, confidenceImpact = 0, now }) {
  const timestamp = now || new Date().toISOString();
  const event = buildEvent({ stateRoot, runId, eventType: GATE_PROTOCOL_EVENTS.GATE_REQUEST, phase, actor: 'gate-protocol', payloadRef: gate, now: timestamp });
  appendEvent(stateRoot, runId, event);
  const gateDecision = gateDecisionRecord({ runId, gate, hardness, phase, decision, decidedBy, detail, confidenceImpact, now: timestamp });
  appendGateDecision(stateRoot, runId, gateDecision);
  const decisionEvent = buildEvent({ stateRoot, runId, eventType: 'gate_decision_recorded', phase, actor: 'gate-protocol', payloadRef: gate, now: timestamp });
  appendEvent(stateRoot, runId, decisionEvent);
  return { ok: decision === 'APPROVED', event, gateDecision, protocolEvent: decisionEvent };
}

function runPlanModeRequest({ stateRoot, runId, phase, planMode, now }) {
  const event = buildEvent({
    stateRoot,
    runId,
    eventType: GATE_PROTOCOL_EVENTS.PLAN_MODE_REQUEST,
    phase,
    actor: 'gate-protocol',
    payloadRef: `plan-mode:${String(planMode || 'unspecified')}`,
    now: now || new Date().toISOString(),
  });
  appendEvent(stateRoot, runId, event);
  return { ok: true, protocolEvent: event };
}

function blockCheckpoint({ stateRoot, runId, checkpointName, gate, detail, now, eventType = 'sentinel_checkpoint_failed' }) {
  const timestamp = now || new Date().toISOString();
  const event = buildEvent({ stateRoot, runId, eventType, phase: checkpointName, actor: 'sentinel', payloadRef: checkpointName, severity: 'high', now: timestamp });
  appendEvent(stateRoot, runId, event);
  const gateDecision = gateDecisionRecord({
    runId,
    gate: gate || 'CHECKPOINT_FAIL',
    hardness: 'HARD',
    phase: checkpointName,
    decision: 'BLOCKED',
    decidedBy: 'sentinel',
    detail,
    confidenceImpact: -40,
    now: timestamp,
  });
  appendGateDecision(stateRoot, runId, gateDecision);
  const sentinelState = loadSentinel(stateRoot, runId, timestamp);
  sentinelState.currentPhase = checkpointName;
  sentinelState.checkpoints[checkpointName] = { status: 'BLOCK', eventId: event.eventId, checkedAt: timestamp };
  sentinelState.blocked = true;
  sentinelState.stopRuleTriggered = true;
  sentinelState.lastValidEventId = event.eventId;
  sentinelState.updatedAt = timestamp;
  saveSentinel(stateRoot, runId, sentinelState);
  return { ok: false, blocked: true, protocolEvent: event, gateDecision, sentinelState };
}

function applySentinelCheckpoint({ stateRoot, runId, checkpointName, requiredGates = [], now }) {
  if (!SENTINEL_CHECKPOINTS.includes(checkpointName)) throw new Error(`Unknown sentinel checkpoint: ${checkpointName}`);
  const currentSentinel = loadSentinel(stateRoot, runId, now || new Date().toISOString());
  const gates = approvedGateSet(stateRoot, runId);
  const required = requiredGates.length > 0 ? requiredGates : (DEFAULT_REQUIRED_GATES[checkpointName] || []);
  const missing = required.filter((gate) => !gates.has(gate));
  if (missing.length > 0) {
    return blockCheckpoint({
      stateRoot,
      runId,
      checkpointName,
      detail: `Required gate missing: ${missing.join(', ')}`,
      now,
    });
  }
  const missingPrerequisite = (CHECKPOINT_PREREQUISITES[checkpointName] || []).filter((name) => !currentSentinel.checkpoints[name]);
  if (missingPrerequisite.length > 0) {
    return blockCheckpoint({
      stateRoot,
      runId,
      checkpointName,
      detail: `Previous checkpoint missing: ${missingPrerequisite.join(', ')}`,
      now,
    });
  }
  const blockedPrerequisite = (CHECKPOINT_PREREQUISITES[checkpointName] || []).filter((name) => currentSentinel.checkpoints[name] && currentSentinel.checkpoints[name].status === 'BLOCK');
  if (blockedPrerequisite.length > 0) {
    return blockCheckpoint({
      stateRoot,
      runId,
      checkpointName,
      detail: `Previous checkpoint blocked: ${blockedPrerequisite.join(', ')}`,
      now,
    });
  }
  const timestamp = now || new Date().toISOString();
  const event = buildEvent({ stateRoot, runId, eventType: 'sentinel_checkpoint_applied', phase: checkpointName, actor: 'sentinel', payloadRef: checkpointName, now: timestamp });
  appendEvent(stateRoot, runId, event);
  const sentinelState = loadSentinel(stateRoot, runId, timestamp);
  sentinelState.currentPhase = checkpointName;
  sentinelState.checkpoints[checkpointName] = { status: 'PASS', eventId: event.eventId, checkedAt: timestamp };
  sentinelState.blocked = false;
  sentinelState.stopRuleTriggered = false;
  sentinelState.lastValidEventId = event.eventId;
  sentinelState.updatedAt = timestamp;
  saveSentinel(stateRoot, runId, sentinelState);
  return { ok: true, blocked: false, protocolEvent: event, sentinelState };
}


function blockDispatchHandshake({ stateRoot, runId, phase, dispatchTarget, reason, now }) {
  const timestamp = now || new Date().toISOString();
  const event = buildEvent({
    stateRoot,
    runId,
    eventType: 'handshake_timeout',
    phase,
    actor: 'gate-protocol',
    payloadRef: sanitizeDetail(dispatchTarget || 'dispatch-handshake'),
    severity: 'high',
    now: timestamp,
  });
  appendEvent(stateRoot, runId, event);
  const gateDecision = gateDecisionRecord({
    runId,
    gate: 'PROTOCOL_HANDSHAKE_TIMEOUT',
    hardness: 'HARD',
    phase,
    decision: 'BLOCKED',
    decidedBy: 'gate-protocol',
    detail: reason,
    confidenceImpact: -40,
    now: timestamp,
  });
  appendGateDecision(stateRoot, runId, gateDecision);
  const sentinelState = loadSentinel(stateRoot, runId, timestamp);
  sentinelState.currentPhase = phase;
  sentinelState.checkpoints[phase] = { status: 'BLOCK', eventId: event.eventId, checkedAt: timestamp };
  sentinelState.blocked = true;
  sentinelState.stopRuleTriggered = true;
  sentinelState.lastValidEventId = event.eventId;
  sentinelState.updatedAt = timestamp;
  saveSentinel(stateRoot, runId, sentinelState);
  return { ok: false, blocked: true, protocolEvent: event, gateDecision, sentinelState };
}

function runDispatchRequest({ stateRoot, runId, phase, dispatchTarget, handshakes, now }) {
  const timestamp = now || new Date().toISOString();
  if (!Array.isArray(handshakes) || handshakes.length === 0) {
    return blockDispatchHandshake({ stateRoot, runId, phase, dispatchTarget, reason: 'Dispatch blocked: required handshake record is missing or empty.', now: timestamp });
  }
  for (const handshake of handshakes) {
    const validation = validateProtocolHandshakeTimeout(handshake);
    if (!validation.ok) {
      return blockDispatchHandshake({ stateRoot, runId, phase, dispatchTarget, reason: `Dispatch blocked: invalid handshake record (${validation.code || validation.message}).`, now: timestamp });
    }
    if (handshake.runId !== runId) {
      return blockDispatchHandshake({ stateRoot, runId, phase, dispatchTarget, reason: 'Dispatch blocked: invalid handshake record runId does not match current run.', now: timestamp });
    }
  }
  const event = buildEvent({ stateRoot, runId, eventType: GATE_PROTOCOL_EVENTS.DISPATCH_REQUEST, phase, actor: 'gate-protocol', payloadRef: dispatchTarget, now: timestamp });
  appendEvent(stateRoot, runId, event);
  for (const handshake of handshakes) {
    const timeout = evaluateHandshakeTimeout(handshake, timestamp);
    if (timeout.timedOut) {
      timeout.protocolEvent.parentEventId = event.eventId;
      const eventValidation = validateProtocolEventRecord(timeout.protocolEvent);
      if (!eventValidation.ok) throw new Error(eventValidation.message);
      appendEvent(stateRoot, runId, timeout.protocolEvent);
      appendGateDecision(stateRoot, runId, timeout.gateDecision);
      const sentinelState = loadSentinel(stateRoot, runId, timestamp);
      sentinelState.currentPhase = phase;
      sentinelState.checkpoints[phase] = { status: 'BLOCK', eventId: timeout.protocolEvent.eventId, checkedAt: timestamp };
      sentinelState.blocked = true;
      sentinelState.stopRuleTriggered = true;
      sentinelState.lastValidEventId = timeout.protocolEvent.eventId;
      sentinelState.updatedAt = timestamp;
      saveSentinel(stateRoot, runId, sentinelState);
      return { ok: false, blocked: true, protocolEvent: event, timeout, sentinelState };
    }
  }
  return { ok: true, blocked: false, protocolEvent: event };
}

function validateFinalSentinel({ stateRoot, runId, now }) {
  const timestamp = now || new Date().toISOString();
  const sentinelState = loadSentinel(stateRoot, runId, timestamp);
  const finalState = { ...sentinelState, currentPhase: 'closed', updatedAt: timestamp };
  const validation = validateSentinelState(finalState, { phase: 'final' });
  if (!validation.ok) {
    const event = buildEvent({ stateRoot, runId, eventType: 'final_sentinel_validation_failed', phase: 'closed', actor: 'sentinel', payloadRef: validation.code, severity: 'high', now: timestamp });
    appendEvent(stateRoot, runId, event);
    return { ok: false, message: validation.message, protocolEvent: event, sentinelState };
  }
  const event = buildEvent({ stateRoot, runId, eventType: 'final_sentinel_validated', phase: 'closed', actor: 'sentinel', payloadRef: 'post_final_validator', now: timestamp });
  appendEvent(stateRoot, runId, event);
  finalState.lastValidEventId = event.eventId;
  finalState.updatedAt = timestamp;
  saveSentinel(stateRoot, runId, finalState);
  return { ok: true, protocolEvent: event, sentinelState: finalState };
}

module.exports = {
  GATE_PROTOCOL_EVENTS,
  SENTINEL_CHECKPOINTS,
  runGateRequest,
  runPlanModeRequest,
  runDispatchRequest,
  applySentinelCheckpoint,
  validateFinalSentinel,
  readJsonl,
};
