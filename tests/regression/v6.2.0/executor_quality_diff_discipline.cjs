#!/usr/bin/env node
'use strict';

/**
 * v6.2.0 — executor-quality-reviewer.md gains "Diff Discipline Review" step.
 *
 * Asserts that the new step exists, that it produces a
 * DIFF_DISCIPLINE_REVIEW YAML block with the required schema, and that the
 * verdict vocabulary (PASS | NEEDS_REDUCTION | REJECTED) is referenced.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const QR = path.join(ROOT, 'agents/executor/executor-quality-reviewer.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== v6.2.0 executor-quality-reviewer Diff Discipline Review ===');

const md = fs.readFileSync(QR, 'utf8');

test('S1: "Diff Discipline Review" step exists', () => {
  assert.ok(/^###\s+Step\s+\d+(\.\d+)?:\s+Diff Discipline Review\b/m.test(md),
    'missing "### Step N: Diff Discipline Review" heading');
});

test('S2: DIFF_DISCIPLINE_REVIEW YAML schema present with required top-level fields', () => {
  assert.ok(/DIFF_DISCIPLINE_REVIEW\s*:/.test(md),
    'missing DIFF_DISCIPLINE_REVIEW YAML');
  for (const f of [
    'verdict', 'scope', 'minimal_diff', 'dependency_config_contract',
    'test_integrity', 'evidence',
  ]) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(md),
      `DIFF_DISCIPLINE_REVIEW missing field "${f}"`);
  }
});

test('S3: scope block has 3 sub-fields', () => {
  for (const f of [
    'outside_allowed_files',
    'unrequested_behavior_changes',
    'unrelated_refactors',
  ]) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(md),
      `scope block missing sub-field "${f}"`);
  }
});

test('S4: minimal_diff block has 4 sub-fields', () => {
  for (const f of [
    'diff_budget_respected',
    'excessive_files_created',
    'excessive_abstractions',
    'simpler_alternative_available',
  ]) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(md),
      `minimal_diff block missing sub-field "${f}"`);
  }
});

test('S5: dependency_config_contract block has 5 sub-fields', () => {
  for (const f of [
    'dependency_changes',
    'lockfile_changes',
    'config_changes',
    'public_contract_changes',
    'migration_changes',
  ]) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(md),
      `dependency_config_contract block missing sub-field "${f}"`);
  }
});

test('S6: test_integrity block has 3 sub-fields', () => {
  for (const f of [
    'tests_added_for_changed_behavior',
    'tests_weakened_to_pass',
    'snapshots_updated_without_reason',
  ]) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(md),
      `test_integrity block missing sub-field "${f}"`);
  }
});

test('S7: verdict vocabulary mentions PASS / NEEDS_REDUCTION / REJECTED', () => {
  // Search inside the Diff Discipline Review step specifically
  const m = md.match(/^###\s+Step\s+\d+(\.\d+)?:\s+Diff Discipline Review\b[\s\S]*?(?=\n###\s|\n##\s|\n---)/m);
  assert.ok(m, 'Diff Discipline Review section body not captured');
  const sec = m[0];
  assert.ok(/\bPASS\b/.test(sec), 'verdict vocabulary missing PASS');
  assert.ok(/\bNEEDS_REDUCTION\b/.test(sec), 'verdict vocabulary missing NEEDS_REDUCTION');
  assert.ok(/\bREJECTED\b/.test(sec), 'verdict vocabulary missing REJECTED');
});

test('S8: blocking severity rule documented', () => {
  // Must state that scope / contract / dependency / config / test-integrity
  // issues map to REJECTED, and overengineering without functional risk maps
  // to NEEDS_REDUCTION.
  assert.ok(/REJECTED/.test(md), 'missing REJECTED');
  assert.ok(/NEEDS_REDUCTION/.test(md), 'missing NEEDS_REDUCTION');
  // Loose phrase check — must talk about "overengineering" -> NEEDS_REDUCTION
  assert.ok(/overengineering[\s\S]{0,200}NEEDS_REDUCTION|NEEDS_REDUCTION[\s\S]{0,200}overengineering/i.test(md),
    'must map overengineering-without-functional-risk to NEEDS_REDUCTION');
});

test('S9: QUALITY_REVIEW_RESULT YAML adds diff_discipline_verdict field', () => {
  const m = md.match(/QUALITY_REVIEW_RESULT\s*:[\s\S]*?(?=\n```|\n##\s|\n---)/);
  assert.ok(m, 'QUALITY_REVIEW_RESULT YAML not found');
  assert.ok(/\bdiff_discipline_verdict\s*:/.test(m[0]),
    'QUALITY_REVIEW_RESULT must include diff_discipline_verdict');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
