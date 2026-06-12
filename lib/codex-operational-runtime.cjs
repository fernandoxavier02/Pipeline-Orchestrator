'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// v7.1.0 — SSOT writer for the gate-decision JSONL audit trail. Replaces the
// direct fs.appendFile pattern so every event carries the correlation envelope
// (run_id, plugin_version, schema_version, type, complexity) and uses the
// canonical 8-value decision vocabulary. Bypassing this writer is forbidden in
// this file (enforced by diff-discipline-reviewer's SSOT-bypass check).
const { appendGateDecision, buildCtx } = require('./gate-decision-writer.cjs');
// v7.13.0 (R4): sentinel-state.json is written through the signer so the
// sentinel-hook can verify its HMAC integrity (consumer of the shared fix —
// Codex path stays a consumer, not a runtime source of truth per design §3).
const { writeSignedState } = require('./sentinel-state-signer.cjs');
// v7.13.0 (R8): protocol-events go through the safe JSONL writer (sanitize +
// round-trip + exclusive lock), not raw fs.appendFileSync.
const { safeAppendJsonl } = require('./jsonl-sanitizer.cjs');

const PROTOCOL_BLOCK_RE = /=== (GATE_REQUEST|DISPATCH_REQUEST|PLAN_MODE_REQUEST) v1 ===\n([\s\S]*?)\n=== END \1 ===/g;

const NAMED_GATE_MAP = {
  'tdd-approval': 'TDD_APPROVAL',
  'phase-2-adversarial-batch': 'ADVERSARIAL_GATE',
  'phase-3-final-adversarial': 'FINAL_ADVERSARIAL_GATE',
  'phase-3-closeout': 'CLOSEOUT_CONFIRM',
  'step-1-7-routing': 'STEP_1_7_ROUTING',
};

const PROTOCOL_ONLY_GATES = new Set([
  'phase-1-pipeline-proposal',
]);

const GATE_HARDNESS = {
  TDD_APPROVAL: 'HARD',
  ADVERSARIAL_GATE: 'SOFT',
  FINAL_ADVERSARIAL_GATE: 'SOFT',
  CLOSEOUT_CONFIRM: 'SOFT',
  STEP_1_7_ROUTING: 'HARD',
};

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file, entry) {
  // v7.13.0 (R8): route protocol-events through the SAFE writer (sanitize +
  // round-trip + exclusive lock). appendJsonl is only used for protocol-events
  // in this runtime; keep it best-effort (never throw) like the raw version it
  // replaced, so a malformed event cannot abort the pipeline.
  try {
    safeAppendJsonl(file, entry, { kind: 'protocol' });
  } catch (err) {
    try { process.stderr.write(`appendJsonl(protocol): safe write failed: ${err && err.message}\n`); } catch { /* ignore */ }
  }
}

// v7.1.0 internal helper: route every gate-decision write through the SSOT
// writer (lib/gate-decision-writer.cjs). Resolves ctx lazily from session.
// Callers MUST pass `session` so the correlation envelope (type/complexity)
// can be attached.
function logGateDecision(pipelineDocPath, session, entry) {
  const ctx = buildCtx(pipelineDocPath, {
    type: session && session.options ? session.options.type : null,
    complexity: session && session.options ? session.options.complexity : null,
  });
  return appendGateDecision(
    path.join(pipelineDocPath, 'gate-decisions.jsonl'),
    entry,
    ctx,
  );
}

