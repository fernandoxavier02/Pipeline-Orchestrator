#!/usr/bin/env node
'use strict';

/**
 * F4 — Suite registry (v7.2.0 batch)
 *
 * Static-analysis regression for v7.2.0. The v7.2.0 ATDD/BDD/DDD telemetry
 * drift fix added new tests F1 (DDD producer), F2 (ATDD bypass), F3 (BDD
 * coverage gap). This suite is the meta-test: it pins the registry contract
 * itself so the new files (a) are visible to the runner, (b) actually run
 * green individually, and (c) total suite count does not regress.
 *
 * Scenarios:
 *   F4-S1 MAIN       — tests/regression/v7.2.0/ contains at minimum
 *                      F1.cjs, F2.cjs, and an F3_*.cjs file.
 *   F4-S2 MAIN       — each of F1, F2, F3 exits 0 when invoked individually
 *                      via `node <file>` (sanity that runner discovers them
 *                      and they are not silently broken in isolation).
 *   F4-S3 MAIN       — scripts/run-tests.cjs walks tests/regression/v<semver>/
 *                      generically (so v7.2.0 is auto-discovered, no hard-
 *                      coded version list). Asserts the runner contains
 *                      either an explicit v7.2.0 reference OR a generic
 *                      directory-walk pattern over tests/regression/.
 *   F4-S4 REGRESSION — the v6.1.0 D5/D6/D7 regression tests are still
 *                      present (anti-regression: the v7.2.0 batch must not
 *                      delete or shadow older suites).
 *   F4-S5 REGRESSION — total runnable test files under tests/regression/
 *                      v<semver>/ is >= 40 (the post-Batch-2 baseline). The
 *                      v7.2.0 batch ADDS two files (F3, F4) so the actual
 *                      count after this file is >= 42.
 *   F4-S6 REGRESSION — every test file added by the v7.2.0 batch follows
 *                      the F<N>.cjs or F<N>_<slug>.cjs naming convention.
 *                      Files outside the convention (e.g., `foo.cjs`,
 *                      `test.cjs`) would not be auto-discovered correctly
 *                      and indicate a naming-policy drift.
 *
 * Production code under test:
 *   - scripts/run-tests.cjs                    (discovery walker)
 *   - tests/regression/v7.2.0/F1.cjs           (existing)
 *   - tests/regression/v7.2.0/F2.cjs           (existing)
 *   - tests/regression/v7.2.0/F3_*.cjs         (added by Batch 3)
 *   - tests/regression/v6.1.0/D5_*.cjs etc.    (regression anchors)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const REG_ROOT = path.join(ROOT, 'tests/regression');
const V72_DIR = path.join(REG_ROOT, 'v7.2.0');
const V61_DIR = path.join(REG_ROOT, 'v6.1.0');
const RUNNER = path.join(ROOT, 'scripts/run-tests.cjs');

const SEMVER_RE = /^v\d+\.\d+\.\d+$/;
const V72_NAMING_RE = /^F\d+(?:_[A-Za-z0-9_]+)?\.cjs$/;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('=== F4 Suite registry (v7.2.0 batch) ===');

// ---------- F4-S1 MAIN ----------
test('F4-S1: v7.2.0/ contains F1.cjs, F2.cjs, and an F3_*.cjs file at minimum', () => {
  assert.ok(fs.existsSync(V72_DIR) && fs.statSync(V72_DIR).isDirectory(),
    `${V72_DIR} must exist as a directory`);
  const files = fs.readdirSync(V72_DIR);
  assert.ok(files.includes('F1.cjs'),
    'tests/regression/v7.2.0/F1.cjs must exist (Bug 0 / DDD producer test)');
  assert.ok(files.includes('F2.cjs'),
    'tests/regression/v7.2.0/F2.cjs must exist (Bug 1 / ATDD bypass test)');
  assert.ok(files.some((f) => /^F3_.*\.cjs$/.test(f)),
    'tests/regression/v7.2.0/ must contain an F3_<slug>.cjs file (Bug 2 / BDD coverage)');
});

// ---------- F4-S2 MAIN ----------
test('F4-S2: F1, F2, and F3 each exit 0 when invoked individually', () => {
  const files = fs.readdirSync(V72_DIR).filter((f) => /^F[1-3](?:_|\.).*\.cjs$|^F[1-3]\.cjs$/.test(f));
  assert.ok(files.length >= 3,
    `expected at least 3 F1/F2/F3 test files in v7.2.0/, found ${files.length}: ${files.join(', ')}`);
  for (const f of files) {
    const full = path.join(V72_DIR, f);
    const result = spawnSync(process.execPath, [full], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0,
      `${f} must exit 0 when run individually (got status=${result.status}). stderr: ${(result.stderr || '').slice(0, 500)}`);
  }
});

// ---------- F4-S3 MAIN ----------
test('F4-S3: scripts/run-tests.cjs discovers tests/regression/v<semver>/ generically', () => {
  assert.ok(fs.existsSync(RUNNER),
    `${RUNNER} must exist`);
  const src = read(RUNNER);
  // Accept EITHER an explicit v7.2.0 reference OR a generic semver walker.
  // The current runner (v6.0.0+) uses generic discovery — the SEMVER_RE
  // pattern walks every v<N>.<N>.<N> sub-directory of tests/regression/.
  const hasGenericWalker = /tests\/regression/.test(src) &&
                            (/v\\d\+\\\.\\d\+\\\.\\d\+/.test(src) ||
                             /SEMVER_RE|semverRe|semver_re/i.test(src) ||
                             /readdirSync\([^)]*regression/.test(src));
  const hasExplicitV72 = /v7\.2\.0/.test(src);
  assert.ok(hasGenericWalker || hasExplicitV72,
    'scripts/run-tests.cjs must either reference v7.2.0 explicitly OR walk tests/regression/v<semver>/ generically');
});

// ---------- F4-S4 REGRESSION ----------
test('F4-S4: v6.1.0 D5/D6/D7 regression tests still present', () => {
  assert.ok(fs.existsSync(V61_DIR) && fs.statSync(V61_DIR).isDirectory(),
    `${V61_DIR} must exist as a directory`);
  const files = fs.readdirSync(V61_DIR);
  for (const anchor of ['D5_atdd_quality_gate_router.cjs',
                        'D6_bdd_gherkin_output_contract.cjs',
                        'D7_ddd_bounded_contexts_contract.cjs']) {
    assert.ok(files.includes(anchor),
      `tests/regression/v6.1.0/${anchor} must still be present (v6.1.0 ATDD/BDD/DDD anchor)`);
  }
});

// ---------- F4-S5 REGRESSION ----------
test('F4-S5: total runnable suite count (regression + hook) is >= 40 after v7.2.0 batch (anti-regression)', () => {
  assert.ok(fs.existsSync(REG_ROOT) && fs.statSync(REG_ROOT).isDirectory(),
    `${REG_ROOT} must exist as a directory`);
  // Match how scripts/run-tests.cjs aggregates: every .cjs under each
  // tests/regression/v<semver>/ PLUS every .test.cjs under .claude/hooks/__tests__/.
  // The TASK_CONTEXT baseline "40/40" is the runner's total suite count
  // BEFORE adding F3 and F4 (so after Batch 3 the total should be >= 42).
  const versionDirs = fs.readdirSync(REG_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SEMVER_RE.test(d.name))
    .map((d) => d.name);
  let regCount = 0;
  for (const v of versionDirs) {
    const files = fs.readdirSync(path.join(REG_ROOT, v))
      .filter((f) => f.endsWith('.cjs'));
    regCount += files.length;
  }
  const hookDir = path.join(ROOT, '.claude/hooks/__tests__');
  let hookCount = 0;
  if (fs.existsSync(hookDir)) {
    hookCount = fs.readdirSync(hookDir).filter((f) => f.endsWith('.test.cjs')).length;
  }
  const total = regCount + hookCount;
  assert.ok(total >= 40,
    `expected >= 40 runnable suites (regression .cjs + hook .test.cjs), got ${total} (regression=${regCount}, hooks=${hookCount}) — anti-regression on suite count`);
});

// ---------- F4-S6 REGRESSION ----------
test('F4-S6: every v7.2.0 test file follows F<N>.cjs or F<N>_<slug>.cjs naming convention', () => {
  const files = fs.readdirSync(V72_DIR).filter((f) => f.endsWith('.cjs'));
  assert.ok(files.length > 0, 'v7.2.0/ must contain at least one .cjs test file');
  for (const f of files) {
    assert.ok(V72_NAMING_RE.test(f),
      `v7.2.0 test file "${f}" violates naming convention F<N>.cjs or F<N>_<slug>.cjs`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
