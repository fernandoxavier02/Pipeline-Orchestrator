'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validatePromptEvidence } = require('../../src/verification/prompt-authenticity-suite.cjs');

const adaptationRoot = path.resolve(__dirname, '..', '..');
const logPath = path.join(adaptationRoot, 'tmp', 'prompt-authenticity.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, 'real prompt output');

let result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Load skill',
    expectedOutput: 'skill loaded',
    actualOutput: 'skill loaded',
    rawLogPath: logPath,
    target: path.join(adaptationRoot, '.opencode', 'skills', 'pipeline-orchestrator', 'SKILL.md'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, true);

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Load plugin',
    expectedOutput: 'plugin loaded',
    actualOutput: 'plugin loaded',
    rawLogPath: logPath,
    target: path.join(adaptationRoot, '.opencode', 'plugins', 'pipeline-adaptation-plugin.js'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, true);

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Fake',
    expectedOutput: 'fake',
    actualOutput: 'fake',
    rawLogPath: logPath,
    target: path.join(adaptationRoot, '.opencode', 'agents', 'pipeline-validator.md'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
    fabricated: true,
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'FABRICATED_PROMPT_EVIDENCE');

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Missing log',
    expectedOutput: 'x',
    actualOutput: 'x',
    target: path.join(adaptationRoot, 'src', 'opencode', 'tool-adapter.cjs'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'PROMPT_EVIDENCE_FIELD_MISSING');
assert.equal(result.field, 'rawLogPath');

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Original target',
    expectedOutput: 'x',
    actualOutput: 'x',
    rawLogPath: logPath,
    target: path.resolve(adaptationRoot, '..', 'Pipeline-Orchestrator', 'CLAUDE.md'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'PROMPT_TARGET_NOT_ADAPTATION');

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Wrong internal target',
    expectedOutput: 'x',
    actualOutput: 'x',
    rawLogPath: logPath,
    target: path.join(adaptationRoot, 'src', 'verification', 'atdd-suite.cjs'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'PROMPT_TARGET_TYPE_NOT_ALLOWED');

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Missing raw log file',
    expectedOutput: 'x',
    actualOutput: 'x',
    rawLogPath: path.join(adaptationRoot, 'tmp', 'missing-prompt.log'),
    target: path.join(adaptationRoot, 'src', 'opencode', 'tool-adapter.cjs'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'PROMPT_RAW_LOG_MISSING');

result = validatePromptEvidence({
  type: 'prompt.recorded',
  payload: {
    prompt: 'Directory raw log',
    expectedOutput: 'x',
    actualOutput: 'x',
    rawLogPath: path.dirname(logPath),
    target: path.join(adaptationRoot, 'src', 'opencode', 'tool-adapter.cjs'),
    environment: { runtime: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    verdict: 'pass',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'PROMPT_RAW_LOG_MISSING');

console.log('prompt authenticity suite OK');
