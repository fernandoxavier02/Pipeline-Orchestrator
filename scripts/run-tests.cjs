#!/usr/bin/env node
'use strict';

/**
 * Cross-platform test runner for the regression suite + hook tests.
 *
 * Replaces `for t in .../*.cjs; do node "$t" || exit 1; done` which only
 * works in POSIX shells. This runner is pure Node, works on Windows/Mac/Linux.
 *
 * Usage:
 *   node scripts/run-tests.cjs              # run everything
 *   node scripts/run-tests.cjs --regression # only regression suite
 *   node scripts/run-tests.cjs --hooks      # only hook tests
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const onlyRegression = args.includes('--regression');
const onlyHooks = args.includes('--hooks');
const runAll = !onlyRegression && !onlyHooks;

const suites = [];

if (runAll || onlyRegression) {
  const regDir = path.join(ROOT, 'tests/regression/v6.0.0');
  if (fs.existsSync(regDir)) {
    const files = fs.readdirSync(regDir).filter((f) => f.endsWith('.cjs')).sort();
    for (const f of files) {
      suites.push({ label: `regression/${f}`, path: path.join(regDir, f) });
    }
  }
}

if (runAll || onlyHooks) {
  const hookDir = path.join(ROOT, '.claude/hooks/__tests__');
  if (fs.existsSync(hookDir)) {
    const files = fs.readdirSync(hookDir).filter((f) => f.endsWith('.test.cjs')).sort();
    for (const f of files) {
      suites.push({ label: `hook/${f}`, path: path.join(hookDir, f) });
    }
  }
}

if (suites.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

console.log(`Running ${suites.length} test suite(s)\n`);

let passed = 0;
let failed = 0;
const failures = [];

for (const suite of suites) {
  process.stdout.write(`  [...] ${suite.label}`);
  const result = spawnSync(process.execPath, [suite.path], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.status === 0) {
    process.stdout.write(`\r  [PASS] ${suite.label}\n`);
    passed++;
  } else {
    process.stdout.write(`\r  [FAIL] ${suite.label}\n`);
    failed++;
    failures.push({ ...suite, stdout: result.stdout, stderr: result.stderr });
  }
}

console.log(`\nSummary: ${passed} passed / ${failed} failed / ${suites.length} total`);

if (failed > 0) {
  console.log('\n--- Failure output ---');
  for (const f of failures) {
    console.log(`\n  ❌ ${f.label}`);
    if (f.stdout) console.log(f.stdout.split('\n').map((l) => '    ' + l).join('\n'));
    if (f.stderr) console.log(f.stderr.split('\n').map((l) => '    ' + l).join('\n'));
  }
  process.exit(1);
}

process.exit(0);
