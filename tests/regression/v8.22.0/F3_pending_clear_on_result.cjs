#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.22.0) — step-ledger-stamp: DETERMINISTIC pending_blocks CLEAR (T3)
// =============================================================================
// DEFECT (live run 2026-07-04): the controller PROSE said "clear the pending
// entry when processing each RESULT" — honor-only. The omission left a stale
// pending_blocks entry that fired a false 482-minute PROTOCOL_HANDSHAKE_TIMEOUT.
//
// FIX UNDER TEST: step-ledger-stamp.cjs (PostToolUse:Agent) exports
// clearSatisfiedPending(docDir, subagentType) and calls it from stamp(): when
// the RETURNING agent is the target of a DISPATCH_REQUEST pending block (same
// leaf-containment match as the gates — eg.dispatchTargetMatches) and returned
// a USABLE result, that entry is removed from the signed state. Other targets'
// entries and non-DISPATCH_REQUEST blocks stay. Read-verify-refuse-launder
// posture mirrors scripts/record-step.cjs (present-but-INVALID signature is
// never rewritten). Fail-silent throughout (PostToolUse cannot block anyway).
//
// BDD scenarios:
//   R1 [clear]     target returns usable → its DISPATCH_REQUEST removed, GATE_REQUEST kept, state re-signed valid
//   R2 [other]     a DIFFERENT agent returns → pending intact
//   R3 [no-result] target returns error shape (via stamp) → pending intact
//   R4 [tamper]    present-but-INVALID signature → file untouched (no launder)
//   R5 [unsigned]  unsigned state → cleared and now validly signed
//   R6 [shape]     pending_blocks absent → no crash, no write
//   R7 [wiring]    stamp() end-to-end (PIPELINE_DOC_PATH) clears on usable result
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f3-pending-clear-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const stampMod = require(path.join(ROOT, '.claude/hooks/step-ledger-stamp.cjs'));
const signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));

const EXECUTOR = 'pipeline-orchestrator:executor:executor-controller';
const OTHER = 'pipeline-orchestrator:quality:plan-architect';

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

function pendingPair() {
  return [
    { block_type: 'DISPATCH_REQUEST', dispatch_id: 'phase-2-executor-controller', emitted_at: iso(60_000) },
    { block_type: 'GATE_REQUEST', gate_id: 'phase-3-closeout', emitted_at: iso(30_000) },
  ];
}

// signMode: 'valid' | 'tampered' | 'unsigned'
function setupRun(signMode, pending) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-04-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 1, run_id: '2026-07-04-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '2',
  };
  if (pending !== undefined) state.pending_blocks = pending;
  const statePath = path.join(runDir, 'sentinel-state.json');
  if (signMode === 'valid') {
    signer.writeSignedState(statePath, state);
  } else if (signMode === 'tampered') {
    state.__signature = { algorithm: 'sha256', value: '0'.repeat(64), schema_version: 1 };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } else {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }
  return { tmp, runDir, statePath };
}

