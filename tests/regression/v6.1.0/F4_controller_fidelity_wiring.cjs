#!/usr/bin/env node
'use strict';

/**
 * F4 — controller/fidelity wiring + run-tests.cjs dynamic discovery.
 *
 * Covers:
 *   - REGRESSION-03 scripts/run-tests.cjs uses dynamic discovery to find ALL
 *                   tests/regression/v<semver>/ directories (v6.0.0 AND
 *                   v6.1.0), and rejects non-semver names like helpers/ or
 *                   fixtures/.
 *
 * We test the discovery logic two ways:
 *   1. Static analysis of scripts/run-tests.cjs — it must contain a regex
 *      matching the v<semver> pattern AND must no longer hardcode the
 *      string "v6.0.0".
 *   2. Behavior — we simulate the discovery by reading the regression dir
 *      ourselves with the same regex; the result must include v6.0.0 and
 *      v6.1.0 but exclude any non-semver child.
 *
 * Production code under test (NOT yet implemented — these tests MUST FAIL):
 *   - scripts/run-tests.cjs is still hardcoded to "v6.0.0".
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const SEMVER_RE = /^v\d+\.\d+\.\d+$/;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F4 REGRESSION-03 — run-tests.cjs dynamic discovery ===');

test('scripts/run-tests.cjs no longer hardcodes "tests/regression/v6.0.0"', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/run-tests.cjs'), 'utf8');
  assert.ok(
    !/tests\/regression\/v6\.0\.0/.test(src),
    'scripts/run-tests.cjs must NOT hardcode "tests/regression/v6.0.0" anymore — switch to dynamic discovery'
  );
});

test('scripts/run-tests.cjs contains a v<semver> regex (/^v\\d+\\.\\d+\\.\\d+$/)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/run-tests.cjs'), 'utf8');
  // Accept either /^v\d+\.\d+\.\d+$/ or an equivalent (escaped backslashes,
  // anchored, capturing 3 numeric segments).
  const hasRegex =
    /\/\^v\\d\+\\\.\\d\+\\\.\\d\+\$\//.test(src) ||
    /v\\d\+\\\.\\d\+\\\.\\d\+/.test(src);
  assert.ok(hasRegex,
    'scripts/run-tests.cjs must contain a /^v\\d+\\.\\d+\\.\\d+$/ style regex for dynamic semver discovery');
});

test('scripts/run-tests.cjs reads from tests/regression (the parent dir)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/run-tests.cjs'), 'utf8');
  assert.ok(/tests\/regression/.test(src) || /tests[\\/]regression/.test(src),
    'expected scripts/run-tests.cjs to reference "tests/regression" as the parent dir for discovery');
});

test('Behavior: applying the v<semver> filter to tests/regression includes v6.0.0 AND v6.1.0', () => {
  const regRoot = path.join(ROOT, 'tests/regression');
  const entries = fs.readdirSync(regRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => SEMVER_RE.test(name));
  assert.ok(entries.includes('v6.0.0'),
    'discovery must include v6.0.0 (pre-existing dir)');
  assert.ok(entries.includes('v6.1.0'),
    'discovery must include v6.1.0 (newly created dir for this pipeline)');
});

test('Behavior: v<semver> filter rejects non-semver siblings (helpers, fixtures, .gitkeep)', () => {
  // We sanity-check the regex itself against synthetic names; no need to
  // create real dirs in the project tree.
  const candidates = ['v6.0.0', 'v6.1.0', 'v10.20.30', 'helpers', 'fixtures',
    '.gitkeep', 'v6', 'v6.0', 'v6.0.0-rc.1', 'old_v5'];
  const accepted = candidates.filter((n) => SEMVER_RE.test(n));
  assert.deepEqual(accepted.sort(), ['v10.20.30', 'v6.0.0', 'v6.1.0'].sort(),
    'v<semver> regex must accept exactly v6.0.0, v6.1.0, v10.20.30');
});

test('Regex demo: matches v6.0.0 / v6.1.0; rejects helpers / .gitkeep / v6.0.0-rc.1', () => {
  assert.equal(SEMVER_RE.test('v6.0.0'), true);
  assert.equal(SEMVER_RE.test('v6.1.0'), true);
  assert.equal(SEMVER_RE.test('helpers'), false);
  assert.equal(SEMVER_RE.test('.gitkeep'), false);
  assert.equal(SEMVER_RE.test('v6.0.0-rc.1'), false,
    'pre-release suffixes must NOT match (keep test discovery strict)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
