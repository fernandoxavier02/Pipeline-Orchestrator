#!/usr/bin/env node
// =============================================================================
// F21 — PLAN_MODE_BYPASS enforcement in pipeline-controller (v7.10.0)
// =============================================================================
// Verifies that pipeline-controller.md:
//   1. Has PLAN_MODE_MANDATORY_AGENTS table with all 10 agents
//   2. References PLAN_MODE_BYPASS enforcement for the full table
//   3. Lists substantive output types for bypass detection
//   4. Mentions re-dispatch on first bypass
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

const controllerPath = path.join(ROOT, 'agents/core/pipeline-controller.md');
const content = fs.readFileSync(controllerPath, 'utf8');

test('F21-S1: controller has PLAN_MODE_MANDATORY_AGENTS table', () => {
  assert.ok(
    content.includes('PLAN_MODE_MANDATORY_AGENTS'),
    'missing PLAN_MODE_MANDATORY_AGENTS declaration'
  );
});

const EXPECTED_AGENTS = [
  'plan-architect',
  'bugfix-diagnostic-agent',
  'bugfix-root-cause-analyzer',
  'audit-intake',
  'audit-domain-analyzer',
  'design-interrogator',
  'feature-vertical-slice-planner',
  'step-01-explore',
  'executor-implementer-task',
  'feature-implementer',
];

for (const agentId of EXPECTED_AGENTS) {
  test(`F21-S2-${agentId}: listed in PLAN_MODE_MANDATORY_AGENTS`, () => {
    const tableRegion = content.slice(
      content.indexOf('PLAN_MODE_MANDATORY_AGENTS'),
      content.indexOf('PLAN_MODE_MANDATORY_AGENTS') + 2000
    );
    assert.ok(
      tableRegion.includes(agentId),
      `${agentId} not found in PLAN_MODE_MANDATORY_AGENTS table`
    );
  });
}

test('F21-S3: references PLAN_MODE_BYPASS enforcement', () => {
  assert.ok(
    content.includes('PLAN_MODE_BYPASS'),
    'missing PLAN_MODE_BYPASS enforcement reference'
  );
});

test('F21-S4: lists substantive output types for bypass detection', () => {
  const hasSomeOutputTypes =
    content.includes('IMPLEMENTATION_PLAN') &&
    content.includes('DIAGNOSTIC_REPORT') &&
    content.includes('ROOT_CAUSE_RESULT') &&
    content.includes('IMPLEMENTATION_RESULT');
  assert.ok(hasSomeOutputTypes, 'missing substantive output types in bypass detection (must include IMPLEMENTATION_RESULT for feature-implementer)');
});

test('F21-S5: mentions re-dispatch on first bypass', () => {
  assert.ok(
    /re-dispatch/i.test(content),
    'missing re-dispatch logic on first bypass'
  );
});

// summary
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`=== F21 PLAN_MODE_BYPASS enforcement ===`);
for (const r of results) {
  const tag = r.ok ? '[PASS]' : '[FAIL]';
  console.log(`  ${tag} ${r.name}${r.ok ? '' : ': ' + r.reason}`);
}
console.log(`    Summary: ${pass} pass / ${fail} fail / ${results.length} total`);
process.exit(fail > 0 ? 1 : 0);
