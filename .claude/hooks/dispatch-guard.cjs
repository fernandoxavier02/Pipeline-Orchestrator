#!/usr/bin/env node
'use strict';

/**
 * dispatch-guard.cjs — PreToolUse:Skill + PreToolUse:Agent guard for pipeline-orchestrator.
 *
 * Purpose (v3.6.0 base + v4.8.0 extension):
 *   v3.6.0: LLM controllers running `/pipeline` occasionally invoke `Skill(task-orchestrator)`
 *     instead of `Agent(subagent_type: "pipeline-orchestrator:core:task-orchestrator")`.
 *     The Skill call fails with "Unknown skill" and the pipeline stalls at Phase 0a.
 *   v4.8.0: When a backing skill (feature-light, audit-heavy, etc.) is in flight,
 *     each step file (skills/<name>/steps/0N-*.md) declares an `agent_type` in its
 *     frontmatter. dispatch-guard now reads that contract and validates that the
 *     Agent being spawned matches the declared agent_type for the current step.
 *
 * What this hook does:
 *   - Skill calls: intercepts skill names that collide with agent leaves and emits
 *     a corrective deny telling the LLM to use Agent(subagent_type: ...) instead.
 *   - Agent calls (v4.8+): when sentinel-state.json has current_skill + current_step,
 *     reads skills/<name>/steps/0N-*.md frontmatter and validates agent_type matches
 *     the call's subagent_type. Mismatch → ENFORCEMENT_WARN (until 2026-05-17) or
 *     ENFORCEMENT_DENY (after).
 *
 * Protocol:
 *   - Exit 0 with no stdout → allow (silent pass)
 *   - Exit 0 with hookSpecificOutput deny → deny this call; reason fed to Claude
 *   - NEVER exits with non-zero — a misfire of this guard must not hard-block the user
 */

const fs = require('fs');
const path = require('path');
const enforcement = require('./skill-frontmatter-parser.cjs');

// SEC-1 (v7.14.0): HMAC integrity verification of the sentinel state before the
// STEP 1.7 enforcement layer trusts its step_1_7 block. Loaded defensively — if
// the lib is unavailable the guard degrades to advisory (warn-first tolerance),
// mirroring how sentinel-hook.cjs consumes the same signer. Strict mode
// (PIPELINE_HMAC_STRICT) fails closed.
let stateSigner = null;
try { stateSigner = require('../../lib/sentinel-state-signer.cjs'); } catch { /* advisory skip */ }

// ── Agent leaf → fully-qualified subagent_type map ──────────────────────────
//
// Source of truth: `agents/**/*.md` filenames. Update this table when agents
// are added/removed/moved. The hook's regression tests assume the invariants
// listed in references/glossary.md's "Agent Naming Convention".
const AGENT_LEAF_TO_FQN = Object.freeze({
  // core/ (10 agents — added brainstorm-controller in v5.3.0 fix H1-001)
  'pipeline-controller': 'pipeline-orchestrator:core:pipeline-controller',
  'brainstorm-controller': 'pipeline-orchestrator:core:brainstorm-controller',
  'task-orchestrator': 'pipeline-orchestrator:core:task-orchestrator',
  'spec-controller': 'pipeline-orchestrator:core:spec-controller',
  'information-gate': 'pipeline-orchestrator:core:information-gate',
  'sentinel': 'pipeline-orchestrator:core:sentinel',
  'checkpoint-validator': 'pipeline-orchestrator:core:checkpoint-validator',
  'sanity-checker': 'pipeline-orchestrator:core:sanity-checker',
  'adversarial-batch': 'pipeline-orchestrator:core:adversarial-batch',
  'final-validator': 'pipeline-orchestrator:core:final-validator',
  'finishing-branch': 'pipeline-orchestrator:core:finishing-branch',

  // executor/ top level (6 agents)
  'executor-controller': 'pipeline-orchestrator:executor:executor-controller',
  'executor-implementer-task': 'pipeline-orchestrator:executor:executor-implementer-task',
  'executor-fix': 'pipeline-orchestrator:executor:executor-fix',
  'executor-spec-reviewer': 'pipeline-orchestrator:executor:executor-spec-reviewer',
  'executor-quality-reviewer': 'pipeline-orchestrator:executor:executor-quality-reviewer',
  'spec-closer': 'pipeline-orchestrator:executor:spec-closer',

  // executor/type-specific/ (20 agents)
  'adversarial-review-coordinator': 'pipeline-orchestrator:executor:type-specific:adversarial-review-coordinator',
  'adversarial-security-scanner': 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner',
  'adversarial-architecture-critic': 'pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic',
  'adversarial-quality-reviewer': 'pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer',
  'audit-intake': 'pipeline-orchestrator:executor:type-specific:audit-intake',
  'audit-domain-analyzer': 'pipeline-orchestrator:executor:type-specific:audit-domain-analyzer',
  'audit-compliance-checker': 'pipeline-orchestrator:executor:type-specific:audit-compliance-checker',
  'audit-risk-matrix-generator': 'pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator',
  'bugfix-diagnostic-agent': 'pipeline-orchestrator:executor:type-specific:bugfix-diagnostic-agent',
  'bugfix-root-cause-analyzer': 'pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer',
  'bugfix-regression-tester': 'pipeline-orchestrator:executor:type-specific:bugfix-regression-tester',
  'feature-vertical-slice-planner': 'pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner',
  'feature-implementer': 'pipeline-orchestrator:executor:type-specific:feature-implementer',
  'feature-integration-validator': 'pipeline-orchestrator:executor:type-specific:feature-integration-validator',
  'spec-format-gate': 'pipeline-orchestrator:executor:type-specific:spec-format-gate',
  'spec-content-reviewer': 'pipeline-orchestrator:executor:type-specific:spec-content-reviewer',
  'spec-post-impl-validator': 'pipeline-orchestrator:executor:type-specific:spec-post-impl-validator',
  'spec-adversarial-critic': 'pipeline-orchestrator:executor:type-specific:spec-adversarial-critic',
  'ux-simulator': 'pipeline-orchestrator:executor:type-specific:ux-simulator',
  'ux-accessibility-auditor': 'pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor',
  'ux-qa-validator': 'pipeline-orchestrator:executor:type-specific:ux-qa-validator',

  // brainstorm/ step agents (4 — step-01c-ideation added v8.0.0 spec-authoring)
  'step-00-intake': 'pipeline-orchestrator:brainstorm:brainstorm-step-00-intake',
  'step-01-explore': 'pipeline-orchestrator:brainstorm:brainstorm-step-01-explore',
  'step-01b-alternatives': 'pipeline-orchestrator:brainstorm:brainstorm-step-01b-alternatives',
  'step-01c-ideation': 'pipeline-orchestrator:brainstorm:brainstorm-step-01c-ideation',

  // quality/ (8 agents — v6.3.0 added diff-discipline-reviewer)
  'review-orchestrator': 'pipeline-orchestrator:quality:review-orchestrator',
  'architecture-reviewer': 'pipeline-orchestrator:quality:architecture-reviewer',
  'diff-discipline-reviewer': 'pipeline-orchestrator:quality:diff-discipline-reviewer',
  'design-interrogator': 'pipeline-orchestrator:quality:design-interrogator',
  'plan-architect': 'pipeline-orchestrator:quality:plan-architect',
  'quality-gate-router': 'pipeline-orchestrator:quality:quality-gate-router',
  'pre-tester': 'pipeline-orchestrator:quality:pre-tester',
  'final-adversarial-orchestrator': 'pipeline-orchestrator:quality:final-adversarial-orchestrator'
});

