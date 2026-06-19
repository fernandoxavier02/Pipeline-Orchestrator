#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.7.0) — Step-ledger decision brain (TDD RED→GREEN).
//
// The general enforcement core: a step is allowed only when every required step
// BEFORE it in the workflow sequence has been stamped in the signed state. One
// engine for pipeline phases, spec phases, and brainstorm steps — replaces the
// prose "do these in order" with code. Written before lib/step-ledger.cjs exists.
// =============================================================================

const assert = require('node:assert/strict');
const MOD = '../../../lib/step-ledger.cjs';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const REQ = ['classify', 'info-gate', 'proposal', 'plan', 'execute', 'final'];

console.log('=== F4 v8.7.0 — step-ledger decision brain ===');

test('F4-1 — first step with nothing stamped → allow', () => {
  const { decideStep } = require(MOD);
  assert.equal(decideStep({ requiredSteps: REQ, stampedSteps: [], attemptedStep: 'classify' }).decision, 'allow');
});

test('F4-2 — step with all prereqs stamped → allow', () => {
  const { decideStep } = require(MOD);
  assert.equal(decideStep({ requiredSteps: REQ, stampedSteps: ['classify', 'info-gate'], attemptedStep: 'proposal' }).decision, 'allow');
});

test('F4-3 — step with a MISSING prereq → BLOCK (out-of-order)', () => {
  const { decideStep } = require(MOD);
  const r = decideStep({ requiredSteps: REQ, stampedSteps: ['classify'], attemptedStep: 'proposal', enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.deepEqual(r.missing, ['info-gate']);
  assert.match(r.reason, /STEP_LEDGER_VIOLATION/);
});

test('F4-4 — jumping straight to the last step → BLOCK with all gaps listed', () => {
  const { decideStep } = require(MOD);
  const r = decideStep({ requiredSteps: REQ, stampedSteps: ['classify'], attemptedStep: 'final', enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.deepEqual(r.missing, ['info-gate', 'proposal', 'plan', 'execute']);
});

test('F4-5 — ungoverned step (not in the sequence) → allow', () => {
  const { decideStep } = require(MOD);
  assert.equal(decideStep({ requiredSteps: REQ, stampedSteps: [], attemptedStep: 'something-else' }).decision, 'allow');
});

test('F4-6 — warn mode → allow + warn + missing list (escape hatch)', () => {
  const { decideStep } = require(MOD);
  const r = decideStep({ requiredSteps: REQ, stampedSteps: [], attemptedStep: 'final', enforce: 'warn' });
  assert.equal(r.decision, 'allow');
  assert.equal(r.warn, true);
  assert.ok(r.missing.length > 0);
});

test('F4-7 — malformed ctx → allow (fail-open)', () => {
  const { decideStep } = require(MOD);
  assert.equal(decideStep(null).decision, 'allow');
  assert.equal(decideStep({}).decision, 'allow');
});

test('F4-8 — manifests exist for pipeline (FULL), Spec and brainstorm', () => {
  const { STEP_MANIFESTS } = require(MOD);
  assert.ok(Array.isArray(STEP_MANIFESTS.FULL) && STEP_MANIFESTS.FULL.length > 0);
  assert.ok(Array.isArray(STEP_MANIFESTS.Spec) && STEP_MANIFESTS.Spec.length > 0);
  assert.ok(Array.isArray(STEP_MANIFESTS.brainstorm) && STEP_MANIFESTS.brainstorm.length > 0);
});

test('F4-9 — decideAgentSpawn: task-orchestrator (classify) first → allow', () => {
  const { decideAgentSpawn } = require(MOD);
  assert.equal(decideAgentSpawn({ workflowKey: 'FULL', agentType: 'pipeline-orchestrator:core:task-orchestrator', stampedSteps: [] }).decision, 'allow');
});

test('F4-10 — decideAgentSpawn: final-validator before prereqs → BLOCK', () => {
  const { decideAgentSpawn } = require(MOD);
  const r = decideAgentSpawn({ workflowKey: 'FULL', agentType: 'pipeline-orchestrator:core:final-validator', stampedSteps: ['classify'], enforce: 'deny' });
  assert.equal(r.decision, 'block');
});

test('F4-11 — decideAgentSpawn: ungoverned agent (sentinel) → allow', () => {
  const { decideAgentSpawn } = require(MOD);
  assert.equal(decideAgentSpawn({ workflowKey: 'FULL', agentType: 'pipeline-orchestrator:core:sentinel', stampedSteps: [] }).decision, 'allow');
});

test('F4-12 — decideAgentSpawn: executor-controller with all prereqs → allow', () => {
  const { decideAgentSpawn } = require(MOD);
  assert.equal(decideAgentSpawn({ workflowKey: 'FULL', agentType: 'pipeline-orchestrator:executor:executor-controller', stampedSteps: ['classify', 'info-gate', 'proposal', 'plan', 'tdd'] }).decision, 'allow');
});

console.log(`\n=== F4 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