// v7.1.0: normalize free-text user response strings to the canonical 8-value
// decision vocabulary. Unknown strings collapse to BLOCKED, which means
// "pipeline halts and the operator must intervene" — preferred over REJECTED
// ("user explicitly said no") because ambiguous responses should NOT be
// treated as explicit user intent. The downstream gate-decision-writer also
// throws on unknown values (defense in depth) but normalizing here gives
// the audit trail a canonical decision rather than a runtime exception.
//
// Post-final-adversarial (ARCH-3) hardening: exact-match against the
// canonical Set is tried FIRST, so a caller that already passes a canonical
// value (e.g. 'APPROVED') bypasses the substring heuristics. This prevents
// "I don't want to reject this" from being mapped to REJECTED.
const { CANONICAL_DECISIONS: _CANONICAL_DECISIONS } = require('./gate-decision-writer.cjs');
function normalizeResponseToDecision(response) {
  const raw = String(response || '').trim();
  // Exact canonical match (preferred path — no heuristic ambiguity)
  if (_CANONICAL_DECISIONS.has(raw.toUpperCase())) return raw.toUpperCase();
  const s = raw.toLowerCase();
  if (s.includes('approve')) return 'APPROVED';
  if (s.includes('reject')) return 'REJECTED';
  if (s.includes('confirm')) return 'CONFIRMED';
  if (s.includes('skip')) return 'SKIPPED';
  if (s.includes('dispatch')) return 'DISPATCHED';
  if (s.includes('trigger')) return 'TRIGGERED';
  if (s === 'yes' || s === 'sim' || s === 'ok') return 'APPROVED';
  if (s === 'no' || s === 'não' || s === 'nao') return 'REJECTED';
  // Unknown → BLOCKED (safe halt). Warn so misconfigured gateResponses
  // surface during testing instead of producing a silently wrong audit row.
  try { process.stderr.write(`normalizeResponseToDecision: unknown response "${raw}" → BLOCKED\n`); } catch (_e) {}
  return 'BLOCKED';
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(input) {
  return String(input || 'pipeline-run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'pipeline-run';
}

function createPipelineDocPath(cwd, task) {
  const stamp = nowIso().replace(/[:.]/g, '-');
  return path.join(cwd, '.pipeline', 'docs', 'codex-operational', `${stamp}-${slugify(task)}`);
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseSimpleYaml(body) {
  const out = {};
  const lines = body.split('\n');
  let currentList = null;
  let currentObject = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;

    const listItem = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (listItem && currentList) {
      currentObject = { [listItem[1]]: parseScalar(listItem[2]) };
      out[currentList].push(currentObject);
      continue;
    }

    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (nested && currentObject) {
      currentObject[nested[1]] = parseScalar(nested[2]);
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value === '|') {
      const blockLines = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        blockLines.push(lines[index].replace(/^\s{2}/, '').replace(/\r$/, ''));
      }
      out[key] = blockLines.join('\n');
      currentList = null;
      currentObject = null;
      continue;
    }
    if (value === '') {
      const childLines = [];
      for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
        const candidate = lines[lookahead];
        if (!candidate.trim()) continue;
        if (!/^\s+/.test(candidate)) break;
        childLines.push(candidate);
      }
      const hasListChildren = childLines.some((candidate) => {
        if (!candidate.trim()) return false;
        return /^\s*-\s+/.test(candidate);
      });
      if (!hasListChildren) {
        out[key] = '';
        currentList = null;
        currentObject = null;
        continue;
      }
      out[key] = [];
      currentList = key;
      currentObject = null;
    } else {
      out[key] = parseScalar(value);
      currentList = null;
      currentObject = null;
    }
  }

  return out;
}

function parseProtocolBlocks(text) {
  const blocks = [];
  for (const match of text.matchAll(PROTOCOL_BLOCK_RE)) {
    blocks.push({
      kind: match[1],
      payload: parseSimpleYaml(match[2]),
      raw: match[0],
    });
  }
  return blocks;
}

function hasMalformedProtocolBlock(text, blocks) {
  const raw = String(text || '');
  const looseOpeners = raw.match(/===\s*(?:GATE_REQUEST|DISPATCH_REQUEST|PLAN_MODE_REQUEST)(?:\s+v\d+)?\s*===/g) || [];
  const looseClosers = raw.match(/===\s*END\s+(?:GATE_REQUEST|DISPATCH_REQUEST|PLAN_MODE_REQUEST)\s*===/g) || [];
  const openers = raw.match(/=== (?:GATE_REQUEST|DISPATCH_REQUEST|PLAN_MODE_REQUEST) v1 ===/g) || [];
  const closers = raw.match(/=== END (?:GATE_REQUEST|DISPATCH_REQUEST|PLAN_MODE_REQUEST) ===/g) || [];
  if (looseOpeners.length !== openers.length || looseClosers.length !== closers.length) return true;
  return openers.length !== closers.length || openers.length !== blocks.length;
}

