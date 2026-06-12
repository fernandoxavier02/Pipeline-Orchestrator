#!/usr/bin/env node
'use strict';

/**
 * F01 (v7.13.0) — R9-core: test runner category discovery, per-test timeout,
 * and empty/absent-category gate.
 *
 * The runner (scripts/run-tests.cjs) must:
 *   - Discover the canonical default categories (regression, hooks, unit,
 *     packaging, watchdog) instead of only regression + hooks.
 *   - Treat "directory exists but empty" as a SKIP, never a failure (so a
 *     freshly-created packaging/ or watchdog/ folder does not break npm test).
 *   - Treat "directory absent" as a SKIP under the default run; only fail it
 *     when strict category enforcement is requested.
 *   - Apply a per-test timeout so a hung test is killed and reported FAIL,
 *     never freezing the suite.
 *
 * Pure Node + node:assert/strict + pass/fail counter + process.exit.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const runner = require('../../../scripts/run-tests.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F01 v7.13.0 test-runner categories + timeout + gate ===');

// --- exported surface ---------------------------------------------------
test('runner exports discoverFlat, runSuite, CATEGORIES, main', () => {
  assert.equal(typeof runner.discoverFlat, 'function', 'discoverFlat must be exported');
  assert.equal(typeof runner.runSuite, 'function', 'runSuite must be exported');
  assert.equal(typeof runner.CATEGORIES, 'object', 'CATEGORIES map must be exported');
  assert.equal(typeof runner.main, 'function', 'main must be exported');
});

test('CATEGORIES includes unit, packaging, watchdog as default-on', () => {
  const c = runner.CATEGORIES;
  for (const cat of ['regression', 'hooks', 'unit', 'packaging', 'watchdog']) {
    assert.ok(c[cat], `category ${cat} must be declared`);
    assert.equal(c[cat].default, true, `category ${cat} must run by default`);
  }
});

test('unit is the canonical category that exposed the orphan-test gap', () => {
  // R9 acceptance: "A test placed in tests/unit is executed by default."
  assert.equal(runner.CATEGORIES.unit.default, true);
});

// --- discoverFlat semantics ---------------------------------------------
function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'f01-runner-'));
}

test('discoverFlat: absent directory → present:false, empty files', () => {
  const root = mkTmp();
  const r = runner.discoverFlat(root, 'tests/does-not-exist', /\.test\.cjs$/);
  assert.equal(r.present, false, 'absent dir must report present:false');
  assert.deepEqual(r.files, [], 'absent dir must yield no files');
});

test('discoverFlat: present but empty directory → present:true, empty files (skip, not fail)', () => {
  const root = mkTmp();
  fs.mkdirSync(path.join(root, 'tests', 'packaging'), { recursive: true });
  const r = runner.discoverFlat(root, 'tests/packaging', /\.test\.cjs$/);
  assert.equal(r.present, true, 'empty existing dir must report present:true');
  assert.deepEqual(r.files, [], 'empty dir must yield no files (→ skipped, never failed)');
});

test('discoverFlat: directory with matching files → returns them sorted', () => {
  const root = mkTmp();
  const dir = path.join(root, 'tests', 'unit');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'b.test.cjs'), '');
  fs.writeFileSync(path.join(dir, 'a.test.js'), '');
  fs.writeFileSync(path.join(dir, 'ignore.md'), '');
  const r = runner.discoverFlat(root, 'tests/unit', /\.test\.(js|cjs)$/);
  assert.equal(r.present, true);
  assert.deepEqual(r.files.map((f) => path.basename(f)), ['a.test.js', 'b.test.cjs']);
});

// --- per-test timeout ----------------------------------------------------
test('runSuite: a hung test is killed by timeout and reported as timedOut/FAIL', () => {
  const root = mkTmp();
  const hung = path.join(root, 'hung.cjs');
  // Keeps the event loop alive well past the timeout window.
  fs.writeFileSync(hung, 'setTimeout(() => {}, 60000);\n');
  const started = Date.now();
  const res = runner.runSuite(hung, { timeoutMs: 600 });
  const elapsed = Date.now() - started;
  assert.equal(res.ok, false, 'hung suite must not be ok');
  assert.equal(res.timedOut, true, 'hung suite must be flagged timedOut');
  assert.ok(elapsed < 10000, `must be killed quickly (elapsed=${elapsed}ms)`);
});

test('runSuite: a fast passing test returns ok:true, timedOut:false', () => {
  const root = mkTmp();
  const ok = path.join(root, 'ok.cjs');
  fs.writeFileSync(ok, 'process.exit(0);\n');
  const res = runner.runSuite(ok, { timeoutMs: 5000 });
  assert.equal(res.ok, true);
  assert.equal(res.timedOut, false);
});

test('runSuite: a failing test (exit 1) returns ok:false, timedOut:false', () => {
  const root = mkTmp();
  const bad = path.join(root, 'bad.cjs');
  fs.writeFileSync(bad, 'process.exit(1);\n');
  const res = runner.runSuite(bad, { timeoutMs: 5000 });
  assert.equal(res.ok, false);
  assert.equal(res.timedOut, false);
});

// --- strict category gate (R9.4) ----------------------------------------
test('main: --strict-categories FAILS a required category present-but-empty', () => {
  const root = mkTmp();
  // regression is a required category; create it empty (no v<semver> subdir).
  fs.mkdirSync(path.join(root, 'tests', 'regression'), { recursive: true });
  const rc = runner.main(['--regression', '--strict-categories'], { root });
  assert.equal(rc, 1, 'strict mode must fail a wiped required category, not green-wash it');
});

test('main: --strict-categories PASSES when required category has a passing test', () => {
  const root = mkTmp();
  const dir = path.join(root, 'tests', 'regression', 'v9.9.9');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ok.cjs'), 'process.exit(0);\n');
  const rc = runner.main(['--regression', '--strict-categories'], { root });
  assert.equal(rc, 0, 'a populated, passing required category must pass strict mode');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
