#!/usr/bin/env node
'use strict';

/**
 * Lock 3 — Declared suite baseline vs LIVE discovery parity
 * (workflow-audit-remediation, S3 / task 4.1).
 *
 * Requirement 6.3: a DECLARED suite count must equal the suite count obtained
 * LIVE from the test runner's DISCOVERY — never a number hard-coded in the test.
 *
 * Deterministic interpretation (chosen for non-flakiness): require the exported
 * discovery surface of `scripts/run-tests.cjs` (`CATEGORIES` + each category's
 * `discover()`), and count the total discovered suite FILES across every
 * category. This is pure filesystem discovery — no recursion into the runner, no
 * dependence on pass/fail totals (which are env-flaky). The declared value lives
 * in the canonical `references/agent-registry.json` under `suite_baseline`.
 *
 * The mechanical obligation this creates: ANY changeset that adds or removes a
 * test file changes the live discovered count, so it MUST co-update the declared
 * `suite_baseline.declared_suite_files` in the same commit or this lock turns RED
 * naming the delta.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

// LIVE discovery: sum discover(root).files.length over every category.
function liveDiscoveredFileCount() {
  const runner = require(path.join(ROOT, 'scripts', 'run-tests.cjs'));
  const { CATEGORIES } = runner;
  assert.ok(CATEGORIES && typeof CATEGORIES === 'object',
    'scripts/run-tests.cjs must export CATEGORIES');
  let total = 0;
  const per = {};
  for (const [cat, def] of Object.entries(CATEGORIES)) {
    const d = def.discover(ROOT);
    if (d && d.present) { total += d.files.length; per[cat] = d.files.length; }
    else per[cat] = 'absent';
  }
  return { total, per };
}

// DECLARED value from the canonical registry.
function declaredSuiteFiles() {
  const p = path.join(ROOT, 'references', 'agent-registry.json');
  assert.ok(fs.existsSync(p),
    'references/agent-registry.json is missing (must declare suite_baseline.declared_suite_files)');
  const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = reg && reg.suite_baseline && reg.suite_baseline.declared_suite_files;
  assert.ok(Number.isInteger(v),
    'references/agent-registry.json must declare an integer suite_baseline.declared_suite_files');
  return v;
}

console.log('=== Lock 3 — declared suite baseline vs live discovery ===');

const live = liveDiscoveredFileCount();

test('runner discovery yields a plausible file count (> 0)', () => {
  assert.ok(live.total > 0,
    `live discovery counted ${live.total} files: ${JSON.stringify(live.per)}`);
});

test(`declared suite_baseline.declared_suite_files === live discovered file count (${live.total})`, () => {
  const declared = declaredSuiteFiles();
  assert.equal(declared, live.total,
    `references/agent-registry.json declares ${declared} suite files but live discovery found ${live.total} — ` +
    `co-update suite_baseline.declared_suite_files. Per-category live: ${JSON.stringify(live.per)}`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
