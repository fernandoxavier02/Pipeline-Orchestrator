'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  guardToolExecution,
  createPipelineGuardHooks,
} = require('../../src/opencode/plugin-guard.cjs');

const adaptationRoot = path.resolve(__dirname, '..', '..');
const activeRun = {
  phase: 'green',
  allowedSurfaces: [path.join(adaptationRoot, 'src', 'runtime')],
};

let result = guardToolExecution({
  activeRun,
  toolName: 'edit',
  args: { filePath: path.join(adaptationRoot, 'src', 'runtime', 'orchestrator.cjs') },
});
assert.equal(result.ok, true);

result = guardToolExecution({
  activeRun,
  toolName: 'edit',
  args: { filePath: path.join(adaptationRoot, 'README.md') },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'WRITE_OUTSIDE_ALLOWED_SCOPE');
assert.equal(result.allowedScope[0], path.join(adaptationRoot, 'src', 'runtime'));
assert.equal(result.attemptedScope, path.join(adaptationRoot, 'README.md'));

result = guardToolExecution({
  activeRun,
  toolName: 'phase.transition',
  args: { from: 'red', to: 'prompt' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'INVALID_PHASE_TRANSITION');

result = guardToolExecution({
  activeRun,
  toolName: 'task',
  args: { agentName: 'pipeline-implementer' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'DISPATCH_CONTEXT_REQUIRED');

const auditEvents = [];
const hooks = createPipelineGuardHooks({
  getActiveRun: () => activeRun,
  audit: (event) => auditEvents.push(event),
});
assert.equal(typeof hooks['tool.execute.before'], 'function');
assert.equal(typeof hooks['tool.execute.after'], 'function');

hooks['tool.execute.before']({ tool: 'edit', args: { filePath: path.join(adaptationRoot, 'src', 'runtime', 'orchestrator.cjs') } }, {});
assert.equal(auditEvents.length, 1);
assert.equal(auditEvents[0].type, 'tool.allowed');

(async () => {
  const pipelineGuardPluginModule = await import('../../.opencode/plugins/pipeline-guard.js');
  assert.equal(typeof pipelineGuardPluginModule.PipelineGuard, 'function');
  const pipelineGuardPlugin = pipelineGuardPluginModule.PipelineGuard;
  const pluginAuditEvents = [];
  const pluginHooks = await pipelineGuardPlugin({}, {
    getActiveRun: () => activeRun,
    audit: (event) => pluginAuditEvents.push(event),
  });
  const output = {};
  pluginHooks['tool.execute.before']({ tool: 'edit', args: { filePath: path.join(adaptationRoot, 'README.md') } }, output);
  assert.equal(output.error.code, 'WRITE_OUTSIDE_ALLOWED_SCOPE');
  assert.equal(pluginAuditEvents[0].type, 'tool.blocked');

  console.log('plugin guard OK');
})();
