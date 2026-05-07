'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const EC = fs.readFileSync('agents/executor/executor-controller.md', 'utf8');

test('executor-controller documents Per-task Step 2.5 review', () => {
  assert.match(EC, /Per-task Step 2\.5: Adversarial review/);
  assert.match(EC, /pipeline-orchestrator:review/);
});

test('review output path is per-batch numbered', () => {
  assert.match(EC, /03-execution\/batch-<NNN>\/review\.md/);
});

test('review REJECT triggers existing fix-loop with max 3 attempts', () => {
  assert.match(EC, /executor-fix.*max 3 attempts/);
});

test('review APPROVE proceeds to spec-reviewer (no parallel-skip)', () => {
  assert.match(EC, /APPROVE.*continue to spec-reviewer/);
});
