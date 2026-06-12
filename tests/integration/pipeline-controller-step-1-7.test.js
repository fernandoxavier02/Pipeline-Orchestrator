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

test('STEP 1.7 documents the state-write-before-spawn contract (v7.14.0 D3)', () => {
  // The controller must write sentinel-state.step_1_7 immediately after the
  // STEP 1.7 decision, BEFORE any Phase 1.5/Phase 2 spawn.
  assert.match(PC, /sentinel-state\.step_1_7\s*=\s*\{[^}]*decision[^}]*prep_run_id[^}]*timestamp[^}]*\}/);
  assert.match(PC, /BEFORE any Phase 1\.5[\s\S]*?or Phase 2[\s\S]*?spawn/);
  assert.match(PC, /buildStep17StateBlock/);
});

test('STEP 1.7 cites the closed 4-value branch vocabulary + helper (v7.14.0 D1)', () => {
  assert.match(PC, /load-existing \| dispatch-brainstorm \| no-prep-override \| simples-bypass/);
  assert.match(PC, /lib\/step-1-7-routing\.cjs/);
  assert.match(PC, /appendStep17Routing/);
});
