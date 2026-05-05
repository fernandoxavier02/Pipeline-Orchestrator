#!/usr/bin/env node
/**
 * tests/unit/compat-runner.test.js
 *
 * Unit tests for the --allow-templates-skipped CLI flag added to tests/compat/runner.cjs in v4.9.2.
 *
 * Background: in CI, all compat scenarios under tests/compat/v4-baseline/scenarios/ are TEMPLATE
 * fixtures (baseline_method contains "template"), so the runner skips all of them and would have
 * exited 1 ("NO REAL VALIDATION — only SKIPPED scenarios"). That exit-1 behavior is correct for
 * human use — it prevents a false "green CI" claim when nothing was actually validated.
 *
 * The escape hatch: pass --allow-templates-skipped TOGETHER with --mock. The runner then prints
 * an explicit warning and exits 0. The flag is rejected (exit 2) if --mock is absent, because
 * real-mode all-skipped is a genuine failure worth surfacing.
 *
 * These three scenarios cover the matrix:
 *   1. --mock + --allow-templates-skipped → exit 0  (the new CI-friendly path)
 *   2. --mock alone                       → exit 1  (preserved original behavior)
 *   3. --allow-templates-skipped alone    → exit 2  (validation: flag without --mock is rejected)
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

test('compat-runner --all --mock --allow-templates-skipped exits 0 with explicit warning', () => {
  const result = runRunner(['--all', '--mock', '--allow-templates-skipped']);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(
    result.stdout,
    /ALL-SKIPPED \+ MOCK \+ --allow-templates-skipped — exit 0/,
    `expected warning marker in stdout, got:\n${result.stdout}`
  );
});

test('compat-runner --all --mock (no flag) exits 1 to prevent false greens', () => {
  const result = runRunner(['--all', '--mock']);
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(
    result.stdout,
    /NO REAL VALIDATION/,
    `expected NO REAL VALIDATION marker in stdout, got:\n${result.stdout}`
  );
});

test('compat-runner --all --allow-templates-skipped without --mock exits 2 (validation error)', () => {
  const result = runRunner(['--all', '--allow-templates-skipped']);
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(
    result.stderr,
    /requires --mock/,
    `expected "requires --mock" in stderr, got:\n${result.stderr}`
  );
});