function readState(statePath) { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
function dispatchCount(state) {
  return (state.pending_blocks || []).filter((b) => b && b.block_type === 'DISPATCH_REQUEST').length;
}

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F3 v8.22.0 — deterministic pending_blocks clear on result (T3) ===');

assert.equal(typeof stampMod.clearSatisfiedPending, 'function',
  'step-ledger-stamp.cjs must export clearSatisfiedPending (T3 not landed yet → this test is RED)');

// R1 — the repro: target returned → its DISPATCH_REQUEST goes, the GATE_REQUEST stays, signature stays valid.
record('R1 [clear] alvo retornou → DISPATCH_REQUEST removido, GATE_REQUEST preservado, assinatura válida', () => {
  const { tmp, runDir, statePath } = setupRun('valid', pendingPair());
  stampMod.clearSatisfiedPending(runDir, EXECUTOR);
  const st = readState(statePath);
  assert.equal(dispatchCount(st), 0, 'DISPATCH_REQUEST entry must be removed');
  assert.equal(st.pending_blocks.length, 1, 'GATE_REQUEST must be preserved');
  assert.equal(st.pending_blocks[0].block_type, 'GATE_REQUEST');
  const v = signer.verifyState(st, { key: signer.readHmacKey() });
  assert.equal(v.valid, true, 'rewritten state must carry a VALID signature');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// R2 — a different agent returning does NOT clear the executor's pending entry.
record('R2 [outro agente] retorno de plan-architect → pending do executor intacto', () => {
  const { tmp, runDir, statePath } = setupRun('valid', pendingPair());
  stampMod.clearSatisfiedPending(runDir, OTHER);
  assert.equal(dispatchCount(readState(statePath)), 1, 'pending must remain for a non-matching agent');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// R3 — through stamp(): an ERROR result must NOT clear (the handshake is unresolved).
record('R3 [sem resultado] stamp() com tool_response de erro → pending intacto', () => {
  const { tmp, runDir, statePath } = setupRun('valid', pendingPair());
  const prevEnv = process.env.PIPELINE_DOC_PATH;
  process.env.PIPELINE_DOC_PATH = runDir;
  try {
    stampMod.stamp({
      tool_name: 'Agent', cwd: tmp,
      tool_input: { subagent_type: EXECUTOR, prompt: 'batch 1' },
      tool_response: { is_error: true },
    });
  } finally {
    if (prevEnv === undefined) delete process.env.PIPELINE_DOC_PATH; else process.env.PIPELINE_DOC_PATH = prevEnv;
  }
  assert.equal(dispatchCount(readState(statePath)), 1, 'an errored return must not clear the pending entry');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// R4 — tampered signature: the file must not be touched (no laundering).
record('R4 [tamper] assinatura presente-mas-INVÁLIDA → arquivo intocado', () => {
  const { tmp, runDir, statePath } = setupRun('tampered', pendingPair());
  const before = fs.readFileSync(statePath, 'utf8');
  stampMod.clearSatisfiedPending(runDir, EXECUTOR);
  assert.equal(fs.readFileSync(statePath, 'utf8'), before, 'tampered state must never be rewritten/laundered');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// R5 — unsigned (migration) is tolerated: cleared and now validly signed.
record('R5 [unsigned] estado sem assinatura → limpo e re-escrito com assinatura válida', () => {
  const { tmp, runDir, statePath } = setupRun('unsigned', pendingPair());
  stampMod.clearSatisfiedPending(runDir, EXECUTOR);
  const st = readState(statePath);
  assert.equal(dispatchCount(st), 0, 'unsigned state should still be cleaned');
  const v = signer.verifyState(st, { key: signer.readHmacKey() });
  assert.equal(v.valid, true, 'the rewrite must sign the state');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// R6 — shape guard: no pending_blocks at all → no crash, no write.
record('R6 [shape] estado sem pending_blocks → sem crash e sem escrita', () => {
  const { tmp, runDir, statePath } = setupRun('valid', undefined);
  const before = fs.readFileSync(statePath, 'utf8');
  stampMod.clearSatisfiedPending(runDir, EXECUTOR);
  assert.equal(fs.readFileSync(statePath, 'utf8'), before, 'nothing to clear → nothing rewritten');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// R7 — end-to-end wiring: stamp() with a USABLE result clears the matching entry.
record('R7 [wiring] stamp() com resultado usável → pending do alvo removido', () => {
  const { tmp, runDir, statePath } = setupRun('valid', pendingPair());
  const prevEnv = process.env.PIPELINE_DOC_PATH;
  process.env.PIPELINE_DOC_PATH = runDir;
  try {
    stampMod.stamp({
      tool_name: 'Agent', cwd: tmp,
      tool_input: { subagent_type: EXECUTOR, prompt: 'batch 1' },
      tool_response: { status: 'completed', content: [{ type: 'text', text: 'BATCH_RESULT ok' }] },
    });
  } finally {
    if (prevEnv === undefined) delete process.env.PIPELINE_DOC_PATH; else process.env.PIPELINE_DOC_PATH = prevEnv;
  }
  assert.equal(dispatchCount(readState(statePath)), 0, 'a usable return must clear the matching pending entry');
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
