#!/usr/bin/env node
'use strict';

/**
 * F9 — agents/quality/plan-architect.md contains CHANGE_CONTRACT yaml block
 * with all canonical fields, forbidden_files, forbidden_change_types, and
 * diff_budget sub-fields.
 *
 * EXPECTED RED STATE on first run: file does not contain CHANGE_CONTRACT block.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F9.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'agents/quality/plan-architect.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readTarget() {
  return fs.readFileSync(TARGET, 'utf8');
}

console.log('=== F9 plan-architect.md CHANGE_CONTRACT block ===');

test('agents/quality/plan-architect.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('contains literal "CHANGE_CONTRACT:" yaml key', () => {
  const content = readTarget();
  assert.ok(/CHANGE_CONTRACT:/.test(content),
    'expected literal "CHANGE_CONTRACT:" key');
});

test('CHANGE_CONTRACT has all 6 required top-level fields', () => {
  const content = readTarget();
  const required = [
    'allowed_files:',
    'allowed_new_files:',
    'forbidden_files:',
    'forbidden_change_types:',
    'diff_budget:',
    'escalation_required_if:',
  ];
  for (const key of required) {
    assert.ok(content.includes(key), `missing required field: ${key}`);
  }
});

test('forbidden_files lists 5 canonical entries verbatim', () => {
  const content = readTarget();
  const canonical = [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.env',
    '.github/workflows/*',
  ];
  for (const entry of canonical) {
    assert.ok(content.includes(entry),
      `missing canonical forbidden_files entry: ${entry}`);
  }
});

test('forbidden_change_types lists 7 canonical entries', () => {
  const content = readTarget();
  const canonical = [
    'unrequested_feature',
    'unrelated_refactor',
    'new_dependency_without_approval',
    'public_api_contract_change_without_approval',
    'schema_migration_without_approval',
    'sensitive_config_change_without_approval',
    'test_weakened_to_fit_implementation',
  ];
  for (const entry of canonical) {
    assert.ok(content.includes(entry),
      `missing canonical forbidden_change_types entry: ${entry}`);
  }
});

test('diff_budget contains all 4 sub-fields', () => {
  const content = readTarget();
  const subFields = [
    'max_files_expected:',
    'max_lines_expected:',
    'new_abstractions_allowed:',
    'new_modules_allowed:',
  ];
  for (const sf of subFields) {
    assert.ok(content.includes(sf),
      `missing diff_budget sub-field: ${sf}`);
  }
});

test('references implementation-discipline.md', () => {
  const content = readTarget();
  assert.ok(/implementation-discipline\.md/.test(content),
    'expected cross-reference to implementation-discipline.md');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
