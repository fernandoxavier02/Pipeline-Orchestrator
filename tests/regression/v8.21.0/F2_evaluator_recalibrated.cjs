#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.21.0) — e2e-evaluator recalibrated replay (Slice S2). TDD RED.
// =============================================================================
// GOAL: pin the OBSERVABLE effect of wiring `lib/e2e-evaluator.cjs` to the new
// GateExpectation selector (subtask 3.3). Three facts:
//   (1.5) Replaying the REAL sealed run 2026-06-29 through scoreRun must score
//         CLEAN — the ~24 exception-only / spec-processing gates that never
//         "fired" are no longer charged as `missing_gate`, because they are not
//         part of a sealed spec-authoring run's recalibrated expectation.
//   (1.6) A mutation of that same fixture carrying a GENUINE miss (the seal gate
//         SPEC_SEALED removed from gate-decisions) stays PENALIZED — recalibration
//         narrows the ruler, it does NOT blanket-pass every run.
//   (1.7) The cross-run eval-log line carries the `ruler_version` marker.
//
// WHY THIS IS A GENUINE RED (right reason): `buildExpectedSet` still measures this
// spec-heavy run against the full COMPLEXA+SPEC processing set (24 gates), so
// scoreRun today returns e2e_score=30 with 24 `missing_gate` glitches (verified in
// the sealed run's own e2e-eval.json). None of the assertions below can hold until
// the selector is wired and authoring is recognized by seal (not variant string).
// Every case runs against a REAL scoreRun result and fails on an assertion — not
// an import/syntax/file error. The require of e2e-evaluator SUCCEEDS (module
// exists); only the recalibrated BEHAVIOUR is absent.
//
// FIXTURE HYGIENE: the committed fixture dir is read-only reference. scoreRun /
// generateFidelityReport WRITE artifacts (e2e-eval.json, fidelity-report.json)
// into pipelineDocPath and append to <repoRoot>/.pipeline/eval-log.jsonl, so this
// test COPIES the fixture into a throwaway temp repo before scoring (also dodges
// the pre-existing out-of-contract discovery-hook that pollutes fixture dirs).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const E = require('../../../lib/e2e-evaluator.cjs'); // must load — else WRONG red

const FIXTURE_DIR = path.join(
  __dirname, '..', '..', 'fixtures', 'e2e-eval', '2026-06-29-telemetry-instrumentation-spec',
);
// RULER_VERSION per the contract (design.md "GateExpectation"). Hardcoded here so
// F2 stays independent of the not-yet-existent gate-expectation.cjs module (F1
// owns that module's contract; F2 owns the evaluator wiring).
const EXPECTED_RULER_VERSION = '2';

// Copy the fixture's trace files into a fresh temp repo and return { repoRoot,
// docPath, state }. `gateFilter` lets a case drop specific gate lines.
function stageFixture(prefix, gateFilter) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Complexa-action', 'replay-run');
  fs.mkdirSync(docPath, { recursive: true });

  // sentinel-state.json → the run's state object (carries seal evidence).
  const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'sentinel-state.json'), 'utf8'));

  // gate-decisions.jsonl (optionally filtered) + protocol-events.jsonl.
  const gdRaw = fs.readFileSync(path.join(FIXTURE_DIR, 'gate-decisions.jsonl'), 'utf8');
  const gdLines = gdRaw.split(/\r?\n/).filter((l) => l.trim().length > 0).filter((l) => {
    if (!gateFilter) return true;
    try { return gateFilter(JSON.parse(l)); } catch { return true; }
  });
  fs.writeFileSync(path.join(docPath, 'gate-decisions.jsonl'), gdLines.join('\n') + '\n');

  const peSrc = path.join(FIXTURE_DIR, 'protocol-events.jsonl');
  if (fs.existsSync(peSrc)) fs.copyFileSync(peSrc, path.join(docPath, 'protocol-events.jsonl'));

  return { repoRoot, docPath, state };
}
function cleanup(repoRoot) {
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch { /* best effort */ }
}

