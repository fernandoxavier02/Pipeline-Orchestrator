#!/usr/bin/env node
'use strict';

/**
 * F8 — references/implementation-discipline.md exists and contains all
 * required canonical sections.
 *
 * EXPECTED RED STATE on first run: file does not exist yet.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F8.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'references/implementation-discipline.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readTarget() {
  return fs.readFileSync(TARGET, 'utf8');
}

console.log('=== F8 implementation-discipline.md canonical sections ===');

test('references/implementation-discipline.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('has Severity Definitions section with PASS / NEEDS_REDUCTION / REJECTED', () => {
  const content = readTarget();
  const hasHeading = /^#{1,6}\s+.*Severity\s+Definitions/im.test(content);
  assert.ok(hasHeading, 'expected a "Severity Definitions" heading');
  assert.ok(/\bPASS\b/.test(content), 'missing PASS verdict');
  assert.ok(/\bNEEDS_REDUCTION\b/.test(content), 'missing NEEDS_REDUCTION verdict');
  assert.ok(/\bREJECTED\b/.test(content), 'missing REJECTED verdict');
});

test('has "Scope Control Rules" section', () => {
  const content = readTarget();
  assert.ok(/^#{1,6}\s+.*Scope\s+Control\s+Rules/im.test(content),
    'expected a Scope Control Rules heading');
});

test('has "Minimal Diff Discipline" section', () => {
  const content = readTarget();
  assert.ok(/^#{1,6}\s+.*Minimal\s+Diff\s+Discipline/im.test(content),
    'expected a Minimal Diff Discipline heading');
});

test('has Anti-Overengineering section mentioning SOLID/KISS/DRY/YAGNI', () => {
  const content = readTarget();
  assert.ok(/^#{1,6}\s+.*Anti[\s\-]?Overengineering/im.test(content),
    'expected an Anti-Overengineering heading');
  assert.ok(/SOLID/.test(content), 'missing SOLID reference');
  assert.ok(/KISS/.test(content), 'missing KISS reference');
  assert.ok(/DRY/.test(content), 'missing DRY reference');
  assert.ok(/YAGNI/.test(content), 'missing YAGNI reference');
});

test('has section on Dependency / Config / Contract / Migration restrictions', () => {
  const content = readTarget();
  const hasUmbrella = /^#{1,6}\s+.*(Dependency|Config|Contract|Migration).*(Restriction|Rules|Discipline)/im.test(content);
  // Accept either single umbrella heading or individual headings for each topic
  const hasIndividual =
    /^#{1,6}\s+.*Dependency/im.test(content) &&
    /^#{1,6}\s+.*(Config|Configuration)/im.test(content) &&
    /^#{1,6}\s+.*(Contract|Public\s+API)/im.test(content) &&
    /^#{1,6}\s+.*Migration/im.test(content);
  assert.ok(hasUmbrella || hasIndividual,
    'expected Dependency/Config/Contract/Migration restrictions section(s)');
});

test('has "Test Integrity Rules" section', () => {
  const content = readTarget();
  assert.ok(/^#{1,6}\s+.*Test\s+Integrity\s+Rules/im.test(content),
    'expected a Test Integrity Rules heading');
});

test('has "Evidence Requirements" section', () => {
  const content = readTarget();
  assert.ok(/^#{1,6}\s+.*Evidence\s+Requirements/im.test(content),
    'expected an Evidence Requirements heading');
});

test('has Bootstrap section mentioning self-applying behavior', () => {
  const content = readTarget();
  assert.ok(/^#{1,6}\s+.*Bootstrap/im.test(content),
    'expected a Bootstrap heading');
  assert.ok(/self[\s\-]?appl/i.test(content),
    'expected mention of self-applying behavior');
});

test('mentions interaction with the Mandatory Gates Table', () => {
  const content = readTarget();
  // The pinned count moved 23 -> 24 in v8.6.0 (ADVERSARIAL_LOOP_BREAKER row added
  // in lockstep with lib/fidelity-reporter.cjs MANDATORY_GATES_BY_COMPLEXITY).
  // Pin to 24 EXACTLY (mirrors F1/F2/D7) so a regression back to 23 is caught.
  // The generic "Interaction with the Mandatory Gates Table" heading still
  // satisfies the requirement when no numeric count is present.
  assert.ok(
    /\b24[\s-]?Gate.*(Mandatory|Table)|Mandatory.*\b24[\s-]?Gate|Interaction with the Mandatory Gates Table/i.test(content),
    'expected reference to the Mandatory Gates Table interaction (24-Gate count pinned exactly)');
});

test('mentions ADVERSARIAL_BLOCK interaction with max=3 vs max=5', () => {
  const content = readTarget();
  assert.ok(/ADVERSARIAL_BLOCK/.test(content),
    'missing ADVERSARIAL_BLOCK reference');
  assert.ok(/max\s*=?\s*3/.test(content) && /max\s*=?\s*5/.test(content),
    'expected explicit max=3 vs max=5 distinction');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
