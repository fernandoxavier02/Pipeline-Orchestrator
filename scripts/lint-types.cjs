#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const files = [
  'lib/index.cjs',
  'lib/codex-operational-runtime.cjs',
  'scripts/run-tests.cjs',
  'scripts/build.cjs',
];

for (const rel of files) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.error(`Missing required runtime file: ${rel}`);
    process.exit(1);
  }
  const source = fs.readFileSync(file, 'utf8').replace(/^#![^\n]*\n/, '');
  new Function(source);
}

console.log(`lint:types ok (${files.length} CommonJS files parsed)`);
