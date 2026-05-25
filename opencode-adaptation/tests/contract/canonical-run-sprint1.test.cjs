"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  initializeCanonicalRun,
  STATE_FILE_INIT_FAIL,
} = require("../../src/runtime/canonical-run.cjs");
const {
  validateGateDecisionRecord,
  validateProtocolEventRecord,
  validateProtocolEventSequence,
  validateSentinelState,
  validateConfidenceScore,
  validateConfidenceScoreCeilings,
  validateEvidenceRecord,
  validateEvidenceSequence,
  validateProtocolHandshakeTimeout,
  evaluateHandshakeTimeout,
  validateUiQuestionRecord,
  validateQuestionDecisionLink,
} = require("../../src/validators/contract-validator.cjs");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

const adaptationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "po-adaptation-root-"));
const stateRoot = path.join(adaptationRoot, "tmp");
fs.mkdirSync(stateRoot, { recursive: true });
const first = initializeCanonicalRun({
  adaptationRoot,
  stateRoot,
  prompt: "Sprint 1 canonical run",
  mode: "base",
  sprint: "1",
  slice: "1.1",
});

assert.equal(first.ok, true);
assert.match(first.runId, /^run-/);
assert.equal(first.runId.includes("sprint"), false);
assert.throws(() => initializeCanonicalRun({ adaptationRoot, stateRoot, prompt: "x", mode: "bugfix-light" }), /only supports base mode/);
assert.equal(first.pipelineDocPath, path.join(adaptationRoot, "tmp", "runs", first.runId));
assert.equal(first.paths.runDir, first.pipelineDocPath);
assert.equal(first.stateInitFailure, undefined);

assert.equal(fs.existsSync(path.join(first.paths.runDir, "sentinel-state.json")), true);
assert.equal(fs.existsSync(path.join(first.paths.runDir, "confidence-score.json")), true);
assert.equal(fs.existsSync(path.join(first.paths.runDir, "protocol-events.jsonl")), true);
assert.equal(fs.existsSync(path.join(first.paths.runDir, "gate-decisions.jsonl")), true);
assert.equal(fs.existsSync(path.join(first.paths.runDir, "evidence.jsonl")), true);

const sentinel = readJson(path.join(first.paths.runDir, "sentinel-state.json"));
assert.equal(validateSentinelState(sentinel, { phase: "session_start" }).ok, true);
assert.equal(sentinel.runId, first.runId);
assert.equal(sentinel.currentPhase, "session_start");
assert.equal(sentinel.blocked, false);
assert.deepEqual(sentinel.checkpoints, {});

const confidence = readJson(path.join(first.paths.runDir, "confidence-score.json"));
assert.equal(validateConfidenceScore(confidence).ok, true);
assert.equal(confidence.runId, first.runId);
assert.equal(confidence.score, 60);
assert.equal(confidence.floorApplied, false);
assert.equal(validateConfidenceScoreCeilings(confidence, { allRequiredGatesPresent: false }).ok, true);
assert.equal(validateConfidenceScoreCeilings({ ...confidence, score: 61 }, { allRequiredGatesPresent: false }).ok, false);
assert.equal(validateConfidenceScoreCeilings({ ...confidence, score: 51 }, { redPresent: false }).ok, false);
assert.equal(validateConfidenceScoreCeilings({ ...confidence, score: 41 }, { highFindingOpen: true }).ok, false);
assert.equal(validateConfidenceScoreCeilings({ ...confidence, score: 21 }, { criticalFindingOpen: true }).ok, false);

const protocolEvents = readJsonl(path.join(first.paths.runDir, "protocol-events.jsonl"));
assert.equal(protocolEvents.length, 1);
assert.equal(validateProtocolEventRecord(protocolEvents[0]).ok, true);
assert.equal(validateProtocolEventSequence(protocolEvents).ok, true);
assert.equal(validateProtocolEventSequence([protocolEvents[0], protocolEvents[0]]).ok, false);
assert.equal(validateProtocolEventSequence([{ ...protocolEvents[0], eventId: "evt-child", parentEventId: "evt-missing" }]).ok, false);
assert.equal(protocolEvents[0].eventType, "run_started");
assert.equal(protocolEvents[0].runId, first.runId);

const gateDecisionsContent = fs.readFileSync(path.join(first.paths.runDir, "gate-decisions.jsonl"), "utf8");
assert.equal(gateDecisionsContent, "");

