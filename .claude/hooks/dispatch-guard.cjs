#!/usr/bin/env node
'use strict';

/**
 * dispatch-guard.cjs — PreToolUse:Skill guard for pipeline-orchestrator.
 *
 * Purpose (v3.6.0):
 *   LLM controllers running `/pipeline` occasionally invoke `Skill(task-orchestrator)`
 *   instead of `Agent(subagent_type: "pipeline-orchestrator:core:task-orchestrator")`.
 *   The Skill call fails with "Unknown skill" and the pipeline stalls at Phase 0a
 *   with a confusing error.
 *
 * What this hook does:
 *   - Intercepts any Skill tool invocation whose skill name matches a known
 *     pipeline-orchestrator agent leaf name.
 *   - DENIES the call via stdout (hookSpecificOutput permissionDecision: deny).
 *   - Returns a corrective message that names the correct Agent tool invocation
 *     with the fully-qualified subagent_type, so the LLM can self-correct.
 *
 * Protocol:
 *   - Exit 0 with no stdout → allow (silent pass)
 *   - Exit 0 with hookSpecificOutput deny → deny this Skill call; reason fed to Claude
 *   - NEVER exits with non-zero — a misfire of this guard must not hard-block the user
 */

// ── Agent leaf → fully-qualified subagent_type map ──────────────────────────
//
// Source of truth: `agents/**/*.md` filenames. Update this table when agents
// are added/removed/moved. The hook's regression tests assume the invariants
// listed in references/glossary.md's "Agent Naming Convention".
const AGENT_LEAF_TO_FQN = Object.freeze({
  // core/ (9 agents)
  'pipeline-controller': 'pipeline-orchestrator:core:pipeline-controller',
  'task-orchestrator': 'pipeline-orchestrator:core:task-orchestrator',
  'information-gate': 'pipeline-orchestrator:core:information-gate',
  'sentinel': 'pipeline-orchestrator:core:sentinel',
  'checkpoint-validator': 'pipeline-orchestrator:core:checkpoint-validator',
  'sanity-checker': 'pipeline-orchestrator:core:sanity-checker',
  'adversarial-batch': 'pipeline-orchestrator:core:adversarial-batch',
  'final-validator': 'pipeline-orchestrator:core:final-validator',
  'finishing-branch': 'pipeline-orchestrator:core:finishing-branch',

  // executor/ top level (5 agents)
  'executor-controller': 'pipeline-orchestrator:executor:executor-controller',
  'executor-implementer-task': 'pipeline-orchestrator:executor:executor-implementer-task',
  'executor-fix': 'pipeline-orchestrator:executor:executor-fix',
  'executor-spec-reviewer': 'pipeline-orchestrator:executor:executor-spec-reviewer',
  'executor-quality-reviewer': 'pipeline-orchestrator:executor:executor-quality-reviewer',

  // executor/type-specific/ (17 agents)
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
  'ux-simulator': 'pipeline-orchestrator:executor:type-specific:ux-simulator',
  'ux-accessibility-auditor': 'pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor',
  'ux-qa-validator': 'pipeline-orchestrator:executor:type-specific:ux-qa-validator',

  // quality/ (7 agents)
  'review-orchestrator': 'pipeline-orchestrator:quality:review-orchestrator',
  'architecture-reviewer': 'pipeline-orchestrator:quality:architecture-reviewer',
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

function handleInput(raw) {
  // 1. Parse stdin. Empty or unparseable → fail-open (do not block user workflows).
  let input;
  try {
    if (!raw || !raw.trim()) return process.exit(0);
    input = JSON.parse(raw.trim());
  } catch {
    return process.exit(0);
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
