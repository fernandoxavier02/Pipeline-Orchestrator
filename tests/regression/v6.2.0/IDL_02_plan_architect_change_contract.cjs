#!/usr/bin/env node
'use strict';

/**
 * IDL-02 - plan-architect.md declares CHANGE_CONTRACT in IMPLEMENTATION_PLAN.
 *
 * Asserts:
 *   - The IMPLEMENTATION_PLAN YAML schema in agents/quality/plan-architect.md
 *     now includes a CHANGE_CONTRACT block with the required fields.
 *   - plan-architect prose explicitly states it must define the smallest
 *     safe change and call out when new files / abstractions / deps /
 *     contracts / config / migrations are NOT allowed.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AGENT = path.join(ROOT, 'agents/quality/plan-architect.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== IDL-02 plan-architect CHANGE_CONTRACT ===');

const md = fs.readFileSync(AGENT, 'utf8');

test('plan-architect.md mentions CHANGE_CONTRACT', () => {
  assert.ok(/CHANGE_CONTRACT/.test(md), 'CHANGE_CONTRACT marker missing');
});

const requiredFields = [
  'allowed_files',
  'allowed_new_files',
  'forbidden_files',
  'forbidden_change_types',
  'diff_budget',
  'escalation_required_if',
];

for (const f of requiredFields) {
  test(`CHANGE_CONTRACT declares field: ${f}`, () => {
    assert.ok(new RegExp(`\\b${f}\\b`).test(md), `missing field ${f} in plan-architect.md`);
  });
}

test('forbidden_files lists package.json / lockfiles / .env / workflows', () => {
  assert.ok(/package\.json/.test(md), 'forbidden_files missing package.json');
  assert.ok(/lock(file|\.json|\.yaml)/i.test(md), 'forbidden_files missing lockfile reference');
  assert.ok(/\.env\b/.test(md), 'forbidden_files missing .env');
  assert.ok(/\.github\/workflows/.test(md), 'forbidden_files missing .github/workflows');
});

const forbiddenTypes = [
  'unrequested_feature',
  'unrelated_refactor',
  'new_dependency_without_approval',
  'public_api_contract_change_without_approval',
  'schema_migration_without_approval',
  'sensitive_config_change_without_approval',
  'test_weakened_to_fit_implementation',
];

for (const t of forbiddenTypes) {
  test(`forbidden_change_types enumerates: ${t}`, () => {
    assert.ok(new RegExp(t).test(md), `missing forbidden_change_type: ${t}`);
  });
}

test('diff_budget mentions max_files_expected and max_lines_expected', () => {
  assert.ok(/max_files_expected/.test(md), 'diff_budget missing max_files_expected');
  assert.ok(/max_lines_expected/.test(md), 'diff_budget missing max_lines_expected');
});

test('diff_budget pins new_abstractions_allowed and new_modules_allowed to false by default', () => {
  assert.ok(/new_abstractions_allowed:\s*false/i.test(md),
    'diff_budget should default new_abstractions_allowed: false');
  assert.ok(/new_modules_allowed:\s*false/i.test(md),
    'diff_budget should default new_modules_allowed: false');
});

test('plan-architect rule: define smallest safe change', () => {
  assert.ok(/smallest safe change/i.test(md),
    'plan-architect must declare the smallest safe change rule');
});

test('plan-architect rule: state when new files / abstractions / deps etc. are NOT allowed', () => {
  // Single sentence requirement covering the key disallowed expansion vectors.
  assert.ok(/NOT allowed/i.test(md),
    'plan-architect must spell out when expansions are NOT allowed');
});

test('plan-architect references the Implementation Discipline SSOT', () => {
  assert.ok(/implementation-discipline\.md/i.test(md),
    'plan-architect must reference references/implementation-discipline.md');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