function buildDenyReason(leaf, fqn) {
  // Agent count derived from the table (v3.6.0 round 2: no magic literal).
  const agentCount = Object.keys(AGENT_LEAF_TO_FQN).length;
  return (
    `DISPATCH GUARD: "${leaf}" is an Agent, not a skill.\n\n` +
    `The pipeline-orchestrator plugin exposes ${agentCount} agents via the Agent tool with the ` +
    `\`subagent_type\` field. None of them are skills or slash commands.\n\n` +
    `ACTION REQUIRED: replace your Skill("${leaf}", ...) call with:\n` +
    `  Agent(\n` +
    `    subagent_type: "${fqn}",\n` +
    `    description: "<short description>",\n` +
    `    prompt: "<full prompt for the agent>"\n` +
    `  )`
  );
}

// ── v4.8.0 Skill Step Enforcement (Agent calls) ────────────────────────────

function checkStepAgentType(toolInput) {
  const docPath = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (!docPath) return null;
  const statePath = path.join(docPath, 'sentinel-state.json');
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
  const ctx = enforcement.getCurrentSkill(state);
  if (!ctx || !ctx.step) return null;
  const repoRoot = process.env.PIPELINE_REPO_ROOT || process.cwd();
  const stepPattern = String(ctx.step).padStart(2, '0');
  const stepsDir = path.join(repoRoot, 'skills', ctx.skill, 'steps');
  let stepFile = null;
  try {
    for (const f of fs.readdirSync(stepsDir)) {
      if (f.startsWith(stepPattern + '-') && f.endsWith('.md')) { stepFile = path.join(stepsDir, f); break; }
    }
  } catch { return null; }
  if (!stepFile) return null;
  let stepText;
  try { stepText = fs.readFileSync(stepFile, 'utf8'); } catch { return null; }
  const stepFm = enforcement.parseFrontmatter(stepText);
  if (!stepFm.ok || !stepFm.frontmatter || !stepFm.frontmatter.agent_type) return null;
  const expectedAgent = String(stepFm.frontmatter.agent_type);
  const actualAgent = (toolInput && typeof toolInput.subagent_type === 'string') ? toolInput.subagent_type : '';
  if (actualAgent === expectedAgent) return null;
  return {
    violation: `step ${ctx.step} of skill ${ctx.skill} expects agent ${expectedAgent}, got "${actualAgent || '(none)'}"`,
    hint: 'Spawn the declared agent_type or update the step file frontmatter',
    pipeline_doc_path: state.pipeline_doc_path || docPath,
    skill: ctx.skill,
    step: ctx.step,
  };
}

