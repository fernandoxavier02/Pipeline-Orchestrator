#!/usr/bin/env node
'use strict';

/**
 * IDL-05 - architecture-reviewer.md adds explicit unnecessary-abstraction /
 * new-file-justification / duplication / layer / unrelated-refactor /
 * semantic-duplication / public-contract-drift checks.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AGENT = path.join(ROOT, 'agents/quality/architecture-reviewer.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== IDL-05 architecture-reviewer Discipline Checks ===');

const md = fs.readFileSync(AGENT, 'utf8');

const requiredPatterns = [
  ['new abstraction without (a )?second( real)? use case', 'new abstraction without second real use case'],
  ['new file where (a )?local change was sufficient', 'new file where local change was sufficient'],
  ['duplicated (helper|type|constant)', 'duplicated helper/type/constant'],
  ['architecture layer created without necessity', 'architecture layer created without necessity'],
  ['refactor unrelated to (the )?batch scope', 'refactor unrelated to batch scope'],
  ['semantic duplication', 'semantic duplication'],
  ['public contract drift', 'public contract drift'],
];

for (const [pattern, label] of requiredPatterns) {
  test(`architecture-reviewer enumerates check: ${label}`, () => {
    assert.ok(new RegExp(pattern, 'i').test(md),
      `missing check: ${label}`);
  });
}

test('architecture-reviewer references the Implementation Discipline SSOT', () => {
  assert.ok(/implementation-discipline\.md/i.test(md),
    'architecture reviewer must reference references/implementation-discipline.md');
});

test('architecture-reviewer emits findings for these checks (DISCIPLINE category or equivalent tag)', () => {
  // Either expand the FINDING category enum or document that the
  // new checks map to DUPLICATION/ARCHITECTURE etc. — accept either.
  assert.ok(/DISCIPLINE|DUPLICATION|ARCHITECTURE/.test(md),
    'must indicate finding category mapping for the new checks');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