function extractPhases(text) {
  return [...String(text || '').matchAll(/PHASE_MILESTONE:\s*([0-3](?:\.5)?)/g)]
    .map((match) => match[1]);
}

function uniquePush(list, values) {
  for (const value of values) {
    if (!list.includes(value)) list.push(value);
  }
}

function canonicalGate(gateId) {
  const normalized = String(gateId || '').trim();
  if (NAMED_GATE_MAP[normalized]) return NAMED_GATE_MAP[normalized];
  if (/^phase-2-tdd-approval(?:-|$)/.test(normalized)) return 'TDD_APPROVAL';
  if (/^phase-2-adversarial-batch(?:-|$)/.test(normalized)) return 'ADVERSARIAL_GATE';
  return null;
}

function isKnownOptionalGate(gateId) {
  return !gateId || PROTOCOL_ONLY_GATES.has(String(gateId));
}

function gateHardness(gate) {
  return GATE_HARDNESS[gate] || 'HARD';
}

function isGateRequestWellFormed(payload) {
  return Boolean(
    payload
    && payload.gate_id
    && payload.question
    && Array.isArray(payload.options)
    && payload.options.length > 0
  );
}

function buildPlanPrompt(payload) {
  if (payload.prompt) return payload.prompt;
  return [
    'PLAN_MODE_REQUEST',
    payload.plan_id ? `plan_id: ${payload.plan_id}` : null,
    payload.research_scope ? `research_scope:\n${payload.research_scope}` : null,
    payload.expected_deliverables ? `expected_deliverables:\n${payload.expected_deliverables}` : null,
  ].filter(Boolean).join('\n\n');
}

function createFakeAgentAdapter(script, options = {}) {
  const calls = [];
  const queue = Array.from(script || []);
  const adapter = {
    kind: options.kind || 'adapter-fake',
    calls,
    async spawnAgent(request) {
      calls.push({ ...request });
      const nextIndex = queue.findIndex((item) => !item.agent || item.agent === request.agent);
      if (nextIndex === -1) {
        return { text: 'STATUS: COMPLETE' };
      }
      const [next] = queue.splice(nextIndex, 1);
      return {
        text: next.result,
        metadata: next.metadata || {},
      };
    },
  };
  return adapter;
}

function resolvePlanMode({ complexity, type, noPlan }) {
  const normalizedComplexity = String(complexity || '').toUpperCase();
  const normalizedType = String(type || '').toLowerCase();
  const automatic = normalizedComplexity === 'MEDIA'
    || normalizedComplexity === 'COMPLEXA'
    || normalizedType === 'spec';
  if (!noPlan) {
    return {
      automatic,
      skipped: !automatic,
      override_attempted: false,
      override_blocked: false,
    };
  }
  if (normalizedComplexity === 'COMPLEXA') {
    return {
      automatic: true,
      skipped: false,
      override_attempted: true,
      override_blocked: true,
      reason: '--no-plan ignored for COMPLEXA',
    };
  }
  return {
    automatic,
    skipped: true,
    override_attempted: true,
    override_blocked: false,
    reason: '--no-plan honored',
  };
}

