#!/usr/bin/env node
/**
 * tests/unit/compat-runner.test.js
 *
 * Validates that --allow-templates-skipped is rejected when paired without --mock. This guard
 * was added in v4.9.2 (PR #9) and survives v4.10.0 as a defensive check — real-mode all-skipped
 * is genuinely a failure worth surfacing, regardless of fixture state.
 *
 * The other two tests originally in this file (v4.9.2 happy paths for the flag) became obsolete
 * in v4.10.0 once all 5 fixtures graduated from TEMPLATE → REAL baselines (Wave 3). They were
 * tied to a fixture state that no longer exists. Replacement coverage for the v4.10.0 baselines
 * lives in tests/unit/compat-baselines.test.js.
 *
 * Run: node --test tests/unit/compat-runner.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const RUNNER = path.resolve(__dirname, '..', 'compat', 'runner.cjs');

function runRunner(args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('compat-runner --all --allow-templates-skipped without --mock exits 2 (validation error)', () => {
  const result = runRunner(['--all', '--allow-templates-skipped']);
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(
    result.stderr,
    /requires --mock/,
    `expected "requires --mock" in stderr, got:\n${result.stderr}`
  );
});
