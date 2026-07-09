#!/usr/bin/env node
'use strict';

// =============================================================================
// F7 (v8.23.0) — lib/audit-read-budget.cjs: no self-write recipe + fallback (Batch 3)
// =============================================================================
// SOURCE: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §4 P1 / CR6,
// plus a second finding along the way: buildAuditInlineReason told the reader
// to "ARME o run: crie {PIPELINE_DOC_PATH}/sentinel-state.json ... à mão" — the
// exact self-write-recipe anti-pattern v8.20.0 already closed for
// pipeline-arm-gate.cjs's own messages (a hand-write recipe lets a steered
// agent forge a fake armed state). This message was simply never updated to
// match. Now points at the single safe action (Agent(subagent_type:
// "pipeline-orchestrator:core:pipeline-controller", ...)) and never teaches
// hand-writing sentinel-state.json, plus carries the subagent-fallback clause
// (a subagent has neither the Agent tool this message names nor a way to
// "arm" anything by hand).
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const { buildAuditInlineReason, buildAuditCorrectiveDescriptor } = require(path.join(ROOT, 'lib/audit-read-budget.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F7 v8.23.0 — audit-read-budget.cjs no self-write recipe + fallback ===');

record('S1 [no self-write recipe] reason never teaches hand-writing sentinel-state.json', () => {
  const reason = buildAuditInlineReason('Read', 'Audit', 13, 12);
  // "crie X" (an instruction to DO the hand-write) is the recipe to forbid.
  // "NUNCA ... à mão" (a WARNING against it) is the correct, intended text —
  // asserting on that phrase's mere presence would ban the fix itself.
  assert.ok(!/crie.*sentinel-state\.json/i.test(reason), `must not teach a hand-write recipe: ${reason}`);
  assert.match(reason, /NUNCA escreva.*à mão/i, `must explicitly warn AGAINST hand-writing state: ${reason}`);
});

record('S2 [single safe action] reason points at the ONE canonical Agent(...) call', () => {
  const reason = buildAuditInlineReason('Grep', null, 20, 12);
  assert.match(reason, /Agent\(subagent_type: "pipeline-orchestrator:core:pipeline-controller"/,
    `must name the canonical safe action exactly: ${reason}`);
});

record('S3 [subagent fallback] reason includes the shared escape-hatch clause', () => {
  const reason = buildAuditInlineReason('Glob', 'UX Simulation', 15, 12);
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
});

// S3b — adversarial review round 2 (MEDIUM): the STRUCTURED twin descriptor
// (buildAuditCorrectiveDescriptor) had the SAME self-write recipe as the
// prose reason (S1 above), just never fixed alongside it — it is not read
// live today (audit-read-budget-gate.cjs only forwards .reason), but the
// AUDIT-005 comment in this file says it exists precisely so a FUTURE
// consumer can read the structured payload without parsing prose, so it must
// not silently carry the anti-pattern the prose twin was just cleaned of.
record('S3b [structured twin, no self-write recipe] buildAuditCorrectiveDescriptor matches the prose fix', () => {
  const c = buildAuditCorrectiveDescriptor('Read', 'Audit');
  assert.ok(!/write the signed sentinel-state/i.test(c.fix_instruction), `must not teach a hand-write recipe: ${c.fix_instruction}`);
  assert.match(c.fix_instruction, /Agent\(subagent_type: "pipeline-orchestrator:core:pipeline-controller"/,
    `must name the same canonical safe action as the prose reason: ${c.fix_instruction}`);
});

record('S4 [machine-readable suffix preserved] corrective_action/agent_type tokens unchanged', () => {
  const reason = buildAuditInlineReason('Read', 'Audit', 13, 12);
  assert.match(reason, /\[corrective_action=dispatch_agent agent_type=audit-intake\]/,
    'the AUDIT-005 machine-parseable suffix must survive this rewrite verbatim');
});

record('S5 [never breaks the reason] a missing next-action.cjs still returns a usable, non-crashing string', () => {
  const modPath = require.resolve(path.join(ROOT, 'lib/audit-read-budget.cjs'));
  const nextActionPath = require.resolve(path.join(ROOT, 'lib/next-action.cjs'));
  const savedMod = require.cache[modPath];
  const savedNextAction = require.cache[nextActionPath];
  delete require.cache[modPath];
  require.cache[nextActionPath] = { id: nextActionPath, filename: nextActionPath, loaded: true, exports: {} };
  try {
    const fresh = require(modPath);
    const reason = fresh.buildAuditInlineReason('Read', 'Audit', 13, 12);
    assert.equal(typeof reason, 'string');
    assert.match(reason, /AUDIT_RAN_INLINE/);
  } finally {
    delete require.cache[modPath];
    delete require.cache[nextActionPath];
    if (savedMod) require.cache[modPath] = savedMod;
    if (savedNextAction) require.cache[nextActionPath] = savedNextAction;
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
