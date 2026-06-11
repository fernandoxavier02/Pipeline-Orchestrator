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

const MANDATORY_AGENTS = [
  // AUDIT-015a (v7.11.0): plan-architect added — the controller table has 10 agents
  // and F20 must cover all 10 uniformly (F18 covers plan-architect's extra contract
  // details separately; this entry pins the same 5 baseline properties as the rest).
  { id: 'plan-architect', file: 'agents/quality/plan-architect.md' },
  { id: 'bugfix-diagnostic-agent', file: 'agents/executor/type-specific/bugfix-diagnostic-agent.md' },
  { id: 'bugfix-root-cause-analyzer', file: 'agents/executor/type-specific/bugfix-root-cause-analyzer.md' },
  { id: 'audit-intake', file: 'agents/executor/type-specific/audit-intake.md' },
  { id: 'audit-domain-analyzer', file: 'agents/executor/type-specific/audit-domain-analyzer.md' },
  { id: 'design-interrogator', file: 'agents/quality/design-interrogator.md' },
  { id: 'feature-vertical-slice-planner', file: 'agents/executor/type-specific/feature-vertical-slice-planner.md' },
  { id: 'step-01-explore', file: 'agents/brainstorm/step-01-explore.md' },
  { id: 'executor-implementer-task', file: 'agents/executor/executor-implementer-task.md' },
  { id: 'feature-implementer', file: 'agents/executor/type-specific/feature-implementer.md' },
];

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
