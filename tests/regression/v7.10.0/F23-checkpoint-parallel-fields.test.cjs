#!/usr/bin/env node
// =============================================================================
// F23 — per-task CHECKPOINT_RESULT in parallel batch (v7.10.0)
// =============================================================================
// Verifies that checkpoint-validator.md has:
//   1. parallel_execution field in CHECKPOINT_RESULT schema
//   2. per_task_status array in CHECKPOINT_RESULT schema
//   3. per_task_status present only when parallel_execution: true
//   4. task_id + status + first_failure fields in per_task_status items
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

const checkpointPath = path.join(ROOT, 'agents/core/checkpoint-validator.md');
const content = fs.readFileSync(checkpointPath, 'utf8');

test('F23-S1: CHECKPOINT_RESULT has parallel_execution field', () => {
  assert.ok(
    content.includes('parallel_execution'),
    'missing parallel_execution field in CHECKPOINT_RESULT'
  );
});

test('F23-S2: CHECKPOINT_RESULT has per_task_status array', () => {
  assert.ok(
    content.includes('per_task_status'),
    'missing per_task_status array in CHECKPOINT_RESULT'
  );
});

test('F23-S3: per_task_status conditioned on parallel_execution: true', () => {
  assert.ok(
    /per_task_status.*parallel_execution.*true|parallel_execution.*true.*per_task_status/is.test(content),
    'per_task_status not conditioned on parallel_execution: true'
  );
});

test('F23-S4: per_task_status items have task_id field', () => {
  const region = content.slice(content.indexOf('per_task_status'));
  assert.ok(
    region.includes('task_id'),
    'missing task_id in per_task_status items'
  );
});

test('F23-S5: per_task_status items have status field', () => {
  const region = content.slice(content.indexOf('per_task_status'));
  assert.ok(
    /status:.*PASS.*FAIL/i.test(region),
    'missing status PASS/FAIL in per_task_status items'
  );
});

test('F23-S6: per_task_status items have first_failure field', () => {
  const region = content.slice(content.indexOf('per_task_status'));
  assert.ok(
    region.includes('first_failure'),
    'missing first_failure in per_task_status items'
  );
});

// summary
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`=== F23 checkpoint parallel fields ===`);
for (const r of results) {
  const tag = r.ok ? '[PASS]' : '[FAIL]';
  console.log(`  ${tag} ${r.name}${r.ok ? '' : ': ' + r.reason}`);
}
console.log(`    Summary: ${pass} pass / ${fail} fail / ${results.length} total`);
process.exit(fail > 0 ? 1 : 0);