// The sealed run's CURRENT (pre-recalibration) baseline, verified live from the
// sealed run's own e2e-eval.json: e2e_score=30, 24 missing_gate glitches.
const SEALED_BASELINE_SCORE = 30;

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e && e.message}`); fail++; failed.push(name); }
}
const missingGates = (ev) => ev.glitches.filter((g) => g.kind === 'missing_gate');

console.log('=== F2 v8.21.0 — e2e-evaluator recalibrated replay [RED] ===');

// 1.5 — [MAIN] clean replay: the false-missing spec-processing gates are gone. --
test('F2-1.5 [MAIN] clean replay — sealed 2026-06-29 run scores clean (no false missing_gate glitches)', () => {
  const { repoRoot, docPath, state } = stageFixture('f2-clean-');
  try {
    const ev = E.scoreRun({ pipelineDocPath: docPath, repoRoot, state });
    assert.equal(ev.ok, true, 'scoreRun must succeed on the fixture');
    assert.equal(missingGates(ev).length, 0,
      `after recalibration a sealed spec-authoring run must charge ZERO missing_gate glitches `
      + `(the ~24 exception-only/spec-processing gates are no longer expected); got `
      + `${missingGates(ev).length}: ${missingGates(ev).map((g) => g.target).join(', ')}`);
    assert.notEqual(ev.subscores.gate_coverage, 0,
      'gate coverage must no longer be a false 0 — the recalibrated expected set is fully covered');
    assert.ok(ev.e2e_score > SEALED_BASELINE_SCORE,
      `e2e_score must improve past the pre-recalibration baseline (${SEALED_BASELINE_SCORE}); got ${ev.e2e_score}`);
  } finally { cleanup(repoRoot); }
});

// 1.6 — [REGRESSION] genuine miss stays penalized: drop the seal gate. ----------
test('F2-1.6 [REGRESSION] real failure — removing the SPEC_SEALED gate keeps the run penalized', () => {
  // Clean run (full fixture) for the comparison score.
  const clean = stageFixture('f2-cmp-clean-');
  let cleanScore;
  try {
    cleanScore = E.scoreRun({ pipelineDocPath: clean.docPath, repoRoot: clean.repoRoot, state: clean.state }).e2e_score;
  } finally { cleanup(clean.repoRoot); }

  // Mutated run: same sealed state (still recognized as sealed via sentinel), but
  // the SPEC_SEALED gate line is stripped from gate-decisions → a genuine miss.
  const mut = stageFixture('f2-real-miss-', (ev) => ev.gate !== 'SPEC_SEALED');
  try {
    const ev = E.scoreRun({ pipelineDocPath: mut.docPath, repoRoot: mut.repoRoot, state: mut.state });
    const missTargets = missingGates(ev).map((g) => g.target);
    assert.ok(missTargets.includes('SPEC_SEALED'),
      `a sealed run whose SPEC_SEALED gate never fired must raise a missing_gate for SPEC_SEALED; got: ${missTargets.join(', ') || '(none)'}`);
    assert.ok(ev.e2e_score < cleanScore,
      `a run with a genuine miss must score strictly below the clean run (clean=${cleanScore}, mutated=${ev.e2e_score})`);
  } finally { cleanup(mut.repoRoot); }
});

// 1.7 — [EDGE] eval-log line carries the ruler_version marker. -----------------
test('F2-1.7 [EDGE] eval-log — the appended cross-run entry carries ruler_version="2"', () => {
  const { repoRoot, docPath, state } = stageFixture('f2-rulerver-');
  try {
    const ev = E.evaluateRun({ pipelineDocPath: docPath, repoRoot, state });
    assert.equal(ev.ok, true, 'evaluateRun must succeed');
    const log = E.readEvalLog(repoRoot);
    assert.ok(log.length >= 1, 'evaluateRun must append exactly one eval-log entry');
    const entry = log[log.length - 1];
    assert.equal(entry.ruler_version, EXPECTED_RULER_VERSION,
      `the eval-log entry must carry ruler_version="${EXPECTED_RULER_VERSION}" (additive schema marker); got ${JSON.stringify(entry.ruler_version)}`);
  } finally { cleanup(repoRoot); }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
