#!/usr/bin/env node
'use strict';

/**
 * v6.2.0 — plan-architect.md gains CHANGE_CONTRACT in IMPLEMENTATION_PLAN
 *
 * Asserts that the IMPLEMENTATION_PLAN YAML template includes the
 * CHANGE_CONTRACT block with all required keys, and that the agent's
 * Overview includes the "Smallest safe change" bullet and a new RULES
 * entry (Rule 11) requiring CHANGE_CONTRACT population.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const PA = path.join(ROOT, 'agents/quality/plan-architect.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== v6.2.0 plan-architect CHANGE_CONTRACT contract ===');

const md = fs.readFileSync(PA, 'utf8');

test('S1: Overview includes "Smallest safe change" bullet', () => {
  assert.ok(/\*\*Smallest safe change:\*\*/m.test(md),
    'missing "**Smallest safe change:**" bullet in Overview');
});

test('S2: IMPLEMENTATION_PLAN YAML has CHANGE_CONTRACT key', () => {
  assert.ok(/CHANGE_CONTRACT:\s*\n/.test(md),
    'missing top-level CHANGE_CONTRACT: key in IMPLEMENTATION_PLAN YAML');
});

test('S3: CHANGE_CONTRACT has allowed_files / allowed_new_files', () => {
  assert.ok(/\ballowed_files\s*:/.test(md), 'missing allowed_files');
  assert.ok(/\ballowed_new_files\s*:/.test(md), 'missing allowed_new_files');
});

test('S4: CHANGE_CONTRACT has forbidden_files with required default entries', () => {
  assert.ok(/\bforbidden_files\s*:/.test(md), 'missing forbidden_files');
  const required = [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.env',
    '.github/workflows/\\*',
  ];
  for (const r of required) {
    const re = new RegExp(`"${r}"`);
    assert.ok(re.test(md), `forbidden_files missing required default "${r.replace(/\\\*/g, '*')}"`);
  }
});

test('S5: CHANGE_CONTRACT has forbidden_change_types with all 7 types', () => {
  assert.ok(/\bforbidden_change_types\s*:/.test(md), 'missing forbidden_change_types');
  const types = [
    'unrequested_feature',
    'unrelated_refactor',
    'new_dependency_without_approval',
    'public_api_contract_change_without_approval',
    'schema_migration_without_approval',
    'sensitive_config_change_without_approval',
    'test_weakened_to_fit_implementation',
  ];
  for (const t of types) {
    assert.ok(new RegExp(`\\b${t}\\b`).test(md),
      `forbidden_change_types missing "${t}"`);
  }
});

test('S6: CHANGE_CONTRACT has diff_budget with 4 sub-fields', () => {
  assert.ok(/\bdiff_budget\s*:/.test(md), 'missing diff_budget');
  for (const f of ['max_files_expected', 'max_lines_expected',
                   'new_abstractions_allowed', 'new_modules_allowed']) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(md),
      `diff_budget missing sub-field "${f}"`);
  }
});

test('S7: CHANGE_CONTRACT has escalation_required_if', () => {
  assert.ok(/\bescalation_required_if\s*:/.test(md),
    'missing escalation_required_if');
});

test('S8: RULES section has a new numbered rule (Rule 11) referencing CHANGE_CONTRACT', () => {
  // RULES section is between "## RULES" and next "## " heading
  const rulesMatch = md.match(/^##\s+RULES\b[\s\S]*?(?=\n##\s|\Z)/m);
  assert.ok(rulesMatch, 'RULES section not found');
  const rules = rulesMatch[0];
  assert.ok(/^\s*11\.\s+/m.test(rules), 'Rule 11 line not present in RULES section');
  // The rule body must mention CHANGE_CONTRACT and the SSOT path
  assert.ok(/CHANGE_CONTRACT/.test(rules), 'Rule 11 must reference CHANGE_CONTRACT');
  assert.ok(/references\/implementation-discipline\.md/.test(rules),
    'Rule 11 must point to references/implementation-discipline.md');
});

test('S9: existing Rule 10 (Bounded Contexts) preserved verbatim', () => {
  // Sanity check that we did not accidentally remove/renumber Rule 10
  const rulesMatch = md.match(/^##\s+RULES\b[\s\S]*?(?=\n##\s|\Z)/m);
  assert.ok(rulesMatch, 'RULES section not found');
  assert.ok(/^\s*10\.\s+\*\*Bounded Contexts/m.test(rulesMatch[0]),
    'Rule 10 (Bounded Contexts) must remain verbatim');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
