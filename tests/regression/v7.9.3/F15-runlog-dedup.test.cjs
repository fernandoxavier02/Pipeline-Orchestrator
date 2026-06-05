#!/usr/bin/env node
// =============================================================================
// F15 — Run-log dedup guard (stop-hook, v7.9.3 BUG 1)
// =============================================================================
// TDD RED-phase suite for the run-log de-duplication fix. A real run on
// 2026-06-01 accumulated 31 run-log entries with only 5 distinct material
// signatures: the stop-hook re-appended an identical line on every session
// teardown. The fix adds a pre-append guard that compares only the MATERIAL
// fields (excluding timestamp_end / duration_seconds, which always change) and
// skips the append when the last entry for the same run_id is materially
// identical — but still appends on first-time, on material progress, and on
// any guard error (soft-fail to append, never silently swallow a real run).
//
// CONTRACT under test (from the approved IMPLEMENTATION_PLAN):
//   stop-hook.cjs exports shouldAppendRunLogEntry(candidate, existingEntries, sentinel?)
//     -> returns true  when the candidate should be written (first time, or a
//        material field differs from the most recent same-run entry)
//     -> returns false when the most recent same-run entry is materially
//        identical (only timestamp / duration differ)
//   Material fields: type, complexity, variant, total_gates_triggered,
//                    total_gates_expected, fidelity_score, final_decision,
//                    pipeline_doc_path  (run_id identifies the run).
//   Non-material (ignored in the comparison): timestamp_start, timestamp_end,
//                    duration_seconds.
//
// RED-phase expectation (against CURRENT v7.9.2 code, which exports only
// { handleStop, buildRunLogEntry, findActiveRunFolder, langfuseFlushAndCleanup }
// and has NO dedup guard):
//   FAIL now: S1 S2 S3 S4 S5 S6  (shouldAppendRunLogEntry is undefined ->
//             the test detects the missing export and fails the assertion).
//   PASS now: S7  (the .claude/.codex mirrors are already byte-identical; the
//             parity invariant must simply STAY true after the Batch 1 patch).
//
// The hook's CLI stdin block is guarded by `require.main === module`, so a
// direct require() does not hang. Harness mold mirrors F13/F14: record()/
// pass/fail/results, mkdtempSync temp folders, env save/restore, process.exit.
// Auto-discovered by scripts/run-tests.cjs (v7.9.3 matches the semver glob).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs');
const HOOK_CODEX = path.join(ROOT, '.codex', 'hooks', 'stop-hook.cjs');

let pass = 0;
let fail = 0;
const results = [];
const _tmpDirs = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }

function sha256(buf) {
  return require('node:crypto').createHash('sha256').update(buf).digest('hex');
}

// Import under test. Direct require is safe: the CLI block is guarded by
// `require.main === module`, so importing won't block on stdin.
const hook = require(HOOK_PATH);
const { shouldAppendRunLogEntry } = hook;

// A complete, materially-populated run-log entry for run "r-001". Helper so each
// scenario can clone + tweak a single field without repeating the shape.
function baseEntry(overrides) {
  return Object.assign({
    run_id: 'r-001',
    timestamp_start: '2026-06-05T10:00:00.000Z',
    timestamp_end: '2026-06-05T10:05:00.000Z',
    type: 'Bug Fix',
    complexity: 'MEDIA',
    variant: 'bugfix-light',
    total_gates_triggered: 8,
    total_gates_expected: 11,
    fidelity_score: 0.87,
    duration_seconds: 300,
    final_decision: 'GO',
    pipeline_doc_path: '.pipeline/docs/Pre-Medium-action/run/',
  }, overrides || {});
}

// Defensive caller: shouldAppendRunLogEntry may not exist yet (RED). Calling an
// undefined function throws a TypeError we surface as a failure with a clear
// reason, instead of letting the suite crash at load.
function callGuard(candidate, existing, sentinel) {
  if (typeof shouldAppendRunLogEntry !== 'function') {
    throw new TypeError('stop-hook does not export shouldAppendRunLogEntry (guard not implemented)');
  }
  return shouldAppendRunLogEntry(candidate, existing, sentinel);
}

console.log('=== F15 Run-log dedup guard (stop-hook shouldAppendRunLogEntry) ===');

