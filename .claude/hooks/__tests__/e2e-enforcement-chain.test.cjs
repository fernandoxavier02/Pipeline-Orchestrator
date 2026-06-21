#!/usr/bin/env node
'use strict';

// =============================================================================
// e2e-enforcement-chain.test.cjs — enforcement-audit combined E2E
//
// Composes the REAL hook processes + the REAL ordering decision lib to prove the
// end-to-end guarantee the audit fixes deliver, WITHOUT a live Claude session:
//
//   Scenario A (DoD#6): a governed agent that returns NO usable result does not
//   get its step stamped (step-ledger-stamp process), AND the very same step
//   ledger then makes the gate's decision lib (ledger.decideAgentSpawn — exactly
//   what step-ledger-gate.cjs calls) DENY the next phase. => a no-op agent cannot
//   unlock the next phase.
//
//   Scenario B: the same agent WITH a usable result stamps its step, and the gate
//   decision then ALLOWS the next phase. => real work advances.
//
//   Scenario C (DoD#12): an AskUserQuestion turn is recorded as a HUMAN_GATE in
//   gate-decisions.jsonl by the human-gate-record process, carrying the real
//   tool_use_id + answer. => the human decision is auditable from the real result.
//
// The live, full-runtime E2E (claude --plugin-dir spawning real subagents) needs
// an authenticated session and is delivered as a manual script in the audit
// report — NOT claimed as passing here.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '..');
const STAMP = path.join(HOOKS, 'step-ledger-stamp.cjs');
const HUMAN = path.join(HOOKS, 'human-gate-record.cjs');
const ledger = require('../../../lib/step-ledger.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-enf-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function seed(dir, obj) { fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(obj, null, 2)); }
function state(dir) { return JSON.parse(fs.readFileSync(path.join(dir, 'sentinel-state.json'), 'utf8')); }
function runHook(hook, dir, payload) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir },
  });
}
// The exact call step-ledger-gate.cjs makes (lib/step-ledger.cjs::decideAgentSpawn).
function gateDecision(st, agentFqn) {
  return ledger.decideAgentSpawn({
    workflowKey: st.workflow_key || (st.task_type === 'Spec' ? 'Spec' : 'FULL'),
    agentType: agentFqn,
    stampedSteps: Array.isArray(st.step_ledger) ? st.step_ledger : [],
    enforce: 'deny',
  }).decision;
}

const TASK_ORCH = 'pipeline-orchestrator:core:task-orchestrator';
const INFO_GATE = 'pipeline-orchestrator:core:information-gate';

console.log('=== E2E enforcement chain (stamp process + real gate decision lib) ===');

test('A — a no-result agent does NOT stamp, and the gate then DENIES the next phase', (dir) => {
  seed(dir, { run_id: 'e2e', pipeline_active: true, task_type: 'Bug Fix', step_ledger: [] });
  // The first phase agent returns with NO usable result (no-op / failed / background).
  const r = runHook(STAMP, dir, { tool_name: 'Agent', tool_input: { subagent_type: TASK_ORCH }, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const st = state(dir);
  assert.deepEqual(st.step_ledger, [], 'no-op agent must not advance the ledger (DoD#6)');
  // Therefore the gate denies the NEXT phase agent (classify prerequisite missing).
  assert.equal(gateDecision(st, INFO_GATE), 'block', 'next phase must be DENIED while step 1 is unproven');
});

test('B — the same agent WITH a result stamps, and the gate then ALLOWS the next phase', (dir) => {
  seed(dir, { run_id: 'e2e', pipeline_active: true, task_type: 'Bug Fix', step_ledger: [] });
  const r = runHook(STAMP, dir, { tool_name: 'Agent', tool_input: { subagent_type: TASK_ORCH }, tool_response: { ok: true }, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const st = state(dir);
  assert.deepEqual(st.step_ledger, ['classify'], 'real work advances the ledger');
  assert.equal(gateDecision(st, INFO_GATE), 'allow', 'next phase allowed once step 1 is proven');
});

test('C — an AskUserQuestion turn is recorded as an auditable HUMAN_GATE (DoD#12)', (dir) => {
  seed(dir, { run_id: 'e2e', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  const r = runHook(HUMAN, dir, {
    tool_name: 'AskUserQuestion', tool_use_id: 'tu_e2e_1',
    tool_response: { choice: 'Proceed with plan' }, cwd: dir,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = fs.readFileSync(path.join(dir, 'gate-decisions.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const hg = lines.find((e) => e.gate === 'HUMAN_GATE');
  assert.ok(hg, 'a HUMAN_GATE entry must be recorded');
  assert.equal(hg.decided_by, 'user');
  assert.match(String(hg.detail), /tu_e2e_1/, 'correlated by the real tool_use_id');
  assert.match(String(hg.detail), /Proceed with plan/, 'carries the real answer');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
