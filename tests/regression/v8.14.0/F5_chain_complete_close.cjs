#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 — Lote 4 (chain-tied enforcement): close requires a COMPLETE chain (opt-in)
// =============================================================================
// PIPELINE_CHAIN_CLOSE_ENFORCEMENT OFF (default) → unchanged: a GO signal closes
//   the run (no deadlock for workflows whose ledger we can't fully verify).
// ON → a GO whose step-chain is INCOMPLETE does NOT close; it falls through to the
//   incomplete-run block (capped at 3 continuities → hard_failed, never forever).
//   A GO with a COMPLETE chain closes normally.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f5-chain-close-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

const FULL_CHAIN = ['classify', 'info-gate', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final'];
const INCOMPLETE = ['classify', 'info-gate']; // GO claimed but most phases never stamped

function seedRun(root, stepLedger) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, {
    run_id: 'rF5', pipeline_active: true, task_type: 'Feature', workflow_key: 'FULL',
    pipeline_doc_path: docDir, state_version: 1, current_phase: 'phase-3-closeout',
    pending_dispatches: {}, final_decision: 'GO', step_ledger: stepLedger,
  });
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rF5', updated_at: '2026-06-26T00:00:00.000Z' }));
  return { docDir, statePath };
}
function run(root, docDir, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'Stop', cwd: root }), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: docDir, ...(env || {}) },
  });
}
function terminalOf(p) { try { const s = JSON.parse(fs.readFileSync(p, 'utf8')); return s.terminal_state || s.status || null; } catch { return null; } }

let pass = 0, fail = 0;
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f5-chain-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F5 — chain-complete close (opt-in) ===');

// A: strict OFF (default) + incomplete chain + GO → STILL completes (no deadlock).
liveTest('A [default-off] GO + corrente incompleta → completa (comportamento inalterado)', (root) => {
  const { docDir, statePath } = seedRun(root, INCOMPLETE);
  const r = run(root, docDir, { PIPELINE_CHAIN_CLOSE_ENFORCEMENT: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(terminalOf(statePath), 'completed', 'default off: a GO closes even with an incomplete chain');
});

// B: strict ON + incomplete chain + GO → does NOT complete (blocks).
liveTest('B [strict] GO + corrente INCOMPLETA → NAO completa (bloqueia)', (root) => {
  const { docDir, statePath } = seedRun(root, INCOMPLETE);
  const r = run(root, docDir, { PIPELINE_CHAIN_CLOSE_ENFORCEMENT: 'strict' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(terminalOf(statePath), 'completed', 'strict: a GO with phases skipped must NOT close the run');
  assert.match(String(r.stdout || ''), /block/i, 'strict + incomplete → the Stop is blocked (recoverable)');
});

// C: strict ON + COMPLETE chain + GO → completes normally.
liveTest('C [strict] GO + corrente COMPLETA → completa', (root) => {
  const { docDir, statePath } = seedRun(root, FULL_CHAIN);
  const r = run(root, docDir, { PIPELINE_CHAIN_CLOSE_ENFORCEMENT: 'strict' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(terminalOf(statePath), 'completed', 'strict: a GO with every phase stamped closes normally');
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail ? 1 : 0);
