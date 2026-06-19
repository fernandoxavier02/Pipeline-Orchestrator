#!/usr/bin/env node
'use strict';

// =============================================================================
// F8 (v8.7.0) — Fix-loop counter brain (TDD RED→GREEN).
//
// Replaces the prose "max 3 attempts" with a code decision: once `attempts`
// reaches `max`, another executor-fix spawn is denied (FIX_LOOP_EXHAUSTED). The
// counter itself is stamped into the signed state by record-step's sibling; this
// is the pure decision. Written before lib/fix-loop.cjs exists.
// =============================================================================

const assert = require('node:assert/strict');
const MOD = '../../../lib/fix-loop.cjs';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F8 v8.7.0 — fix-loop counter brain ===');

test('F8-1 — under the cap → allow', () => {
  const { decideFixLoop } = require(MOD);
  assert.equal(decideFixLoop({ attempts: 0, max: 3 }).decision, 'allow');
  assert.equal(decideFixLoop({ attempts: 2, max: 3 }).decision, 'allow');
});

test('F8-2 — at the cap → BLOCK (FIX_LOOP_EXHAUSTED)', () => {
  const { decideFixLoop } = require(MOD);
  const r = decideFixLoop({ attempts: 3, max: 3, enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /FIX_LOOP_EXHAUSTED/);
});

test('F8-3 — over the cap → BLOCK', () => {
  const { decideFixLoop } = require(MOD);
  assert.equal(decideFixLoop({ attempts: 5, max: 3, enforce: 'deny' }).decision, 'block');
});

test('F8-4 — default cap is 3 when max omitted', () => {
  const { decideFixLoop } = require(MOD);
  assert.equal(decideFixLoop({ attempts: 3, enforce: 'deny' }).decision, 'block');
  assert.equal(decideFixLoop({ attempts: 2 }).decision, 'allow');
});

test('F8-5 — warn mode → allow + warn even at the cap', () => {
  const { decideFixLoop } = require(MOD);
  const r = decideFixLoop({ attempts: 3, max: 3, enforce: 'warn' });
  assert.equal(r.decision, 'allow');
  assert.equal(r.warn, true);
});

test('F8-6 — malformed ctx → allow (fail-open)', () => {
  const { decideFixLoop } = require(MOD);
  assert.equal(decideFixLoop(null).decision, 'allow');
  assert.equal(decideFixLoop({}).decision, 'allow'); // attempts 0 < default 3
});

console.log(`\n=== F8 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
