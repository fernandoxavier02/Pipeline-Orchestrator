#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.23.0) — lib/next-action.cjs :: resolveNextAction SSOT (T1.1)
// =============================================================================
// SOURCE: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §4 P1 —
// every deny must hand back a guaranteed, non-empty, executable next action for
// BOTH possible readers (parent with the Agent tool, or a dispatched subagent
// with no Agent tool per Achado #7 — the two are indistinguishable from the hook
// payload alone, session_id is identical for both).
//
// BDD scenarios:
//   V1 [FULL resolvable]     workflow FULL + expectedStep 'execute' → parent_action
//                            cites the EXACT executor-controller subagent_type.
//   V2 [Spec seal]           workflow Spec + expectedStep 'seal' → parent_action
//                            cites the EXACT spec-controller subagent_type.
//   V3 [null spine]          workflow DIAGNOSTIC (agents_by_step: null) → parent_action
//                            falls back to the generic pipeline-controller FQN.
//   V4 [unknown workflow]    unrecognized/missing workflowKey → same generic fallback,
//                            never throws.
//   V5 [always non-empty]   for every scenario above (+ empty invariantId), message,
//                            parent_action and subagent_fallback_action are all
//                            non-empty strings, and the fallback always names the
//                            DISPATCH_REQUEST block (the only exit a subagent has).
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const { resolveNextAction, GENERIC_FALLBACK_FQN } = require(path.join(ROOT, 'lib/next-action.cjs'));

const EXECUTOR_FQN = 'pipeline-orchestrator:executor:executor-controller';
const SPEC_CONTROLLER_FQN = 'pipeline-orchestrator:core:spec-controller';

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

function assertAlwaysFilled(result) {
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0, 'message must be non-empty');
  assert.equal(typeof result.parent_action, 'string');
  assert.ok(result.parent_action.length > 0, 'parent_action must be non-empty');
  assert.equal(typeof result.subagent_fallback_action, 'string');
  assert.ok(result.subagent_fallback_action.length > 0, 'subagent_fallback_action must be non-empty');
  assert.ok(result.subagent_fallback_action.includes('DISPATCH_REQUEST'),
    'subagent_fallback_action must name the DISPATCH_REQUEST block (the only exit a subagent has)');
}

console.log('=== F1 v8.23.0 — lib/next-action.cjs resolveNextAction SSOT ===');

// V1 — FULL workflow, resolvable expected step → exact executor-controller FQN.
record('V1 [FULL resolvable] expectedStep=execute → parent_action cites executor-controller exact subagent_type', () => {
  const r = resolveNextAction({ invariantId: 'INLINE_WORK_BLOCKED', ctx: { workflowKey: 'FULL', expectedStep: 'execute' } });
  assertAlwaysFilled(r);
  assert.ok(r.parent_action.includes(EXECUTOR_FQN), `parent_action must include ${EXECUTOR_FQN}, got: ${r.parent_action}`);
  assert.ok(r.subagent_fallback_action.includes(EXECUTOR_FQN), 'subagent fallback must target the same resolved FQN');
});

// V2 — Spec workflow, 'seal' step → exact spec-controller FQN.
record("V2 [Spec seal] workflow=Spec expectedStep=seal → parent_action cites spec-controller exact subagent_type", () => {
  const r = resolveNextAction({ invariantId: 'SPEC_AUTHORING_INCOMPLETE', ctx: { workflowKey: 'Spec', expectedStep: 'seal' } });
  assertAlwaysFilled(r);
  assert.ok(r.parent_action.includes(SPEC_CONTROLLER_FQN), `parent_action must include ${SPEC_CONTROLLER_FQN}, got: ${r.parent_action}`);
});

// V3 — null-spine workflow (DIAGNOSTIC has agents_by_step: null, GAP-02) → generic fallback.
record('V3 [null spine] workflow=DIAGNOSTIC (agents_by_step: null) → generic pipeline-controller fallback', () => {
  const r = resolveNextAction({ invariantId: 'PROTOCOL_HANDSHAKE_TIMEOUT', ctx: { workflowKey: 'DIAGNOSTIC', expectedStep: 'anything' } });
  assertAlwaysFilled(r);
  assert.ok(r.parent_action.includes(GENERIC_FALLBACK_FQN), `parent_action must include the generic fallback ${GENERIC_FALLBACK_FQN}, got: ${r.parent_action}`);
});

// V4 — unknown / missing workflowKey never throws and still falls back generically.
record('V4 [unknown workflow] missing ctx entirely → generic fallback, never throws', () => {
  const r1 = resolveNextAction({ invariantId: 'NOT_ARMED' });
  assertAlwaysFilled(r1);
  assert.ok(r1.parent_action.includes(GENERIC_FALLBACK_FQN));

  const r2 = resolveNextAction({ invariantId: 'CORRUPT_STATE', ctx: { workflowKey: 'not-a-real-workflow', expectedStep: 'execute' } });
  assertAlwaysFilled(r2);
  assert.ok(r2.parent_action.includes(GENERIC_FALLBACK_FQN));

  const r3 = resolveNextAction();
  assertAlwaysFilled(r3);
});

// V5 — every scenario tested (incl. an empty/garbage invariantId) always returns
// all three fields non-empty — the contract this whole module exists to guarantee.
record('V5 [always non-empty] empty invariantId + garbage ctx never produces an empty/missing field', () => {
  const scenarios = [
    { invariantId: '', ctx: {} },
    { invariantId: undefined, ctx: { workflowKey: 'FULL', expectedStep: 'tdd' } },
    { invariantId: 'X', ctx: { workflowKey: 'brainstorm', expectedStep: null } },
    { invariantId: 'Y', ctx: { workflowKey: 'REVIEW-ONLY' } },
    { invariantId: 'Z', ctx: null },
  ];
  for (const s of scenarios) assertAlwaysFilled(resolveNextAction(s));
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
