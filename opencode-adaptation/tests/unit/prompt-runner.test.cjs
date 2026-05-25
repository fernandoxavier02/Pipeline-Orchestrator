'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { readEvidence } = require('../../src/state/evidence-writer.cjs');
const { runPrompt } = require('../../src/runtime/prompt-runner.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-prompt-'));
const run = startRun({
  stateRoot,
  prompt: 'prompt runner',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'actual output',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
});

let result = runPrompt({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  prompt: 'Say actual output',
  expectedOutput: 'actual output',
  target: path.resolve(__dirname, '..', '..'),
  environment: { runtime: 'test' },
  execute: () => ({ actualOutput: 'actual output', rawLog: 'actual output', fabricated: false }),
});

assert.equal(result.ok, true);
assert.equal(result.verdict, 'pass');
assert.equal(fs.existsSync(result.rawLogPath), true);

const events = readEvidence({ stateRoot, runId: run.runId });
assert.equal(events.length, 1);
assert.equal(events[0].type, 'prompt.recorded');
assert.equal(events[0].payload.prompt, 'Say actual output');
assert.equal(events[0].payload.actualOutput, 'actual output');
assert.equal(events[0].payload.target, path.resolve(__dirname, '..', '..'));
assert.equal(typeof events[0].payload.timestamp, 'string');

result = runPrompt({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  prompt: 'bad',
  expectedOutput: 'bad',
  target: path.resolve(__dirname, '..', '..', '..', 'Pipeline-Orchestrator'),
  environment: { runtime: 'test' },
  execute: () => ({ actualOutput: 'bad', rawLog: 'bad', fabricated: false }),
});
assert.equal(result.ok, false);
assert.equal(result.code, 'PROTECTED_ORIGINAL_TARGET');

result = runPrompt({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  prompt: 'external',
  expectedOutput: 'external',
  target: fs.mkdtempSync(path.join(os.tmpdir(), 'outside-target-')),
  environment: { runtime: 'test' },
  execute: () => ({ actualOutput: 'external', rawLog: 'external', fabricated: false }),
});
assert.equal(result.ok, false);
assert.equal(result.code, 'TARGET_OUTSIDE_ADAPTATION');

let executeCalled = false;
result = runPrompt({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  prompt: 'fake',
  expectedOutput: 'fake',
  target: path.resolve(__dirname, '..', '..'),
  environment: { runtime: 'test' },
  fabricated: true,
  execute: () => {
    executeCalled = true;
    return { actualOutput: 'fake', rawLog: 'fake', fabricated: true };
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'FABRICATED_PROMPT_REJECTED');
assert.equal(executeCalled, false);

console.log('prompt runner OK');
