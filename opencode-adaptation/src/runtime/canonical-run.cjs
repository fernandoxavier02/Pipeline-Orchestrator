"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STATE_FILE_INIT_FAIL = "STATE_FILE_INIT_FAIL";

function assertAbsolute(name, value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path`);
  }
}

function createRunId() {
  const time = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
  const random = crypto.randomBytes(8).toString("hex");
  return `run-${time}-${random}`;
}

function writeJson(adapter, filePath, value) {
  adapter.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function appendJsonl(adapter, filePath, value) {
  adapter.appendFileSync(filePath, JSON.stringify(value) + "\n");
}

function sanitizeInitError(error) {
  if (!error) return "State file initialization failed.";
  const safeCode = typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "UNKNOWN";
  const code = ` Code: ${safeCode}.`;
  return `State file initialization failed.${code}`;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildFailureRecords({ runId, now, error }) {
  const eventId = `evt-${crypto.randomBytes(4).toString("hex")}`;
  const protocolEvent = {
    schemaVersion: "PROTOCOL_EVENT_RECORD/v1",
    runId,
    eventId,
    eventType: "state_init_failed",
    phase: "session_start",
    timestamp: now,
    actor: "RunLifecycle",
    payloadRef: "state-init-error",
    parentEventId: null,
    severity: "critical",
  };
  const gateDecision = {
    schemaVersion: "GATE_DECISION_RECORD/v1",
    runId,
    gate: STATE_FILE_INIT_FAIL,
    hardness: "CIRCUIT_BREAKER",
    phase: "session_start",
    decision: "BLOCKED",
    decided_by: "system",
    timestamp: now,
    detail: sanitizeInitError(error),
    confidence_impact: -100,
  };
  const sentinelState = {
    schemaVersion: "SENTINEL_STATE/v1",
    runId,
    currentPhase: "session_start",
    checkpoints: {},
    blocked: true,
    stopRuleTriggered: true,
    lastValidEventId: eventId,
    updatedAt: now,
  };
  return { protocolEvent, gateDecision, sentinelState };
}

function initializeCanonicalRun({ adaptationRoot, stateRoot, prompt = "", mode = "base", sprint = "1", slice = "1.1", fsAdapter = fs }) {
  assertAbsolute("adaptationRoot", adaptationRoot);
  const resolvedAdaptationRoot = path.resolve(adaptationRoot);
  const resolvedStateRoot = stateRoot === undefined ? path.join(resolvedAdaptationRoot, "tmp") : path.resolve(stateRoot);
  assertAbsolute("stateRoot", resolvedStateRoot);
  if (!isInside(resolvedAdaptationRoot, resolvedStateRoot)) {
    throw new Error("stateRoot must be inside adaptationRoot");
  }

  const now = new Date().toISOString();
  if (mode !== "base") {
    throw new Error("Sprint 1 canonical run only supports base mode");
  }
  const runId = createRunId();
  const runDir = path.join(resolvedStateRoot, "runs", runId);
  const eventId = `evt-${crypto.randomBytes(4).toString("hex")}`;
  const paths = {
    runDir,
    sentinelState: path.join(runDir, "sentinel-state.json"),
    confidenceScore: path.join(runDir, "confidence-score.json"),
    protocolEvents: path.join(runDir, "protocol-events.jsonl"),
    gateDecisions: path.join(runDir, "gate-decisions.jsonl"),
    evidence: path.join(runDir, "evidence.jsonl"),
  };

  const protocolEvent = {
    schemaVersion: "PROTOCOL_EVENT_RECORD/v1",
    runId,
    eventId,
    eventType: "run_started",
    phase: "session_start",
    timestamp: now,
    actor: "SessionStart",
    payloadRef: "canonical-run-init",
    parentEventId: null,
    severity: "info",
  };
  const sentinelState = {
    schemaVersion: "SENTINEL_STATE/v1",
    runId,
    currentPhase: "session_start",
    checkpoints: {},
    blocked: false,
    stopRuleTriggered: false,
    lastValidEventId: eventId,
    updatedAt: now,
  };
  const confidenceScore = {
    schemaVersion: "CONFIDENCE_SCORE/v1",
    runId,
    score: 60,
    scale: "0-100",
    factors: [
      { name: "canonical_run_initialized", delta: 60 },
      { name: "no_gates_decided_yet", delta: 0 },
    ],
    updatedAt: now,
    updatedBy: "pipeline-run-orchestrator",
    floorApplied: false,
  };
  const evidenceRecord = {
    schemaVersion: "EVIDENCE_RECORD/v1",
    runId,
    evidenceId: `ev-${crypto.randomBytes(4).toString("hex")}`,
    evidenceType: "ACCEPTANCE",
    mode,
    sprint,
    slice,
    commandOrPromptRef: "initializeCanonicalRun",
    resultSummary: "Canonical OpenCode run initialized with fresh state files.",
    artifactRef: "canonical-run-init",
    verdict: "PASS",
    createdAt: now,
  };

  try {
    if (!fsAdapter.existsSync(resolvedStateRoot)) {
      const err = new Error("stateRoot must exist before canonical run initialization");
      err.code = "STATE_ROOT_MISSING";
      throw err;
    }
    const physicalAdaptationRoot = fs.realpathSync(resolvedAdaptationRoot);
    const physicalStateRoot = fs.realpathSync(resolvedStateRoot);
    if (!isInside(physicalAdaptationRoot, physicalStateRoot)) {
      const err = new Error("stateRoot physical path must be inside adaptationRoot");
    err.code = "STATE_ROOT_ESCAPE";
    throw err;
    }
    fsAdapter.mkdirSync(path.dirname(runDir), { recursive: true });
    const physicalRunsRoot = fs.realpathSync(path.dirname(runDir));
    if (!isInside(physicalAdaptationRoot, physicalRunsRoot)) {
      const err = new Error("runs root physical path must be inside adaptationRoot");
      err.code = "STATE_ROOT_ESCAPE";
      throw err;
    }
    fsAdapter.mkdirSync(runDir, { recursive: false });
    const physicalRunDir = fs.realpathSync(runDir);
    if (!isInside(physicalAdaptationRoot, physicalRunDir)) {
      const err = new Error("run directory physical path must be inside adaptationRoot");
      err.code = "STATE_ROOT_ESCAPE";
      throw err;
    }
    writeJson(fsAdapter, paths.sentinelState, sentinelState);
    writeJson(fsAdapter, paths.confidenceScore, confidenceScore);
    fsAdapter.writeFileSync(paths.gateDecisions, "");
    fsAdapter.writeFileSync(paths.protocolEvents, "");
    appendJsonl(fsAdapter, paths.protocolEvents, protocolEvent);
    fsAdapter.writeFileSync(paths.evidence, "");
    appendJsonl(fsAdapter, paths.evidence, evidenceRecord);
  } catch (error) {
    const failure = buildFailureRecords({ runId, now, error });
    const failureArtifactId = runId.replace(/^run-/, "failed-");
    const failureDir = path.join(path.dirname(path.dirname(runDir)), "state-init-failures", failureArtifactId);
    try {
      if (error && (error.code === "STATE_ROOT_ESCAPE" || error.code === "STATE_ROOT_MISSING")) throw error;
      fsAdapter.mkdirSync(failureDir, { recursive: true });
      writeJson(fsAdapter, path.join(failureDir, "sentinel-state.json"), failure.sentinelState);
      fsAdapter.writeFileSync(path.join(failureDir, "gate-decisions.jsonl"), JSON.stringify(failure.gateDecision) + "\n");
      fsAdapter.writeFileSync(path.join(failureDir, "protocol-events.jsonl"), JSON.stringify(failure.protocolEvent) + "\n");
    } catch (_) {
      // If even the failure trail cannot be persisted, keep the fail-closed return.
    }
    return {
      ok: false,
      code: STATE_FILE_INIT_FAIL,
      runId,
      pipelineDocPath: runDir,
      paths,
      stateInitFailure: sanitizeInitError(error),
      failureArtifactPath: failureDir,
      ...failure,
    };
  }

  return {
    ok: true,
    runId,
    pipelineDocPath: runDir,
    paths,
    sentinelState,
    confidenceScore,
    protocolEvent,
    evidenceRecord,
  };
}

module.exports = { initializeCanonicalRun, STATE_FILE_INIT_FAIL };
