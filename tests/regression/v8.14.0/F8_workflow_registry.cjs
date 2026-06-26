#!/usr/bin/env node
'use strict';

// =============================================================================
// F8 — Batch 1 (audit fix): workflow registry SSOT (ARCH-2 / ARCH-3 / ARCH-7)
// =============================================================================
// ATDD acceptance criteria = the audit findings:
//  - ARCH-3: a brainstorm/Spec run is NEVER silently mapped to FULL.
//  - ARCH-7: ONE resolveWorkflowKey SSOT (the 4 inline heuristics now delegate).
//  - ARCH-2: the chain-complete CLOSE only governs ledger-governed workflows (FULL);
//    Spec/brainstorm defer to the GO/seal signal and must NOT deadlock on strict close.
//
// BDD:
//   GIVEN a Spec run whose agent-step ledger is empty (its phases are skill-dispatched)
//   WHEN  PIPELINE_CHAIN_CLOSE_ENFORCEMENT=strict and a GO signal is present
//   THEN  the run still CLOSES (ledgerGovernsClosure('Spec') === false), no deadlock.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f8-workflow-registry-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..', '..');
const L = require(path.join(root, 'lib', 'step-ledger.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

// ---- resolveWorkflowKey (ARCH-3 / ARCH-7) -----------------------------------
check('explicit workflow_key=brainstorm honrado (NAO vira FULL)', L.resolveWorkflowKey({ workflow_key: 'brainstorm' }) === 'brainstorm');
check('explicit workflow_key=Spec honrado', L.resolveWorkflowKey({ workflow_key: 'Spec' }) === 'Spec');
check('task_type=Spec → Spec', L.resolveWorkflowKey({ task_type: 'Spec' }) === 'Spec');
check('task_type=Bug Fix → FULL', L.resolveWorkflowKey({ task_type: 'Bug Fix' }) === 'FULL');
check('estado vazio → FULL (default seguro)', L.resolveWorkflowKey({}) === 'FULL');
check('workflow_key desconhecido cai no task_type', L.resolveWorkflowKey({ workflow_key: 'NOPE', task_type: 'Spec' }) === 'Spec');

// ---- ledgerGovernsClosure (ARCH-2) ------------------------------------------
check('FULL: ledger governa fechamento', L.ledgerGovernsClosure('FULL') === true);
check('Spec: ledger NAO governa (seal-governed)', L.ledgerGovernsClosure('Spec') === false);
check('brainstorm: ledger NAO governa (sequence_lock)', L.ledgerGovernsClosure('brainstorm') === false);

// ---- brainstorm AGENT-dispatched prefix agora é governável (ARCH-2 parte real) -
check('brainstorm intake mapeado', L.stepForAgent('brainstorm', 'brainstorm-step-00-intake') === 'intake');
check('brainstorm explore mapeado', L.stepForAgent('brainstorm', 'brainstorm-step-01-explore') === 'explore');
check('brainstorm expectedNext vazio → intake (nao mais FULL/classify)', L.expectedNextStep({ step_ledger: [] }, 'brainstorm') === 'intake');
check('brainstorm passo skill (spec-init) NAO é agente governado', L.stepForAgent('brainstorm', 'spec-init') === null);

// ---- LIVE: strict close does NOT deadlock Spec / brainstorm (the audit's prediction)
const HOOK = path.resolve(root, '.claude', 'hooks', 'stop-gate-hook.cjs');
const { writeSignedState } = require(path.join(root, 'lib', 'sentinel-state-signer.cjs'));
function seed(rootDir, extra) {
  const docDir = path.join(rootDir, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rF8', pipeline_active: true, pipeline_doc_path: docDir, state_version: 1,
    current_phase: 'closeout', pending_dispatches: {}, final_decision: 'GO', step_ledger: [],
  }, extra));
  fs.writeFileSync(path.join(rootDir, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rF8', updated_at: '2026-06-26T00:00:00.000Z' }));
  return statePath;
}
function runStop(rootDir, docDir) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'Stop', cwd: rootDir }), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: docDir, PIPELINE_CHAIN_CLOSE_ENFORCEMENT: 'strict' },
  });
}
function terminalOf(p) { try { const s = JSON.parse(fs.readFileSync(p, 'utf8')); return s.terminal_state || s.status || null; } catch { return null; } }

// The 3rd case is the adversarial REC-2 / MEDIUM-2 hole: a brainstorm run that the
// controller did NOT tag (no workflow_key; a task_type that maps to FULL). It mis-maps
// to FULL, but its EMPTY ledger must still let it close — the deadlock is gone at the root.
for (const [label, extra] of [
  ['Spec', { task_type: 'Spec' }],
  ['brainstorm (tagged)', { workflow_key: 'brainstorm' }],
  ['brainstorm UNTAGGED → mis-maps to FULL, empty ledger', { task_type: 'Brainstorm' }],
]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f8-'));
  try {
    const statePath = seed(dir, extra);
    const r = runStop(dir, path.dirname(statePath));
    check(`${label}: strict close + GO + ledger vazio → COMPLETA (nao trava)`, r.status === 0 && terminalOf(statePath) === 'completed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(failures === 0 ? '\n>>> F8 PASS' : `\n>>> F8 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