const evidence = readJsonl(path.join(first.paths.runDir, "evidence.jsonl"));
assert.equal(evidence.length, 1);
assert.equal(validateEvidenceRecord(evidence[0]).ok, true);
assert.equal(validateEvidenceSequence(evidence).ok, false);
assert.equal(validateEvidenceSequence([
  { ...evidence[0], evidenceId: "ev-a", evidenceType: "ACCEPTANCE" },
  { ...evidence[0], evidenceId: "ev-r", evidenceType: "RED" },
  { ...evidence[0], evidenceId: "ev-g", evidenceType: "GREEN" },
  { ...evidence[0], evidenceId: "ev-p", evidenceType: "PROMPT_DEBUG" },
  { ...evidence[0], evidenceId: "ev-v", evidenceType: "REVIEW" },
  { ...evidence[0], evidenceId: "ev-final", evidenceType: "VERDICT" },
]).ok, true);
assert.equal(evidence[0].evidenceType, "ACCEPTANCE");
assert.equal(evidence[0].runId, first.runId);

const second = initializeCanonicalRun({
  adaptationRoot,
  stateRoot,
  prompt: "Sprint 1 canonical run",
  mode: "base",
  sprint: "1",
  slice: "1.1",
});
assert.notEqual(second.runId, first.runId);
assert.notEqual(second.paths.runDir, first.paths.runDir);
assert.equal(readJsonl(path.join(second.paths.runDir, "protocol-events.jsonl")).length, 1);
assert.equal(fs.readFileSync(path.join(second.paths.runDir, "gate-decisions.jsonl"), "utf8"), "");

assert.equal(validateGateDecisionRecord({
  schemaVersion: "GATE_DECISION_RECORD/v1",
  runId: "run-001",
  gate: "STATE_FILE_INIT_FAIL",
  hardness: "CIRCUIT_BREAKER",
  phase: "session_start",
  decision: "BLOCKED",
  decided_by: "system",
  timestamp: "2026-05-24T00:01:00.000Z",
  detail: "state init failed",
  confidence_impact: -100,
}).ok, true);
assert.equal(validateGateDecisionRecord({
  schemaVersion: "GATE_DECISION_RECORD/v1",
  runId: "run-001",
  gate: "STATE_FILE_INIT_FAIL",
  hardness: "CONDITIONAL",
  phase: "session_start",
  decision: "BLOCKED",
  decided_by: "system",
  timestamp: "2026-05-24T00:01:00.000Z",
  detail: "state init failed",
  confidence_impact: -100,
}).ok, false);
assert.equal(validateGateDecisionRecord({
  schemaVersion: "GATE_DECISION_RECORD/v1",
  runId: "run-001",
  gate: "STATE_FILE_INIT_FAIL",
  hardness: "CIRCUIT_BREAKER",
  phase: "session_start",
  decision: "MAYBE",
  decided_by: "system",
  timestamp: "2026-05-24T00:01:00.000Z",
  detail: "state init failed",
  confidence_impact: -100,
}).ok, false);
assert.equal(validateGateDecisionRecord({
  schemaVersion: "GATE_DECISION_RECORD/v1",
  runId: "run-001",
  gate: "STATE_FILE_INIT_FAIL",
  hardness: "CIRCUIT_BREAKER",
  phase: "session_start",
  decision: "BLOCKED",
  decided_by: "system",
  timestamp: "2026-05-24T00:01:00.000Z",
  confidence_impact: -100,
}).ok, false);