function handleAgentEnforcement(toolInput) {
  let violation;
  try { violation = checkStepAgentType(toolInput); } catch { return false; }
  if (!violation) return false;
  const mode = enforcement.getEnforcementMode();
  enforcement.logEnforcementDecision(violation.pipeline_doc_path, {
    mode, hook: 'dispatch-guard', skill: violation.skill, step: violation.step,
    violation: violation.violation, detail: violation.hint, pipeline_doc_path: violation.pipeline_doc_path,
  });
  if (mode === 'deny') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[ENFORCEMENT] ${violation.violation}. ${violation.hint}`,
      }
    }));
    return true;
  }
  process.stderr.write(`[ENFORCEMENT_WARN] dispatch-guard: ${violation.violation}\n`);
  return false;
}

// ── v7.11.0 AUDIT-001/002: deterministic Plan Mode bypass detection ──────────
//
// The historical PLAN_MODE_BYPASS enforcement was 100% controller prose with
// ZERO hook backstop (grep PLAN_MODE in hooks/ = 0). Signal G of the 2026-06-11
// audit caught a live bypass that nothing detected. This block converts the
// detection to deterministic code, reading the machine-readable roster
// (references/plan-mode-mandatory-agents.json, AUDIT-002) instead of prose.
//
// What is observable at PreToolUse (the hook sees the DISPATCH, not the return):
//   - dispatch of a mandatory agent WITH `PLAN_MODE_RESULTS` in the prompt
//     → the plan-mode round-trip happened; clear pending.
//   - dispatch WITHOUT it, first time → legit first dispatch (agent should emit
//     PLAN_MODE_REQUEST and stop); record PLAN_MODE_DISPATCH_PENDING; allow.
//   - dispatch WITHOUT it, while the SAME agent is already pending → re-dispatch
//     without the payload = bypass; record PLAN_MODE_BYPASS; warn (deny only
//     under PIPELINE_PLAN_MODE_ENFORCEMENT=deny).
// Pending state lives in a hook-owned file (plan-mode-pending.json) so it never
// races the controller's sentinel-state.json writes.

let _rosterCache = null;
function loadPlanModeRoster() {
  if (_rosterCache) return _rosterCache;
  const repoRoot = process.env.PIPELINE_REPO_ROOT || process.cwd();
  const candidates = [
    path.join(repoRoot, 'references', 'plan-mode-mandatory-agents.json'),
    path.join(__dirname, '..', '..', 'references', 'plan-mode-mandatory-agents.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j && Array.isArray(j.agents)) {
          _rosterCache = {
            leaves: new Set(j.agents.map((a) => a.leaf)),
            fqns: new Set(j.agents.map((a) => a.fqn)),
          };
          return _rosterCache;
        }
      }
    } catch { /* try next */ }
  }
  // R2 follow-up: the roster file is missing/unreadable — Plan Mode enforcement
  // is silently disabled. Emit one stderr breadcrumb so an operator who deletes
  // or corrupts the SSOT sees that the protection is gone.
  //
  // ARCH-RR2-1 — INTENTIONAL ASYMMETRY (do NOT "harmonize" with the brainstorm
  // loader): this Plan-Mode loader fails OPEN (empty roster → nothing matches →
  // detection off) while loadBrainstormRoster() fails CLOSED (missing registry →
  // embedded fallback target list → detection stays on). The difference is by
  // design, not an oversight:
  //   - Plan Mode mandatory agents are a LARGE, churning set (10+ agents that
  //     change release to release). An embedded copy would drift out of sync with
  //     references/plan-mode-mandatory-agents.json and produce false PLAN_MODE
  //     bypass denials against agents no longer mandatory. Failing open + a loud
  //     stderr breadcrumb is the safer trade-off for a warn-first protection.
  //   - STEP 1.7 brainstorm targets are a SMALL, stable set (4 execution entry
  //     points) that rarely changes, so an embedded fail-closed fallback is cheap
  //     to keep byte-equivalent and the security win (deleting the SSOT cannot
  //     silently disable enforcement) is worth it.
  // If you make this loader fail closed, mirror the small-set reasoning above; if
  // you make the brainstorm loader fail open, you reopen the SEC-B2-001 hole.
  process.stderr.write('[PLAN_MODE_WARN] dispatch-guard: plan-mode-mandatory-agents.json not found/unreadable — Plan Mode bypass detection DISABLED\n');
  _rosterCache = { leaves: new Set(), fqns: new Set() };
  return _rosterCache;
}

// appendProtocolEvent — shared AUDIT append used by BOTH the PLAN_MODE_BYPASS
// (Plan Mode) and BRAINSTORM_BYPASS (STEP 1.7) detectors. Renamed from
// planModeAppendEvent in v7.14.0 B2 when the second consumer arrived. Never
// throws — an audit-write failure must not hard-block the user.
function appendProtocolEvent(docPath, event) {
  try {
    const line = JSON.stringify({ ...event, ts: new Date().toISOString() }).replace(/[\r\n]+/g, ' ');
    fs.appendFileSync(path.join(docPath, 'protocol-events.jsonl'), line + '\n');
  } catch { /* never throw from audit */ }
}

// SEC-RR2-1: sanitize any state-derived string before it is interpolated into a
// permissionDecisionReason / audit detail. State (sentinel-state.json) is
// attacker-influenceable: a crafted type/complexity/subagent_type could carry
// newlines, control chars, or injected prose ("...ignore previous instructions")
// that breaks the JSONL audit line OR smuggles text into the harness decision
// context. We (1) cap length, then (2) keep ONLY printable ASCII (0x20..0x7E),
// dropping control chars / newlines / non-ASCII. Returns '' for non-strings.
function sanitizeForReason(value, max) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.slice(0, max || 64).replace(/[^\x20-\x7E]/g, '');
}

// SEC-B4-004 (v7.11.0): per-agent pending FILES (plan-mode-pending-<leaf>.json)
// instead of a shared object — eliminates the read-modify-write race when
// parallel_eligible MEDIA batches dispatch two mandatory agents concurrently.
// Each entry is { run_id, ts } so it is SESSION-SCOPED (SEC-B4-001/005): a stale
// entry from a crashed prior run is ignored when its run_id != current run.
// MINOR (RR2): despite the PLAN_MODE_ prefix, this TTL is the SHARED no-run_id
// freshness window for BOTH session-scoped marker files — the plan-mode pending
// file (readPending) AND the brainstorm-bypass dedup marker
// (brainstormBypassAlreadyEmitted). Both fall back to it only when the current
// session has no run_id. Kept under one name (not renamed) to avoid a churny
// rename across two call sites; read it as PENDING_MARKER_TTL_MS.
const PLAN_MODE_PENDING_TTL_MS = 24 * 3600 * 1000;
function pendingFile(docPath, leaf) {
  const safe = String(leaf).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return path.join(docPath, `plan-mode-pending-${safe}.json`);
}
function readPending(docPath, leaf) {
  try {
    const p = pendingFile(docPath, leaf);
    if (fs.statSync(p).size > 4096) return null; // poison guard
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    const curRun = (process.env.PIPELINE_RUN_ID || '').trim();
    // Session scoping (SEC-R2-001): when the current session HAS a run_id, the entry
    // is active ONLY if it carries the SAME run_id. An entry written by a prior
    // run — including a no-run_id session that stored run_id: null — belongs to a
    // different session and is treated as absent (prevents the null-run_id deadlock).
    if (curRun) {
      const fileRun = typeof j.run_id === 'string' && j.run_id ? j.run_id : null;
      if (fileRun !== curRun) return null;
    } else {
      // No current run_id — fall back to a freshness TTL so a crashed run cannot
      // poison a much later one.
      const age = typeof j.ts === 'string' ? (Date.now() - Date.parse(j.ts)) : NaN;
      if (!Number.isFinite(age) || age < 0 || age >= PLAN_MODE_PENDING_TTL_MS) return null;
    }
    return j;
  } catch { return null; }
}
function writePending(docPath, leaf) {
  try {
    fs.writeFileSync(pendingFile(docPath, leaf), JSON.stringify({
      run_id: (process.env.PIPELINE_RUN_ID || '').trim() || null,
      ts: new Date().toISOString(),
    }, null, 2));
  } catch { /* soft */ }
}
function clearPending(docPath, leaf) {
  try { fs.rmSync(pendingFile(docPath, leaf), { force: true }); } catch { /* soft */ }
}

// SEC-B2-004: per-leaf+run dedup marker for BRAINSTORM_BYPASS. Unlike PLAN_MODE,
// the brainstorm bypass has no PLAN_MODE_RESULTS-style clear-after-first signal —
// a retry loop on the same in-scope task would otherwise append ~1 event per
// dispatch (~1000 lines under a pathological loop). This marker makes the event
// fire ONCE per leaf per run. Marker is session-scoped via run_id (same logic as
// the plan-mode pending file): a marker from a prior run does NOT suppress the
// current run's first event.
function brainstormMarkerFile(docPath, leaf) {
  const safe = String(leaf).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return path.join(docPath, `brainstorm-bypass-${safe}.json`);
}
function brainstormBypassAlreadyEmitted(docPath, leaf) {
  try {
    const p = brainstormMarkerFile(docPath, leaf);
    if (fs.statSync(p).size > 4096) return false; // poison guard → re-emit (and rewrite)
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
    const curRun = (process.env.PIPELINE_RUN_ID || '').trim();
    if (curRun) {
      const fileRun = typeof j.run_id === 'string' && j.run_id ? j.run_id : null;
      return fileRun === curRun; // same run → already emitted, suppress
    }
    // No current run_id — fall back to a freshness TTL so a crashed run cannot
    // suppress a much later one's first event.
    const age = typeof j.ts === 'string' ? (Date.now() - Date.parse(j.ts)) : NaN;
    return Number.isFinite(age) && age >= 0 && age < PLAN_MODE_PENDING_TTL_MS;
  } catch { return false; }
}
function markBrainstormBypassEmitted(docPath, leaf) {
  try {
    fs.writeFileSync(brainstormMarkerFile(docPath, leaf), JSON.stringify({
      run_id: (process.env.PIPELINE_RUN_ID || '').trim() || null,
      ts: new Date().toISOString(),
    }, null, 2));
  } catch { /* soft */ }
}

// Returns true when the hook has emitted a deny decision (caller must exit).
function handlePlanModeDispatch(toolInput) {
  const docPath = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (!docPath) return false; // no run context → nothing to track
  const subagent = (toolInput && typeof toolInput.subagent_type === 'string') ? toolInput.subagent_type : '';
  if (!subagent) return false;
  const roster = loadPlanModeRoster();
  const leaf = subagent.split(':').pop();
  // SEC-B4-003 (v7.11.0): exact FQN match, OR a leaf match BUT ONLY within the
  // pipeline-orchestrator namespace — a third-party plugin agent that happens to
  // share a leaf name (e.g. another 'audit-intake') must NOT be tracked.
  const isMandatory = roster.fqns.has(subagent)
    || (roster.leaves.has(leaf) && subagent.startsWith('pipeline-orchestrator:'));
  if (!isMandatory) return false;

  const prompt = (toolInput && typeof toolInput.prompt === 'string') ? toolInput.prompt : '';
  // SEC-B4-002 / SEC-R2-002 (v7.11.0): anchored at COLUMN 0 — a real PLAN_MODE_RESULTS
  // payload is prepended at the very start of a line by the parent controller. No
  // leading whitespace is allowed, so an indented boilerplate mention deep in prose
  // cannot clear pending / reset bypass detection.
  const hasResults = /^PLAN_MODE_RESULTS\b/m.test(prompt);
  const pending = readPending(docPath, leaf);

  if (hasResults) {
    // Plan-mode round-trip fulfilled — clear pending for this agent.
    if (pending) clearPending(docPath, leaf);
    return false;
  }

  if (!pending) {
    // Legit first dispatch — the agent is expected to emit PLAN_MODE_REQUEST.
    writePending(docPath, leaf);
    appendProtocolEvent(docPath, {
      event: 'PLAN_MODE_DISPATCH_PENDING', agent: leaf, phase: 'pre-dispatch',
      detail: `${leaf} dispatched without PLAN_MODE_RESULTS — awaiting PLAN_MODE_REQUEST (first dispatch)`,
      decided_by: 'dispatch-guard',
    });
    return false; // allow
  }

  // Same agent re-dispatched, still no PLAN_MODE_RESULTS → bypass.
  appendProtocolEvent(docPath, {
    event: 'PLAN_MODE_BYPASS', agent: leaf, phase: 'pre-dispatch',
    detail: `${leaf} re-dispatched without PLAN_MODE_RESULTS — plan-mode boundary bypassed`,
    decided_by: 'dispatch-guard',
  });
  // Log-amplification guard (R2 follow-up): clear pending after the first bypass so
  // a pathological re-dispatch loop emits ONE bypass event, not one per dispatch.
  clearPending(docPath, leaf);
  const enforce = String(process.env.PIPELINE_PLAN_MODE_ENFORCEMENT || 'warn').toLowerCase();
  if (enforce === 'deny') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[PLAN_MODE] ${leaf} was re-dispatched without a PLAN_MODE_RESULTS payload — ` +
          `the plan-mode boundary was bypassed. Run the PLAN_MODE_REQUEST round-trip ` +
          `(parent enters Plan Mode, researches read-only, re-dispatches with PLAN_MODE_RESULTS prepended) before retrying.`,
      },
    }));
    return true; // deny
  }
  // warn-first (default): nudge the controller via stderr, do not block.
  process.stderr.write(`[PLAN_MODE_WARN] dispatch-guard: ${leaf} re-dispatched without PLAN_MODE_RESULTS (set PIPELINE_PLAN_MODE_ENFORCEMENT=deny to block)\n`);
  return false;
}

