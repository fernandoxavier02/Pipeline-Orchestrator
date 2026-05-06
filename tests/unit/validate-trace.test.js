#!/usr/bin/env node
/**
 * tests/unit/validate-trace.test.js
 *
 * Wave 8-spec (Batch B) — Standalone TRACE.md validator unit tests.
 *
 * Validates that scripts/validate-trace.cjs:
 *   - Exits 0 for the happy-path fixture (matches schema_version=1).
 *   - Exits 1 for the corrupt-frontmatter fixture, with stderr listing
 *     what's wrong (missing fields, wrong types, wrong section order).
 *
 * DoD criterion #3: TRACE.md attachable to PR — a reviewer must be able
 * to validate without running the pipeline.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-trace.cjs');
const HAPPY = path.join(REPO_ROOT, 'tests', 'fixtures', 'trace', 'happy-path.md');
const CORRUPT = path.join(REPO_ROOT, 'tests', 'fixtures', 'trace', 'corrupt-frontmatter.md');

function run(...args) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('Batch B: happy-path fixture validates with exit 0', () => {
  const r = run(HAPPY);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}\nstdout: ${r.stdout}`);
});

test('Batch B: corrupt-frontmatter fixture fails with exit 1', () => {
  const r = run(CORRUPT);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}`);
});

test('Batch B: corrupt fixture stderr lists at least one missing/malformed field', () => {
  const r = run(CORRUPT);
  // Either schema-version mismatch (99 != 1) or one of the missing fields.
  assert.match(
    r.stderr,
    /(schema_version|started_at|ended_at|duration_seconds|user_identity|branch|repo|Classification|Execution Log|Final Verdict)/i,
    `stderr should diagnose at least one issue, got: ${r.stderr}`
  );
});

test('Batch B: validator with no args exits non-zero with usage message', () => {
  const r = run();
  assert.notEqual(r.status, 0, 'no-args invocation must fail');
  assert.match(r.stderr, /usage|Usage/, 'stderr should print a usage line');
});

test('Batch B: validator on nonexistent file exits non-zero with clear error', () => {
  const r = run(path.join(REPO_ROOT, 'does-not-exist.md'));
  assert.notEqual(r.status, 0, 'nonexistent file must fail');
  assert.match(r.stderr, /not found|ENOENT|cannot read/i, 'stderr should explain the file is missing');
});