assert.equal(validateProtocolEventRecord(protocolEvents[0]).ok, true);
assert.equal(validateProtocolEventRecord({ eventType: "run_started" }).ok, false);
assert.equal(validateSentinelState({
  schemaVersion: "SENTINEL_STATE/v1",
  runId: "run-001",
  currentPhase: "closed",
  checkpoints: { post_orchestrator: { status: "PASS" } },
  blocked: false,
  stopRuleTriggered: false,
  lastValidEventId: "evt-1",
  updatedAt: "2026-05-24T00:01:00.000Z",
}, { phase: "final" }).ok, false);
assert.equal(validateSentinelState({ ...sentinel, checkpoints: {} }, { phase: "before_execution" }).ok, false);
assert.equal(validateSentinelState({ ...sentinel, checkpoints: {} }, { phase: "before_closeout" }).ok, false);
assert.equal(validateConfidenceScore({ schemaVersion: "CONFIDENCE_SCORE/v1", runId: "run-001", score: 150 }).ok, false);
assert.equal(validateEvidenceRecord({ evidenceType: "RED", verdict: "PASS" }).ok, false);
assert.equal(validateEvidenceRecord({ ...evidence[0], evidenceType: "MADE_UP" }).ok, false);
assert.equal(validateEvidenceRecord({ ...evidence[0], verdict: "MAYBE" }).ok, false);
assert.equal(validateProtocolHandshakeTimeout({
  schemaVersion: "PROTOCOL_HANDSHAKE_TIMEOUT/v1",
  runId: "run-001",
  handshakeId: "hs-001",
  actorType: "agent",
  actorName: "reviewer-security",
  expectedEventType: "agent_completed",
  startedAt: "2026-05-24T00:05:00.000Z",
  timeoutMs: 120000,
  onTimeout: "BLOCK",
  recoveryOptions: ["retry_once", "stop"],
}).ok, true);
const timeoutRecord = {
  schemaVersion: "PROTOCOL_HANDSHAKE_TIMEOUT/v1",
  runId: "run-001",
  handshakeId: "hs-timeout",
  actorType: "agent",
  actorName: "reviewer-security",
  expectedEventType: "agent_completed",
  startedAt: "2026-05-24T00:05:00.000Z",
  timeoutMs: 120000,
  onTimeout: "BLOCK",
  recoveryOptions: ["retry_once", "stop"],
};
const timeoutResult = evaluateHandshakeTimeout(timeoutRecord, "2026-05-24T00:08:00.001Z");
assert.equal(timeoutResult.ok, false);
assert.equal(validateProtocolEventRecord(timeoutResult.protocolEvent).ok, true);
assert.equal(validateGateDecisionRecord(timeoutResult.gateDecision).ok, true);
assert.equal(validateProtocolHandshakeTimeout({ actorName: "reviewer-security", timeoutMs: 0 }).ok, false);
const uiQuestion = {
  schemaVersion: "UI_QUESTION_RECORD/v1",
  runId: "run-001",
  questionId: "q-001",
  phase: "phase-0",
  flowPoint: "classification_confirmation",
  questionText: "Confirmar rota proposta?",
  options: [{ id: "approve", label: "Aprovar rota proposta (Recomendado)", effect: "continue" }],
  recommendedOptionId: "approve",
  reason: "classifica??o consistente com o pedido",
  emittedAt: "2026-05-24T00:00:00.000Z",
  emittedBy: "pipeline-run-orchestrator",
  writesProtocolEvent: true,
  linkedGateId: "gate-classification",
};
const linkedDecision = {
  schemaVersion: "GATE_DECISION_RECORD/v1",
  runId: "run-001",
  gate: "gate-classification",
  hardness: "HARD",
  phase: "phase-0",
  decision: "APPROVED",
  decided_by: "user",
  timestamp: "2026-05-24T00:01:00.000Z",
  detail: "approved",
  confidence_impact: 5,
  questionId: "q-001",
  selectedOptionId: "approve",
};
assert.equal(validateUiQuestionRecord(uiQuestion).ok, true);
assert.equal(validateQuestionDecisionLink(uiQuestion, linkedDecision).ok, true);
assert.equal(validateQuestionDecisionLink(uiQuestion, { ...linkedDecision, selectedOptionId: "missing" }).ok, false);
assert.equal(validateUiQuestionRecord({ runId: "run-001", questionText: "Pode seguir?" }).ok, false);

const failing = initializeCanonicalRun({
  adaptationRoot,
  stateRoot,
  prompt: "force init failure",
  mode: "base",
  sprint: "1",
  slice: "1.1",
  fsAdapter: {
    mkdirSync(target) {
      if (String(target).includes("run-")) {
        const err = new Error("simulated mkdir failure");
        err.code = "EACCES";
        throw err;
      }
      fs.mkdirSync(target, { recursive: true });
    },
    writeFileSync: fs.writeFileSync,
    appendFileSync: fs.appendFileSync,
    existsSync: fs.existsSync,
  },
});
assert.equal(failing.ok, false);
assert.equal(failing.code, STATE_FILE_INIT_FAIL);
assert.equal(failing.stateInitFailure.includes("simulated mkdir failure"), false);
assert.equal(failing.gateDecision.detail.includes("simulated mkdir failure"), false);
assert.equal(fs.existsSync(path.join(failing.failureArtifactPath, "gate-decisions.jsonl")), true);
assert.equal(validateGateDecisionRecord(readJsonl(path.join(failing.failureArtifactPath, "gate-decisions.jsonl"))[0]).ok, true);
assert.equal(validateProtocolEventRecord(readJsonl(path.join(failing.failureArtifactPath, "protocol-events.jsonl"))[0]).ok, true);
assert.equal(readJson(path.join(failing.failureArtifactPath, "sentinel-state.json")).blocked, true);
assert.equal(validateGateDecisionRecord(failing.gateDecision).ok, true);
assert.equal(validateProtocolEventRecord(failing.protocolEvent).ok, true);
assert.equal(failing.sentinelState.blocked, true);
assert.equal(validateSentinelState(failing.sentinelState, { phase: "session_start" }).ok, true);

console.log("canonical run sprint 1 OK");
