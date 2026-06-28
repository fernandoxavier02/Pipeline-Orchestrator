#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 — v8.17.0 — AUDIT-006 — evaluator-abort-blindspot
// =============================================================================
// When the run's sentinel-state carries an `abort_reason` AND the
// `pipeline_outcome` starts with `ABORTED_`, the e2e-evaluator must SKIP the
// per-step / per-gate scoring (those are NOT meaningful for a run that never
// really started) and emit a single AUDIT-class hygiene_violation named
// PIPELINE_ABORTED, severity high.
//
// Contract:
//   - subscores.step_completion === null (dropped + renormalized)
//   - subscores.gate_coverage === null
//   - subscores.order_integrity === null
//   - glitches contains exactly ONE entry with kind=hygiene_violation,
//     target=PIPELINE_ABORTED, severity='high', weight=1.0
//   - no missing_step / missing_gate glitches are emitted
// =============================================================================

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const e2e = require(path.join(ROOT, 'lib', 'e2e-evaluator.cjs'));

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f4-v8170-'));
const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Heavy-action', 'demo', '001-abort');
fs.mkdirSync(docPath, { recursive: true });

const abortedState = {
  run_id: 'aborted-run-001',
  task_type: 'Bug Fix',
  complexity: 'MEDIA',
  pipeline_active: false,
  step_ledger: [],
  abort_reason: 'user_pressed_escape_during_classify',
  pipeline_outcome: 'ABORTED_USER_CANCELLED',
};

const ev = e2e.scoreRun({ pipelineDocPath: docPath, repoRoot, state: abortedState });

check('Case A: scoreRun returns ok=true on aborted run', ev && ev.ok === true);
check('Case A: step_completion is null (dropped)', ev.subscores.step_completion === null);
check('Case A: gate_coverage is null (dropped)', ev.subscores.gate_coverage === null);
check('Case A: order_integrity is null (dropped)', ev.subscores.order_integrity === null);

const aborts = ev.glitches.filter((g) => g.target === 'PIPELINE_ABORTED');
check('Case A: exactly one PIPELINE_ABORTED glitch', aborts.length === 1);
if (aborts.length === 1) {
  const g = aborts[0];
  check('Case A: PIPELINE_ABORTED kind is hygiene_violation', g.kind === 'hygiene_violation');
  check('Case A: PIPELINE_ABORTED severity is high', g.severity === 'high');
  check('Case A: PIPELINE_ABORTED weight is 1.0', g.weight === 1.0);
}

// No missing_step / missing_gate glitches must be emitted for an aborted run.
check('Case A: no missing_step glitches', ev.glitches.every((g) => g.kind !== 'missing_step'));
check('Case A: no missing_gate glitches', ev.glitches.every((g) => g.kind !== 'missing_gate'));
check('Case A: no out_of_order glitches', ev.glitches.every((g) => g.kind !== 'out_of_order'));

// --- Case B: a NORMAL (non-aborted) run keeps the existing scoring path ----
{
  const docPathB = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Heavy-action', 'demo', '002-normal');
  fs.mkdirSync(docPathB, { recursive: true });
  const normalState = {
    run_id: 'normal-run-002',
    task_type: 'Bug Fix',
    complexity: 'MEDIA',
    pipeline_active: true,
    step_ledger: ['classify'],
    // no abort_reason / pipeline_outcome
  };
  const evB = e2e.scoreRun({ pipelineDocPath: docPathB, repoRoot, state: normalState });
  // Should NOT emit a PIPELINE_ABORTED glitch.
  check('Case B: normal run -> no PIPELINE_ABORTED glitch',
    evB.glitches.every((g) => g.target !== 'PIPELINE_ABORTED'));
}

// --- Case C: abort_reason WITHOUT ABORTED_* outcome -> normal path (defense)
{
  const docPathC = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Heavy-action', 'demo', '003-partial');
  fs.mkdirSync(docPathC, { recursive: true });
  const partialState = {
    run_id: 'partial-run-003',
    task_type: 'Bug Fix',
    complexity: 'MEDIA',
    pipeline_active: true,
    step_ledger: [],
    abort_reason: 'forensic-only',
    pipeline_outcome: 'COMPLETED', // does NOT start with ABORTED_
  };
  const evC = e2e.scoreRun({ pipelineDocPath: docPathC, repoRoot, state: partialState });
  check('Case C: abort_reason without ABORTED_ outcome -> no PIPELINE_ABORTED glitch',
    evC.glitches.every((g) => g.target !== 'PIPELINE_ABORTED'));
}

fs.rmSync(repoRoot, { recursive: true, force: true });

process.exit(failures > 0 ? 1 : 0);
