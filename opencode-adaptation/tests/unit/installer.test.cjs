'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installArtifacts } = require('../../src/install/installer.cjs');

const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-install-source-'));
const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-install-target-'));
fs.mkdirSync(path.join(sourceRoot, '.opencode', 'skills', 'demo'), { recursive: true });
fs.writeFileSync(path.join(sourceRoot, '.opencode', 'skills', 'demo', 'SKILL.md'), 'demo');

let result = installArtifacts({
  sourceRoot,
  targetRoot,
  adaptationRoot: targetRoot,
  artifacts: [{ relativePath: '.opencode/skills/demo/SKILL.md' }],
  protectedRoots: [path.join(os.tmpdir(), 'protected-original')],
});

assert.equal(result.ok, true);
assert.equal(fs.existsSync(path.join(targetRoot, '.opencode', 'skills', 'demo', 'SKILL.md')), true);
assert.equal(fs.existsSync(result.manifestPath), true);

const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
assert.equal(manifest.artifacts.length, 1);
assert.equal(manifest.artifacts[0].relativePath, '.opencode/skills/demo/SKILL.md');
assert.equal(manifest.artifacts[0].owner, 'opencode-adaptation');

const protectedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'protected-original-'));
result = installArtifacts({
  sourceRoot,
  targetRoot: protectedRoot,
  adaptationRoot: protectedRoot,
  artifacts: [{ relativePath: '.opencode/skills/demo/SKILL.md' }],
  protectedRoots: [protectedRoot],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'INSTALL_TARGET_PROTECTED');

const indirectProtectedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'protected-indirect-'));
const indirectParent = path.dirname(indirectProtectedRoot);
const indirectRelative = path.join(path.basename(indirectProtectedRoot), 'adapter', '.opencode', 'skills', 'demo', 'SKILL.md');
fs.mkdirSync(path.dirname(path.join(sourceRoot, indirectRelative)), { recursive: true });
fs.writeFileSync(path.join(sourceRoot, indirectRelative), 'demo');
result = installArtifacts({
  sourceRoot,
  targetRoot: indirectParent,
  adaptationRoot: path.join(indirectProtectedRoot, 'adapter'),
  artifacts: [{ relativePath: indirectRelative }],
  protectedRoots: [indirectProtectedRoot],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'INSTALL_TARGET_PROTECTED');

const manifestOutsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-outside-'));
const manifestAdapter = path.join(manifestOutsideRoot, 'adapter');
fs.mkdirSync(path.join(sourceRoot, 'adapter', '.opencode', 'skills', 'demo'), { recursive: true });
fs.writeFileSync(path.join(sourceRoot, 'adapter', '.opencode', 'skills', 'demo', 'SKILL.md'), 'demo');
result = installArtifacts({
  sourceRoot,
  targetRoot: manifestOutsideRoot,
  adaptationRoot: manifestAdapter,
  artifacts: [{ relativePath: 'adapter/.opencode/skills/demo/SKILL.md' }],
  protectedRoots: [],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'MANIFEST_OUTSIDE_ADAPTATION');

console.log('installer OK');
