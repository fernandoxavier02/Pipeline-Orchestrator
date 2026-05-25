'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uninstallArtifacts } = require('../../src/install/uninstaller.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-uninstall-'));
const owned = path.join(root, '.opencode', 'skills', 'demo', 'SKILL.md');
const external = path.join(root, '.opencode', 'skills', 'external', 'SKILL.md');
fs.mkdirSync(path.dirname(owned), { recursive: true });
fs.mkdirSync(path.dirname(external), { recursive: true });
fs.writeFileSync(owned, 'owned');
fs.writeFileSync(external, 'external');

const manifestPath = path.join(root, 'install-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({
  artifacts: [{ relativePath: '.opencode/skills/demo/SKILL.md', owner: 'opencode-adaptation' }],
}, null, 2));

let result = uninstallArtifacts({ root, manifestPath });
assert.equal(result.ok, true);
assert.equal(fs.existsSync(owned), false);
assert.equal(fs.existsSync(external), true);
assert.equal(result.removed.length, 1);

fs.writeFileSync(manifestPath, JSON.stringify({
  artifacts: [{ relativePath: '../outside.txt', owner: 'opencode-adaptation' }],
}, null, 2));
result = uninstallArtifacts({ root, manifestPath });
assert.equal(result.ok, false);
assert.equal(result.code, 'UNINSTALL_TARGET_OUTSIDE_ROOT');


const newRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-uninstall-new-'));
const pipelineOwned = path.join(newRoot, 'plugins', 'pipeline-guard.js');
const mergedConfig = path.join(newRoot, 'opencode.json');
fs.mkdirSync(path.dirname(pipelineOwned), { recursive: true });
fs.writeFileSync(pipelineOwned, 'owned');
fs.writeFileSync(mergedConfig, '{"shell":"powershell"}');
const newManifestPath = path.join(newRoot, 'pipeline-orchestrator-install.manifest.json');
fs.writeFileSync(newManifestPath, JSON.stringify({
  files: [
    { relativePath: 'plugins/pipeline-guard.js', owner: 'pipeline-orchestrator-opencode-adaptation', uninstall: 'delete' },
    { relativePath: 'opencode.json', owner: 'pipeline-orchestrator-opencode-adaptation', uninstall: 'manual-merge' },
  ],
}, null, 2));
result = uninstallArtifacts({ root: newRoot, manifestPath: newManifestPath });
assert.equal(result.ok, true);
assert.equal(fs.existsSync(pipelineOwned), false);
assert.equal(fs.existsSync(mergedConfig), true);
assert.deepEqual(result.skipped, ['opencode.json']);
console.log('uninstaller OK');