function initializeArtifacts({ pipelineDocPath, cwd, task, mode, dispatchMode, planMode, type, complexity }) {
  ensureDir(pipelineDocPath);
  const session = {
    task,
    mode,
    status: 'RUNNING',
    dispatch_mode: dispatchMode,
    phases_reached: [],
    plan_mode: planMode,
    execution_identity: {
      cwd,
      shell_cwd: process.cwd(),
    },
    // v7.1.0: persist classification on session so logGateDecision (called from
    // blockRun/blockActiveRun/recordGateRequest) can attach the correlation
    // envelope without re-threading the original `options` object.
    options: {
      type: typeof type === 'string' ? type : null,
      complexity: typeof complexity === 'string' ? complexity : null,
    },
    started_at: nowIso(),
    updated_at: nowIso(),
  };
  writeJson(path.join(pipelineDocPath, 'session.json'), session);
  writeSignedState(path.join(pipelineDocPath, 'sentinel-state.json'), {
    pipeline_active: true,
    current_phase: 'init',
    expected_next: 'pipeline-controller',
    // v7.5.0: stamp the discoverable runId so sentinel/stop hooks can match
    // by PIPELINE_RUN_ID instead of mtime-newest (REQ-C-1..REQ-C-3).
    run_id: process.env.PIPELINE_RUN_ID || null,
    updated_at: nowIso(),
  });
  fs.writeFileSync(path.join(pipelineDocPath, 'protocol-events.jsonl'), '');
  fs.writeFileSync(path.join(pipelineDocPath, 'gate-decisions.jsonl'), '');
  fs.writeFileSync(path.join(pipelineDocPath, 'NEXT_STEP'), 'Run pipeline-controller through a configured Codex agent adapter.\n');
  return session;
}

function finalizeArtifacts({ pipelineDocPath, session, status, reason, nextStep }) {
  session.status = status;
  if (reason) session.reason = reason;
  session.updated_at = nowIso();
  writeJson(path.join(pipelineDocPath, 'session.json'), session);
  writeSignedState(path.join(pipelineDocPath, 'sentinel-state.json'), {
    pipeline_active: false,
    current_phase: session.phases_reached.at(-1) || 'blocked',
    expected_next: status === 'PASS' ? 'complete' : 'operator-action',
    reason: reason || null,
    run_id: process.env.PIPELINE_RUN_ID || (session && session.run_id) || null,
    updated_at: nowIso(),
  });
  if (nextStep) fs.writeFileSync(path.join(pipelineDocPath, 'NEXT_STEP'), `${nextStep}\n`);
}

function blockRun({ pipelineDocPath, session, reason, dispatchMode, nextStep }) {
  logGateDecision(pipelineDocPath, session, {
    gate: reason === 'missing-session-state' ? 'CONTINUE_STATE' : 'AGENT_RUNTIME',
    hardness: 'HARD',
    phase: 'entrypoint',
    decision: 'BLOCKED',
    decided_by: 'runtime',
    timestamp: nowIso(),
    detail: reason,
    confidence_impact: -1,
  });
  finalizeArtifacts({ pipelineDocPath, session, status: 'BLOCKED', reason, nextStep });
  return {
    status: 'BLOCKED',
    reason,
    dispatchMode,
    harness: false,
    pipelineDocPath,
    phasesReached: session.phases_reached,
    brainstorm: { concluded: false },
  };
}

function blockActiveRun({ pipelineDocPath, session, reason, dispatchMode, gate = 'PROTOCOL_BLOCK', nextStep }) {
  logGateDecision(pipelineDocPath, session, {
    gate,
    hardness: 'HARD',
    phase: session.phases_reached.at(-1) || 'protocol',
    decision: 'BLOCKED',
    decided_by: 'runtime',
    timestamp: nowIso(),
    detail: reason,
    confidence_impact: -1,
  });
  finalizeArtifacts({ pipelineDocPath, session, status: 'BLOCKED', reason, nextStep });
  return {
    status: 'BLOCKED',
    reason,
    dispatchMode,
    harness: false,
    pipelineDocPath,
    phasesReached: session.phases_reached,
    brainstorm: { concluded: false },
  };
}

