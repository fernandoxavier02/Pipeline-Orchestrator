'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planInstall, MANIFEST_RELATIVE_PATH } = require('../../src/install/dry-run.cjs');

const adaptationRoot = path.resolve(__dirname, '..', '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-install-'));
const targetProjectRoot = path.join(tmpRoot, 'consumer-project');
fs.mkdirSync(targetProjectRoot, { recursive: true });

const plan = planInstall({
  targetProjectRoot,
  adaptationRoot,
  requestedVersion: '0.1.0',
});

assert.equal(plan.mode, 'dry-run');
assert.equal(plan.writesToDisk, false);
assert.equal(plan.existingVersion, null);
assert.equal(plan.replacementRequiresConfirmation, false);
assert.ok(plan.operations.length >= 6);
assert.ok(plan.operations.every((operation) => operation.status === 'planned'));
assert.ok(plan.operations.some((operation) => operation.relativePath === '.opencode/skills'));
assert.ok(plan.operations.some((operation) => operation.relativePath === '.opencode/plugins'));
assert.ok(plan.operations.some((operation) => operation.relativePath === 'opencode.json'));
assert.equal(plan.operations.some((operation) => operation.relativePath === '.opencode/opencode.json'), false);
assert.ok(plan.operations.some((operation) => operation.relativePath === MANIFEST_RELATIVE_PATH));
assert.equal(fs.existsSync(path.join(targetProjectRoot, '.opencode')), false);

const manifestPath = path.join(targetProjectRoot, MANIFEST_RELATIVE_PATH);
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify({ version: '0.0.1' }));

const replacementPlan = planInstall({
  targetProjectRoot,
  adaptationRoot,
  requestedVersion: '0.1.0',
});
assert.equal(replacementPlan.existingVersion, '0.0.1');
assert.equal(replacementPlan.replacementRequiresConfirmation, true);

const classifiedTargetRoot = path.join(tmpRoot, 'classified-project');
fs.mkdirSync(path.join(classifiedTargetRoot, '.opencode', 'plugins'), { recursive: true });
fs.mkdirSync(path.join(classifiedTargetRoot, '.opencode'), { recursive: true });
fs.writeFileSync(path.join(classifiedTargetRoot, '.opencode', 'skills'), 'not a directory');

const classifiedPlan = planInstall({
  targetProjectRoot: classifiedTargetRoot,
  adaptationRoot,
  requestedVersion: '0.1.0',
});
const byPath = new Map(classifiedPlan.operations.map((operation) => [
  operation.relativePath,
  operation,
]));
assert.equal(byPath.get('.opencode/agents').action, 'create');
assert.equal(byPath.get('.opencode/plugins').action, 'replace');
assert.equal(byPath.get('opencode.json').action, 'create');
assert.equal(byPath.get('.opencode/skills').action, 'refuse');
assert.equal(byPath.get('.opencode/skills').status, 'refused');
assert.match(byPath.get('.opencode/skills').reason, /expected directory/i);

console.log('installer dry-run OK');
