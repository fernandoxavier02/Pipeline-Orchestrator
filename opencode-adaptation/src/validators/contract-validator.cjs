"use strict";

const VALID_HARDNESS = new Set(["MANDATORY", "HARD", "CIRCUIT_BREAKER", "SOFT", "AUDIT"]);
const VALID_DECISIONS = new Set(["APPROVED", "REJECTED", "BLOCKED", "BYPASSED", "REWORK", "STOPPED"]);
const VALID_CHECKPOINT_STATUS = new Set(["PASS", "CORRECTED", "BLOCK"]);
const VALID_EVIDENCE_TYPES = new Set(["ACCEPTANCE", "RED", "GREEN", "PROMPT_DEBUG", "REVIEW", "VERDICT"]);
const VALID_EVIDENCE_VERDICTS = new Set(["PASS", "FAIL", "BLOCKED", "PARTIAL"]);
const FINAL_CHECKPOINTS = [
  "post_orchestrator",
  "phase_0_to_1",
  "phase_1_to_2",
  "phase_2_to_3",
  "post_final_validator",
];

function ok() {
  return { ok: true };
}

function fail(code, message) {
  return { ok: false, code, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasString(record, field) {
  return typeof record[field] === "string" && record[field].length > 0;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function requireFields(record, fields) {
  if (!isObject(record)) return fail("INVALID_RECORD", "record must be an object");
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      return fail("FIELD_MISSING", `${field} is required`);
    }
  }
  return ok();
}

function validateUiQuestionRecord(record) {
  const required = ["schemaVersion", "runId", "questionId", "phase", "flowPoint", "questionText", "options", "recommendedOptionId", "reason", "emittedAt", "emittedBy", "writesProtocolEvent", "linkedGateId"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "UI_QUESTION_RECORD/v1") return fail("SCHEMA_VERSION_INVALID", "invalid UI question schemaVersion");
  for (const field of ["runId", "questionId", "phase", "flowPoint", "questionText", "recommendedOptionId", "reason", "emittedBy", "linkedGateId"]) {
    if (!hasString(record, field)) return fail("FIELD_INVALID", `${field} must be a non-empty string`);
  }
  if (!isIsoDate(record.emittedAt)) return fail("TIMESTAMP_INVALID", "emittedAt must be ISO 8601");
  if (typeof record.writesProtocolEvent !== "boolean") return fail("FIELD_INVALID", "writesProtocolEvent must be boolean");
  if (!Array.isArray(record.options) || record.options.length === 0) return fail("OPTIONS_INVALID", "options must be non-empty");
  const optionIds = new Set();
  for (const option of record.options) {
    if (!isObject(option) || !hasString(option, "id") || !hasString(option, "label") || !hasString(option, "effect")) {
      return fail("OPTION_INVALID", "each option needs id, label and effect");
    }
    optionIds.add(option.id);
  }
  if (!optionIds.has(record.recommendedOptionId)) return fail("RECOMMENDATION_INVALID", "recommended option must exist");
  return ok();
}

function validateGateDecisionRecord(record) {
  const required = ["schemaVersion", "runId", "gate", "hardness", "phase", "decision", "decided_by", "timestamp", "detail", "confidence_impact"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "GATE_DECISION_RECORD/v1") return fail("SCHEMA_VERSION_INVALID", "invalid gate decision schemaVersion");
  for (const field of ["runId", "gate", "hardness", "phase", "decision", "decided_by", "detail"]) {
    if (!hasString(record, field)) return fail("FIELD_INVALID", `${field} must be a non-empty string`);
  }
  if (!VALID_HARDNESS.has(record.hardness)) return fail("HARDNESS_INVALID", "invalid gate hardness");
  if (!VALID_DECISIONS.has(record.decision)) return fail("DECISION_INVALID", "invalid gate decision");
  if (!isIsoDate(record.timestamp)) return fail("TIMESTAMP_INVALID", "timestamp must be ISO 8601");
  if (typeof record.confidence_impact !== "number" || record.confidence_impact < -100 || record.confidence_impact > 100) {
    return fail("CONFIDENCE_IMPACT_INVALID", "confidence_impact must be between -100 and 100");
  }
  return ok();
}

function validateProtocolEventRecord(record) {
  const required = ["schemaVersion", "runId", "eventId", "eventType", "phase", "timestamp", "actor", "payloadRef", "parentEventId", "severity"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "PROTOCOL_EVENT_RECORD/v1") return fail("SCHEMA_VERSION_INVALID", "invalid protocol event schemaVersion");
  for (const field of ["runId", "eventId", "eventType", "phase", "actor", "payloadRef", "severity"]) {
    if (!hasString(record, field)) return fail("FIELD_INVALID", `${field} must be a non-empty string`);
  }
  if (record.parentEventId !== null && typeof record.parentEventId !== "string") return fail("FIELD_INVALID", "parentEventId must be null or string");
  if (!isIsoDate(record.timestamp)) return fail("TIMESTAMP_INVALID", "timestamp must be ISO 8601");
  if (!["info", "warning", "high", "critical"].includes(record.severity)) return fail("SEVERITY_INVALID", "invalid severity");
  return ok();
}

function validateCheckpoint(name, checkpoint) {
  if (!isObject(checkpoint)) return fail("CHECKPOINT_INVALID", `${name} must be an object`);
  if (!VALID_CHECKPOINT_STATUS.has(checkpoint.status)) return fail("CHECKPOINT_STATUS_INVALID", `${name} status invalid`);
  if (!hasString(checkpoint, "eventId")) return fail("CHECKPOINT_EVENT_INVALID", `${name} eventId is required`);
  if (!isIsoDate(checkpoint.checkedAt)) return fail("CHECKPOINT_TIME_INVALID", `${name} checkedAt must be ISO 8601`);
  return ok();
}

function validateSentinelState(record, options = {}) {
  const required = ["schemaVersion", "runId", "currentPhase", "checkpoints", "blocked", "stopRuleTriggered", "lastValidEventId", "updatedAt"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "SENTINEL_STATE/v1") return fail("SCHEMA_VERSION_INVALID", "invalid sentinel schemaVersion");
  if (!hasString(record, "runId") || !hasString(record, "currentPhase")) return fail("FIELD_INVALID", "runId and currentPhase are required");
  if (!isObject(record.checkpoints)) return fail("CHECKPOINTS_INVALID", "checkpoints must be object");
  if (typeof record.blocked !== "boolean" || typeof record.stopRuleTriggered !== "boolean") return fail("FIELD_INVALID", "blocked flags must be boolean");
  if (!(record.lastValidEventId === null || typeof record.lastValidEventId === "string")) return fail("FIELD_INVALID", "lastValidEventId must be null or string");
  if (!isIsoDate(record.updatedAt)) return fail("TIMESTAMP_INVALID", "updatedAt must be ISO 8601");

  for (const [name, checkpoint] of Object.entries(record.checkpoints)) {
    const checkpointResult = validateCheckpoint(name, checkpoint);
    if (!checkpointResult.ok) return checkpointResult;
    if (checkpoint.status === "BLOCK" && record.blocked !== true) return fail("BLOCK_MISMATCH", "BLOCK checkpoint requires blocked=true");
  }

  if (options.phase === "before_execution") {
    for (const checkpointName of ["phase_0_to_1", "phase_1_to_2"]) {
      if (!record.checkpoints[checkpointName]) return fail("CHECKPOINT_MISSING", `${checkpointName} is required before execution`);
    }
  }
  if (options.phase === "before_closeout") {
    if (!record.checkpoints.phase_2_to_3) return fail("CHECKPOINT_MISSING", "phase_2_to_3 is required before closeout");
  }
  if (options.phase === "final" || record.currentPhase === "closed") {
    for (const checkpointName of FINAL_CHECKPOINTS) {
      if (!record.checkpoints[checkpointName]) return fail("FINAL_CHECKPOINT_MISSING", `${checkpointName} is required for final state`);
      if (!["PASS", "CORRECTED"].includes(record.checkpoints[checkpointName].status)) {
        return fail("FINAL_CHECKPOINT_STATUS_INVALID", `${checkpointName} must pass or be corrected`);
      }
    }
  }
  return ok();
}

function validateConfidenceScore(record) {
  const required = ["schemaVersion", "runId", "score", "scale", "factors", "updatedAt", "updatedBy", "floorApplied"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "CONFIDENCE_SCORE/v1") return fail("SCHEMA_VERSION_INVALID", "invalid confidence schemaVersion");
  if (!hasString(record, "runId") || record.scale !== "0-100" || !hasString(record, "updatedBy")) return fail("FIELD_INVALID", "invalid confidence fields");
  if (typeof record.score !== "number" || record.score < 0 || record.score > 100) return fail("SCORE_INVALID", "score must be between 0 and 100");
  if (!Array.isArray(record.factors)) return fail("FACTORS_INVALID", "factors must be array");
  if (!isIsoDate(record.updatedAt)) return fail("TIMESTAMP_INVALID", "updatedAt must be ISO 8601");
  if (typeof record.floorApplied !== "boolean") return fail("FIELD_INVALID", "floorApplied must be boolean");
  return ok();
}

function validateEvidenceRecord(record) {
  const required = ["schemaVersion", "runId", "evidenceId", "evidenceType", "mode", "sprint", "slice", "commandOrPromptRef", "resultSummary", "artifactRef", "verdict", "createdAt"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "EVIDENCE_RECORD/v1") return fail("SCHEMA_VERSION_INVALID", "invalid evidence schemaVersion");
  for (const field of ["runId", "evidenceId", "evidenceType", "mode", "sprint", "slice", "commandOrPromptRef", "resultSummary", "artifactRef", "verdict"]) {
    if (!hasString(record, field)) return fail("FIELD_INVALID", `${field} must be a non-empty string`);
  }
  if (!VALID_EVIDENCE_TYPES.has(record.evidenceType)) return fail("EVIDENCE_TYPE_INVALID", "invalid evidenceType");
  if (!VALID_EVIDENCE_VERDICTS.has(record.verdict)) return fail("EVIDENCE_VERDICT_INVALID", "invalid evidence verdict");
  if (!isIsoDate(record.createdAt)) return fail("TIMESTAMP_INVALID", "createdAt must be ISO 8601");
  return ok();
}

function validateProtocolHandshakeTimeout(record) {
  const required = ["schemaVersion", "runId", "handshakeId", "actorType", "actorName", "expectedEventType", "startedAt", "timeoutMs", "onTimeout", "recoveryOptions"];
  const fields = requireFields(record, required);
  if (!fields.ok) return fields;
  if (record.schemaVersion !== "PROTOCOL_HANDSHAKE_TIMEOUT/v1") return fail("SCHEMA_VERSION_INVALID", "invalid handshake schemaVersion");
  for (const field of ["runId", "handshakeId", "actorType", "actorName", "expectedEventType", "onTimeout"]) {
    if (!hasString(record, field)) return fail("FIELD_INVALID", `${field} must be a non-empty string`);
  }
  if (!isIsoDate(record.startedAt)) return fail("TIMESTAMP_INVALID", "startedAt must be ISO 8601");
  if (!Number.isInteger(record.timeoutMs) || record.timeoutMs <= 0) return fail("TIMEOUT_INVALID", "timeoutMs must be positive integer");
  if (!Array.isArray(record.recoveryOptions) || record.recoveryOptions.length === 0) return fail("RECOVERY_INVALID", "recoveryOptions must be non-empty");
  return ok();
}

function validateProtocolEventSequence(events) {
  if (!Array.isArray(events)) return fail("EVENT_SEQUENCE_INVALID", "events must be array");
  const seenByRun = new Map();
  for (const event of events) {
    const single = validateProtocolEventRecord(event);
    if (!single.ok) return single;
    const seen = seenByRun.get(event.runId) || new Set();
    if (seen.has(event.eventId)) return fail("EVENT_ID_DUPLICATE", "eventId must be unique per run");
    if (event.parentEventId !== null && !seen.has(event.parentEventId)) {
      return fail("EVENT_PARENT_OUT_OF_ORDER", "parent event must appear before child event");
    }
    seen.add(event.eventId);
    seenByRun.set(event.runId, seen);
  }
  return ok();
}

function validateEvidenceSequence(records) {
  if (!Array.isArray(records)) return fail("EVIDENCE_SEQUENCE_INVALID", "evidence records must be array");
  const order = ["ACCEPTANCE", "RED", "GREEN", "PROMPT_DEBUG", "REVIEW", "VERDICT"];
  let cursor = -1;
  for (const record of records) {
    const single = validateEvidenceRecord(record);
    if (!single.ok) return single;
    const index = order.indexOf(record.evidenceType);
    if (index === -1) continue;
    if (index < cursor) return fail("EVIDENCE_SEQUENCE_OUT_OF_ORDER", "evidence records are out of order");
    if (index > cursor + 1) return fail("EVIDENCE_SEQUENCE_GAP", "evidence sequence has a gap");
    cursor = index;
  }
  return cursor === order.length - 1 ? ok() : fail("EVIDENCE_SEQUENCE_INCOMPLETE", "evidence sequence is incomplete");
}

function validateConfidenceScoreCeilings(record, evidence = {}) {
  const base = validateConfidenceScore(record);
  if (!base.ok) return base;
  const missingGate = evidence.allRequiredGatesPresent === false;
  const missingRed = evidence.redPresent === false;
  const highOpen = evidence.highFindingOpen === true;
  const criticalOpen = evidence.criticalFindingOpen === true;
  let ceiling = 100;
  if (missingGate) ceiling = Math.min(ceiling, 60);
  if (missingRed) ceiling = Math.min(ceiling, 50);
  if (highOpen) ceiling = Math.min(ceiling, 40);
  if (criticalOpen) ceiling = Math.min(ceiling, 20);
  if (record.score > ceiling) return fail("CONFIDENCE_CEILING_EXCEEDED", "confidence score exceeds evidence ceiling");
  return ok();
}

function evaluateHandshakeTimeout(record, nowIso) {
  const base = validateProtocolHandshakeTimeout(record);
  if (!base.ok) return base;
  const nowMs = Date.parse(nowIso);
  const startedMs = Date.parse(record.startedAt);
  if (Number.isNaN(nowMs) || nowMs - startedMs <= record.timeoutMs) return { ok: true, timedOut: false };
  const timestamp = new Date(nowMs).toISOString();
  return {
    ok: false,
    timedOut: true,
    protocolEvent: {
      schemaVersion: "PROTOCOL_EVENT_RECORD/v1",
      runId: record.runId,
      eventId: `${record.handshakeId}-timeout`,
      eventType: "handshake_timeout",
      phase: "handshake",
      timestamp,
      actor: record.actorName,
      payloadRef: record.handshakeId,
      parentEventId: null,
      severity: "high",
    },
    gateDecision: {
      schemaVersion: "GATE_DECISION_RECORD/v1",
      runId: record.runId,
      gate: "PROTOCOL_HANDSHAKE_TIMEOUT",
      hardness: "HARD",
      phase: "handshake",
      decision: "BLOCKED",
      decided_by: "system",
      timestamp,
      detail: "Expected actor event did not arrive before timeout.",
      confidence_impact: -30,
    },
  };
}

function validateQuestionDecisionLink(question, decision) {
  const q = validateUiQuestionRecord(question);
  if (!q.ok) return q;
  const d = validateGateDecisionRecord(decision);
  if (!d.ok) return d;
  if (question.runId !== decision.runId) return fail("LINK_RUN_MISMATCH", "question and decision must use same runId");
  if (decision.questionId !== question.questionId) return fail("LINK_QUESTION_MISMATCH", "decision must reference questionId");
  if (decision.gate !== question.linkedGateId) return fail("LINK_GATE_MISMATCH", "decision gate must match linkedGateId");
  if (decision.selectedOptionId && !question.options.some((option) => option.id === decision.selectedOptionId)) {
    return fail("LINK_OPTION_MISMATCH", "selected option must exist in question options");
  }
  return ok();
}

module.exports = {
  validateUiQuestionRecord,
  validateGateDecisionRecord,
  validateProtocolEventRecord,
  validateSentinelState,
  validateConfidenceScore,
  validateEvidenceRecord,
  validateProtocolHandshakeTimeout,
  validateProtocolEventSequence,
  validateEvidenceSequence,
  validateConfidenceScoreCeilings,
  evaluateHandshakeTimeout,
  validateQuestionDecisionLink,
};
