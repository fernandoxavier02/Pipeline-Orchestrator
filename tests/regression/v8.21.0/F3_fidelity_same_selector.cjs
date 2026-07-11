#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.21.0) — fidelity + gate-coverage share ONE selector (Slice S2). RED.
// =============================================================================
// GOAL (Requirement 1.8): the fidelity_score and the E2E gate_coverage sub-score
// of the SAME run must be produced by the SAME recalibrated selector, so they can
// never contradict each other. Concretely, for the sealed 2026-06-29 run:
//   * scoreRun's `fidelity_score` (sourced from generateFidelityReport) and its
//     `subscores.gate_coverage` must be EQUAL (single source of truth), AND
//   * both must reflect the RECALIBRATED ruler — a clean 1.0 for this sealed
//     authoring run whose two authoring gates (SPEC_SEALED, SPEC_REVIEW_FINDINGS)
//     both fired — NOT the old harsh 0 produced by measuring a spec-authoring run
//     against the 24-gate COMPLEXA+SPEC processing set, AND
//   * the persisted fidelity-report.json must count the SAME small recalibrated
//     expected set as scoreRun.expected.gates (the shared selector, not the harsh
//     24).
//
// WHY THIS IS A GENUINE RED (right reason): today generateFidelityReport keys
// authoring off the variant STRING ('spec-heavy' is NOT an authoring variant), so
// it measures this run against 24 processing gates → mandatory_triggered 0 →
// fidelity_score 0, and scoreRun mirrors 0 for gate_coverage. The equality
// (0===0) holds trivially, but every RECALIBRATED assertion below (both ===1, the
// expected count is the small recalibrated set, fidelity is not the false 0)
// fails on a clean assertion until authoring-by-seal + the shared selector are
// wired. Both modules load fine; only the recalibrated wiring is absent.
//
// Signature-agnostic on purpose: this test drives the INTEGRATED path (scoreRun,
// which threads the run state into generateFidelityReport and writes
// fidelity-report.json) rather than guessing generateFidelityReport's new
// argument shape.
//
// FIXTURE HYGIENE: copies the read-only fixture into a throwaway temp repo before
// scoring (scoreRun + generateFidelityReport write artifacts into the dirs).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const E = require('../../../lib/e2e-evaluator.cjs'); // must load — else WRONG red

const FIXTURE_DIR = path.join(
  __dirname, '..', '..', 'fixtures', 'e2e-eval', '2026-06-29-telemetry-instrumentation-spec',
);

function stageFixture(prefix) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Complexa-action', 'replay-run');
  fs.mkdirSync(docPath, { recursive: true });
  const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'sentinel-state.json'), 'utf8'));
  for (const f of ['gate-decisions.jsonl', 'protocol-events.jsonl']) {
    const src = path.join(FIXTURE_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(docPath, f));
  }
  return { repoRoot, docPath, state };
}
function cleanup(repoRoot) {
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch { /* best effort */ }
}

// The pre-recalibration harsh expected set for this spec-heavy run is 24 gates.
// The recalibrated authoring ruler is a small set (the two authoring gates), so a
// generous ceiling well below 24 pins "the shared selector shrank the ruler".
const RECALIBRATED_MAX_EXPECTED = 6;
const HARSH_EXPECTED_COUNT = 24;

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e && e.message}`); fail++; failed.push(name); }
}

console.log('=== F3 v8.21.0 — fidelity + gate_coverage share one selector [RED] ===');

// 1 — [MAIN] the two sub-scores are equal AND both recalibrated-clean. ---------
test('F3-1 [MAIN] gate_coverage === fidelity_score, and both are the recalibrated clean 1.0', () => {
  const { repoRoot, docPath, state } = stageFixture('f3-main-');
  try {
    const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
    assert.equal(ev.ok, true, 'scoreRun must succeed');
    assert.equal(ev.subscores.gate_coverage, ev.fidelity_score,
      `gate_coverage (${ev.subscores.gate_coverage}) and fidelity_score (${ev.fidelity_score}) must match — one selector, no contradiction`);
    assert.equal(ev.fidelity_score, 1,
      `a sealed authoring run whose authoring gates all fired must score fidelity 1 under the recalibrated ruler; got ${ev.fidelity_score}`);
    assert.equal(ev.subscores.gate_coverage, 1,
      `gate_coverage must likewise be the recalibrated clean 1; got ${ev.subscores.gate_coverage}`);
  } finally { cleanup(repoRoot); }
});

// 2 — [REGRESSION] the shared selector shrank the expected set on BOTH surfaces. -
test('F3-2 [REGRESSION] shared selector — fidelity-report and scoreRun count the SAME small recalibrated set', () => {
  const { repoRoot, docPath, state } = stageFixture('f3-shared-');
  try {
    const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
    const reportPath = path.join(docPath, 'fidelity-report.json');
    assert.ok(fs.existsSync(reportPath), 'scoreRun must have written fidelity-report.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.ok(ev.expected.gates.length <= RECALIBRATED_MAX_EXPECTED,
      `scoreRun.expected.gates must be the small recalibrated set (<= ${RECALIBRATED_MAX_EXPECTED}, was ${HARSH_EXPECTED_COUNT} harsh); got ${ev.expected.gates.length}`);
    assert.equal(report.mandatory_expected, ev.expected.gates.length,
      `fidelity-report.mandatory_expected (${report.mandatory_expected}) must equal scoreRun's recalibrated expected count (${ev.expected.gates.length}) — same selector on both surfaces`);
    assert.ok(report.mandatory_expected <= RECALIBRATED_MAX_EXPECTED,
      `fidelity-report must measure against the recalibrated set, not the harsh ${HARSH_EXPECTED_COUNT}; got ${report.mandatory_expected}`);
  } finally { cleanup(repoRoot); }
});

// 3 — [EDGE] the harsh-ruler false zero is gone from the fidelity report. -------
test('F3-3 [EDGE] no false zero — fidelity-report.json fidelity_score for the sealed run is not the harsh 0', () => {
  const { repoRoot, docPath, state } = stageFixture('f3-nofalse-');
  try {
    E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
    const report = JSON.parse(fs.readFileSync(path.join(docPath, 'fidelity-report.json'), 'utf8'));
    assert.notEqual(report.fidelity_score, 0,
      'the sealed authoring run must not be scored a false 0 by measuring it against the processing ruler');
    assert.equal(report.fidelity_score, 1,
      `with the recalibrated ruler the sealed run's authoring gates are all covered → fidelity 1; got ${report.fidelity_score}`);
  } finally { cleanup(repoRoot); }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
