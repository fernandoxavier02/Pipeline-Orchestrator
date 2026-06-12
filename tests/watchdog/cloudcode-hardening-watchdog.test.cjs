#!/usr/bin/env node
'use strict';

/**
 * Watchdog test (v7.13.0 — R11/R12): the release watchdog must FAIL-CLOSED.
 *
 * Proves:
 *   - W1 catches version drift (a wrong expected version fails).
 *   - W10 is fail-closed: a review group with NO adversarial-review-attempt
 *     artifact is a release blocker; a group WITH one passes; an absent
 *     reviews/ dir fails (R11 acceptance: "the watchdog rejects a final run
 *     missing adversarial review evidence").
 *   - The watchdog exposes its checks and a runnable main.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const wd = require(path.join(ROOT, 'scripts/watchdog-cloudcode-hardening.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}
function mktmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-')); }

console.log('=== Watchdog cloudcode-hardening (R11 fail-closed) ===');

test('exposes w1, w10, w11, w12, main', () => {
  for (const k of ['w1', 'w10', 'w11', 'w12', 'main']) {
    assert.equal(typeof wd[k], 'function', `${k} must be exported`);
  }
});

test('W1 catches version drift (wrong expected version → FAIL)', () => {
  const r = wd.w1('999.999.999');
  assert.equal(r.status, 'FAIL', 'a version that matches no surface must FAIL');
  assert.ok(r.evidence.some((e) => /!=/.test(e)), 'evidence shows the mismatch');
});

test('W1 passes when expected matches the repo surfaces', () => {
  const cur = require(path.join(ROOT, 'package.json')).version;
  const r = wd.w1(cur);
  assert.equal(r.status, 'PASS', `current version ${cur} must pass W1`);
});

test('W10 FAILS when a review group lacks adversarial evidence (R11 fail-closed)', () => {
  const dir = mktmp();
  const reviews = path.join(dir, 'reviews');
  fs.mkdirSync(path.join(reviews, 'B0'), { recursive: true });
  fs.writeFileSync(path.join(reviews, 'B0', 'tests.md'), 'evidence');
  // B0 has tests.md but NO adversarial-review-attempt-*.md → blocker
  const r = wd.w10({ reviewsDir: reviews });
  assert.equal(r.status, 'FAIL', 'a group without an adversarial review artifact is a blocker');
});

test('W10 PASSES when every group has a real (>=120B) adversarial artifact', () => {
  const dir = mktmp();
  const reviews = path.join(dir, 'reviews');
  const body = '# adversarial review\n' + 'finding and verdict line. '.repeat(8); // > 120 bytes
  for (const g of ['B0', 'B1']) {
    fs.mkdirSync(path.join(reviews, g), { recursive: true });
    fs.writeFileSync(path.join(reviews, g, 'adversarial-review-attempt-1.md'), body);
  }
  const r = wd.w10({ reviewsDir: reviews });
  assert.equal(r.status, 'PASS', 'all groups have evidence → pass');
});

test('W10 FAILS an EMPTY stub artifact (not just a missing one)', () => {
  const dir = mktmp();
  const reviews = path.join(dir, 'reviews');
  fs.mkdirSync(path.join(reviews, 'B0'), { recursive: true });
  fs.writeFileSync(path.join(reviews, 'B0', 'adversarial-review-attempt-1.md'), 'x'); // 1 byte stub
  const r = wd.w10({ reviewsDir: reviews });
  assert.equal(r.status, 'FAIL', 'an empty stub must not satisfy W10');
});

test('W10 FAILS when the reviews dir is absent (no evidence at all)', () => {
  const dir = mktmp();
  const r = wd.w10({ reviewsDir: path.join(dir, 'does-not-exist') });
  assert.equal(r.status, 'FAIL', 'absent reviews dir must fail closed');
});

// --- W8 baseline allow-list (HIGH fix: no substring false-PASS) ---------
test('W8 does NOT absorb a real failing test disguised with a baseline token', () => {
  const fake = 'Summary: 100 passed / 1 failed / 101 total\n  [FAIL] tests/regression/v7.13.0/F99-langfuse-disguised-real-bug.cjs\n';
  const r = wd.w8({ stdout: fake });
  assert.equal(r.status, 'FAIL', 'a disguised real failure must NOT pass W8');
  assert.ok(r.evidence.join(' ').includes('UNEXPECTED'));
});

test('W8 PASSES when only the documented baseline suites fail', () => {
  const baseline = ['F8-langfuse-disabled-noop.test.cjs', 'F9-langfuse-span-lifecycle.test.cjs',
    'F10-langfuse-sanitizer.test.cjs', 'F2-score-writer.test.cjs'];
  const fake = 'Summary: 109 passed / 4 failed / 113 total\n' +
    baseline.map((b) => `  [FAIL] tests/regression/x/${b}`).join('\n') + '\n';
  const r = wd.w8({ stdout: fake });
  assert.equal(r.status, 'PASS', 'only-baseline failures pass W8');
});

test('W8 FAILS when the suite output is unparseable (no Summary)', () => {
  const r = wd.w8({ stdout: 'garbage, no summary line' });
  assert.equal(r.status, 'FAIL', 'unparseable suite output must fail closed');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
