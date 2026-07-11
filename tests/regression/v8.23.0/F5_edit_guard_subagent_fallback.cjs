#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.23.0) — edit-guard-hook.cjs: subagent-fallback clause (Batch 3)
// =============================================================================
// SOURCE: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §4 P1 / CR6.
// buildBlockMessage (PIPELINE_LOCK_ACTIVE), buildDispatchBlockMessage
// (DISPATCH_LOCK_ACTIVE), and buildPlanGateMessage (PLAN_GATE_ACTIVE) all told
// the reader to act "via Agent tool" / "via AskUserQuestion" / "Enter Plan
// Mode" without offering an exit reachable by a dispatched subagent (Achado
// #7 — none of those three tools exist in a subagent's runtime). All three
// (plus the two shell-write inline duplicates for DISPATCH_LOCK_ACTIVE /
// PLAN_GATE_ACTIVE) now append the shared clause from
// lib/next-action.cjs::buildSubagentFallbackClause.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const eg = require(path.join(ROOT, '.claude/hooks/edit-guard-hook.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F5 v8.23.0 — edit-guard-hook.cjs subagent-fallback clause ===');

record('S1 [PIPELINE_LOCK_ACTIVE] buildBlockMessage includes the fallback clause', () => {
  const msg = eg.buildBlockMessage('src/foo.cjs', 'session-1');
  assert.match(msg, /subagente sem a ferramenta Agent/i);
  assert.match(msg, /DISPATCH_REQUEST/);
  // Original instruction must still be there (additive, not replaced).
  assert.match(msg, /Spawn Agent\(subagent_type/);
});

record('S2 [DISPATCH_LOCK_ACTIVE] buildDispatchBlockMessage names the ACTUAL blockType', () => {
  const msg = eg.buildDispatchBlockMessage('GATE_REQUEST', 'step-1-plan');
  assert.match(msg, /emita agora um bloco GATE_REQUEST/, `must name GATE_REQUEST specifically, got: ${msg}`);
  assert.match(msg, /despache o alvo via Agent tool/); // original preserved
});

record('S3 [PLAN_GATE_ACTIVE] buildPlanGateMessage points at PLAN_MODE_REQUEST', () => {
  const msg = eg.buildPlanGateMessage();
  assert.match(msg, /emita agora um bloco PLAN_MODE_REQUEST/, `must name PLAN_MODE_REQUEST, got: ${msg}`);
  assert.match(msg, /Enter Plan Mode/); // original preserved
});

record('S4 [never breaks the message] a missing next-action.cjs still returns a usable, non-crashing message', () => {
  const egPath = require.resolve(path.join(ROOT, '.claude/hooks/edit-guard-hook.cjs'));
  const nextActionPath = require.resolve(path.join(ROOT, 'lib/next-action.cjs'));
  const savedEg = require.cache[egPath];
  const savedNextAction = require.cache[nextActionPath];
  delete require.cache[egPath];
  require.cache[nextActionPath] = { id: nextActionPath, filename: nextActionPath, loaded: true, exports: {} };
  try {
    const freshEg = require(egPath);
    const msg = freshEg.buildBlockMessage('src/foo.cjs', 'session-1');
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0);
    assert.match(msg, /Spawn Agent\(subagent_type/, 'the original message must survive even without the fallback clause');
  } finally {
    delete require.cache[egPath];
    delete require.cache[nextActionPath];
    if (savedEg) require.cache[egPath] = savedEg;
    if (savedNextAction) require.cache[nextActionPath] = savedNextAction;
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
