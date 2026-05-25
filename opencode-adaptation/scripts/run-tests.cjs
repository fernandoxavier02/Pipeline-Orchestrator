#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsRoot = path.join(root, 'tests');

function collectTests(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const tests = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tests.push(...collectTests(fullPath));
    } else if (/\.test\.cjs$/.test(entry.name)) {
      tests.push(fullPath);
    }
  }
  return tests.sort();
}

const tests = collectTests(testsRoot);

if (tests.length === 0) {
  console.log('No tests found');
  process.exit(0);
}

let failed = 0;
for (const testFile of tests) {
  const relative = path.relative(root, testFile);
  const result = spawnSync(process.execPath, [testFile], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status === 0) {
    console.log(`[PASS] ${relative}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${relative}`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

const passed = tests.length - failed;
console.log(`Summary: ${passed} passed / ${failed} failed / ${tests.length} total`);
process.exit(failed === 0 ? 0 : 1);
