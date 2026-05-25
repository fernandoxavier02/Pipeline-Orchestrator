'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { redactString } = require('../validators/redactor.cjs');

const STOP_BEFORE_PA_DE_CAL = 'STOP_BEFORE_PA_DE_CAL';

function createRunId() {
  return `run-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17)}-${crypto.randomBytes(4).toString('hex')}`;
}

function createEventId(index) {
  return `evt-${String(index).padStart(3, '0')}`;
}

function isInside(parent, child) {
  const resolvedParent = path.resolve(parent).toLowerCase();
  const resolvedChild = path.resolve(child).toLowerCase();
  const relative = path.relative(resolvedParent, resolvedChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function makeProtocolEvent({ runId, index, eventType, phase, actor, payloadRef, parentEventId, severity }) {
  return {
    schemaVersion: 'PROTOCOL_EVENT_RECORD/v1',
    runId,
    eventId: createEventId(index),
    eventType,
    phase,
    timestamp: new Date().toISOString(),
    actor,
    payloadRef,
    parentEventId,
    severity,
  };
}

function makeGateDecision({ runId, gate, hardness, phase, decision, detail, confidenceImpact }) {
  return {
    schemaVersion: 'GATE_DECISION_RECORD/v1',
    runId,
    gate,
    hardness,
    phase,
    decision,
    decided_by: 'system',
    timestamp: new Date().toISOString(),
    detail,
    confidence_impact: confidenceImpact,
  };
}

function normalizePreToolInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const toolInput = source.tool_input && typeof source.tool_input === 'object' ? source.tool_input : {};
  const rawToolName = source.toolName || source.tool_name || source.name || '';
  const toolName = rawToolName === 'Task' ? 'Agent' : rawToolName;
  const pathValue = source.path || source.filePath || toolInput.path || toolInput.filePath || toolInput.file_path;
  const agentName = source.agentName || source.agent || toolInput.agentName || toolInput.agent || toolInput.subagent_type || toolInput.agent_type;
  return {
    ...toolInput,
    ...source,
    toolName,
    path: pathValue,
    filePath: pathValue,
    agentName,
  };
}

function createHookSmokeHarness({ adaptationRoot, allowedSurfaces, authorizedAgents = [], expectedAgentOrder = [] }) {
  if (!path.isAbsolute(adaptationRoot)) throw new TypeError('adaptationRoot must be absolute');
  if (!Array.isArray(allowedSurfaces) || allowedSurfaces.length === 0) throw new TypeError('allowedSurfaces must be a non-empty array');

  const state = {
    runId: null,
    active: false,
    finalValidatorPassed: false,
    protocolEvents: [],
    protocolPayloads: [],
    agentIndex: 0,
  };
  const allowed = allowedSurfaces.map((surface) => path.resolve(surface));
  const authorized = new Set(authorizedAgents);

  function appendEvent({ eventType, phase, actor, payloadRef, severity }) {
    const event = makeProtocolEvent({
      runId: state.runId,
      index: state.protocolEvents.length + 1,
      eventType,
      phase,
      actor,
      payloadRef,
      parentEventId: state.protocolEvents.length === 0 ? null : state.protocolEvents[state.protocolEvents.length - 1].eventId,
      severity,
    });
    state.protocolEvents.push(event);
    return event;
  }

  function ensureRun() {
    if (!state.runId) state.runId = createRunId();
    state.active = true;
  }

  function handleSessionStart() {
    ensureRun();
    const event = appendEvent({
      eventType: 'run_started',
      phase: 'session_start',
      actor: 'SessionStart',
      payloadRef: 'hook-smoke-session-start',
      severity: 'info',
    });
    return { ok: true, action: 'allow', runId: state.runId, event };
  }

  function handlePromptSubmit(input) {
    if (!state.runId) return { ok: false, action: 'block', code: 'RUN_NOT_STARTED' };
    const sanitizedPrompt = redactString(String(input.prompt || ''));
    const protocolPayload = { prompt: sanitizedPrompt };
    state.protocolPayloads.push(protocolPayload);
    const event = appendEvent({
      eventType: 'prompt_submitted',
      phase: 'user_prompt_submit',
      actor: 'UserPromptSubmit',
      payloadRef: `protocol-payload-${state.protocolPayloads.length}`,
      severity: 'info',
    });
    return { ok: true, action: 'allow', runId: state.runId, event, protocolPayload };
  }

  function blockMissingPath(input) {
    const event = appendEvent({
      eventType: 'tool_use_blocked',
      phase: 'pre_tool_use',
      actor: `PreToolUse:${input.toolName}`,
      payloadRef: 'missing-tool-path',
      severity: 'high',
    });
    return { ok: false, action: 'block', code: 'MISSING_TOOL_PATH', event };
  }

  function handleEditOrWrite(input) {
    if (!state.runId) return { ok: false, action: 'block', code: 'RUN_NOT_STARTED' };
    if (typeof input.path !== 'string' && typeof input.filePath !== 'string') return blockMissingPath(input);
    const rawPath = typeof input.path === 'string' ? input.path : input.filePath;
    if (rawPath.trim() === '') return blockMissingPath(input);

    const targetPath = path.resolve(rawPath);
    const allowedPath = allowed.some((surface) => isInside(surface, targetPath));
    if (!allowedPath) {
      const event = appendEvent({
        eventType: 'tool_use_blocked',
        phase: 'pre_tool_use',
        actor: `PreToolUse:${input.toolName}`,
        payloadRef: 'out-of-scope-path-redacted',
        severity: 'high',
      });
      return { ok: false, action: 'block', code: 'OUT_OF_SCOPE_TOOL_USE', event };
    }
    const event = appendEvent({
      eventType: 'tool_use_allowed',
      phase: 'pre_tool_use',
      actor: `PreToolUse:${input.toolName}`,
      payloadRef: 'allowed-scope-path-redacted',
      severity: 'info',
    });
    return { ok: true, action: 'allow', event };
  }

  function handleAgent(input) {
    if (!state.runId) return { ok: false, action: 'block', code: 'RUN_NOT_STARTED' };
    const agentName = String(input.agentName || input.agent || '');
    let code = null;
    if (!authorized.has(agentName)) code = 'AGENT_NOT_AUTHORIZED';
    else if (state.agentIndex >= expectedAgentOrder.length || expectedAgentOrder[state.agentIndex] !== agentName) code = 'AGENT_OUT_OF_ORDER';

    if (code) {
      const event = appendEvent({
        eventType: 'agent_blocked',
        phase: 'pre_tool_use',
        actor: 'PreToolUse:Agent',
        payloadRef: code.toLowerCase(),
        severity: 'high',
      });
      return { ok: false, action: 'block', code, event };
    }

    state.agentIndex += 1;
    const event = appendEvent({
      eventType: 'agent_allowed',
      phase: 'pre_tool_use',
      actor: 'PreToolUse:Agent',
      payloadRef: 'authorized-agent',
      severity: 'info',
    });
    return { ok: true, action: 'allow', event };
  }

  function handlePreToolUse(input) {
    const normalizedInput = normalizePreToolInput(input);
    if (normalizedInput.toolName === 'Edit' || normalizedInput.toolName === 'Write') return handleEditOrWrite(normalizedInput);
    if (normalizedInput.toolName === 'Agent') return handleAgent(normalizedInput);
    if (!state.runId) return { ok: false, action: 'block', code: 'RUN_NOT_STARTED' };
    const event = appendEvent({
      eventType: 'tool_use_allowed',
      phase: 'pre_tool_use',
      actor: `PreToolUse:${normalizedInput.toolName || 'Unknown'}`,
      payloadRef: 'unrestricted-tool',
      severity: 'info',
    });
    return { ok: true, action: 'allow', event };
  }

  function handleStop(input) {
    if (!state.runId) return { ok: false, action: 'block', code: 'RUN_NOT_STARTED' };
    state.finalValidatorPassed = Boolean(input.finalValidatorPassed || state.finalValidatorPassed);
    if (state.active && !state.finalValidatorPassed) {
      const event = appendEvent({
        eventType: 'stop_before_pa_de_cal_blocked',
        phase: 'stop',
        actor: 'Stop',
        payloadRef: 'final-validator-missing',
        severity: 'critical',
      });
      const gateDecision = makeGateDecision({
        runId: state.runId,
        gate: STOP_BEFORE_PA_DE_CAL,
        hardness: 'HARD',
        phase: 'stop',
        decision: 'BLOCKED',
        detail: 'Stop blocked while run is active before final-validator.',
        confidenceImpact: -100,
      });
      return { ok: false, action: 'block', code: STOP_BEFORE_PA_DE_CAL, event, gateDecision };
    }
    state.active = false;
    const event = appendEvent({
      eventType: 'run_stopped',
      phase: 'stop',
      actor: 'Stop',
      payloadRef: 'final-validator-passed',
      severity: 'info',
    });
    return { ok: true, action: 'allow', event };
  }

  function handleHook({ hook, input = {} }) {
    if (hook === 'SessionStart') return handleSessionStart(input);
    if (hook === 'UserPromptSubmit') return handlePromptSubmit(input);
    if (hook === 'PreToolUse') return handlePreToolUse(input);
    if (hook === 'Stop') return handleStop(input);
    return { ok: false, action: 'block', code: 'UNKNOWN_HOOK' };
  }

  return {
    handleHook,
    getProtocolEvents: () => state.protocolEvents.slice(),
    getProtocolPayloads: () => state.protocolPayloads.slice(),
  };
}

module.exports = { createHookSmokeHarness, STOP_BEFORE_PA_DE_CAL, normalizePreToolInput };
