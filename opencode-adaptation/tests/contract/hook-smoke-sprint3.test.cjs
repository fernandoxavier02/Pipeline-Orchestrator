'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  createHookSmokeHarness,
} = require('../../src/opencode/hook-smoke.cjs');
const {
  validateProtocolEventRecord,
  validateProtocolEventSequence,
} = require('../../src/validators/contract-validator.cjs');

const adaptationRoot = path.resolve(__dirname, '..', '..');
const allowedSrc = path.join(adaptationRoot, 'src');
const allowedTests = path.join(adaptationRoot, 'tests');
const outsidePath = path.resolve(adaptationRoot, '..', 'Pipeline-Orchestrator', 'plugin.js');

const preSessionHarness = createHookSmokeHarness({
  adaptationRoot,
  allowedSurfaces: [allowedSrc, allowedTests],
  authorizedAgents: ['pipeline-pre-tester'],
  expectedAgentOrder: ['pipeline-pre-tester'],
});
const preSessionPrompt = preSessionHarness.handleHook({ hook: 'UserPromptSubmit', input: { prompt: 'hello' } });
assert.equal(preSessionPrompt.ok, false);
assert.equal(preSessionPrompt.action, 'block');
assert.equal(preSessionPrompt.code, 'RUN_NOT_STARTED');
const preSessionTool = preSessionHarness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Write', path: path.join(allowedTests, 'contract', 'pre-session.test.cjs') },
});
assert.equal(preSessionTool.ok, false);
assert.equal(preSessionTool.action, 'block');
assert.equal(preSessionTool.code, 'RUN_NOT_STARTED');


const harness = createHookSmokeHarness({
  adaptationRoot,
  allowedSurfaces: [allowedSrc, allowedTests],
  authorizedAgents: ['pipeline-pre-tester', 'pipeline-implementer', 'pipeline-validator'],
  expectedAgentOrder: ['pipeline-pre-tester', 'pipeline-implementer', 'pipeline-validator'],
});

const session = harness.handleHook({ hook: 'SessionStart', input: { sessionId: 'sess-3' } });
assert.equal(session.ok, true);
assert.equal(session.action, 'allow');
assert.match(session.runId, /^run-/);
assert.equal(session.event.eventType, 'run_started');

const sensitiveTokenValue = ['raw', 'secret', '123'].join('-');
const sensitivePasswordValue = ['abc', '123'].join('');
const prompt = harness.handleHook({
  hook: 'UserPromptSubmit',
  input: {
    prompt: [
      'please proceed',
      ['to', 'ken'].join('') + '=' + sensitiveTokenValue,
      ['pass', 'word'].join('') + '=' + sensitivePasswordValue,
    ].join(' '),
  },
});
assert.equal(prompt.ok, true);
assert.equal(prompt.action, 'allow');
assert.equal(prompt.event.eventType, 'prompt_submitted');
assert.equal(JSON.stringify(prompt.protocolPayload).includes(sensitiveTokenValue), false);
assert.equal(JSON.stringify(prompt.protocolPayload).includes(sensitivePasswordValue), false);

const editBlocked = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Edit', path: outsidePath },
});
assert.equal(editBlocked.ok, false);
assert.equal(editBlocked.action, 'block');
assert.equal(editBlocked.code, 'OUT_OF_SCOPE_TOOL_USE');
assert.equal(editBlocked.event.eventType, 'tool_use_blocked');
assert.equal(editBlocked.event.severity, 'high');

const opencodeWriteBlocked = harness.handleHook({
  hook: 'PreToolUse',
  input: { tool_name: 'Write', tool_input: { file_path: outsidePath } },
});
assert.equal(opencodeWriteBlocked.ok, false);
assert.equal(opencodeWriteBlocked.action, 'block');
assert.equal(opencodeWriteBlocked.code, 'OUT_OF_SCOPE_TOOL_USE');

const writeAllowed = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Write', path: path.join(allowedTests, 'contract', 'scratch.test.cjs') },
});
assert.equal(writeAllowed.ok, true);
assert.equal(writeAllowed.action, 'allow');
assert.equal(writeAllowed.event.eventType, 'tool_use_allowed');
const missingPathWrite = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Write' },
});
assert.equal(missingPathWrite.ok, false);
assert.equal(missingPathWrite.action, 'block');
assert.equal(missingPathWrite.code, 'MISSING_TOOL_PATH');


const unauthorizedAgent = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Agent', agentName: 'random-agent' },
});
assert.equal(unauthorizedAgent.ok, false);
assert.equal(unauthorizedAgent.action, 'block');
assert.equal(unauthorizedAgent.code, 'AGENT_NOT_AUTHORIZED');
assert.equal(unauthorizedAgent.event.eventType, 'agent_blocked');

const outOfOrderAgent = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Agent', agentName: 'pipeline-implementer' },
});
assert.equal(outOfOrderAgent.ok, false);
assert.equal(outOfOrderAgent.action, 'block');
assert.equal(outOfOrderAgent.code, 'AGENT_OUT_OF_ORDER');
assert.equal(outOfOrderAgent.event.eventType, 'agent_blocked');

const firstAgent = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Agent', agentName: 'pipeline-pre-tester' },
});
assert.equal(firstAgent.ok, true);
assert.equal(firstAgent.action, 'allow');
assert.equal(firstAgent.event.eventType, 'agent_allowed');

const secondAgent = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Agent', agentName: 'pipeline-implementer' },
});
assert.equal(secondAgent.ok, true);
assert.equal(secondAgent.event.eventType, 'agent_allowed');

const thirdAgent = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Agent', agentName: 'pipeline-validator' },
});
assert.equal(thirdAgent.ok, true);
assert.equal(thirdAgent.event.eventType, 'agent_allowed');

const extraAgent = harness.handleHook({
  hook: 'PreToolUse',
  input: { toolName: 'Agent', agentName: 'pipeline-pre-tester' },
});
assert.equal(extraAgent.ok, false);
assert.equal(extraAgent.code, 'AGENT_OUT_OF_ORDER');

const unsafeStop = harness.handleHook({ hook: 'Stop', input: { finalValidatorPassed: false } });
assert.equal(unsafeStop.ok, false);
assert.equal(unsafeStop.action, 'block');
assert.equal(unsafeStop.code, 'STOP_BEFORE_PA_DE_CAL');
assert.equal(unsafeStop.event.eventType, 'stop_before_pa_de_cal_blocked');
assert.equal(unsafeStop.gateDecision.gate, 'STOP_BEFORE_PA_DE_CAL');
assert.equal(unsafeStop.gateDecision.decision, 'BLOCKED');

const events = harness.getProtocolEvents();
assert.equal(events.length, 13);
assert.deepEqual(events.map((event) => event.eventType), [
  'run_started',
  'prompt_submitted',
  'tool_use_blocked',
  'tool_use_blocked',
  'tool_use_allowed',
  'tool_use_blocked',
  'agent_blocked',
  'agent_blocked',
  'agent_allowed',
  'agent_allowed',
  'agent_allowed',
  'agent_blocked',
  'stop_before_pa_de_cal_blocked',
]);
for (const event of events) assert.equal(validateProtocolEventRecord(event).ok, true);
assert.equal(validateProtocolEventSequence(events).ok, true);

console.log('hook smoke sprint3 OK');
