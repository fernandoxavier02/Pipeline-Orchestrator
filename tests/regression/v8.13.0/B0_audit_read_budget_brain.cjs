#!/usr/bin/env node
'use strict';

// =============================================================================
// B0 (v8.13.0) — AUDIT READ-BUDGET GATE — pure-brain RED tests.
// =============================================================================
// Closes the read-only escape: the arm-gate blocks WORK_TOOLS in the governed
// window but ALWAYS allows Read/Grep/Glob, so an Audit/UX-Simulation run can be
// done entirely inline (no arming, no dispatch). This new gate counts the
// investigation reads in the governed-UNARMED window and BLOCKS the (N+1)th read
// for read-only-escapable types, forcing the agent to arm the pipeline.
//
// This file pins the PURE brain `decideAuditReadBudget(ctx)` (no I/O) + the
// helpers (resolveReadBudget, READ_ONLY_ESCAPABLE_TYPES, isCountableRead,
// sanitizeWorkflow). RED until lib/audit-read-budget.cjs exists.
// Mirrors the decideArmGate / decideFixLoop pure-brain contract.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
let mod = null;
try { mod = require(path.join(ROOT, 'lib/audit-read-budget.cjs')); } catch { mod = null; }

const CTX = (over) => ({
  toolName: 'Read', armPending: true, runActive: false, budgeted: true,
  pipelineAligned: false, count: 0, budget: 12, enforce: 'deny', workflow: 'FULL/Audit', ...over,
});

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== B0 v8.13.0 — audit read-budget pure brain (RED until lib exists) ===');

check('S0 module exports the brain + helpers', () => {
  assert.ok(mod, 'lib/audit-read-budget.cjs must load — RED until Batch 1');
  assert.equal(typeof mod.decideAuditReadBudget, 'function', 'export decideAuditReadBudget');
  assert.equal(typeof mod.resolveReadBudget, 'function', 'export resolveReadBudget');
  assert.equal(typeof mod.isCountableRead, 'function', 'export isCountableRead');
  assert.equal(typeof mod.sanitizeWorkflow, 'function', 'export sanitizeWorkflow');
  assert.ok(mod.READ_ONLY_ESCAPABLE_TYPES, 'export READ_ONLY_ESCAPABLE_TYPES');
  assert.equal(mod.DEFAULT_READ_BUDGET, 12, 'DEFAULT_READ_BUDGET === 12');
});

check('S1 non-object ctx → allow (defensive)', () => {
  assert.equal(mod.decideAuditReadBudget(null).decision, 'allow');
  assert.equal(mod.decideAuditReadBudget(undefined).decision, 'allow');
});

check('S2 no arm-pending → allow (ungoverned session untouched)', () => {
  assert.equal(mod.decideAuditReadBudget(CTX({ armPending: false })).decision, 'allow');
});

check('S3 run already active → allow (demand satisfied)', () => {
  assert.equal(mod.decideAuditReadBudget(CTX({ runActive: true, count: 999 })).decision, 'allow');
});

check('S4 non-budgeted type (Bug Fix) → allow (not policed)', () => {
  // budgeted=false means the pending type is NOT in READ_ONLY_ESCAPABLE_TYPES.
  assert.equal(mod.decideAuditReadBudget(CTX({ budgeted: false, count: 999 })).decision, 'allow');
});

check('S5 pipeline-aligned read (.pipeline/) → allow (coordination, not counted)', () => {
  assert.equal(mod.decideAuditReadBudget(CTX({ pipelineAligned: true, count: 999 })).decision, 'allow');
});

check('S6 under budget → allow', () => {
  assert.equal(mod.decideAuditReadBudget(CTX({ count: 5, budget: 12 })).decision, 'allow');
  assert.equal(mod.decideAuditReadBudget(CTX({ count: 11, budget: 12 })).decision, 'allow');
});

check('S7 count === budget → BLOCK (the budget+1th read)', () => {
  const r = mod.decideAuditReadBudget(CTX({ count: 12, budget: 12 }));
  assert.equal(r.decision, 'block', 'count==budget must block');
});

check('S8 count > budget → BLOCK', () => {
  assert.equal(mod.decideAuditReadBudget(CTX({ count: 50, budget: 12 })).decision, 'block');
});