// ── v7.14.0 B2: deterministic STEP 1.7 brainstorm bypass detection ───────────
//
// STEP 1.7 of the pipeline-controller mandates that MEDIA/COMPLEXA/Spec tasks
// pass through the mandatory brainstorm BEFORE execution, recording the routing
// decision in sentinel-state.step_1_7 (D3). The 2026-06-12 audit proved this
// was prose-only enforcement (4 events in 245 runs, 1 out-of-vocabulary
// violation). This block mirrors the PLAN_MODE_BYPASS pattern (v7.11.0): when a
// Phase 1.5 / Phase 2 enforcement target is dispatched but the brainstorm
// decision is absent (or carries a branch outside the closed vocabulary), emit
// an AUDIT BRAINSTORM_BYPASS event + stderr warn; under
// PIPELINE_BRAINSTORM_ENFORCEMENT=deny, return a corrective permission deny.
//
// CROSS-BATCH CONTRACT (from B1, lib/step-1-7-routing.cjs): sentinel-state
// .step_1_7.decision stores the RAW BRANCH value (one of BRANCH_VALUES), NOT a
// canonical gate-decision value. We validate against BRANCH_VALUES — never
// against the 8-value CANONICAL_DECISIONS set.

// Embedded fail-closed fallback: if references/step-1-7-enforcement.json is
// missing/unreadable, target detection MUST still work so deleting the SSOT does
// not silently disable enforcement. Kept byte-equivalent to that file's targets.
const BRAINSTORM_FALLBACK = Object.freeze({
  fqns: new Set([
    'pipeline-orchestrator:executor:executor-controller',
    'pipeline-orchestrator:quality:plan-architect',
    'pipeline-orchestrator:executor:executor-implementer-task',
    'pipeline-orchestrator:executor:type-specific:feature-implementer',
  ]),
  leaves: new Set([
    'executor-controller',
    'plan-architect',
    'executor-implementer-task',
    'feature-implementer',
  ]),
  skillPrefixes: ['feature-', 'bugfix-', 'audit-', 'user-story-', 'ux-sim-', 'spec-'],
});

