#!/usr/bin/env node
/**
 * tests/contracts/gate-request-protocol.test.cjs
 *
 * Regression test for Achado #7 fix — the GATE_REQUEST / DISPATCH_REQUEST /
 * PLAN_MODE_REQUEST protocol that hoists user interaction and nested Agent
 * dispatches to the parent context (main LLM), since these tools are
 * stripped from subagent runtime by the Claude Code harness.
 *
 * The protocol surfaces audited:
 *   1. references/gate-request-protocol.md   — protocol SSOT (must exist + cite all 3 block types)
 *   2. agents/core/brainstorm-controller.md   — must reference protocol + remove silent fallback
 *   3. agents/core/pipeline-controller.md     — must reference protocol for AskUserQuestion + Agent + EnterPlanMode
 *   4. agents/executor/executor-controller.md — must reference protocol for nested Agent dispatches
 *   5. commands/brainstorm.md                 — must instruct parent how to handle GATE_REQUEST
 *   6. commands/pipeline.md                   — must instruct parent how to handle all 3 block types
 *
 * Migration claim: see tail of references/gate-request-protocol.md "Migration status".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

test('Surface 1: gate-request-protocol.md exists and defines all 3 block types', () => {
  const text = read('references/gate-request-protocol.md');
  assert.match(text, /=== GATE_REQUEST v1 ===/, 'must define GATE_REQUEST schema');
  assert.match(text, /=== DISPATCH_REQUEST v1 ===/, 'must define DISPATCH_REQUEST schema');
  assert.match(text, /=== PLAN_MODE_REQUEST v1 ===/, 'must define PLAN_MODE_REQUEST schema');
  assert.match(text, /AWAITING_GATE_RESPONSES/, 'must document the AWAITING termination contract');
  assert.match(text, /AWAITING_DISPATCH_RESULTS/, 'must document AWAITING_DISPATCH_RESULTS');
  assert.match(text, /Migration status/, 'must include the migration status table');
});

test('Surface 2: brainstorm-controller adopts GATE_REQUEST + removes silent fallback', () => {
  const text = read('agents/core/brainstorm-controller.md');
  assert.match(text, /GATE_REQUEST protocol/i, 'must reference the protocol by name');
  assert.match(text, /references\/gate-request-protocol\.md/, 'must cite the protocol SSOT');
  assert.match(text, /AskUserQuestion.*stripped|stripped.*AskUserQuestion/i,
    'must explicitly state AskUserQuestion is stripped from subagent runtime');
  // The legacy silent fallback must be removed:
  assert.doesNotMatch(text, /AskUserQuestion unavailable in runtime: fall back to numbered prose options/,
    'silent fallback must be removed — replaced by GATE_REQUEST protocol');
  assert.match(text, /silent fallback is a contract violation|silent fallback is REMOVED/i,
    'must explicitly disclaim the old silent-fallback behavior');
});

test('Surface 3: pipeline-controller adopts protocol for all three tool denials', () => {
  const text = read('agents/core/pipeline-controller.md');
  assert.match(text, /GATE_REQUEST.*DISPATCH_REQUEST.*protocol|GATE_REQUEST \+ DISPATCH_REQUEST/,
    'must reference both block types');
  assert.match(text, /references\/gate-request-protocol\.md/, 'must cite the protocol SSOT');
  assert.match(text, /AskUserQuestion.*Agent.*EnterPlanMode|stripped/i,
    'must mention all three stripped tools');
  assert.match(text, /STATUS: AWAITING_GATE_RESPONSES|AWAITING_DISPATCH_RESULTS/,
    'must document the AWAITING termination contract');
});

test('Surface 4: executor-controller adopts DISPATCH_REQUEST for nested Agent calls', () => {
  const text = read('agents/executor/executor-controller.md');
  assert.match(text, /Achado #7|DISPATCH_REQUEST/, 'must reference Achado #7 / DISPATCH_REQUEST');
  assert.match(text, /Agent.*stripped|stripped.*subagent runtime/i,
    'must explain why nested Agent calls fail');
  assert.match(text, /references\/gate-request-protocol\.md/, 'must cite the protocol SSOT');
});

test('Surface 5: commands/brainstorm.md instructs parent on GATE_REQUEST handling', () => {
  const text = read('commands/brainstorm.md');
  assert.match(text, /GATE_REQUEST/, 'must mention GATE_REQUEST');
  assert.match(text, /AskUserQuestion/, 'must reference parent-side AskUserQuestion invocation');
  assert.match(text, /re-dispatch/i, 'must instruct re-dispatch with GATE_RESPONSES');
  assert.match(text, /references\/gate-request-protocol\.md/, 'must cite the protocol SSOT');
});

test('Surface 6: commands/pipeline.md instructs parent on all three block types', () => {
  const text = read('commands/pipeline.md');
  assert.match(text, /ACHADO #7 RUNTIME CONTEXT|Achado #7/, 'must include the Achado #7 runtime context section');
  assert.match(text, /GATE_REQUEST/, 'must mention GATE_REQUEST');
  assert.match(text, /DISPATCH_REQUEST/, 'must mention DISPATCH_REQUEST');
  assert.match(text, /PLAN_MODE_REQUEST/, 'must mention PLAN_MODE_REQUEST');
  assert.match(text, /Never silently default/i, 'must explicitly forbid silent defaulting');
});

test('Cross-cutting: the protocol does NOT introduce new gates in the 22-gate registry', () => {
  const protocol = read('references/gate-request-protocol.md');
  assert.match(protocol, /22-gate registry.*unchanged|registry is unchanged|protocol bookkeeping reuses/i,
    'protocol must explicitly state it does NOT add to the gate registry');
});

test('Cross-cutting: every adoption surface cites the SSOT path identically', () => {
  const surfaces = [
    'agents/core/brainstorm-controller.md',
    'agents/core/pipeline-controller.md',
    'agents/executor/executor-controller.md',
    'commands/brainstorm.md',
    'commands/pipeline.md',
  ];
  for (const s of surfaces) {
    const text = read(s);
    assert.match(text, /references\/gate-request-protocol\.md/,
      `${s} must reference the protocol SSOT path`);
  }
});

test('Migration status table covers the three adopted agents', () => {
  const text = read('references/gate-request-protocol.md');
  assert.match(text, /brainstorm-controller.*YES/, 'migration table must mark brainstorm-controller as adopted');
  assert.match(text, /pipeline-controller.*YES/, 'migration table must mark pipeline-controller as adopted');
  assert.match(text, /executor-controller.*YES/, 'migration table must mark executor-controller as adopted');
});

// ----- A.1 fix: schema collision avoidance -----

test('A.1: protocol uses separate protocol-events.jsonl, NOT gate-decisions.jsonl', () => {
  const protocol = read('references/gate-request-protocol.md');
  assert.match(protocol, /protocol-events\.jsonl/, 'must use a separate file name');
  assert.match(protocol, /NOT.*gate-decisions\.jsonl|separate.*from.*gate-decisions/i,
    'must explicitly distinguish from gate-decisions.jsonl');
  assert.match(protocol, /final-validator does NOT parse|final-validator does not parse/,
    'must explain final-validator does not parse the protocol log');
});

test('A.1: protocol JSONL schema uses event field, not gate field', () => {
  const protocol = read('references/gate-request-protocol.md');
  // The example JSON should show "event": not "gate":
  assert.match(protocol, /"event":\s*"GATE_REQUEST"/, 'GATE_REQUEST entry must use event field');
  assert.match(protocol, /"event":\s*"DISPATCH_REQUEST"/, 'DISPATCH_REQUEST entry must use event field');
  // Must NOT have "gate":"GATE_REQUEST" anywhere (that was the broken old design):
  assert.doesNotMatch(protocol, /"gate":\s*"GATE_REQUEST"/,
    'GATE_REQUEST must NOT appear as a gate name (would collide with 22-gate registry)');
});

test('A.1: protocol explains dual-write back to gate-decisions.jsonl when gate is named', () => {
  const protocol = read('references/gate-request-protocol.md');
  assert.match(protocol, /dual-write|ALSO writes the canonical gate-decisions/i,
    'must document the dual-write pattern for cross-traceability');
  assert.match(protocol, /decided_by:\s*user/, 'dual-write entry uses decided_by: user (in enum)');
});

test('A.1: commands/pipeline.md instructs parent to use protocol-events.jsonl', () => {
  const cmd = read('commands/pipeline.md');
  assert.match(cmd, /protocol-events\.jsonl/, 'parent handler instructions must reference protocol-events.jsonl');
  assert.match(cmd, /NOT.*gate-decisions\.jsonl|dual-write/i,
    'parent handler must distinguish from gate-decisions.jsonl');
});

// ----- A.2 fix: no contradictory AskUserQuestion examples in agent body -----

test('A.2: pipeline-controller body has zero JS-style AskUserQuestion( examples', () => {
  const text = read('agents/core/pipeline-controller.md');
  // The protocol section at the top references "Invoke AskUserQuestion" as a SOURCE phrase
  // ("where this spec says ..."). That's prose, fine. What we forbid is the JS-style
  // invocation `AskUserQuestion(` appearing as code-block content.
  const jsStyleMatches = text.match(/^AskUserQuestion\(/gm) || [];
  assert.strictEqual(jsStyleMatches.length, 0,
    `pipeline-controller body must NOT contain AskUserQuestion( JS-style examples (found ${jsStyleMatches.length})`);
});

test('A.2: pipeline-controller body has GATE_REQUEST examples for each gate point', () => {
  const text = read('agents/core/pipeline-controller.md');
  // Each Phase 1 / Phase 2 / Phase 3 user-decision gate should have a GATE_REQUEST example.
  const examples = text.match(/=== GATE_REQUEST v1 ===/g) || [];
  assert.ok(examples.length >= 3,
    `pipeline-controller body must contain GATE_REQUEST examples for the 3 gate points (Phase 1 proposal, Phase 2 adversarial, Phase 3 final adversarial); found ${examples.length}`);
});

test('A.2: each GATE_REQUEST example has a unique gate_id', () => {
  const text = read('agents/core/pipeline-controller.md');
  const ids = [...text.matchAll(/gate_id:\s*([\w-]+)/g)].map(m => m[1]);
  const unique = new Set(ids);
  assert.strictEqual(ids.length, unique.size,
    `every gate_id in pipeline-controller GATE_REQUEST examples must be unique; got ${ids.join(', ')}`);
  assert.ok(ids.length >= 3, `expected at least 3 gate_id occurrences, got ${ids.length}`);
});

test('A.2: legacy AskUserQuestion examples are explicitly marked as REMOVED', () => {
  const text = read('agents/core/pipeline-controller.md');
  // Each replaced site should now contain "REMOVED" near the GATE_REQUEST example
  // so a maintainer reading the file knows the old form is intentionally gone.
  const removedMentions = (text.match(/AskUserQuestion.*REMOVED|legacy.*REMOVED|REMOVED.*emit ONLY/g) || []).length;
  assert.ok(removedMentions >= 3,
    `each replaced gate site must explicitly mark the legacy form as REMOVED; found ${removedMentions} mentions`);
});

// ----- Round 2 fixes (A.5, A.8, A.9, A.11, A.12) -----

test('A.8: protocol documents gate_id → canonical gate mapping table', () => {
  const text = read('references/gate-request-protocol.md');
  assert.match(text, /gate_id.*canonical gate mapping|canonical.*gate.*mapping/i,
    'must include a mapping table for gate_id → canonical gate');
  // Specific entries the parent needs:
  assert.match(text, /phase-2-adversarial-batch.*ADVERSARIAL_GATE/,
    'must map adversarial batch gate_id to ADVERSARIAL_GATE');
  assert.match(text, /phase-3-final-adversarial.*FINAL_ADVERSARIAL_GATE/,
    'must map final adversarial gate_id to FINAL_ADVERSARIAL_GATE');
  assert.match(text, /phase-3-closeout.*CLOSEOUT_CONFIRM/,
    'must map closeout gate_id to CLOSEOUT_CONFIRM');
});

test('A.5: protocol discloses lock cleanup limitation + workaround', () => {
  const text = read('references/gate-request-protocol.md');
  assert.match(text, /Lock cleanup limitation/i, 'must include the lock cleanup section');
  assert.match(text, /AWAITING_.*remains held|orphan lock|stale-lock/i,
    'must explain how AWAITING leaves locks held');
  assert.match(text, /v5\.2|deferred|Estimated/i,
    'must point to the deferred permanent fix');
});

test('A.9: pipeline-controller has reminder for DISPATCH_REQUEST + concrete Phase 0a example', () => {
  const text = read('agents/core/pipeline-controller.md');
  // The Achado #9 reminder block should appear at the top of "## STEP 4: EXECUTE PHASES"
  assert.match(text, /Achado #9 reminder|Spawn.*MUST be implemented as.*DISPATCH_REQUEST/,
    'STEP 4 must include the A.9 reminder block');
  // Concrete example with phase-0a-task-orchestrator dispatch_id:
  assert.match(text, /dispatch_id:\s*phase-0a-task-orchestrator/,
    'must include a concrete DISPATCH_REQUEST example for Phase 0a task-orchestrator');
});

test('A.11: brainstorm-controller has concrete GATE_REQUEST example for explore Q1', () => {
  const text = read('agents/core/brainstorm-controller.md');
  assert.match(text, /gate_id:\s*brainstorm-explore-q1/,
    'must include a concrete GATE_REQUEST example for the first explore question');
  assert.match(text, /=== GATE_REQUEST v1 ===[\s\S]+?=== END GATE_REQUEST ===/,
    'must include a complete GATE_REQUEST block (start + end markers)');
});

test('A.12: executor-controller has concrete DISPATCH_REQUEST example for implementer', () => {
  const text = read('agents/executor/executor-controller.md');
  assert.match(text, /dispatch_id:\s*batch-<N>-task-<M>-implementer/,
    'must include a concrete DISPATCH_REQUEST example for executor-implementer-task');
  assert.match(text, /target_name:\s*pipeline-orchestrator:executor:executor-implementer-task/,
    'must include the canonical fully-qualified subagent_type');
  assert.match(text, /=== DISPATCH_REQUEST v1 ===[\s\S]+?=== END DISPATCH_REQUEST ===/,
    'must include a complete DISPATCH_REQUEST block (start + end markers)');
});

// ----- v5.2.0-rc.2 fixes (5 SKILLs + brainstorm step agents + 9 pipeline-controller dispatch sites) -----

test('v5.2.0-rc.2 / Batch 1: all 5 public SKILLs have GATE_REQUEST handler', () => {
  const skills = [
    'skills/audit/SKILL.md',
    'skills/bugfix/SKILL.md',
    'skills/feature/SKILL.md',
    'skills/spec/SKILL.md',
    'skills/pipeline/SKILL.md',
  ];
  for (const s of skills) {
    const text = read(s);
    assert.match(text, /Achado #7 GATE_REQUEST handler/i,
      `${s} must include the Achado #7 GATE_REQUEST handler section`);
    assert.match(text, /references\/gate-request-protocol\.md/,
      `${s} must cite the protocol SSOT path`);
    assert.match(text, /AWAITING_GATE_RESPONSES.*AWAITING_DISPATCH_RESULTS|AWAITING_DISPATCH_RESULTS.*AWAITING_GATE_RESPONSES/s,
      `${s} must reference both AWAITING_GATE_RESPONSES and AWAITING_DISPATCH_RESULTS`);
    assert.match(text, /protocol-events\.jsonl/,
      `${s} must reference protocol-events.jsonl`);
    assert.match(text, /Never silently default/i,
      `${s} must explicitly forbid silent defaulting`);
  }
});

test('v5.2.0-rc.2 / Batch 2: brainstorm-controller has DISPATCH_REQUEST adoption for step agents', () => {
  const text = read('agents/core/brainstorm-controller.md');
  assert.match(text, /DISPATCH_REQUEST protocol.*REQUIRED|REQUIRED.*DISPATCH_REQUEST/,
    'must declare DISPATCH_REQUEST is required for step agents');
  assert.match(text, /step-00-intake.*Agent|Agent.*step-00-intake/i,
    'must reference step-00-intake explicitly');
  assert.match(text, /step-01-explore.*Agent|Agent.*step-01-explore/i,
    'must reference step-01-explore explicitly');
  assert.match(text, /dispatch_id:\s*brainstorm-step-00-intake/,
    'must include concrete DISPATCH_REQUEST example for step-00-intake');
});

test('v5.2.0-rc.2 / Batch 3: pipeline-controller covers all 9 dispatch sites + sentinel', () => {
  const text = read('agents/core/pipeline-controller.md');
  const expected = [
    'phase-0a-task-orchestrator',
    'phase-0b-information-gate',
    'phase-0c-design-interrogator',
    'phase-1-5-plan-architect',
    'phase-2c-executor-controller',
    'phase-2e-batch',
    'phase-3a-sanity-checker',
    'phase-3b-final-validator',
    'phase-3c-finishing-branch',
    'sentinel',
  ];
  for (const dispatchId of expected) {
    assert.match(text, new RegExp(`dispatch_id:\\s*${dispatchId}`),
      `pipeline-controller must include dispatch_id starting with "${dispatchId}"`);
  }
  // Total DISPATCH_REQUEST blocks should be at least 10 (one per site, possibly more for batched examples).
  const blocks = (text.match(/=== DISPATCH_REQUEST v1 ===/g) || []).length;
  assert.ok(blocks >= 10, `must include at least 10 DISPATCH_REQUEST examples (one per site); found ${blocks}`);
});

test('v5.2.0-rc.2: every DISPATCH_REQUEST example has a unique dispatch_id pattern', () => {
  const text = read('agents/core/pipeline-controller.md');
  const ids = [...text.matchAll(/dispatch_id:\s*([\w-<>]+)/g)].map(m => m[1]);
  const unique = new Set(ids);
  assert.strictEqual(ids.length, unique.size,
    `every dispatch_id must be unique; got ${ids.join(', ')}`);
});
