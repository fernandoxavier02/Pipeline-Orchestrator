#!/usr/bin/env node
'use strict';

// =============================================================================
// F6 — Lote 4 (chain-tied enforcement): auto-recovery re-anchor
// =============================================================================
// buildChainRecovery (pure): re-anchor = first UNSTAMPED manifest step, NEVER
//   forward of what was stamped; complete → nothing to recover; unknown workflow →
//   not anchorable (freeze for the operator escape).
// reanchorExpectedNext (I/O): persists expected_next = the re-anchor point into the
//   SIGNED state; never adds ledger entries (no fabricated progress).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f6-recovery-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const L = require(path.join(root, 'lib', 'step-ledger.cjs'));
const { reanchorExpectedNext } = require(path.join(root, 'scripts', 'record-step.cjs'));
const { writeSignedState } = require(path.join(root, 'lib', 'sentinel-state-signer.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }
const st = (steps) => ({ step_ledger: steps, workflow_key: 'FULL' });

// ---- buildChainRecovery (pure) ----------------------------------------------
const r1 = L.buildChainRecovery(st(['classify', 'info-gate']), 'FULL');
check('incompleta em ordem → re-ancora em plan', r1.anchorable && !r1.complete && !r1.broken && r1.reanchorTo === 'plan');

const r2 = L.buildChainRecovery(st(['classify', 'plan']), 'FULL'); // pulou info-gate
check('ordem quebrada → broken + re-ancora no gap (info-gate)', r2.anchorable && r2.broken && r2.brokenAt === 'info-gate' && r2.reanchorTo === 'info-gate');
check('re-ancora NUNCA vai pra frente (info-gate < plan)', r2.reanchorTo === 'info-gate');

const r3 = L.buildChainRecovery(st(['classify', 'info-gate', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final']), 'FULL');
check('completa → nada a recuperar', r3.complete && r3.reanchorTo === null);

const r4 = L.buildChainRecovery(st([]), 'FULL');
check('vazia → re-ancora no começo (classify)', r4.anchorable && r4.reanchorTo === 'classify');

const r5 = L.buildChainRecovery(st(['x']), 'NOPE');
check('workflow desconhecido → NAO ancoravel (congela)', r5.anchorable === false && r5.reanchorTo === null);
check('re-ancora sempre traz reason de reidratacao', typeof r1.reason === 'string' && /re-ancora/i.test(r1.reason));

// ---- reanchorExpectedNext (I/O, signed) -------------------------------------
function seed(steps, wf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f6-'));
  const docDir = path.join(dir, 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'rF6', pipeline_active: true, workflow_key: wf || 'FULL',
    pipeline_doc_path: docDir, state_version: 1, step_ledger: steps, expected_next: 'STALE',
  });
  return { dir, docDir };
}
function readExpected(docDir) { return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')).expected_next; }
function ledgerOf(docDir) { return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')).step_ledger; }

// broken chain → re-anchors expected_next to the gap, ledger UNCHANGED (no fabrication).
{
  const { dir, docDir } = seed(['classify', 'plan']);
  const res = reanchorExpectedNext(docDir);
  check('reanchor I/O: ok + reanchored', res.ok && res.reanchored === true && res.expected_next === 'info-gate');
  check('reanchor I/O: gravou expected_next=info-gate', readExpected(docDir) === 'info-gate');
  check('reanchor I/O: NAO fabricou ledger (continua [classify,plan])', JSON.stringify(ledgerOf(docDir)) === JSON.stringify(['classify', 'plan']));
  fs.rmSync(dir, { recursive: true, force: true });
}
// complete chain → no-op.
{
  const { dir, docDir } = seed(['classify', 'info-gate', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final']);
  const res = reanchorExpectedNext(docDir);
  check('reanchor I/O: corrente completa → no-op', res.ok && res.reanchored === false);
  fs.rmSync(dir, { recursive: true, force: true });
}
// unknown workflow → not anchorable, no-op (freeze).
{
  const { dir, docDir } = seed(['x'], 'NOPE');
  const res = reanchorExpectedNext(docDir, 'NOPE');
  check('reanchor I/O: sem ancora → no-op (congela)', res.ok && res.reanchored === false && res.recovery.anchorable === false);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n>>> F6 PASS' : `\n>>> F6 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