async function dispatchToAdapter({ adapter, request, pipelineDocPath }) {
  const protocolId = request.dispatch_id || request.id;
  appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
    event: 'DISPATCH_REQUEST_EMITTED',
    protocol_event_id: protocolId,
    target_kind: request.target_kind,
    target_name: request.target_name,
    timestamp: nowIso(),
  });
  const result = await adapter.spawnAgent({
    agent: request.target_name,
    description: request.description,
    prompt: request.prompt,
  });
  appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
    event: 'DISPATCH_RESULT_CAPTURED',
    protocol_event_id: protocolId,
    target_name: request.target_name,
    timestamp: nowIso(),
  });
  return result;
}

function recordGateRequest({ block, pipelineDocPath, gateResponses, session }) {
  const gateId = block.payload.gate_id || block.payload.id;
  const gate = canonicalGate(gateId);
  const protocolId = block.payload.id || block.payload.gate_id;
  appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
    event: 'GATE_REQUEST_EMITTED',
    protocol_event_id: protocolId,
    gate_id: gateId,
    timestamp: nowIso(),
  });

  if (!isGateRequestWellFormed(block.payload)) {
    logGateDecision(pipelineDocPath, session, {
      gate: 'PROTOCOL_BLOCK',
      hardness: 'HARD',
      phase: 'protocol',
      decision: 'BLOCKED',
      decided_by: 'runtime',
      timestamp: nowIso(),
      detail: 'GATE_REQUEST missing required gate_id, question, or options',
      confidence_impact: -1,
    });
    return { ok: false, reason: 'malformed-protocol-block', gate: 'PROTOCOL_BLOCK' };
  }

  if (!gate && !isKnownOptionalGate(gateId)) {
    logGateDecision(pipelineDocPath, session, {
      gate: 'UNKNOWN_GATE_REQUEST',
      hardness: 'HARD',
      phase: 'protocol',
      decision: 'BLOCKED',
      decided_by: 'runtime',
      timestamp: nowIso(),
      detail: `unknown gate_id=${gateId}`,
      confidence_impact: -1,
    });
    return { ok: false, reason: 'unknown-gate-request', gate: 'UNKNOWN_GATE_REQUEST' };
  }
  if (!gate) {
    const response = gateResponses[gateId] || null;
    if (!response) {
      logGateDecision(pipelineDocPath, session, {
        gate: 'PROTOCOL_ONLY_GATE',
        hardness: 'HARD',
        phase: 'protocol',
        decision: 'BLOCKED',
        decided_by: 'runtime',
        timestamp: nowIso(),
        detail: `missing GATE_RESPONSES for ${gateId}`,
        confidence_impact: -1,
      });
      return { ok: false, reason: 'missing-gate-responses', gate: 'PROTOCOL_ONLY_GATE' };
    }
    appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
      event: 'GATE_RESPONSE_CAPTURED',
      protocol_event_id: protocolId,
      gate_id: gateId,
      timestamp: nowIso(),
    });
    return { ok: true, response };
  }
  const response = gateResponses[gateId] || gateResponses[gate] || null;
  if (!response) {
    logGateDecision(pipelineDocPath, session, {
      gate,
      hardness: gateHardness(gate),
      phase: gate === 'STEP_1_7_ROUTING' ? '1.7' : 'protocol',
      decision: 'BLOCKED',
      decided_by: 'runtime',
      timestamp: nowIso(),
      detail: `missing GATE_RESPONSES for ${gateId}`,
      confidence_impact: -1,
    });
    return { ok: false, reason: 'missing-gate-responses', gate };
  }

  appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
    event: 'GATE_RESPONSE_CAPTURED',
    protocol_event_id: protocolId,
    gate_id: gateId,
    timestamp: nowIso(),
  });
  logGateDecision(pipelineDocPath, session, {
    gate,
    hardness: gateHardness(gate),
    phase: gate === 'STEP_1_7_ROUTING' ? '1.7' : 'protocol',
    decision: normalizeResponseToDecision(response),
    decided_by: 'user',
    timestamp: nowIso(),
    detail: `protocol_event_id=${protocolId}`,
    confidence_impact: 0,
  });
  return { ok: true, response };
}

