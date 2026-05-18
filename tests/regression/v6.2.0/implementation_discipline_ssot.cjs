#!/usr/bin/env node
'use strict';

/**
 * v6.2.0 — Implementation Discipline SSOT contract
 *
 * Asserts that references/implementation-discipline.md exists and defines
 * the canonical sections this SSOT is supposed to define (scope, minimal
 * diff, anti-overengineering, SOLID/KISS/DRY/YAGNI,
 * dependency/config/contract/migration, test integrity, evidence,
 * PASS/NEEDS_REDUCTION/REJECTED verdicts).
 *
 * Why it exists: the file is the source-of-truth that the 4 agent prompts
 * point to. If a future edit accidentally removes a section, the agents
 * silently lose their backing rules. This test fails the build before
 * that drift can ship.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const SSOT = path.join(ROOT, 'references/implementation-discipline.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== v6.2.0 implementation-discipline.md SSOT ===');

test('S1: file exists', () => {
  assert.ok(fs.existsSync(SSOT), `${SSOT} does not exist`);
});

const md = fs.readFileSync(SSOT, 'utf8');

test('S2: has section "Scope control"', () => {
  assert.ok(/^##\s+\d+\.\s+Scope control\b/m.test(md),
    'missing "## N. Scope control" heading');
});

test('S3: has section "Minimal diff"', () => {
  assert.ok(/^##\s+\d+\.\s+Minimal diff\b/m.test(md),
    'missing "## N. Minimal diff" heading');
});

test('S4: has section "Anti-overengineering"', () => {
  assert.ok(/^##\s+\d+\.\s+Anti-overengineering\b/m.test(md),
    'missing "## N. Anti-overengineering" heading');
});

test('S5: has section "SOLID / KISS / DRY / YAGNI"', () => {
  assert.ok(/^##\s+\d+\.\s+SOLID\s*\/\s*KISS\s*\/\s*DRY\s*\/\s*YAGNI\b/m.test(md),
    'missing "## N. SOLID / KISS / DRY / YAGNI" heading');
});

test('S6: has section covering dependency/config/contract/migration restrictions', () => {
  assert.ok(/^##\s+\d+\.\s+Dependency,?\s+config,?\s+contract,?\s+and migration restrictions\b/im.test(md),
    'missing "## N. Dependency, config, contract, and migration restrictions" heading');
});

test('S7: has section "Test integrity"', () => {
  assert.ok(/^##\s+\d+\.\s+Test integrity\b/m.test(md),
    'missing "## N. Test integrity" heading');
});

test('S8: has section "Evidence"', () => {
  assert.ok(/^##\s+\d+\.\s+Evidence\b/m.test(md),
    'missing "## N. Evidence" heading');
});

test('S9: defines PASS / NEEDS_REDUCTION / REJECTED verdict vocabulary', () => {
  assert.ok(/\bPASS\b/.test(md), 'missing PASS verdict');
  assert.ok(/\bNEEDS_REDUCTION\b/.test(md), 'missing NEEDS_REDUCTION verdict');
  assert.ok(/\bREJECTED\b/.test(md), 'missing REJECTED verdict');
  // Verdict table should appear in a "Verdict vocabulary" section
  assert.ok(/^##\s+\d+\.\s+Verdict vocabulary\b/m.test(md),
    'missing "## N. Verdict vocabulary" heading');
});

test('S10: explicitly states "not a new gate" and "22-gate count preserved"', () => {
  assert.ok(/22[- ]gate/i.test(md), 'must reference the 22-gate registry count');
  assert.ok(/not (a )?(new )?gate|no new row|not a registered gate|Not a gate/i.test(md),
    'must explicitly state this is not a new registered gate');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