check('S9 warn escape → allow + warn (no deny under warn)', () => {
  const r = mod.decideAuditReadBudget(CTX({ count: 99, budget: 12, enforce: 'warn' }));
  assert.equal(r.decision, 'allow', 'warn escape allows');
  assert.equal(r.warn, true, 'warn flag set');
});

check('S10 block carries invariant_id + reason + count + budget + corrective(blocking)', () => {
  const r = mod.decideAuditReadBudget(CTX({ count: 12, budget: 12 }));
  assert.equal(r.invariant_id, 'AUDIT_RAN_INLINE', 'invariant AUDIT_RAN_INLINE');
  assert.equal(typeof r.reason, 'string', 'has reason');
  assert.ok(/AUDIT_RAN_INLINE/.test(r.reason), 'reason names the invariant');
  assert.equal(r.count, 12); assert.equal(r.budget, 12);
  assert.ok(r.corrective && typeof r.corrective === 'object', 'has corrective descriptor');
  assert.equal(r.corrective.invariant_id, 'AUDIT_RAN_INLINE');
  assert.equal(r.corrective.blocking, true, 'LAYER-A hard block');
});

check('S11 hostile workflow is sanitized in the reason (no CR/LF injection)', () => {
  const r = mod.decideAuditReadBudget(CTX({ count: 12, budget: 12, workflow: 'FULL/Audit\n\rFAKE: deny <script>' }));
  assert.doesNotMatch(r.reason, /[\r\n]/, 'no raw CR/LF in reason');
  assert.doesNotMatch(r.reason, /<script>/, 'no unsafe chars survive');
});

check('S12 resolveReadBudget: NaN/0/negative → 12, floor 1; respects valid env', () => {
  const save = process.env.PIPELINE_AUDIT_READ_BUDGET;
  try {
    delete process.env.PIPELINE_AUDIT_READ_BUDGET; assert.equal(mod.resolveReadBudget(), 12, 'unset → 12');
    process.env.PIPELINE_AUDIT_READ_BUDGET = '0'; assert.equal(mod.resolveReadBudget(), 12, '0 → 12');
    process.env.PIPELINE_AUDIT_READ_BUDGET = '-5'; assert.equal(mod.resolveReadBudget(), 12, 'neg → 12');
    process.env.PIPELINE_AUDIT_READ_BUDGET = 'abc'; assert.equal(mod.resolveReadBudget(), 12, 'NaN → 12');
    process.env.PIPELINE_AUDIT_READ_BUDGET = '8'; assert.equal(mod.resolveReadBudget(), 8, 'valid → 8');
  } finally { if (save === undefined) delete process.env.PIPELINE_AUDIT_READ_BUDGET; else process.env.PIPELINE_AUDIT_READ_BUDGET = save; }
});

check('S13 READ_ONLY_ESCAPABLE_TYPES is EXACTLY {Audit, UX Simulation}', () => {
  const s = mod.READ_ONLY_ESCAPABLE_TYPES;
  const has = (t) => (typeof s.has === 'function' ? s.has(t) : Array.isArray(s) ? s.includes(t) : false);
  assert.ok(has('Audit'), 'includes Audit');
  assert.ok(has('UX Simulation'), 'includes UX Simulation');
  assert.ok(!has('Bug Fix'), 'excludes Bug Fix');
  assert.ok(!has('Feature'), 'excludes Feature');
  const size = typeof s.size === 'number' ? s.size : (Array.isArray(s) ? s.length : -1);
  assert.equal(size, 2, 'exactly 2 types');
});

check('S14 isCountableRead: governed-unarmed + budgeted + not-aligned → true; else false', () => {
  assert.equal(mod.isCountableRead(CTX()), true, 'governed audit read is countable');
  assert.equal(mod.isCountableRead(CTX({ armPending: false })), false, 'no pending → not counted');
  assert.equal(mod.isCountableRead(CTX({ runActive: true })), false, 'armed → not counted');
  assert.equal(mod.isCountableRead(CTX({ budgeted: false })), false, 'non-escapable type → not counted');
  assert.equal(mod.isCountableRead(CTX({ pipelineAligned: true })), false, 'coordination read → not counted');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
