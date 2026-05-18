#!/usr/bin/env node
'use strict';

/**
 * IDL-01 - Implementation Discipline Layer SSOT exists with required sections.
 *
 * Asserts:
 *   - references/implementation-discipline.md exists
 *   - It defines the severity taxonomy (PASS / NEEDS_REDUCTION / REJECTED)
 *   - It documents scope control, minimal diff, anti-overengineering,
 *     SOLID/KISS/DRY/YAGNI, dependency/config/contract/migration
 *     restrictions, test integrity, evidence, blocking vs warnings.
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

console.log('=== IDL-01 implementation-discipline.md SSOT ===');

test('references/implementation-discipline.md exists', () => {
  assert.ok(fs.existsSync(SSOT), `expected file at ${SSOT}`);
});

const md = fs.existsSync(SSOT) ? fs.readFileSync(SSOT, 'utf8') : '';

test('SSOT documents severity taxonomy (PASS / NEEDS_REDUCTION / REJECTED)', () => {
  assert.ok(/\bPASS\b/.test(md), 'missing severity: PASS');
  assert.ok(/\bNEEDS_REDUCTION\b/.test(md), 'missing severity: NEEDS_REDUCTION');
  assert.ok(/\bREJECTED\b/.test(md), 'missing severity: REJECTED');
});

test('SSOT covers scope control rules', () => {
  assert.ok(/scope control/i.test(md), 'missing "scope control" section');
});

test('SSOT covers minimal diff rules', () => {
  assert.ok(/minimal diff/i.test(md), 'missing "minimal diff" section');
});

test('SSOT covers anti-overengineering rules', () => {
  assert.ok(/anti[- ]?overengineering/i.test(md), 'missing "anti-overengineering" section');
});

test('SSOT covers SOLID/KISS/DRY/YAGNI checks', () => {
  assert.ok(/\bSOLID\b/.test(md), 'missing SOLID');
  assert.ok(/\bKISS\b/.test(md), 'missing KISS');
  assert.ok(/\bDRY\b/.test(md), 'missing DRY');
  assert.ok(/\bYAGNI\b/.test(md), 'missing YAGNI');
});

test('SSOT covers dependency, config, contract and migration restrictions', () => {
  assert.ok(/dependenc/i.test(md), 'missing dependency restriction text');
  assert.ok(/config/i.test(md), 'missing config restriction text');
  assert.ok(/contract/i.test(md), 'missing contract restriction text');
  assert.ok(/migration/i.test(md), 'missing migration restriction text');
});

test('SSOT covers test integrity rules', () => {
  assert.ok(/test integrity/i.test(md), 'missing "test integrity" section');
});

test('SSOT enumerates blocking conditions and non-blocking warnings', () => {
  assert.ok(/blocking conditions?/i.test(md), 'missing "blocking conditions"');
  assert.ok(/non[- ]?blocking/i.test(md), 'missing "non-blocking" warnings');
});

test('SSOT requires evidence for findings', () => {
  assert.ok(/evidence/i.test(md), 'missing "evidence" requirement section');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