// Embedded copy of the 4 closed branch values — keeps validation working even if
// the sealed B1 lib is unreadable. ARCH-RR2-2: this is the SINGLE source for the
// fallback so the drift guard below can compare it against the live lib set.
const BRAINSTORM_FALLBACK_BRANCHES = Object.freeze([
  'load-existing', 'dispatch-brainstorm', 'no-prep-override', 'simples-bypass',
]);

// BRANCH_VALUES from the sealed B1 lib (import only — do not edit that module).
// Fail-soft if the lib cannot be loaded so the hook never crashes the session.
let _BRANCH_VALUES = null;
function brainstormBranchValues() {
  if (_BRANCH_VALUES) return _BRANCH_VALUES;
  const tryPaths = [
    path.join(process.env.PIPELINE_REPO_ROOT || process.cwd(), 'lib', 'step-1-7-routing.cjs'),
    path.join(__dirname, '..', '..', 'lib', 'step-1-7-routing.cjs'),
  ];
  for (const p of tryPaths) {
    try {
      const mod = require(p);
      if (mod && mod.BRANCH_VALUES) {
        // ARCH-RR2-2 — DRIFT GUARD (implements the v7.14.0 B2 placeholder TODO):
        // the lib loaded, so it is the source of truth AND we can prove the
        // embedded fallback is still in sync. If the lib gains/removes a branch
        // (e.g. a 5th branch) and this hook's embedded copy is NOT updated in
        // lockstep, a future lib-import failure would fall back to a STALE set,
        // silently misclassifying the new branch as a bypass (false-bypass).
        // Catch that at load time with a loud stderr breadcrumb. We still TRUST
        // the lib set (never the stale embedded copy) on the happy path.
        if (mod.BRANCH_VALUES.size !== BRAINSTORM_FALLBACK_BRANCHES.length) {
          process.stderr.write(
            `[BRAINSTORM_WARN] dispatch-guard: BRANCH_VALUES drift — lib has ${mod.BRANCH_VALUES.size} branches but ` +
            `the embedded fallback has ${BRAINSTORM_FALLBACK_BRANCHES.length}. Update BRAINSTORM_FALLBACK_BRANCHES in dispatch-guard.cjs in lockstep with lib/step-1-7-routing.cjs.\n`,
          );
        }
        _BRANCH_VALUES = mod.BRANCH_VALUES;
        return _BRANCH_VALUES;
      }
    } catch { /* try next path / fall through to embedded copy */ }
  }
  // Lib unreadable on both paths — use the embedded fallback (fail-soft).
  // ARCH-RR2-2 — KEEP IN SYNC with lib/step-1-7-routing.cjs BRANCH_VALUES: the
  // drift guard above proves sync ONLY when the lib loads; if you add a branch to
  // the lib, add it to BRAINSTORM_FALLBACK_BRANCHES too or this path goes stale.
  _BRANCH_VALUES = new Set(BRAINSTORM_FALLBACK_BRANCHES);
  return _BRANCH_VALUES;
}

