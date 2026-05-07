'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const PC = fs.readFileSync('agents/core/pipeline-controller.md', 'utf8');

test('verify-completion is dispatched before final-validator', () => {
  const verifyIdx = PC.indexOf('Phase 3 Pre-Validator Step: verify-completion');
  const validatorIdx = PC.indexOf('final-validator (Pa de Cal)');
  assert.ok(verifyIdx > 0, 'verify-completion section missing');
  assert.ok(validatorIdx > verifyIdx, 'verify-completion should be documented BEFORE final-validator dispatch');
});

test('FAIL verdict skips Pa de Cal and logs STOP_BEFORE_PA_DE_CAL gate', () => {
  assert.match(PC, /STOP_BEFORE_PA_DE_CAL/);
  assert.match(PC, /skip Pa de Cal, set pipeline status to NO-GO/);
});

test('verify-completion output path is documented', () => {
  assert.match(PC, /pipeline-runs\/<run_id>\/03-execution\/verify-completion\.md/);
});
