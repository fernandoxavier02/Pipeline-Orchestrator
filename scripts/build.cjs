#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

for (const [name, target] of Object.entries(pkg.exports || {})) {
  if (name === './package.json') continue;
  const targetPath = path.join(ROOT, target);
  if (!fs.existsSync(targetPath)) {
    console.error(`Build contract failed: export ${name} points to missing ${target}`);
    process.exit(1);
  }
}

require(path.join(ROOT, 'lib', 'index.cjs'));
require(path.join(ROOT, 'lib', 'codex-operational-runtime.cjs'));

console.log('build ok');