let _brainstormRosterCache = null;
function loadBrainstormRoster() {
  if (_brainstormRosterCache) return _brainstormRosterCache;
  const repoRoot = process.env.PIPELINE_REPO_ROOT || process.cwd();
  const candidates = [
    path.join(repoRoot, 'references', 'step-1-7-enforcement.json'),
    path.join(__dirname, '..', '..', 'references', 'step-1-7-enforcement.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        // SEC-B2-001 (cache-poisoning): require targets.length > 0. A registry
        // with an empty targets:[] array parses as "valid" and would cache a
        // PERMANENT empty roster — every spawn then misses, the embedded
        // fail-closed fallback is NEVER consulted, and enforcement is 100% OFF
        // for the whole session with zero events. Treat empty/missing targets as
        // a LOAD FAILURE so it falls through to the embedded fallback below.
        // (test-pinned: F33 cache-poisoning regression.)
        if (j && Array.isArray(j.targets) && j.targets.length > 0) {
          // SEC-RR2-2 (skill DoS): filter skill_prefixes to safe entries —
          // length 1..32 only. An empty-string prefix matches EVERY skill via
          // startsWith() and would deny every variant skill in deny mode
          // (complete Skill-path DoS); an absurdly long one is junk. If the
          // filtered list is empty (e.g. registry shipped skill_prefixes:[''] or
          // []), fall through to the embedded set so detection stays fail-closed
          // (mirrors the SEC-B2-001 empty-targets guard).
          const rawPrefixes = Array.isArray(j.skill_prefixes) ? j.skill_prefixes : [];
          const safePrefixes = rawPrefixes.filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 32);
          _brainstormRosterCache = {
            fqns: new Set(j.targets.map((t) => t.fqn).filter(Boolean)),
            leaves: new Set(j.targets.map((t) => t.leaf).filter(Boolean)),
            skillPrefixes: safePrefixes.length > 0 ? safePrefixes : BRAINSTORM_FALLBACK.skillPrefixes.slice(),
          };
          return _brainstormRosterCache;
        }
      }
    } catch { /* try next candidate */ }
  }
  // Registry missing/unreadable → embedded fallback (fail-closed detection).
  process.stderr.write('[BRAINSTORM_WARN] dispatch-guard: step-1-7-enforcement.json not found/unreadable — using embedded fallback target list\n');
  _brainstormRosterCache = {
    fqns: new Set(BRAINSTORM_FALLBACK.fqns),
    leaves: new Set(BRAINSTORM_FALLBACK.leaves),
    skillPrefixes: BRAINSTORM_FALLBACK.skillPrefixes.slice(),
  };
  return _brainstormRosterCache;
}

// Is this spawn (Agent subagent_type or Skill name) a brainstorm-enforcement
// target? Agent targets match by exact FQN OR by leaf within the
// pipeline-orchestrator namespace; Skill targets match a Phase 2 variant prefix.
function isBrainstormTarget(target, kind) {
  if (!target) return false;
  const roster = loadBrainstormRoster();
  if (kind === 'Skill') {
    // SEC-B2-003: namespace guard mirroring the Agent path. A pipeline-orchestrator
    // Phase 2 variant is dispatched EITHER as a namespaced FQN
    // ("pipeline-orchestrator:feature-light") OR as a bare leaf ("feature-light")
    // resolved within our plugin. A THIRD-PARTY plugin skill that merely shares a
    // variant prefix ("some-plugin:feature-x") must NOT be enforced — otherwise it
    // false-denies and floods BRAINSTORM_BYPASS events. So: a colon-bearing name is
    // a target ONLY when it lives in the pipeline-orchestrator namespace; a bare
    // (colon-free) leaf is assumed ours (same assumption as the Agent leaf path).
    if (target.includes(':') && !target.startsWith('pipeline-orchestrator:')) return false;
    const name = target.includes(':') ? target.split(':').pop() : target;
    return roster.skillPrefixes.some((pre) => name.startsWith(pre));
  }
  const leaf = target.split(':').pop();
  return roster.fqns.has(target)
    || (roster.leaves.has(leaf) && target.startsWith('pipeline-orchestrator:'));
}