try {
  // =========================================================================
  // S1 (main) — skip-idêntico: same material fields, different timestamp -> false
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const existing = [baseEntry()];
      // Candidate differs ONLY in timestamp_end + duration_seconds (non-material).
      const candidate = baseEntry({
        timestamp_end: '2026-06-05T11:30:00.000Z',
        duration_seconds: 5700,
      });
      const decision = callGuard(candidate, existing);
      ok = decision === false;
      why = `shouldAppend=${JSON.stringify(decision)} (want false — material fields identical)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F15-S1: main — identical material fields are NOT re-appended', ok, why);
  }

  // =========================================================================
  // S2 (main) — append-progresso-material: final_decision UNKNOWN -> GO -> true
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const existing = [baseEntry({ final_decision: 'UNKNOWN' })];
      const candidate = baseEntry({ final_decision: 'GO' });
      const decision = callGuard(candidate, existing);
      ok = decision === true;
      why = `shouldAppend=${JSON.stringify(decision)} (want true — final_decision changed UNKNOWN->GO)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F15-S2: main — material progress (final_decision UNKNOWN->GO) is appended', ok, why);
  }

  // =========================================================================
  // S3 (main) — append-fidelity-null→num: fidelity_score null -> 0.87 -> true
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const existing = [baseEntry({ fidelity_score: null })];
      const candidate = baseEntry({ fidelity_score: 0.87 });
      const decision = callGuard(candidate, existing);
      ok = decision === true;
      why = `shouldAppend=${JSON.stringify(decision)} (want true — fidelity_score null->0.87 is material)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F15-S3: main — fidelity_score null->number is material and is appended', ok, why);
  }

  // =========================================================================
  // S4 (main) — primeira-vez-apenda: no prior entry for this run -> true
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      // Log is non-empty but holds only OTHER runs; nothing for r-001.
      const existing = [baseEntry({ run_id: 'r-other', final_decision: 'NO-GO' })];
      const candidate = baseEntry(); // run_id 'r-001' — first time
      const decision = callGuard(candidate, existing);
      ok = decision === true;
      why = `shouldAppend=${JSON.stringify(decision)} (want true — first entry for this run_id)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F15-S4: main — first-ever entry for a run is always appended', ok, why);
  }

  // =========================================================================
  // S5 (edge) — timestamp-only-não-conta: ONLY timestamp_start differs -> false
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const existing = [baseEntry()];
      // Differ in BOTH timestamps but keep every material field identical.
      const candidate = baseEntry({
        timestamp_start: '2026-06-05T09:59:59.000Z',
        timestamp_end: '2026-06-05T12:00:00.000Z',
        duration_seconds: 7201,
      });
      const decision = callGuard(candidate, existing);
      ok = decision === false;
      why = `shouldAppend=${JSON.stringify(decision)} (want false — only timestamp/duration differ)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F15-S5: edge — timestamp/duration-only difference does NOT trigger append', ok, why);
  }

  // =========================================================================
  // S6 (edge) — run-fechado-reforçado: sentinel complete + identical -> false
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const existing = [baseEntry()];
      const candidate = baseEntry({
        timestamp_end: '2026-06-05T13:00:00.000Z',
        duration_seconds: 10800,
      });
      // Sentinel marks the run complete; combined with an identical candidate
      // the skip is doubly guaranteed (sentinel reinforces, does not replace).
      const sentinel = { status: 'complete', current_phase: 'closeout' };
      const decision = callGuard(candidate, existing, sentinel);
      ok = decision === false;
      why = `shouldAppend=${JSON.stringify(decision)} (want false — sentinel complete + identical entry)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F15-S6: edge — sentinel complete + identical entry is skipped (reinforced)', ok, why);
  }

  // =========================================================================
  // S7 (regression) — paridade sha256: .claude vs .codex stop-hook byte-identical
  // =========================================================================
  {
    let ok = false, why = '';
    const a = safeRead(HOOK_PATH);
    const b = safeRead(HOOK_CODEX);
    if (a === null) { why = `${HOOK_PATH} missing`; }
    else if (b === null) { why = `${HOOK_CODEX} missing`; }
    else {
      const ha = sha256(a);
      const hb = sha256(b);
      ok = ha === hb;
      why = `sha256 match=${ok} (.claude=${ha.slice(0, 12)} .codex=${hb.slice(0, 12)})`;
    }
    record('F15-S7: regression — .claude/.codex stop-hook.cjs sha256 identical', ok, why);
  }
} finally {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nF15 — Run-log dedup guard: ${pass}/${pass + fail}`);
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
