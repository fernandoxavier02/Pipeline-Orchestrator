#!/usr/bin/env node
// =============================================================================
// F20 — PLAN_MODE_REQUEST emission in mandatory agents (v7.10.0)
// =============================================================================
// Verifies that each agent in PLAN_MODE_MANDATORY_AGENTS has:
//   1. A Step 0 requesting Plan Mode (MANDATORY) BEFORE any research
//   2. A PLAN_MODE_REQUEST v1 template in the Step 0 body
//   3. A STATUS: AWAITING_PLAN_MODE_RESULTS line
//   4. Subsequent steps referencing PLAN_MODE_RESULTS payload
//   5. Full Achado #7 RUNTIME PROTOCOL section with PLAN_MODE_REQUEST template
// =============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const results = [];

function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, reason: e.message }); }
}

// AUDIT-002 (v7.11.0): the roster is loaded from the machine-readable SSOT
// (references/plan-mode-mandatory-agents.json), NOT hardcoded here. F20 thereby
// pins the SAME source the dispatch-guard hook reads at runtime — if the roster
// drifts from the per-agent contracts, this test fails. AUDIT-015a: plan-architect
// is included (the roster has all 10 agents).
const LEAF_TO_FILE = {
  'plan-architect': 'agents/quality/plan-architect.md',
  'bugfix-diagnostic-agent': 'agents/executor/type-specific/bugfix-diagnostic-agent.md',
  'bugfix-root-cause-analyzer': 'agents/executor/type-specific/bugfix-root-cause-analyzer.md',
  'audit-intake': 'agents/executor/type-specific/audit-intake.md',
  'audit-domain-analyzer': 'agents/executor/type-specific/audit-domain-analyzer.md',
  'design-interrogator': 'agents/quality/design-interrogator.md',
  'feature-vertical-slice-planner': 'agents/executor/type-specific/feature-vertical-slice-planner.md',
  'step-01-explore': 'agents/brainstorm/step-01-explore.md',
  'executor-implementer-task': 'agents/executor/executor-implementer-task.md',
  'feature-implementer': 'agents/executor/type-specific/feature-implementer.md',
};

const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'references', 'plan-mode-mandatory-agents.json'), 'utf8'));
const MANDATORY_AGENTS = roster.agents.map((a) => {
  const file = LEAF_TO_FILE[a.leaf];
  if (!file) throw new Error(`F20: roster agent '${a.leaf}' has no known agent file mapping — update LEAF_TO_FILE`);
  return { id: a.leaf, file };
});

// Pin the roster size so a silent drop from the JSON is caught.
test('F20-roster: machine-readable roster lists exactly 10 mandatory agents', () => {
  assert.strictEqual(MANDATORY_AGENTS.length, 10,
    `expected 10 PLAN_MODE_MANDATORY agents in references/plan-mode-mandatory-agents.json, got ${MANDATORY_AGENTS.length}`);
});

for (const agent of MANDATORY_AGENTS) {
  const content = fs.readFileSync(path.join(ROOT, agent.file), 'utf8');

  test(`F20-${agent.id}: has Step 0 / Phase 0 with Plan Mode MANDATORY`, () => {
    assert.ok(
      /(?:Step|Phase) 0.*(?:Plan Mode|PLAN_MODE).*MANDATORY/i.test(content),
      `${agent.id} missing Step 0 / Phase 0 Plan Mode MANDATORY header`
    );
  });

  test(`F20-${agent.id}: Step 0 has PLAN_MODE_REQUEST v1 template`, () => {
    assert.ok(
      content.includes('PLAN_MODE_REQUEST v1'),
      `${agent.id} missing PLAN_MODE_REQUEST v1 in Step 0`
    );
  });

  test(`F20-${agent.id}: has AWAITING_PLAN_MODE_RESULTS status`, () => {
    assert.ok(
      content.includes('AWAITING_PLAN_MODE_RESULTS'),
      `${agent.id} missing STATUS: AWAITING_PLAN_MODE_RESULTS`
    );
  });

  test(`F20-${agent.id}: references PLAN_MODE_RESULTS payload`, () => {
    assert.ok(
      content.includes('PLAN_MODE_RESULTS'),
      `${agent.id} missing PLAN_MODE_RESULTS reference`
    );
  });

  test(`F20-${agent.id}: has Achado #7 RUNTIME PROTOCOL section`, () => {
    assert.ok(
      /ACHADO #7 RUNTIME PROTOCOL/i.test(content),
      `${agent.id} missing ACHADO #7 RUNTIME PROTOCOL section`
    );
  });
}

// summary
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`=== F20 PLAN_MODE_REQUEST mandatory agents ===`);
for (const r of results) {
  const tag = r.ok ? '[PASS]' : '[FAIL]';
  console.log(`  ${tag} ${r.name}${r.ok ? '' : ': ' + r.reason}`);
}
console.log(`    Summary: ${pass} pass / ${fail} fail / ${results.length} total`);
process.exit(fail > 0 ? 1 : 0);
