'use strict';

const assert = require('node:assert/strict');
const { buildEmpiricalOpenCodeReport } = require('../../src/config/empirical-opencode-report.cjs');

const report = buildEmpiricalOpenCodeReport({
  versionOutput: '1.15.10',
  helpOutput: 'opencode run [message..]\nopencode plugin <module>\n--agent agent to use',
});

assert.equal(report.ok, true);
assert.equal(report.version, '1.15.10');
assert.equal(report.supported.edit.hook, 'tool.execute.before');
assert.equal(report.supported.bash.hook, 'tool.execute.before');
assert.equal(report.supported.task.hook, 'tool.execute.before');
assert.equal(report.supported.skill.hook, 'tool.execute.before');
assert.equal(report.supported.customTool.hook, 'tool.execute.before');
assert.equal(report.degraded.write.reason, 'OpenCode exposes edit permission/tooling instead of a separate write command.');
assert.equal(report.degraded.compatibilityHooks.reason, 'Observed compatibility hooks are not a replacement for official plugin hooks.');
assert.equal(report.blocked.length, 0);
assert.equal(report.gates.length, 2);
assert.equal(report.gates[0].safetyCritical, true);

const missing = buildEmpiricalOpenCodeReport({ versionOutput: '', helpOutput: '' });
assert.equal(missing.ok, false);
assert.equal(missing.blocked[0].code, 'OPENCODE_CLI_EVIDENCE_MISSING');

const partial = buildEmpiricalOpenCodeReport({
  versionOutput: '1.15.10',
  helpOutput: 'opencode run [message..]',
});
assert.equal(partial.ok, false);
assert.equal(partial.blocked[0].code, 'OPENCODE_DISCOVERY_INCOMPLETE');

console.log('empirical opencode report OK');