// Returns true when the hook has emitted a deny decision (caller must exit).
// `target` is the subagent_type (Agent) or skill name (Skill); `kind` selects
// the matching strategy.
function handleBrainstormDispatch(target, kind) {
  const enforce = String(process.env.PIPELINE_BRAINSTORM_ENFORCEMENT || 'warn').toLowerCase();
  const docPath = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (!docPath) return false; // no run context → out of scope
  if (!isBrainstormTarget(target, kind)) return false; // not an enforcement target

  // Read sentinel-state.json. Unreadable/corrupt → fail-OPEN in warn (never
  // crash the session) / fail-CLOSED in deny (v7.13.0 lesson).
  let state;
  try {
    state = JSON.parse(fs.readFileSync(path.join(docPath, 'sentinel-state.json'), 'utf8'));
  } catch {
    if (enforce === 'deny') {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            '[BRAINSTORM] sentinel-state.json is unreadable/corrupt and ' +
            'PIPELINE_BRAINSTORM_ENFORCEMENT=deny — cannot confirm STEP 1.7 brainstorm ran. ' +
            'Restore a valid pipeline run state (or set enforcement to warn) before dispatching execution.',
        },
      }));
      return true; // fail-closed deny
    }
    return false; // fail-open allow (warn / default)
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;

  const od = (state.orchestrator_decision && typeof state.orchestrator_decision === 'object')
    ? state.orchestrator_decision : {};
  const complexity = String(od.complexity || '').trim().toUpperCase();
  // SEC-B2-002: normalize type the SAME way complexity is (trim + case-fold)
  // before the equality check. Without this, 'spec' / 'SPEC' / 'Spec ' (trailing
  // space) all slip past a bare `type === 'Spec'` and exempt a Spec task from
  // enforcement. Compare case-folded against the canonical 'SPEC'.
  const type = String(od.type || '').trim();
  const inScope = complexity === 'MEDIA' || complexity === 'COMPLEXA' || type.toUpperCase() === 'SPEC';
  if (!inScope) return false; // SIMPLES / out-of-scope tasks are exempt

  // SEC-1: verify the state's HMAC signature before TRUSTING its step_1_7 block.
  // Without this, a forged sentinel with an in-vocabulary branch satisfies all
  // enforcement layers silently. Mirror sentinel-hook.cjs's two-tier consumption:
  //   - UNSIGNED state -> tolerated in warn-first (migration period); the block is
  //     still trusted. verifyState() returns valid:true for unsigned in non-strict.
  //   - TAMPERED state (signature present but mismatched/malformed) -> NEVER trust:
  //     emit a BRAINSTORM_STATE_UNSIGNED AUDIT breadcrumb and treat the step_1_7
  //     block as ABSENT (bypass-suspect -> the warn/deny path below fires).
  //   - STRICT mode (PIPELINE_HMAC_STRICT=true): unsigned OR tampered fails closed.
  // This keeps F33's unsigned fixtures passing: their valid step_1_7 blocks are
  // trusted in warn mode (S3 zero-bypass), while S2/S6/S8c deny via the bypass
  // logic itself (in-scope, no step_1_7 / corrupt), not via a signature deny.
  let stateTrusted = true;
  if (stateSigner && typeof stateSigner.verifyState === 'function') {
    const hmacStrict = process.env.PIPELINE_HMAC_STRICT === 'true';
    let verification;
    try {
      verification = stateSigner.verifyState(state, {
        key: stateSigner.readHmacKey(),
        strict: hmacStrict,
      });
    } catch {
      verification = { valid: false, reason: 'verification threw' };
    }
    if (!verification.valid) {
      // Signature invalid/missing-under-strict. Audit breadcrumb (warn mode) +
      // treat the block as absent so the bypass path drives the decision.
      appendProtocolEvent(docPath, {
        event: 'BRAINSTORM_STATE_UNSIGNED', agent: 'dispatch-guard', phase: 'pre-dispatch',
        detail: sanitizeForReason(`step_1_7 trust withheld: ${verification.reason}`, 200),
        decided_by: 'dispatch-guard',
      });
      if (hmacStrict && enforce === 'deny') {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              '[BRAINSTORM] sentinel-state.json failed HMAC verification ' +
              `(${sanitizeForReason(verification.reason, 80)}) and PIPELINE_HMAC_STRICT + ` +
              'enforcement=deny refuse to trust an unsigned/tampered state. Re-sign the state ' +
              '(lib/sentinel-state-signer.cjs writeSignedState) or relax strict mode.',
          },
        }));
        return true; // fail-closed deny
      }
      stateTrusted = false; // warn-first: block treated as absent below
    }
  }

  // STEP 1.7 satisfied iff a step_1_7 block exists AND its decision is a valid
  // RAW BRANCH value (cross-batch contract: branch, NOT canonical decision).
  // SEC-1: when the state is NOT trusted (tampered signature in warn mode), the
  // block is forced to null so a forged in-vocabulary branch can't grant a pass.
  const block = (stateTrusted && state.step_1_7 && typeof state.step_1_7 === 'object' && !Array.isArray(state.step_1_7))
    ? state.step_1_7 : null;
  const branchValues = brainstormBranchValues();
  const decided = !!block && typeof block.decision === 'string' && branchValues.has(block.decision);
  if (decided) return false; // happy path — brainstorm decision recorded

  // Bypass: in-scope task spawning an execution target with no valid STEP 1.7
  // routing recorded. Emit the AUDIT event (reuse of the shared appender).
  // SEC-B2-005: cap the leaf before it reaches the audit write / deny payload so
  // a pathological subagent_type cannot bloat protocol-events / the LLM context.
  // SEC-RR2-3: align the cap to 80 — the SAME bound the marker-file slug enforces
  // (brainstormMarkerFile slice(0,80)). With a 128 cap here, two leaves differing
  // only after char 80 collapsed to ONE marker file (dedup marker collision), so
  // the second leaf's bypass event would be silently suppressed. 80 == 80 removes
  // the asymmetry. Also strip to printable ASCII (SEC-RR2-1) so a control char /
  // newline cannot break the JSONL audit line or inject into the deny reason.
  const leaf = sanitizeForReason(kind === 'Skill' ? target : target.split(':').pop(), 80);
  // SEC-RR2-1: type/complexity come from sentinel-state, which an attacker who
  // controls the run dir could craft. Slice+printable-ASCII-filter EACH before it
  // reaches the audit detail OR the deny reason, so injected newlines/control
  // chars / prose cannot break the JSONL line or smuggle instructions into the
  // harness decision context. (complexity is already UPPERCASEd; both are short.)
  const typeSafe = sanitizeForReason(type, 32) || '(no type)';
  const complexitySafe = sanitizeForReason(complexity, 32) || '(no complexity)';
  // SEC-B2-004: emit the BRAINSTORM_BYPASS event at most ONCE per leaf per run.
  // A retry loop on the same in-scope task would otherwise flood the log.
  if (!brainstormBypassAlreadyEmitted(docPath, leaf)) {
    markBrainstormBypassEmitted(docPath, leaf);
    // SEC-B2-005: cap the detail at ~200 chars (the logEnforcementDecision pattern).
    const detail = `${leaf} dispatched for ${typeSafe}/${complexitySafe} without a recorded STEP 1.7 routing decision`.slice(0, 200);
    appendProtocolEvent(docPath, {
      event: 'BRAINSTORM_BYPASS', agent: leaf, phase: 'pre-dispatch',
      detail,
      decided_by: 'dispatch-guard',
    });
  }
  if (enforce === 'deny') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[BRAINSTORM] ${leaf} was dispatched for a ${complexitySafe || typeSafe} task but STEP 1.7 ` +
          `(mandatory brainstorm) has no recorded routing decision in sentinel-state.step_1_7. ` +
          `Run STEP 1.7 first (dispatch the brainstorm, load an existing prep, or record a legal ` +
          `--no-prep / simples-bypass branch) before dispatching execution.`,
      },
    }));
    return true; // deny
  }
  // warn-first (default): nudge via stderr, do not block.
  process.stderr.write(`[BRAINSTORM_WARN] dispatch-guard: ${leaf} dispatched without a recorded STEP 1.7 routing decision (set PIPELINE_BRAINSTORM_ENFORCEMENT=deny to block)\n`);
  return false;
}

function handleInput(raw) {
  // 1. Parse stdin. Empty or unparseable → fail-open (do not block user workflows).
  let input;
  try {
    if (!raw || !raw.trim()) return process.exit(0);
    input = JSON.parse(raw.trim());
  } catch {
    return process.exit(0);
  }

  // 1.5. v4.8.0 Agent enforcement: validate agent_type per step
  // Agent calls flow through this branch when matcher includes "Agent" in hooks.json.
  if (input && input.tool_name === 'Agent') {
    const toolInput = input.tool_input || {};
    // v7.11.0 AUDIT-001: deterministic Plan Mode bypass detection runs first.
    if (handlePlanModeDispatch(toolInput)) return process.exit(0);
    // v7.14.0 B2: deterministic STEP 1.7 brainstorm bypass detection.
    // SEC-B2-005: mirror the Skill path's 128-char cap on subagent_type before
    // it reaches the audit write / deny payload (Agent leaves are well under 64).
    const subagent = (typeof toolInput.subagent_type === 'string') ? toolInput.subagent_type : '';
    if (subagent.length <= 128 && handleBrainstormDispatch(subagent, 'Agent')) return process.exit(0);
    if (handleAgentEnforcement(toolInput)) return process.exit(0);
    return process.exit(0); // Agent calls are otherwise out of scope for the legacy Skill→FQN map
  }

  // 2. We only evaluate Skill tool calls. Any other tool → not our concern.
  if (!input || input.tool_name !== 'Skill') {
    return process.exit(0);
  }

  // 3. Extract the skill name. Guard against type confusion.
  const toolInput = input.tool_input || {};
  const rawSkill = toolInput.skill;
  const skillName = typeof rawSkill === 'string' ? rawSkill : '';

  // 3.5. v7.14.0 B2: STEP 1.7 brainstorm bypass detection for Phase 2 skill
  // variants (feature-*, bugfix-*, ... dispatched via Skill). Runs before the
  // leaf→FQN collision check so a deny short-circuits cleanly.
  if (skillName && skillName.length <= 128 && handleBrainstormDispatch(skillName, 'Skill')) {
    return process.exit(0);
  }

  // 4. Length cap (SEC-001, v3.6 round 2): a pathologically long value would bloat
  // the LLM context if echoed into the deny payload. Agent leaf names are well
  // under 64 chars; cap at 128 with margin.
  if (skillName.length > 128) {
    return process.exit(0);
  }

  // 5. Only leaf names (no colon) can collide with our agent namespace.
  // A plugin-namespaced skill like "skill-advisor:advisor" is a legitimate skill.
  if (!skillName || skillName.includes(':')) {
    return process.exit(0);
  }

  // 5. Lookup in the known-agent-leaves table.
  const fqn = AGENT_LEAF_TO_FQN[skillName];
  if (!fqn) {
    return process.exit(0); // not one of ours, silent allow
  }

  // 6. Hit — deny with corrective guidance.
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: buildDenyReason(skillName, fqn)
    }
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => handleInput(input));
