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
// A gate entry may be a plain string (defaults to decision 'TRIGGERED', the prior
// behavior — byte-identical output) OR a { gate, decision } object so a case can
// pin a specific decision (e.g. NOT_TRIGGERED for the NEW-2 filter case).
function setupRun(gates, protocolEvents) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-eval-'));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-bugfix-action', 'demo', '001-run');
  fs.mkdirSync(docPath, { recursive: true });
  if (gates && gates.length) {
    const lines = gates.map((g) => {
      const gate = typeof g === 'string' ? g : g.gate;
      const decision = typeof g === 'string' ? 'TRIGGERED' : (g.decision || 'TRIGGERED');
      return JSON.stringify({ gate, hardness: 'MANDATORY', decision, timestamp_utc: '2026-06-26T00:00:00Z' });
    });
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
  // v8.21.0 (S2) re-baseline: scoreRun now measures against the RECALIBRATED gate
  // set, not the full MEDIA mandatory set. For this Bug Fix/MEDIA run the recalibrated
  // expectation is the 4 happy-path gates (TDD_APPROVAL, COMPLEXITY_GATE,
  // CLOSEOUT_CONFIRM, ADVERSARIAL_GATE) — the exception-only gates are dropped because
  // no matching failure occurred. TDD_APPROVAL is among the 3 fired, so missing = 3.
  // (design.md ~line 107: "4 happy-path gates expected, TDD_APPROVAL fired => missing = 3").
  // BIZ-1 fix (task 3.3 review): failureContexts is now sourced from the FIRED gate
  // names, so the two fired exception-only gates (STATE_FILE_INIT_FAIL, INFO_GATE_BLOCKED)
  // ALSO enter the recalibrated set — but both fired, so they add NO missing_gate. The 3
  // unfired happy-path gates (COMPLEXITY_GATE, CLOSEOUT_CONFIRM, ADVERSARIAL_GATE) remain
  // the only misses, so the count is UNCHANGED at 3.
  const missingGateCount = ev.glitches.filter((g) => g.kind === 'missing_gate').length;
  check('B: missing_gate count', missingGateCount, 3);
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

// --- Case E (BIZ-1 / task 3.3): a genuinely-FIRED exception-only gate must land in
//     `expected`. Before the fix, failureContexts came ONLY from protocol-event names
//     (a disjoint vocabulary), so no exception-only gate name could ever match and none
//     entered `expected`. Now failureContexts is sourced from the FIRED gate names, so a
//     fired exception-only gate (CHECKPOINT_FAIL) IS expected, while an UN-fired one
//     (STOP_RULE) is still correctly dropped — the exact-name-match predicate is intact.
{
  const MEDIA_HAPPY = ['TDD_APPROVAL', 'COMPLEXITY_GATE', 'ADVERSARIAL_GATE', 'CLOSEOUT_CONFIRM'];
  // exception-only CHECKPOINT_FAIL genuinely fired; STOP_RULE (also exception-only) did NOT.
  const firedGates = MEDIA_HAPPY.concat(['CHECKPOINT_FAIL']);
  const { repoRoot, docPath } = setupRun(firedGates, []);
  const state = { run_id: 'caseE', task_type: 'Bug Fix', complexity: 'MEDIA', step_ledger: FULL_STEPS.slice() };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('E: ok', ev.ok, true);
  checkTrue('E: fired exception-only CHECKPOINT_FAIL IS in expected', ev.expected.gates.includes('CHECKPOINT_FAIL'));
  checkTrue('E: un-fired exception-only STOP_RULE NOT in expected', !ev.expected.gates.includes('STOP_RULE'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case F (BIZ-2 / ARCH-1 / task 3.3): pin the 'post-impl' phase LANDMINE for a
//     NON-sealed Spec processing run. phasesReached is derived from the signed
//     step-ledger; phase 'final' IS a real stamped step, so FINAL_ADVERSARIAL_GATE is
//     correctly kept, but phase 'post-impl' has NO ledger producer today, so
//     SPEC_POST_IMPL_FAIL + ADVERSARIAL_LOOP_CHECKPOINT are silently dropped. This pins
//     the interim behavior; the STRUCTURAL remap is task 3.4 — when it lands, the two
//     post-impl assertions below flip to "kept" (an intentional tripwire).
{
  const specGates = mandatorySetFor('COMPLEXA', 'Spec', 'spec-heavy');
  const { repoRoot, docPath } = setupRun(specGates, []);
  // workflow_key='FULL' → the run stamps FULL agent steps (incl. 'final'); task_type
  // 'Spec' still pulls in the SPEC mandatory gates; variant 'spec-heavy' is a PROCESSING
  // variant (NOT authoring) and there is no seal evidence → isSealedAuthoring is false.
  const state = {
    run_id: 'caseF', task_type: 'Spec', complexity: 'COMPLEXA',
    variant: 'spec-heavy', workflow_key: 'FULL', step_ledger: FULL_STEPS.slice(),
  };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('F: ok', ev.ok, true);
  checkTrue('F: FINAL_ADVERSARIAL_GATE kept — phase "final" IS a stamped step', ev.expected.gates.includes('FINAL_ADVERSARIAL_GATE'));
  checkTrue('F: SPEC_POST_IMPL_FAIL dropped — post-impl landmine (task 3.4)', !ev.expected.gates.includes('SPEC_POST_IMPL_FAIL'));
  checkTrue('F: ADVERSARIAL_LOOP_CHECKPOINT dropped — post-impl landmine (task 3.4)', !ev.expected.gates.includes('ADVERSARIAL_LOOP_CHECKPOINT'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case G (NEW-1 / ARCH-6 / task 3.3 attempt 2): the gate_coverage sub-score must
//     be measured against the SAME recalibrated set as the missing_gate list, for a
//     NON-sealed Spec-processing run. Before the fix, non-sealed runs took gate_coverage
//     from the OLD unrecalibrated fidelityScore (the harsh 24-gate processing set),
//     while the missing_gate list iterated the small recalibrated set — the two numbers
//     silently contradicted each other. This fires only the 4 happy-path gates + the
//     phase-'final' gate, so the recalibrated set (5) is fully covered (coverage 1) while
//     the harsh set (24) is only 5/24 ≈ 0.21 — the two would differ before the fix.
{
  const HAPPY = ['TDD_APPROVAL', 'COMPLEXITY_GATE', 'ADVERSARIAL_GATE', 'CLOSEOUT_CONFIRM'];
  // FINAL_ADVERSARIAL_GATE is phase-conditional on phase 'final' (a real stamped step);
  // firing it gives the recalibrated set full coverage. NO exception-only gate fires, so
  // all of them (and the two post-impl phase-conditional gates) are correctly dropped.
  const firedGates = HAPPY.concat(['FINAL_ADVERSARIAL_GATE']);
  const { repoRoot, docPath } = setupRun(firedGates, []);
  const state = {
    run_id: 'caseG', task_type: 'Spec', complexity: 'COMPLEXA',
    variant: 'spec-heavy', workflow_key: 'FULL', step_ledger: FULL_STEPS.slice(),
  };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('G: ok', ev.ok, true);
  const expectedCount = ev.expected.gates.length;
  const missingCount = ev.glitches.filter((g) => g.kind === 'missing_gate').length;
  const impliedCoverage = expectedCount > 0 ? (expectedCount - missingCount) / expectedCount : null;
  // The core NEW-1 assertion: the subscore equals what the missing_gate list implies over
  // the recalibrated set — they cannot contradict. (Was fidelityScore ≈ 5/24 before the fix.)
  check('G: gate_coverage consistent with the recalibrated missing_gate list', ev.subscores.gate_coverage, impliedCoverage);
  checkTrue('G: recalibrated expected set is the SMALL set (< harsh 24)', expectedCount < 24);
  check('G: recalibrated set fully covered → coverage 1 (not the harsh 5/24)', ev.subscores.gate_coverage, 1);
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case H (NEW-2 / task 3.3 attempt 2): an exception-only gate logged with decision
//     NOT_TRIGGERED on a CLEAN run must NOT become "expected". CHECKPOINT_FAIL and
//     PLAN_REJECTED are routinely logged NOT_TRIGGERED on successful runs, so sourcing
//     failureContexts from ANY decision (attempt 1) made them permanently "expected" and
//     collapsed missing_gate detection to a tautology for them. failureContexts is now
//     sourced from GENUINELY-triggered gates only: a gate logged NOT_TRIGGERED is dropped,
//     while a genuinely-TRIGGERED exception-only gate is still expected. Case E hardcodes
//     decision:'TRIGGERED' for every gate and cannot catch this — Case H pins the filter.
{
  const HAPPY = ['TDD_APPROVAL', 'COMPLEXITY_GATE', 'ADVERSARIAL_GATE', 'CLOSEOUT_CONFIRM'];
  const gateEntries = HAPPY.map((g) => ({ gate: g, decision: 'TRIGGERED' }));
  // CHECKPOINT_FAIL logged NOT_TRIGGERED (clean run — the checkpoint passed);
  // STATE_FILE_INIT_FAIL genuinely TRIGGERED (a real failure). Both are exception-only
  // and both are in the MEDIA base set, so only the DECISION distinguishes them.
  gateEntries.push({ gate: 'CHECKPOINT_FAIL', decision: 'NOT_TRIGGERED' });
  gateEntries.push({ gate: 'STATE_FILE_INIT_FAIL', decision: 'TRIGGERED' });
  const { repoRoot, docPath } = setupRun(gateEntries, []);
  const state = { run_id: 'caseH', task_type: 'Bug Fix', complexity: 'MEDIA', step_ledger: FULL_STEPS.slice() };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('H: ok', ev.ok, true);
  checkTrue('H: NOT_TRIGGERED exception-only CHECKPOINT_FAIL is NOT expected (no tautology)', !ev.expected.gates.includes('CHECKPOINT_FAIL'));
  checkTrue('H: genuinely-TRIGGERED exception-only STATE_FILE_INIT_FAIL IS expected', ev.expected.gates.includes('STATE_FILE_INIT_FAIL'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case I (NEW-5 / task 3.3 attempt 3): the top-level fidelity_score must stay on
//     the OLD, un-recalibrated meter even on the FALLBACK path (generateFidelityReport
//     returns ok:false). Before the fix, `if (!fidelityOk) fidelityScore = localGateCoverage`
//     reused the RECALIBRATED ratio — the moment task 3.3 switched localGateCoverage to
//     recalibratedGates, that fallback silently advanced fidelity_score to the recalibrated
//     value (the number task 3.4 owns, deliberately kept RED by v8.21.0/F3). No prior case
//     forced the fallback (the committed fixtures all use a valid complexity ⇒ reporter
//     succeeds). This reproduces the REAL production trigger both reviewers cited: a SEALED
//     spec run whose sentinel carries the 'unknown' complexity placeholder + a non-authoring
//     variant ('spec-heavy') — mandatorySetFor keeps it complexity-independent (SPEC set),
//     but generateFidelityReport's enum guard rejects 'unknown' (fidelity-reporter.cjs:455),
//     so fidelityOk is false and the fallback fires.
{
  // Authoring gates (SPEC_SEALED, SPEC_REVIEW_FINDINGS) drive the RECALIBRATED subscore:
  // for a sealed authoring run the recalibrated base is the 2-gate SPEC_AUTHORING set, so
  // firing both gives gate_coverage = 1. The OLD meter, however, measures against the
  // un-recalibrated expectedGates = mandatorySetFor('unknown','Spec','spec-heavy') = the
  // 6-gate SPEC processing set; firing 3 of those 6 gives the legacy ratio 3/6 = 0.5.
  const firedGates = [
    'SPEC_SEALED', 'SPEC_REVIEW_FINDINGS',              // → recalibrated coverage = 1
    'SPEC_ARTIFACT_MISSING', 'SPEC_FORMAT_GATE_FAIL', 'SPEC_CONTENT_REVIEW_NOGO', // 3 of 6 SPEC
  ];
  const { repoRoot, docPath } = setupRun(firedGates, []);
  const state = {
    run_id: 'caseI', task_type: 'Spec', complexity: 'unknown',
    variant: 'spec-heavy', final_decision: 'SEALED', step_ledger: [],
  };
  const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
  check('I: ok', ev.ok, true);
  // The recalibrated subscore is unchanged (NEW-1 intact): fired over the 2 authoring gates.
  check('I: recalibrated gate_coverage subscore stays 1', ev.subscores.gate_coverage, 1);
  // The CORE NEW-5 assertion: on the reporter-rejected fallback, fidelity_score is the OLD
  // un-recalibrated ratio (3/6), NOT the recalibrated localGateCoverage (which was 1).
  // Before the fix this asserted 1 (the leaked recalibrated value) — a genuine RED-revert.
  check('I: fidelity_score is the legacy un-recalibrated ratio (3/6), not the recalibrated 1', ev.fidelity_score, 0.5);
  checkTrue('I: fidelity_score does NOT equal the recalibrated gate_coverage (no leak)', ev.fidelity_score !== ev.subscores.gate_coverage);
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n>>> F1 PASS' : `\n>>> F1 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
