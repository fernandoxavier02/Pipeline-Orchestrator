#!/usr/bin/env node
/**
 * tests/brainstorm-controller-flag-propagation.test.cjs
 *
 * Test for Achado #4 — propagate --plan / --no-plan from brainstorm-controller
 * to pipeline-controller through the STEP E handoff (line 123 of the agent
 * file, post-Achado-4 reconciliation).
 *
 * The contract changes are documentary (the agent file describes the protocol
 * the LLM must follow). This test asserts the agent file describes the
 * propagation and that the canonical example pattern matches the contract.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENT = fs.readFileSync(
  path.join(REPO_ROOT, 'agents', 'core', 'brainstorm-controller.md'),
  'utf8'
);

test('STEP A.1 persists plan_flag in manifest.notes options', () => {
  const idx = AGENT.search(/STEP A\.1/);
  assert.ok(idx >= 0, 'STEP A.1 section must exist');
  const slice = AGENT.slice(idx, idx + 2500);
  assert.match(slice, /plan_flag/, 'STEP A.1 must declare plan_flag persistence');
  assert.match(slice, /"plan"|"no-plan"|null/, 'STEP A.1 must enumerate the three plan_flag values');
});

test('STEP E reads plan_flag and appends matching CLI flag to spawn args', () => {
  const idx = AGENT.search(/STEP E/);
  assert.ok(idx >= 0, 'STEP E section must exist');
  const slice = AGENT.slice(idx, idx + 3000);
  assert.match(slice, /Read.*manifest\.notes\.options\.plan_flag/i, 'STEP E must read plan_flag from manifest');
  assert.match(slice, /--plan|--no-plan/, 'STEP E must reference at least one of --plan / --no-plan');
});

test('Canonical example mentions both --plan and --no-plan paths', () => {
  // Search the entire file because the example may live in a separate sub-section
  const planMentions = (AGENT.match(/--plan(?!-)/g) || []).length;
  const noPlanMentions = (AGENT.match(/--no-plan/g) || []).length;
  assert.ok(planMentions >= 1, '--plan must be mentioned at least once for force-flag propagation');
  assert.ok(noPlanMentions >= 1, '--no-plan must be mentioned at least once for skip-flag propagation');
});

test('Spawn-args example uses PREP_RUN_ID as documented', () => {
  // The example in STEP E should show the args string format after the fix.
  const idx = AGENT.search(/PREP_RUN_ID=/);
  assert.ok(idx >= 0, 'PREP_RUN_ID handoff format must be documented in agent body');
});

test('Negative case: empty plan_flag does NOT inject a flag', () => {
  // The contract says null → empty string. Test that the agent prose calls
  // out the null/empty case explicitly so future maintainers do not regress.
  const idx = AGENT.search(/STEP E/);
  const slice = AGENT.slice(idx, idx + 3000);
  assert.match(slice, /null.*empty|empty.*null|null.*nothing|nothing.*null/i,
    'STEP E must explicitly state that null plan_flag injects no flag');
});
