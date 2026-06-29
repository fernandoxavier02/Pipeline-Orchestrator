#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.19.0) — SSOT: spec-controller becomes the one governed terminal leaf of
// the Spec workflow (REQ-B1, NFR-7). Pure-brain contract test over
// lib/contracts/workflow-manifest.cjs — no I/O.
//
// EXPECTED RED (before T1.2): the Spec workflow is the all-null entry, so
//   - stepForAgentType('Spec','spec-controller')  → null   (want 'seal')
//   - resultRequired('Spec','seal')               → false  (want true)
//   - isGovernedLeaf('spec-controller')           → false  (want true)
//   - governed-leaf count                         → 9      (want 10)
// EXPECTED GREEN (after T1.2): the single-leaf Spec spine governs only 'seal'.
//
// PARITY GUARD (never RED): the FULL spine/map/obligations are byte-unchanged —
// the single-leaf Spec addition must not touch FULL (the manifest↔step-ledger
// lockstep stays green). Anti-deadlock: a transition OUTSIDE ['seal'] still allows.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const manifest = require(path.join(ROOT, 'lib/contracts/workflow-manifest.cjs'));

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F1 v8.19.0 — Spec workflow governs spec-controller at seal ===');

// ---- the new governed Spec leaf (RED until T1.2) ----------------------------
check('stepForAgentType(Spec, spec-controller) === "seal"', () => {
  assert.equal(manifest.stepForAgentType('Spec', 'spec-controller'), 'seal');
});

check('resultRequired(Spec, seal) === true', () => {
  assert.equal(manifest.resultRequired('Spec', 'seal'), true);
});

check('evidenceRequired(Spec, seal) === false', () => {
  assert.equal(manifest.evidenceRequired('Spec', 'seal'), false);
});

check('isGovernedLeaf(spec-controller) === true', () => {
  assert.equal(manifest.isGovernedLeaf('spec-controller'), true);
});

check('governed-leaf count === 10 (the 9 FULL leaves + spec-controller)', () => {
  // Collect every distinct agent named in any workflow spine, then keep the ones
  // the manifest itself calls a governed leaf.
  const all = new Set();
  for (const key of Object.keys(manifest.WORKFLOWS)) {
    const wf = manifest.WORKFLOWS[key];
    if (wf && wf.agents_by_step) {
      for (const step of Object.keys(wf.agents_by_step)) {
        for (const a of wf.agents_by_step[step]) all.add(a);
      }
    }
  }
  const governed = [...all].filter((a) => manifest.isGovernedLeaf(a));
  assert.equal(governed.length, 10, `expected 10 governed leaves, got ${governed.length}: ${governed.sort().join(', ')}`);
  assert.ok(governed.includes('spec-controller'), 'spec-controller must be among the governed leaves');
});

// ---- FULL spine byte-unchanged (parity guard — never RED) -------------------
check('FULL spine / agents_by_step / obligations are byte-unchanged', () => {
  const FULL = manifest.WORKFLOWS.FULL;
  assert.deepStrictEqual(FULL.steps,
    ['classify', 'info-gate', 'proposal', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final']);
  assert.deepStrictEqual(FULL.agents_by_step, {
    classify: ['task-orchestrator'],
    'info-gate': ['information-gate'],
    plan: ['plan-architect'],
    tdd: ['quality-gate-router', 'pre-tester'],
    execute: ['executor-controller'],
    adversarial: ['review-orchestrator'],
    sanity: ['sanity-checker'],
    final: ['final-validator'],
  });
  assert.deepStrictEqual(FULL.step_obligations, {
    classify:    { result_required: true,  evidence_required: false },
    'info-gate': { result_required: true,  evidence_required: false },
    proposal:    { result_required: false, evidence_required: false },
    plan:        { result_required: true,  evidence_required: false },
    tdd:         { result_required: true,  evidence_required: true  },
    execute:     { result_required: true,  evidence_required: true  },
    adversarial: { result_required: true,  evidence_required: true  },
    sanity:      { result_required: true,  evidence_required: true  },
    final:       { result_required: true,  evidence_required: false },
  });
  assert.deepStrictEqual(FULL.terminal_states,
    ['completed', 'hard_failed', 'aborted_by_user', 'cancelled']);
});

// ---- anti-deadlock: a step OUTSIDE ['seal'] still allows any transition ------
check('isTransitionAllowed(Spec, x, y) === true for steps outside ["seal"] (anti-deadlock)', () => {
  assert.equal(manifest.isTransitionAllowed('Spec', 'intake', 'design'), true);
  assert.equal(manifest.isTransitionAllowed('Spec', 'design', 'intake'), true);
  assert.equal(manifest.isTransitionAllowed('Spec', 'whatever', 'seal'), true);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
