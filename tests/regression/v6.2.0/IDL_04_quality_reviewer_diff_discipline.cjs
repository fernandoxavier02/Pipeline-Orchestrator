#!/usr/bin/env node
'use strict';

/**
 * IDL-04 - executor-quality-reviewer.md runs Diff Discipline Review BEFORE
 * the existing Quality Checklist and emits a DIFF_DISCIPLINE_REVIEW block
 * with verdict PASS | NEEDS_REDUCTION | REJECTED.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AGENT = path.join(ROOT, 'agents/executor/executor-quality-reviewer.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== IDL-04 executor-quality-reviewer Diff Discipline Review ===');

const md = fs.readFileSync(AGENT, 'utf8');

test('executor-quality-reviewer.md introduces a "Diff Discipline Review" step', () => {
  assert.ok(/Diff Discipline Review/i.test(md), 'missing Diff Discipline Review section');
});

test('Diff Discipline Review runs BEFORE the existing Quality Checklist', () => {
  const diffIdx = md.search(/Diff Discipline Review/i);
  const checklistIdx = md.search(/Quality Checklist/i);
  assert.ok(diffIdx >= 0, 'Diff Discipline Review missing');
  assert.ok(checklistIdx >= 0, 'Quality Checklist marker missing');
  assert.ok(diffIdx < checklistIdx,
    'Diff Discipline Review must come BEFORE Quality Checklist');
});

test('Emits a DIFF_DISCIPLINE_REVIEW block in the output', () => {
  assert.ok(/DIFF_DISCIPLINE_REVIEW/.test(md), 'missing DIFF_DISCIPLINE_REVIEW emission marker');
});

test('DIFF_DISCIPLINE_REVIEW verdict accepts PASS / NEEDS_REDUCTION / REJECTED', () => {
  assert.ok(/verdict\s*:\s*PASS\s*\|\s*NEEDS_REDUCTION\s*\|\s*REJECTED/.test(md),
    'verdict triple missing');
});

const subBlocks = {
  scope: ['outside_allowed_files', 'unrequested_behavior_changes', 'unrelated_refactors'],
  minimal_diff: ['diff_budget_respected', 'excessive_files_created', 'excessive_abstractions', 'simpler_alternative_available'],
  dependency_config_contract: ['dependency_changes', 'lockfile_changes', 'config_changes', 'public_contract_changes', 'migration_changes'],
  test_integrity: ['tests_added_for_changed_behavior', 'tests_weakened_to_pass', 'snapshots_updated_without_reason'],
};

for (const [block, fields] of Object.entries(subBlocks)) {
  test(`DIFF_DISCIPLINE_REVIEW declares sub-block: ${block}`, () => {
    assert.ok(new RegExp(`\\b${block}\\b`).test(md), `missing sub-block ${block}`);
  });
  for (const f of fields) {
    test(`DIFF_DISCIPLINE_REVIEW.${block} field: ${f}`, () => {
      assert.ok(new RegExp(`\\b${f}\\b`).test(md), `missing field ${block}.${f}`);
    });
  }
}

test('DIFF_DISCIPLINE_REVIEW requires evidence', () => {
  assert.ok(/evidence/i.test(md), 'must require evidence');
});

test('Blocking conditions map to REJECTED verdict', () => {
  assert.ok(/blocking[\s\S]{0,200}REJECTED/i.test(md) || /REJECTED[\s\S]{0,200}blocking/i.test(md),
    'must map blocking conditions to REJECTED');
});

test('Overengineering without functional risk maps to NEEDS_REDUCTION', () => {
  assert.ok(/overengineering[\s\S]{0,200}NEEDS_REDUCTION/i.test(md) ||
           /NEEDS_REDUCTION[\s\S]{0,200}overengineering/i.test(md),
    'must map overengineering (no functional risk) to NEEDS_REDUCTION');
});

test('Quality reviewer references the Implementation Discipline SSOT', () => {
  assert.ok(/implementation-discipline\.md/i.test(md),
    'quality reviewer must reference references/implementation-discipline.md');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
