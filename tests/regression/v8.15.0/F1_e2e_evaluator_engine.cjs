#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — e2e-evaluator engine: expected-vs-actual scoring + glitch detection
// =============================================================================
// scoreRun joins the run's intended workflow (step manifests + mandatory gates)
// against its immutable trace (step_ledger + gate-decisions + protocol-events)
// and produces e2e_score (0-100, higher=better) + a glitch list. N/A sub-scores
// (a report-only run the agent ledger never tracked) are dropped + renormalized,
// so "evaluate every run" holds without false glitches.
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const E = require(path.join(root, 'lib', 'e2e-evaluator.cjs'));
const { mandatorySetFor } = require(path.join(root, 'lib', 'fidelity-reporter.cjs'));
const { agentStepsFor } = require(path.join(root, 'lib', 'step-ledger.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) { failures++; console.log(`FAIL | exp=${JSON.stringify(exp)} got=${JSON.stringify(got)} | ${label}`); }
  else console.log(`OK   | ${label}`);
}
function checkTrue(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | expected truthy | ${label}`); }
  else console.log(`OK   | ${label}`);
}

// Build an isolated repo root + run dir; write the trace files.
function setupRun(gates, protocolEvents) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-eval-'));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-bugfix-action', 'demo', '001-run');
  fs.mkdirSync(docPath, { recursive: true });
  if (gates && gates.length) {
    const lines = gates.map((g) => JSON.stringify({ gate: g, hardness: 'MANDATORY', decision: 'TRIGGERED', timestamp_utc: '2026-06-26T00:00:00Z' }));
    fs.writeFileSync(path.join(docPath, 'gate-decisions.jsonl'), lines.join('\n') + '\n');
  }
  if (protocolEvents && protocolEvents.length) {
    const lines = protocolEvents.map((e) => JSON.stringify({ event: e, detail: 'test', decided_by: 'test', ts: '2026-06-26T00:00:00Z' }));
    fs.writeFileSync(path.join(docPath, 'protocol-events.jsonl'), lines.join('\n') + '\n');
  }
  return { repoRoot, docPath };
}

const FULL_STEPS = agentStepsFor('FULL');
const MEDIA_GATES = mandatorySetFor('MEDIA', 'Bug Fix', null);

// --- Case A: perfect FULL/MEDIA run → 100, zero glitches ---------------------
{
  const { repoRoot, docPath } = setupRun(MEDIA_GATES, []);
  const state = { run_id: 'caseA', task_type: 'Bug Fix', complexity: 'MEDIA', step_ledger: FULL_STEPS.slice() };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('A: ok', ev.ok, true);
  check('A: e2e_score 100', ev.e2e_score, 100);
  check('A: zero glitches', ev.glitch_count, 0);
  check('A: stepCompletion 1', ev.subscores.step_completion, 1);
  check('A: gateCoverage 1', ev.subscores.gate_coverage, 1);
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case B: skipped info-gate + missing gates + a bypass --------------------
{
  const someGates = MEDIA_GATES.slice(0, 3); // only first 3 mandatory gates fired
  const { repoRoot, docPath } = setupRun(someGates, ['PLAN_MODE_BYPASS']);
  // step_ledger jumps classify -> plan (info-gate skipped) → out_of_order
  const state = { run_id: 'caseB', task_type: 'Bug Fix', complexity: 'MEDIA', step_ledger: ['classify', 'plan'] };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('B: ok', ev.ok, true);
  checkTrue('B: score below 100', ev.e2e_score < 100);
  const kinds = ev.glitches.map((g) => g.kind);
  checkTrue('B: has missing_step', kinds.includes('missing_step'));
  checkTrue('B: has out_of_order', kinds.includes('out_of_order'));
  checkTrue('B: has missing_gate', kinds.includes('missing_gate'));
  checkTrue('B: has hygiene_violation', kinds.includes('hygiene_violation'));
  const ooo = ev.glitches.find((g) => g.kind === 'out_of_order');
  check('B: out_of_order at info-gate', ooo && ooo.target, 'info-gate');
  // missing gates = expected minus the 3 fired
  const missingGateCount = ev.glitches.filter((g) => g.kind === 'missing_gate').length;
  check('B: missing_gate count', missingGateCount, MEDIA_GATES.length - 3);
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case C: report-only run, empty agent ledger → step/order N/A ------------
{
  const { repoRoot, docPath } = setupRun(mandatorySetFor('MEDIA', 'Audit', null), []);
  const state = { run_id: 'caseC', task_type: 'Audit', complexity: 'MEDIA', step_ledger: [] };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('C: stepCompletion N/A', ev.subscores.step_completion, null);
  check('C: orderIntegrity N/A', ev.subscores.order_integrity, null);
  const kinds = ev.glitches.map((g) => g.kind);
  checkTrue('C: no missing_step (not falsely penalized)', !kinds.includes('missing_step'));
  // gate+hygiene only, both perfect → 100
  check('C: e2e_score 100', ev.e2e_score, 100);
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case D: eval-log append + read round-trip ------------------------------
{
  const { repoRoot, docPath } = setupRun(MEDIA_GATES, []);
  const state = { run_id: 'caseD', task_type: 'Bug Fix', complexity: 'MEDIA', step_ledger: FULL_STEPS.slice() };
  const ev = E.evaluateRun({ pipelineDocPath: docPath, repoRoot, state });
  check('D: evaluateRun ok', ev.ok, true);
  checkTrue('D: e2e-eval.json written', fs.existsSync(path.join(docPath, 'e2e-eval.json')));
  checkTrue('D: e2e-eval.md written', fs.existsSync(path.join(docPath, 'e2e-eval.md')));
  const log = E.readEvalLog(repoRoot);
  check('D: eval-log has 1 entry', log.length, 1);
  check('D: eval-log run_id', log[0] && log[0].run_id, 'caseD');
  check('D: eval-log e2e_score', log[0] && log[0].e2e_score, 100);
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n>>> F1 PASS' : `\n>>> F1 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
