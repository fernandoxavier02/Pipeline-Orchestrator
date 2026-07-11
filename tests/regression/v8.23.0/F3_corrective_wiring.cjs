#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.23.0) — INLINE_WORK_BLOCKED corrective wiring (T1.2)
// =============================================================================
// SOURCE: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §2 E1 — the
// INLINE_WORK_BLOCKED corrective-trigger landed empty (`corrective: {}`) on disk
// because nothing ever built one: lib/run-step-guard.cjs::decideGovernedAction
// never included a `corrective` key in its block return, and even where it did,
// .claude/hooks/pipeline-arm-gate.cjs rebuilt the return object without
// forwarding it. Fixed at BOTH points (T1.2), sourced from the Next-Action
// Contract SSOT (lib/next-action.cjs, T1.1/T1.1b).
//
// BDD scenarios:
//   S1 [brain-level]     run-step-guard.decideGovernedAction's block decision
//                        carries a fully-populated corrective on its own.
//   S2 [gate-level]      pipeline-arm-gate.decideArmGate's INLINE_WORK_BLOCKED
//                        block forwards that SAME corrective end to end (the
//                        exact regression this batch fixes — before the fix,
//                        the gate silently dropped it while rebuilding the
//                        return object).
//   S3 [never empty]     corrective is never `{}`/undefined/missing any field —
//                        the class of bug closed, pinned directly.
//   S4 [named agent]     when the workflow/expectedStep resolve to a real agent
//                        (FULL + 'execute'), fix_instruction names it exactly —
//                        not just the generic pipeline-controller fallback.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const { decideGovernedAction } = require(path.join(ROOT, 'lib/run-step-guard.cjs'));
const { decideArmGate } = require(path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs'));
const nextActionModule = require(path.join(ROOT, 'lib/next-action.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

function assertFullCorrective(corrective, label) {
  assert.ok(corrective && typeof corrective === 'object', `${label}: corrective must be an object, got: ${JSON.stringify(corrective)}`);
  for (const field of ['invariant_id', 'what_failed', 'what_is_missing', 'fix_instruction', 'resume_instruction']) {
    assert.equal(typeof corrective[field], 'string', `${label}: corrective.${field} must be a string`);
    assert.ok(corrective[field].length > 0, `${label}: corrective.${field} must be non-empty`);
  }
  assert.equal(corrective.blocking, true, `${label}: corrective.blocking must be true`);
}

console.log('=== F3 v8.23.0 — INLINE_WORK_BLOCKED corrective wiring (T1.2) ===');

const ACTIVE_ARM = { armPending: true, runActive: true, observedActive: true, corrupt: false };
delete process.env.PIPELINE_CHAIN_ENFORCEMENT;

// S1 — the brain itself.
record('S1 [brain-level] decideGovernedAction block carries a full corrective', () => {
  const r = decideGovernedAction({
    toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', workflowKey: 'FULL',
  });
  assert.equal(r.decision, 'block');
  assert.equal(r.invariant_id, 'INLINE_WORK_BLOCKED');
  assertFullCorrective(r.corrective, 'S1');
});

// S2 — end-to-end through the gate (the actual regression: this used to drop it).
// NOTE: decideArmGate reads ctx.trustedWorkflowKey (not ctx.workflowKey) — a
// SEPARATE field from decideGovernedAction's ctx.workflowKey, renamed on the
// gate side per adversarial review (Batch 2, architecture: name-collision risk
// against the gate's own pre-existing ctx.workflow). Both are passed here so
// this scenario exercises the SAME resolved-agent path S1 does, end to end.
record('S2 [gate-level] decideArmGate forwards the SAME corrective through to the caller', () => {
  const r = decideArmGate({ ...ACTIVE_ARM, toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', trustedWorkflowKey: 'FULL' });
  assert.equal(r.decision, 'block');
  assert.equal(r.invariant_id, 'INLINE_WORK_BLOCKED');
  assertFullCorrective(r.corrective, 'S2');
  assert.ok(r.corrective.fix_instruction.includes('pipeline-orchestrator:executor:executor-controller'),
    `S2: the gate-level corrective must resolve the exact agent too, not silently fall back to generic: ${r.corrective.fix_instruction}`);
});

// S3 — the class of bug is closed: never {} / undefined / partial, across several contexts.
record('S3 [never empty] corrective is fully populated across a spread of contexts', () => {
  const contexts = [
    { toolName: 'Bash', execWindowOpen: false, expectedStep: null, workflowKey: null },
    { toolName: 'Write', execWindowOpen: false, expectedStep: 'tdd', workflowKey: 'FULL' },
    { toolName: 'PowerShell', execWindowOpen: false, expectedStep: 'anything', workflowKey: 'DIAGNOSTIC' },
    { toolName: 'MultiEdit', execWindowOpen: false },
  ];
  for (const c of contexts) {
    const r = decideGovernedAction(c);
    assertFullCorrective(r.corrective, `S3 ctx=${JSON.stringify(c)}`);
    // decideArmGate's ctx field is named trustedWorkflowKey, not workflowKey — mirror it explicitly.
    const g = decideArmGate({ ...ACTIVE_ARM, ...c, trustedWorkflowKey: c.workflowKey });
    assertFullCorrective(g.corrective, `S3 gate ctx=${JSON.stringify(c)}`);
  }
});

// S4 — when expectedStep genuinely resolves, fix_instruction names the exact agent.
record('S4 [named agent] FULL + execute resolves fix_instruction to executor-controller exactly', () => {
  const r = decideGovernedAction({ toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', workflowKey: 'FULL' });
  assert.ok(r.corrective.fix_instruction.includes('pipeline-orchestrator:executor:executor-controller'),
    `fix_instruction must name the resolved agent exactly, got: ${r.corrective.fix_instruction}`);
});

// S5 — adversarial review finding (security, ALTO): run-step-guard.cjs's own
// header promises "PURE + deterministic; never throws" — the ENTIRE call chain
// up to the CLI entry point relies on that being literally true (the one outer
// catch-all fails OPEN, silently ALLOWING the exact inline mutation this gate
// exists to block). Prove the block decision survives even when the corrective
// builder itself throws — only the enrichment may be lost. Mocks
// resolveInlineWorkCorrective specifically (NOT resolveCorrectiveDescriptor):
// both run-step-guard.cjs and the gate's fail-safe branch now call the shared
// wrapper (adversarial review, Batch 2, architecture — duplication fix), which
// calls resolveCorrectiveDescriptor via its OWN internal closure reference, not
// through module.exports — patching the exports property would silently miss
// that internal call and this test would pass for the wrong reason.
record('S5 [never throws] a throwing corrective builder still returns a valid block, not a crash', () => {
  const original = nextActionModule.resolveInlineWorkCorrective;
  nextActionModule.resolveInlineWorkCorrective = () => { throw new Error('simulated failure inside next-action.cjs'); };
  try {
    const r = decideGovernedAction({ toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', workflowKey: 'FULL' });
    assert.equal(r.decision, 'block', 'the security decision itself must NOT be lost when corrective-building throws');
    assert.equal(r.invariant_id, 'INLINE_WORK_BLOCKED');
    assert.equal(r.corrective, undefined, 'corrective is allowed to be absent here — just never a thrown exception');

    const g = decideArmGate({ ...ACTIVE_ARM, toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', trustedWorkflowKey: 'FULL' });
    assert.equal(g.decision, 'block', 'the gate-level decision must also survive');
    assert.equal(g.invariant_id, 'INLINE_WORK_BLOCKED');
  } finally {
    nextActionModule.resolveInlineWorkCorrective = original;
  }
});

// S6 — adversarial review finding (architecture, ALTO): MARKER_TAMPERED was the
// ONLY decision:'block' in pipeline-arm-gate.cjs with no corrective at all — it
// silently fell into emitCorrectiveTrigger's `|| {}` fallback (the exact class
// of bug this batch exists to close), AND would have inherited the WRONG
// hand-written descriptor (NOT_ARMED's "no run armed" text) had it fallen
// through buildCorrectiveDescriptor's generic branch instead. Prove it now has
// its own accurate, non-empty descriptor.
record('S6 [marker tampered] a tampered arm marker gets its own accurate corrective, not NOT_ARMED\'s', () => {
  const r = decideArmGate({ armPending: true, markerTampered: true, toolName: 'Edit' });
  assert.equal(r.decision, 'block');
  assert.equal(r.invariant_id, 'MARKER_TAMPERED');
  assertFullCorrective(r.corrective, 'S6');
  assert.equal(r.corrective.invariant_id, 'MARKER_TAMPERED');
  assert.ok(!/no run armed/i.test(r.corrective.what_failed),
    `MARKER_TAMPERED must not inherit NOT_ARMED's description: ${r.corrective.what_failed}`);
  assert.ok(/re-arm|rearm/i.test(r.corrective.fix_instruction),
    `fix_instruction must point at the signed re-arm path: ${r.corrective.fix_instruction}`);
});

// S7 — adversarial review finding (architecture, MÉDIO): the fail-safe branch
// (used ONLY when lib/run-step-guard.cjs itself is unavailable — the file's own
// comment calls this "the attack TERMINAL") had ZERO test forcing that
// unavailability; every other test in this repo that touches run-step-guard
// exercises it present and working. Reproduces a REAL broken install by making
// pipeline-arm-gate.cjs's own `require('../../lib/run-step-guard.cjs')`
// resolve to a module lacking `decideGovernedAction` (no mocking of the
// decision logic itself — the fresh module re-evaluates its real top-level
// require and falls back for real).
record('S7 [fail-safe, run-step-guard unavailable] still blocks inline work AND still has a corrective', () => {
  const gatePath = require.resolve(path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs'));
  const guardPath = require.resolve(path.join(ROOT, 'lib/run-step-guard.cjs'));
  const savedGateEntry = require.cache[gatePath];
  const savedGuardEntry = require.cache[guardPath];
  delete require.cache[gatePath];
  require.cache[guardPath] = { id: guardPath, filename: guardPath, loaded: true, exports: {} };
  try {
    const freshGate = require(gatePath);
    const g = freshGate.decideArmGate({
      armPending: true, runActive: true, observedActive: true, corrupt: false,
      toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', trustedWorkflowKey: 'FULL',
    });
    assert.equal(g.decision, 'block', 'a broken run-step-guard install must NOT silently allow inline mutation');
    assert.equal(g.invariant_id, 'INLINE_WORK_BLOCKED');
    assertFullCorrective(g.corrective, 'S7');
    // The legitimate escape (reads, exec-window) must still work in this mode too.
    const allowed = freshGate.decideArmGate({
      armPending: true, runActive: true, observedActive: true, corrupt: false, toolName: 'Read',
    });
    assert.equal(allowed.decision, 'allow', 'reads must still pass even in fail-safe mode');
  } finally {
    delete require.cache[gatePath];
    delete require.cache[guardPath];
    if (savedGateEntry) require.cache[gatePath] = savedGateEntry;
    if (savedGuardEntry) require.cache[guardPath] = savedGuardEntry;
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
