'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { validateAgentDirectory } = require('../../src/opencode/agent-validator.cjs');

const root = path.resolve(__dirname, '..', '..');
const result = validateAgentDirectory({
  root,
  agentNames: [
    'pipeline-run-orchestrator',
    'pipeline-information-gate',
    'pipeline-planner',
    'pipeline-pre-tester',
    'pipeline-implementer',
    'pipeline-validator',
    'pipeline-adversarial-security',
    'pipeline-adversarial-architecture',
    'pipeline-adversarial-quality',
  ],
});

assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
assert.equal(result.agents.length, 9);

for (const agent of result.agents) {
  assert.equal(agent.mode, 'subagent');
  assert.equal(typeof agent.description, 'string');
  assert.equal(agent.description.length > 0, true);
  assert.equal(agent.body.includes('Role:'), true);
  assert.equal(agent.body.includes('Evidence:'), true);
}

const adversarial = result.agents.filter((agent) => agent.name.includes('adversarial'));
assert.equal(adversarial.length, 3);
for (const agent of adversarial) {
  assert.equal(agent.permission.edit, 'deny');
  assert.equal(agent.permission.bash, 'deny');
}

const implementer = result.agents.find((agent) => agent.name === 'pipeline-implementer');
assert.equal(implementer.permission.edit, 'allow');

console.log('opencode agents OK');
