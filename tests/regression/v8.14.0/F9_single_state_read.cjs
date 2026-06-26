#!/usr/bin/env node
'use strict';

// =============================================================================
// F9 — Batch 2 (adversarial ARCH-1 TOCTOU): gatherContext reads state ONCE
// =============================================================================
// ATDD acceptance: the audit found gatherContext read the sentinel-state THREE
// times per PreToolUse (runStateContext + discoverRunState + findActiveSentinelState),
// so the three reads could observe three different snapshots mid-write.
// BDD:
//   GIVEN an armed marker + an observed-active run
//   WHEN  the arm-gate gathers its context for one tool call
//   THEN  the sentinel-state is read EXACTLY ONCE, and runActive/observedActive/corrupt
//         are all derived from that single snapshot.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const eg = require(path.join(root, '.claude', 'hooks', 'edit-guard-hook.cjs'));
const armGate = require(path.join(root, '.claude', 'hooks', 'pipeline-arm-gate.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

// Seed an armed marker + an observed-active run in a temp cwd.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-'));
try {
  const docDir = path.join(dir, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  // Non-expired UNSIGNED arm marker (tampered-check tolerates unsigned).
  fs.writeFileSync(path.join(dir, '.pipeline', 'pipeline-arm-pending.json'),
    JSON.stringify({ requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix' }));
  // Active run discoverable via the active-run.json pointer.
  fs.writeFileSync(path.join(docDir, 'sentinel-state.json'),
    JSON.stringify({ pipeline_active: true, workflow_key: 'FULL', step_ledger: ['classify'], pipeline_doc_path: docDir }));
  fs.writeFileSync(path.join(dir, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'run', updated_at: new Date().toISOString() }));

  // Count findActiveSentinelState calls by wrapping the SHARED edit-guard module export
  // (pipeline-arm-gate resolves eg.findActiveSentinelState at call time → hits the wrapper).
  const orig = eg.findActiveSentinelState;
  let calls = 0;
  eg.findActiveSentinelState = function (d) { calls++; return orig.call(eg, d); };
  try {
    const ctx = armGate.gatherContext({ cwd: dir, tool_name: 'Edit' });
    check('estado lido EXATAMENTE 1 vez (era 3 — ARCH-1)', calls === 1);
    check('armPending derivado', ctx && ctx.armPending === true);
    check('runActive derivado do mesmo snapshot', ctx && ctx.runActive === true);
    check('observedActive derivado do mesmo snapshot', ctx && ctx.observedActive === true);
    check('corrupt=false derivado do mesmo snapshot', ctx && ctx.corrupt === false);
    // Batch 2 review (ARCH-REVIEW-1, LOW): the OPTIONAL enrichment assertion must NOT
    // contaminate the core single-read proof. Only assert expectedStep when the optional
    // step-ledger module is actually loadable; otherwise the ARCH-1 guarantee stands alone.
    let ledgerLoadable = true;
    try { require(path.join(root, 'lib', 'step-ledger.cjs')); } catch { ledgerLoadable = false; }
    if (ledgerLoadable) {
      check('expectedStep derivado do MESMO estado (sem re-leitura)', ctx && ctx.expectedStep === 'info-gate');
    } else {
      console.log('SKIP | expectedStep (step-ledger ausente — nao contamina a prova ARCH-1)');
    }
  } finally {
    eg.findActiveSentinelState = orig; // restore
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n>>> F9 PASS' : `\n>>> F9 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
