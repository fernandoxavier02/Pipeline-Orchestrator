'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function assertExists(relativePath) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `Expected ${relativePath} to exist`
  );
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

assertExists('package.json');
assertExists('scripts/run-tests.cjs');

for (const relativePath of [
  'src/types/index.cjs',
  'src/config/index.cjs',
  'src/state/index.cjs',
  'src/validators/index.cjs',
  'src/runtime/index.cjs',
  'src/opencode/plugins/index.js',
  'src/opencode/agents/README.md',
  'src/opencode/skills/README.md',
  'src/opencode/tools/index.js',
  'opencode.json',
  'src/install/index.cjs',
  'tests/contract/.gitkeep',
  'tests/integration/.gitkeep',
  'tests/prompt-fixtures/.gitkeep',
  'tests/adversarial-fixtures/.gitkeep',
]) {
  assertExists(relativePath);
}

const pkg = readJson('package.json');
assert.equal(pkg.name, 'pipeline-orchestrator-opencode-adaptation');
assert.equal(pkg.private, true);
assert.equal(pkg.type, 'commonjs');
assert.equal(pkg.scripts.test, 'node scripts/run-tests.cjs');
assert.equal(fs.existsSync(path.join(root, '.opencode', 'opencode.json')), false);
assert.equal(fs.existsSync(path.join(root, 'src', 'opencode', 'config', 'opencode.json')), false);

console.log('foundation scaffold OK');