async function runOperationalPipeline(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const task = options.task || '';
  const mode = options.mode || 'full';
  const strictAgents = options.strictAgents !== false;
  const adapter = options.agentAdapter || null;
  const gateResponses = options.gateResponses || {};
  const dispatchMode = adapter ? (adapter.kind || 'real-agent') : 'blocked-no-agent-runtime';
  const pipelineDocPath = options.pipelineDocPath || createPipelineDocPath(cwd, task || mode);
  const planMode = resolvePlanMode({
    complexity: options.complexity,
    type: options.type,
    noPlan: options.noPlan,
  });

  const session = initializeArtifacts({
    pipelineDocPath, cwd, task, mode, dispatchMode, planMode,
    type: options.type,
    complexity: options.complexity,
  });
  let controllerInitialPrompt = task;

  if (mode === 'continue') {
    if (!options.continueStatePath) {
      return blockRun({
        pipelineDocPath,
        session,
        reason: 'missing-session-state',
        dispatchMode,
        nextStep: 'Start a new pipeline run or provide a valid previous session.json path for continue.',
      });
    }
    try {
      const previous = JSON.parse(fs.readFileSync(options.continueStatePath, 'utf8'));
      if (!Array.isArray(previous.phases_reached)) {
        throw new Error('previous session missing phases_reached');
      }
      session.resume = {
        continue_state_path: path.resolve(options.continueStatePath),
        previous_status: previous.status || null,
        previous_phases_reached: previous.phases_reached,
        previous_pipeline_doc_path: previous.pipeline_doc_path || null,
      };
      controllerInitialPrompt = [
        'CONTINUE_STATE:',
        JSON.stringify(session.resume, null, 2),
        '',
        task,
      ].join('\n');
      writeJson(path.join(pipelineDocPath, 'session.json'), session);
    } catch (error) {
      return blockRun({
        pipelineDocPath,
        session,
        reason: 'invalid-session-state',
        dispatchMode,
        nextStep: `Provide a readable previous session.json with phases_reached. ${error.message}`,
      });
    }
  }

  if (mode === 'review-only' && (!options.changedFiles || options.changedFiles.length === 0)) {
    fs.writeFileSync(
      path.join(pipelineDocPath, 'review-only-report.md'),
      '# Review-only blocked\n\nNo changed file list was provided, so review-only cannot produce an auditable review.\n'
    );
    return blockRun({
      pipelineDocPath,
      session,
      reason: 'review-only-requires-change-list',
      dispatchMode,
      nextStep: 'Re-run review-only with an explicit changed file list.',
    });
  }

  if (strictAgents && !adapter) {
    return blockRun({
      pipelineDocPath,
      session,
      reason: 'blocked-no-agent-runtime',
      dispatchMode,
      nextStep: 'Configure a Codex agent adapter that can spawn pipeline-controller, or run an explicitly diagnostic harness.',
    });
  }

  if (mode === 'review-only') {
    session.review_only = {
      changed_files: [...options.changedFiles],
      report_only: true,
    };
    writeJson(path.join(pipelineDocPath, 'session.json'), session);
    const review = await adapter.spawnAgent({
      agent: 'review-orchestrator',
      description: 'Run review-only report for explicit changed files',
      prompt: [
        'REVIEW_ONLY=true',
        'Do not perform implementation changes.',
        'Changed files:',
        ...options.changedFiles.map((file) => `- ${file}`),
      ].join('\n'),
    });
    fs.writeFileSync(path.join(pipelineDocPath, 'review-only-report.md'), `${review.text || ''}\n`);
    const reviewStatus = /STATUS:\s*PASS|REVIEW_ONLY_REPORT/.test(review.text || '') ? 'PASS' : 'BLOCKED';
    const reviewReason = reviewStatus === 'PASS' ? null : 'review-only-blocked';
    finalizeArtifacts({
      pipelineDocPath,
      session,
      status: reviewStatus,
      reason: reviewReason,
      nextStep: reviewStatus === 'PASS' ? 'Review-only report completed.' : 'Inspect review-only-report.md.',
    });
    return {
      status: reviewStatus,
      reason: reviewReason,
      dispatchMode,
      harness: false,
      pipelineDocPath,
      phasesReached: session.phases_reached,
      brainstorm: { concluded: false },
    };
  }

  const initial = await adapter.spawnAgent({
    agent: 'pipeline-controller',
    description: 'Orchestrate pipeline for the user request',
    prompt: controllerInitialPrompt,
  });
  let pendingControllerPrompt = controllerInitialPrompt;
  let text = initial.text || '';
  let status = 'RUNNING';
  let reason = null;
  let brainstormConcluded = !/STEP_1_7_ROUTING|brainstorm-controller/.test(text);
  let iterations = 0;

  while (iterations < 25) {
    iterations += 1;
    uniquePush(session.phases_reached, extractPhases(text));
    const blocks = parseProtocolBlocks(text);
    if (hasMalformedProtocolBlock(text, blocks)) {
      return blockActiveRun({
        pipelineDocPath,
        session,
        reason: 'malformed-protocol-block',
        dispatchMode,
        nextStep: 'Fix malformed protocol block delimiters before treating this run as operational.',
      });
    }

    if (blocks.length === 0) {
      if (/PIPELINE COMPLETE|STATUS:\s*PASS/.test(text)) {
        status = 'PASS';
      } else if (/STATUS:\s*BLOCKED/.test(text)) {
        status = 'BLOCKED';
        reason = 'controller-blocked';
      } else {
        status = 'BLOCKED';
        reason = 'malformed-controller-output';
      }
      break;
    }

    const dispatchResults = [];
    let controllerAlreadyContinued = false;
    for (const block of blocks) {
      if (block.kind === 'DISPATCH_REQUEST') {
        if (!block.payload.dispatch_id || !block.payload.target_name || !block.payload.prompt) {
          return blockActiveRun({
            pipelineDocPath,
            session,
            reason: 'malformed-protocol-block',
            dispatchMode,
            nextStep: 'DISPATCH_REQUEST requires dispatch_id, target_name, and prompt.',
          });
        }
        if (block.payload.target_name === 'brainstorm-controller') {
          logGateDecision(pipelineDocPath, session, {
            gate: 'STEP_1_7_ROUTING',
            hardness: 'HARD',
            phase: '1.7',
            decision: 'DISPATCHED',
            decided_by: 'runtime',
            timestamp: nowIso(),
            detail: `protocol_event_id=${block.payload.dispatch_id || block.payload.id}`,
            confidence_impact: 0,
          });
        }
        const dispatchResult = await dispatchToAdapter({
          adapter,
          request: block.payload,
          pipelineDocPath,
        });
        const dispatchText = dispatchResult.text || '';
        const nestedBlocks = parseProtocolBlocks(dispatchText);
        if (hasMalformedProtocolBlock(dispatchText, nestedBlocks)) {
          return blockActiveRun({
            pipelineDocPath,
            session,
            reason: 'malformed-protocol-block',
            dispatchMode,
            nextStep: 'Fix malformed nested protocol block delimiters before treating this run as operational.',
          });
        }
        let nestedGateHandled = false;
        for (const nestedBlock of nestedBlocks) {
          if (nestedBlock.kind !== 'GATE_REQUEST') continue;
          nestedGateHandled = true;
          const gate = recordGateRequest({ block: nestedBlock, pipelineDocPath, gateResponses, session });
          if (!gate.ok) {
            status = 'BLOCKED';
            reason = gate.reason;
            brainstormConcluded = gate.gate === 'STEP_1_7_ROUTING' ? false : brainstormConcluded;
            finalizeArtifacts({
              pipelineDocPath,
              session,
              status,
              reason,
              nextStep: `Provide GATE_RESPONSES for ${nestedBlock.payload.gate_id || nestedBlock.payload.id}.`,
            });
            return {
              status,
              reason,
              dispatchMode,
              harness: false,
              pipelineDocPath,
              phasesReached: session.phases_reached,
              brainstorm: { concluded: brainstormConcluded },
            };
          }
          if (gate.gate === 'STEP_1_7_ROUTING') brainstormConcluded = true;
        }
        if (!nestedGateHandled) {
          dispatchResults.push(dispatchText);
        }
      }

      if (block.kind === 'GATE_REQUEST') {
        const gate = recordGateRequest({ block, pipelineDocPath, gateResponses, session });
        if (!gate.ok) {
          status = 'BLOCKED';
          reason = gate.reason;
          brainstormConcluded = gate.gate === 'STEP_1_7_ROUTING' ? false : brainstormConcluded;
          finalizeArtifacts({
            pipelineDocPath,
            session,
            status,
            reason,
            nextStep: `Provide GATE_RESPONSES for ${block.payload.gate_id || block.payload.id}.`,
          });
          return {
            status,
            reason,
            dispatchMode,
            harness: false,
            pipelineDocPath,
            phasesReached: session.phases_reached,
            brainstorm: { concluded: brainstormConcluded },
          };
        }
        if (gate.gate === 'STEP_1_7_ROUTING') brainstormConcluded = true;
      }

      if (block.kind === 'PLAN_MODE_REQUEST') {
        const planId = block.payload.plan_id || block.payload.id;
        appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
          event: 'PLAN_MODE_REQUEST_EMITTED',
          protocol_event_id: planId,
          timestamp: nowIso(),
        });
        const planResult = await adapter.spawnAgent({
          agent: 'plan-mode',
          description: block.payload.description || 'Run plan mode',
          prompt: buildPlanPrompt(block.payload),
        });
        appendJsonl(path.join(pipelineDocPath, 'protocol-events.jsonl'), {
          event: 'PLAN_MODE_RESULT_CAPTURED',
          protocol_event_id: planId,
          timestamp: nowIso(),
        });
        pendingControllerPrompt = [
          'PLAN_MODE_RESULTS:',
          planResult.text || '',
          '',
          pendingControllerPrompt,
        ].join('\n');
        const next = await adapter.spawnAgent({
          agent: 'pipeline-controller',
          description: 'Continue pipeline after plan mode results',
          prompt: pendingControllerPrompt,
        });
        text = next.text || '';
        controllerAlreadyContinued = true;
        break;
      }
    }

    if (controllerAlreadyContinued) continue;

    if (dispatchResults.length > 0) {
      pendingControllerPrompt = [
        'DISPATCH_RESULTS:',
        dispatchResults.join('\n---\n'),
        '',
        pendingControllerPrompt,
      ].join('\n');
      const next = await adapter.spawnAgent({
        agent: 'pipeline-controller',
        description: 'Continue pipeline after dispatch results',
        prompt: pendingControllerPrompt,
      });
      text = next.text || '';
      continue;
    }

    pendingControllerPrompt = [
      'GATE_RESPONSES:',
      JSON.stringify(gateResponses),
      '',
      pendingControllerPrompt,
    ].join('\n');
    const next = await adapter.spawnAgent({
      agent: 'pipeline-controller',
      description: 'Continue pipeline after protocol responses',
      prompt: pendingControllerPrompt,
    });
    text = next.text || '';
  }

  finalizeArtifacts({
    pipelineDocPath,
    session,
    status,
    reason,
    nextStep: status === 'PASS'
      ? 'Pipeline completed.'
      : (reason === 'malformed-controller-output'
          ? 'Investigate malformed controller output; do not treat this run as PASS.'
          : 'Inspect protocol-events.jsonl and gate-decisions.jsonl.'),
  });

  return {
    status,
    reason,
    dispatchMode,
    harness: false,
    pipelineDocPath,
    controllerInitialPrompt,
    phasesReached: session.phases_reached,
    brainstorm: { concluded: brainstormConcluded },
  };
}

module.exports = {
  runOperationalPipeline,
  createFakeAgentAdapter,
  parseProtocolBlocks,
  _private: {
    parseSimpleYaml,
    canonicalGate,
    extractPhases,
  },
};
