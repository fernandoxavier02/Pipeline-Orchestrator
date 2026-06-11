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
  'ux-simulator': 'pipeline-orchestrator:executor:type-specific:ux-simulator',
  'ux-accessibility-auditor': 'pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor',
  'ux-qa-validator': 'pipeline-orchestrator:executor:type-specific:ux-qa-validator',

  // brainstorm/ step agents (3 — step-01b-alternatives added v6.2.0 clarification overhaul)
  'step-00-intake': 'pipeline-orchestrator:brainstorm:brainstorm-step-00-intake',
  'step-01-explore': 'pipeline-orchestrator:brainstorm:brainstorm-step-01-explore',
  'step-01b-alternatives': 'pipeline-orchestrator:brainstorm:brainstorm-step-01b-alternatives',

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
  process.stderr.write('[PLAN_MODE_WARN] dispatch-guard: plan-mode-mandatory-agents.json not found/unreadable — Plan Mode bypass detection DISABLED\n');
  _rosterCache = { leaves: new Set(), fqns: new Set() };
  return _rosterCache;
}

function planModeAppendEvent(docPath, event) {
  try {
    const line = JSON.stringify({ ...event, ts: new Date().toISOString() }).replace(/[\r\n]+/g, ' ');
    fs.appendFileSync(path.join(docPath, 'protocol-events.jsonl'), line + '\n');
  } catch { /* never throw from audit */ }
}

// SEC-B4-004 (v7.11.0): per-agent pending FILES (plan-mode-pending-<leaf>.json)
// instead of a shared object — eliminates the read-modify-write race when
// parallel_eligible MEDIA batches dispatch two mandatory agents concurrently.
// Each entry is { run_id, ts } so it is SESSION-SCOPED (SEC-B4-001/005): a stale
// entry from a crashed prior run is ignored when its run_id != current run.
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
    planModeAppendEvent(docPath, {
      event: 'PLAN_MODE_DISPATCH_PENDING', agent: leaf, phase: 'pre-dispatch',
      detail: `${leaf} dispatched without PLAN_MODE_RESULTS — awaiting PLAN_MODE_REQUEST (first dispatch)`,
      decided_by: 'dispatch-guard',
    });
    return false; // allow
  }

  // Same agent re-dispatched, still no PLAN_MODE_RESULTS → bypass.
  planModeAppendEvent(docPath, {
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
