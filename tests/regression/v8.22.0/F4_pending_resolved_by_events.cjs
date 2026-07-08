#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.22.0) — ANTI-FALSO-TIMEOUT: pending resolvido pela verdade em disco (T4)
// =============================================================================
// DEFECT (live run 2026-07-04): um pending_block cujo DISPATCH_RESULT já estava
// registrado no protocol-events.jsonl disparou PROTOCOL_HANDSHAKE_TIMEOUT falso
// de 482 minutos — o sentinel teve que provar A MÃO, lendo o protocol-events,
// que a troca tinha completado em janela. O docstring do cleanup hook prometia
// "AND no matching response arrived", mas o código nunca checava.
//
// FIX UNDER TEST: edit-guard-hook.cjs exporta pendingResolvedByEvents(state,
// block, docDir?) — um DISPATCH_REQUEST cujo id tem DISPATCH_RESULT com
// timestamp >= emitted_at no protocol-events.jsonl do run é RESOLVIDO. Ligado
// em findLivePendingBlock (os 3 gates de sessão) e na varredura
// checkHandshakeTimeouts do cleanup-orphan hook. Sem RESULT correspondente ou
// sem protocol-events legível → comportamento anterior INTOCADO.
//
// BDD scenarios:
//   E1 [repro]    pending + RESULT posterior no events → decideInlineGate ALLOW
//   E2 [sem log]  pending sem protocol-events → BLOCK (comportamento atual)
//   E3 [id]       RESULT de OUTRO id → BLOCK
//   E4 [velho]    RESULT ANTERIOR ao request → BLOCK (resposta de encarnação antiga)
//   E5 [escopo]   GATE_REQUEST + GATE_RESPONSE no events → BLOCK (só DISPATCH resolve por evento)
//   E6 [cleanup]  varredura: pending velho + RESULT no events → 0 timeouts emitidos
//   E7 [cleanup]  varredura: pending velho SEM RESULT → 1 timeout emitido (preservado)
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f4-resolved-by-events-stable-secret-0123456789';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const gate = require(path.join(ROOT, '.claude/hooks/dispatch-pending-gate.cjs'));
const eg = require(path.join(ROOT, '.claude/hooks/edit-guard-hook.cjs'));
const cleanup = require(path.join(ROOT, '.claude/hooks/cleanup-orphan-sentinel-state-hook.cjs'));

assert.equal(typeof eg.pendingResolvedByEvents, 'function',
  'edit-guard-hook.cjs must export pendingResolvedByEvents (T4 not landed yet → RED)');

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

function setupRun(opts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f4-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-04-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 1, run_id: '2026-07-04-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '2', pending_blocks: opts.pending,
  };
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  if (opts.events) {
    fs.writeFileSync(path.join(runDir, 'protocol-events.jsonl'),
      opts.events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }
  return { tmp, runDir };
}

const bashPayload = (tmp) => ({ tool_name: 'Bash', tool_input: { command: 'node scripts/run-tests.cjs' }, cwd: tmp });

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F4 v8.22.0 — pending resolvido pela verdade em disco (T4) ===');

const REQ_AT = iso(120_000);
const pendingReq = () => [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'phase-2c-batch-1-executor-controller', emitted_at: REQ_AT }];
const resultEvent = (id, ageMs) => ({ event: 'DISPATCH_RESULT', id, status: 'completed', summary: 'BATCH_RESULT ok', handled_by: 'parent', timestamp: iso(ageMs) });

// E1 — the repro: REQUEST 120s ago, RESULT 30s ago already on disk → not live.
record('E1 [repro] pending + DISPATCH_RESULT posterior no protocol-events → Bash ALLOW', () => {
  const { tmp } = setupRun({
    pending: pendingReq(),
    events: [
      { event: 'DISPATCH_REQUEST', id: 'phase-2c-batch-1-executor-controller', timestamp: REQ_AT },
      resultEvent('phase-2c-batch-1-executor-controller', 30_000),
    ],
  });
  const r = gate.decideInlineGate(bashPayload(tmp));
  assert.equal(r.decision, 'allow', `expected allow, got ${r.decision}${r.reason ? ' — ' + String(r.reason).slice(0, 100) : ''}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// E2 — no events file: current behavior preserved (still blocked).
record('E2 [sem log] pending sem protocol-events.jsonl → Bash BLOCK', () => {
  const { tmp } = setupRun({ pending: pendingReq() });
  assert.equal(gate.decideInlineGate(bashPayload(tmp)).decision, 'block');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// E3 — a RESULT for a different id does not resolve this request.
record('E3 [id errado] DISPATCH_RESULT de outro id → Bash BLOCK', () => {
  const { tmp } = setupRun({ pending: pendingReq(), events: [resultEvent('phase-0b-information-gate', 30_000)] });
  assert.equal(gate.decideInlineGate(bashPayload(tmp)).decision, 'block');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// E4 — a RESULT from BEFORE the request (an older incarnation) does not resolve it.
record('E4 [resposta velha] DISPATCH_RESULT anterior ao request → Bash BLOCK', () => {
  const { tmp } = setupRun({ pending: pendingReq(), events: [resultEvent('phase-2c-batch-1-executor-controller', 300_000)] });
  assert.equal(gate.decideInlineGate(bashPayload(tmp)).decision, 'block');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// E5 — scope: only DISPATCH_REQUEST resolves by event; a GATE_REQUEST stays live.
record('E5 [escopo] GATE_REQUEST + GATE_RESPONSE no events → Bash BLOCK (resolução é humana)', () => {
  const { tmp } = setupRun({
    pending: [{ block_type: 'GATE_REQUEST', gate_id: 'phase-1-proposal', emitted_at: REQ_AT }],
    events: [{ event: 'GATE_RESPONSE', id: 'phase-1-proposal', status: 'resolved', timestamp: iso(30_000) }],
  });
  assert.equal(gate.decideInlineGate(bashPayload(tmp)).decision, 'block');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// E6 — cleanup sweep: a stale pending WITH its RESULT on disk emits NO timeout.
record('E6 [cleanup] pending velho + RESULT no events → 0 PROTOCOL_HANDSHAKE_TIMEOUT', () => {
  const oldReq = iso(45 * 60 * 1000); // 45 min > janela default de 30
  const { tmp, runDir } = setupRun({
    pending: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'phase-2c-batch-1-executor-controller', emitted_at: oldReq }],
    events: [resultEvent('phase-2c-batch-1-executor-controller', 40 * 60 * 1000)],
  });
  const n = cleanup.checkHandshakeTimeouts(path.join(runDir, 'sentinel-state.json'), {});
  assert.equal(n, 0, `expected 0 timeouts emitted, got ${n}`);
  assert.equal(fs.existsSync(path.join(runDir, 'gate-decisions.jsonl')), false, 'no gate line should be appended');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// E7 — cleanup sweep unchanged for a genuinely dead handshake: still emits.
record('E7 [cleanup] pending velho SEM RESULT → 1 PROTOCOL_HANDSHAKE_TIMEOUT (preservado)', () => {
  const oldReq = iso(45 * 60 * 1000);
  const { tmp, runDir } = setupRun({
    pending: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'phase-2c-batch-1-executor-controller', emitted_at: oldReq }],
  });
  const n = cleanup.checkHandshakeTimeouts(path.join(runDir, 'sentinel-state.json'), {});
  assert.equal(n, 1, `expected 1 timeout emitted, got ${n}`);
  const gd = fs.readFileSync(path.join(runDir, 'gate-decisions.jsonl'), 'utf8');
  assert.match(gd, /PROTOCOL_HANDSHAKE_TIMEOUT/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
