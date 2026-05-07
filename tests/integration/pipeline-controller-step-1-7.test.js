'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const PC = fs.readFileSync('agents/core/pipeline-controller.md', 'utf8');

test('STEP 1.7 section exists', () => {
  assert.match(PC, /## STEP 1\.7: PRE-EXECUTION ROUTING/);
});

test('STEP 1.7 documents the PREP_RUN_ID branch', () => {
  assert.match(PC, /IF arguments contain "PREP_RUN_ID=/);
  assert.match(PC, /pipeline-runs\/<slug>\/manifest\.yaml/);
});

test('STEP 1.7 documents the MEDIA/COMPLEXA/Spec branch', () => {
  assert.match(PC, /complexity in \{MEDIA, COMPLEXA\} OR type == "Spec"/);
  assert.match(PC, /Spawn agents\/core\/brainstorm-controller/);
});

test('STEP 1.7 documents the --no-prep escape hatch', () => {
  assert.match(PC, /--no-prep/);
  assert.match(PC, /no-prep-overrides\.jsonl/);
});

test('STEP 1.7 documents the SIMPLES bypass', () => {
  assert.match(PC, /SIMPLES, no Spec type/);
  assert.match(PC, /Continue to STEP 2 \(no brainstorm\)/);
});

test('STEP 1.7 logs STEP_1_7_ROUTING gate', () => {
  assert.match(PC, /STEP_1_7_ROUTING/);
  assert.match(PC, /hardness: HARD/);
});
