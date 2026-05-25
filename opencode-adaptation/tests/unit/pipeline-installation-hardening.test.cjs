'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createPipelineGuardHooks } = require('../../src/opencode/plugin-guard.cjs');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const adaptationRoot = path.resolve(__dirname, '..', '..');
const localPluginPath = path.join(repoRoot, '.opencode', 'plugins', 'pipeline-guard.js');
const globalRoot = path.join(process.env.USERPROFILE || 'C:\\Users\\win', '.config', 'opencode');
const globalPluginPath = path.join(globalRoot, 'plugins', 'pipeline-guard.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

for (const pluginPath of [localPluginPath, globalPluginPath]) {
  const source = readText(pluginPath);
  assert.equal(source.includes('opencode-adaptation'), false, `${pluginPath} must not depend on the adaptation workspace path`);
  assert.equal(source.includes('D:\\Pipeline Orchestrator Claude'), false, `${pluginPath} must not contain the project absolute path`);
}

(async () => {
  const localModule = await import(pathToFileURL(localPluginPath).href + `?t=${Date.now()}`);
  assert.equal(typeof (localModule.PipelineGuard || localModule.default), 'function');

  const globalModule = require(globalPluginPath);
  assert.equal(typeof globalModule, 'function');

  const activeRun = {
    phase: 'green',
    allowedSurfaces: [path.join(adaptationRoot, 'src', 'runtime')],
  };
  const auditEvents = [];
  const firstHooks = createPipelineGuardHooks({
    getActiveRun: () => activeRun,
    audit: (event) => auditEvents.push({ source: 'first', ...event }),
  });
  const secondHooks = createPipelineGuardHooks({
    getActiveRun: () => activeRun,
    audit: (event) => auditEvents.push({ source: 'second', ...event }),
  });
  const output = {};
  const blockedInput = { tool: 'edit', args: { filePath: path.join(adaptationRoot, 'README.md') } };
  firstHooks['tool.execute.before'](blockedInput, output);
  secondHooks['tool.execute.before'](blockedInput, output);
  assert.equal(output.error.code, 'WRITE_OUTSIDE_ALLOWED_SCOPE');
  assert.equal(auditEvents.filter((event) => event.type === 'tool.blocked').length, 1, 'duplicate guard hooks must not duplicate block audit events');

  const inactiveAuditEvents = [];
  const inactiveHooks = createPipelineGuardHooks({
    getActiveRun: () => null,
    audit: (event) => inactiveAuditEvents.push(event),
  });
  const activeHooks = createPipelineGuardHooks({
    getActiveRun: () => activeRun,
    audit: (event) => inactiveAuditEvents.push(event),
  });
  const inactiveFirstOutput = {};
  inactiveHooks['tool.execute.before'](blockedInput, inactiveFirstOutput);
  activeHooks['tool.execute.before'](blockedInput, inactiveFirstOutput);
  assert.equal(inactiveFirstOutput.error.code, 'WRITE_OUTSIDE_ALLOWED_SCOPE');
  assert.equal(inactiveAuditEvents.filter((event) => event.type === 'tool.blocked').length, 1, 'inactive duplicate hook must not mask the active hook');

  const afterAuditEvents = [];
  const afterHooksA = createPipelineGuardHooks({ getActiveRun: () => activeRun, audit: (event) => afterAuditEvents.push(event) });
  const afterHooksB = createPipelineGuardHooks({ getActiveRun: () => activeRun, audit: (event) => afterAuditEvents.push(event) });
  const completedInput = { tool: 'edit' };
  afterHooksA['tool.execute.after'](completedInput);
  afterHooksB['tool.execute.after'](completedInput);
  assert.equal(afterAuditEvents.filter((event) => event.type === 'tool.completed').length, 1, 'duplicate after hooks must not duplicate completion audit events');
  for (const [scope, manifestPath, expectedRoot] of [
    ['local', path.join(repoRoot, '.opencode', 'pipeline-orchestrator-install.manifest.json'), repoRoot],
    ['global', path.join(globalRoot, 'pipeline-orchestrator-install.manifest.json'), globalRoot],
  ]) {
    assert.equal(fs.existsSync(manifestPath), true, `${scope} manifest must exist`);
    const manifest = JSON.parse(readText(manifestPath));
    assert.equal(manifest.name, 'pipeline-orchestrator-opencode-install');
    assert.equal(typeof manifest.version, 'string');
    assert.equal(typeof manifest.installedAt, 'string');
    assert.equal(manifest.scope, scope);
    assert.equal(typeof manifest.source, 'string');
    assert.ok(Array.isArray(manifest.files));
    assert.ok(manifest.files.length > 0);
    assert.ok(manifest.files.every((entry) => typeof entry.relativePath === 'string'));
    assert.ok(manifest.files.every((entry) => {
      const relative = path.relative(path.resolve(expectedRoot), path.resolve(expectedRoot, entry.relativePath));
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }));
    assert.ok(!JSON.stringify(manifest).includes('D:'));
    assert.ok(!JSON.stringify(manifest).includes('C:\\\\Users\\\\win'));
    const configEntry = manifest.files.find((entry) => entry.relativePath === 'opencode.json');
    if (configEntry) assert.equal(configEntry.uninstall, 'manual-merge');
  }

  console.log('pipeline installation hardening OK');
})();
