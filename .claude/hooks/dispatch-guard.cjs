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
