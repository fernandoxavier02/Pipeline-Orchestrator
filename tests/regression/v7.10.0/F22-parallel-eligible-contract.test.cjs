#!/usr/bin/env node
// =============================================================================
// F22 — parallel_eligible contract in plan-architect + executor-controller (v7.10.0)
// =============================================================================
// Verifies:
//   1. plan-architect.md has Step 2b Batch Metadata with parallel eligibility
//   2. plan-architect.md outputs batch_metadata with parallel_eligible field
//   3. executor-controller.md has parallel dispatch section
//   4. executor-controller.md references parallel_eligible in dispatch logic
//   5. complexity-matrix.md has Parallel tasks row
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

// --- plan-architect ---
const planArchitect = fs.readFileSync(
  path.join(ROOT, 'agents/quality/plan-architect.md'), 'utf8'
);

test('F22-S1: plan-architect has Step 2b Batch Metadata', () => {
  assert.ok(
    /Step 2b.*Batch Metadata/i.test(planArchitect),
    'missing Step 2b Batch Metadata in plan-architect'
  );
});

test('F22-S2: plan-architect has parallel_eligible in output schema', () => {
  assert.ok(
    planArchitect.includes('parallel_eligible'),
    'missing parallel_eligible field in plan-architect output'
  );
});

test('F22-S3: plan-architect has batch_metadata in IMPLEMENTATION_PLAN', () => {
  assert.ok(
    planArchitect.includes('batch_metadata'),
    'missing batch_metadata in IMPLEMENTATION_PLAN output'
  );
});

test('F22-S4: plan-architect mentions CHANGE_CONTRACT for overlap detection', () => {
  assert.ok(
    planArchitect.includes('CHANGE_CONTRACT'),
    'missing CHANGE_CONTRACT reference in parallel eligibility step'
  );
});

// --- executor-controller ---
const executorController = fs.readFileSync(
  path.join(ROOT, 'agents/executor/executor-controller.md'), 'utf8'
);

test('F22-S5: executor-controller has parallel dispatch section', () => {
  assert.ok(
    /PARALLEL.*Dispatch|Parallel Dispatch/i.test(executorController),
    'missing parallel dispatch section in executor-controller'
  );
});

test('F22-S6: executor-controller references parallel_eligible', () => {
  assert.ok(
    executorController.includes('parallel_eligible'),
    'missing parallel_eligible reference in executor-controller'
  );
});

test('F22-S7: executor-controller keeps spec+quality serial per task', () => {
  assert.ok(
    /spec.*quality.*serial|spec-reviewer.*quality-reviewer.*SERIAL/i.test(executorController),
    'missing serial spec+quality guarantee in parallel dispatch section'
  );
});

// --- complexity-matrix ---
const matrix = fs.readFileSync(
  path.join(ROOT, 'references/complexity-matrix.md'), 'utf8'
);

test('F22-S8: complexity-matrix has Parallel tasks row', () => {
  assert.ok(
    matrix.includes('Parallel tasks'),
    'missing Parallel tasks row in complexity-matrix'
  );
});

test('F22-S9: complexity-matrix MEDIA allows parallel if disjoint', () => {
  assert.ok(
    /Parallel.*file-scope disjoint/i.test(matrix),
    'missing file-scope disjoint condition in MEDIA column'
  );
});

test('F22-S10: plan-architect has Rule 5 for analysis-incomplete default', () => {
  assert.ok(
    /analysis cannot be completed/i.test(planArchitect),
    'missing Rule 5 covering analysis failure case in plan-architect'
  );
  assert.ok(
    planArchitect.includes('analysis_incomplete:'),
    'missing analysis_incomplete: prefix in overlap_reason guidance'
  );
});

test('F22-S11: executor-controller has explicit guard for absent parallel_eligible', () => {
  assert.ok(
    /parallel_eligible.*absent.*undefined/i.test(executorController),
    'missing explicit guard for absent/undefined parallel_eligible in executor-controller'
  );
  assert.ok(
    /WARN.*parallel_eligible absent/i.test(executorController),
    'missing WARN trace message for absent parallel_eligible'
  );
});

// summary
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`=== F22 parallel_eligible contract ===`);
for (const r of results) {
  const tag = r.ok ? '[PASS]' : '[FAIL]';
  console.log(`  ${tag} ${r.name}${r.ok ? '' : ': ' + r.reason}`);
}
console.log(`    Summary: ${pass} pass / ${fail} fail / ${results.length} total`);
process.exit(fail > 0 ? 1 : 0);
