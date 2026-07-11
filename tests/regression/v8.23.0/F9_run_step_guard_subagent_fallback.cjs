#!/usr/bin/env node
'use strict';

// =============================================================================
// F9 (v8.23.0) — lib/run-step-guard.cjs: subagent-fallback clause (Batch 5)
// =============================================================================
// SOURCE: adversarial review of tests/regression/v8.23.0/F8_deny_sweep_liveness.cjs
// (Batch 5, HIGH finding). buildRehydrationReason is the LIVE text a blocked
// caller actually reads for INLINE_WORK_BLOCKED (pipeline-arm-gate.cjs's
// ctx.runActive-forward site returns g.reason verbatim as
// permissionDecisionReason) — the SEPARATE `corrective` structured field
// Batch 2 already wired never reaches that live stdout path (it's drained
// asynchronously, on disk, by lib/corrective-dispatch.cjs). This function
// said "Despache o agente ... (Agent com subagent_type ...)" as the ONLY
// resolution, with zero fallback for a subagent reader — exactly the CR6 gap
// Batches 1-4 closed everywhere else, missed here because this file lives
// outside .claude/hooks/ (F8's original scan scope).
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const { buildRehydrationReason } = require(path.join(ROOT, 'lib/run-step-guard.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F9 v8.23.0 — run-step-guard.cjs subagent-fallback clause ===');

record('S1 [fallback present] reason includes the subagent-fallback clause', () => {
  const reason = buildRehydrationReason('Edit', 'step-1-7-brainstorm-controller');
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
});

record('S2 [original preserved] the parent-facing primary instruction is unchanged (additive, not replaced)', () => {
  const reason = buildRehydrationReason('Bash', null);
  assert.match(reason, /Despache o agente desse passo/);
  assert.match(reason, /a janela não se abre à mão/);
});

record('S3 [no self-write regression] the exec-window anti-pattern guard (SEC-3) still holds', () => {
  const reason = buildRehydrationReason('Write', 'foo');
  assert.doesNotMatch(reason, /\.exec-window/, 'must never re-introduce the exec-window hand-write path removed per SEC-3');
});

record('S4 [never breaks the reason] a missing next-action.cjs still returns a usable, non-crashing string', () => {
  const modPath = require.resolve(path.join(ROOT, 'lib/run-step-guard.cjs'));
  const nextActionPath = require.resolve(path.join(ROOT, 'lib/next-action.cjs'));
  const savedMod = require.cache[modPath];
  const savedNextAction = require.cache[nextActionPath];
  delete require.cache[modPath];
  require.cache[nextActionPath] = { id: nextActionPath, filename: nextActionPath, loaded: true, exports: {} };
  try {
    const fresh = require(modPath);
    const reason = fresh.buildRehydrationReason('Edit', null);
    assert.equal(typeof reason, 'string');
    assert.match(reason, /INLINE_WORK_BLOCKED/);
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
