#!/usr/bin/env node
// =============================================================================
// F13 — RunLog entry defects (stop-hook buildRunLogEntry aggregator, 2026-06-01)
// =============================================================================
// TDD RED-phase suite for the telemetry run-log aggregator bugfix. Encodes the
// POST-fix contract for buildRunLogEntry() in .claude/hooks/stop-hook.cjs across
// four defects. The mains MUST FAIL against the current (unfixed) code; the same
// assertions go GREEN once the executor applies T1-T5 from IMPLEMENTATION_PLAN.
//
//   D2 — classification source: current code reads only
//        classification_post_orchestrator / classification, ignoring the
//        canonical orchestrator_decision SSOT. Fix reads orchestrator_decision
//        first (type|task_type, complexity, pipeline_variant|variant), then
//        falls back to the legacy classification shape, then session.
//
//   D4 — duration inflation: current code Date.parse()es a date-only
//        "YYYY-MM-DD" started_at, which parses to UTC-midnight and yields a
//        huge positive duration vs. now. Fix guards date-only -> null (no time
//        component = cannot compute), while full-ISO timestamps still compute.
//
//   D1 — gates expected + fidelity score: current code hardcodes both to null.
//        Fix derives total_gates_expected from
//        lib/fidelity-reporter.cjs::MANDATORY_GATES_BY_COMPLEXITY[complexity]
//        (+ SPEC additions when type==='Spec'), and reads fidelity_score from a
//        persisted fidelity-report.json in the run folder.
//
//   D3 — final_decision cascade: current code falls to 'UNKNOWN' the moment
//        session.status and sentinel.final_decision are both absent. Fix scans
//        the tail of gate-decisions.jsonl for a CLOSEOUT_CONFIRM / PA_DE_CAL
//        line and maps its decision through DECISION_MAP
//        (CONFIRMED/APPROVED -> 'GO', BLOCKED/REJECTED -> 'NO-GO') before
//        giving up with 'UNKNOWN'.
//
// Plus a parity guard:
//   S15 — .claude and .codex stop-hook.cjs must remain byte-identical (T5).
//         Currently identical; must stay identical after the mirror patch.
//
// RED-phase expectation (against CURRENT unfixed code):
//   FAIL now: S1 S2 S4 S7 S8 S11 S12   (the D2/D4/D1/D3 mains)
//   PASS now: S3 S5 S6 S9 S10 S13 S14 S15 (fallbacks/edges already satisfied
//             by current behavior, plus the parity guard)
//
// buildRunLogEntry is exported (module.exports at stop-hook.cjs:396) and its CLI
// stdin block is guarded by `if (require.main === module)`, so require()-ing the
// hook in-process does NOT hang. We import it directly and drive it with crafted
// temp run folders under os.tmpdir().
//
// Harness mold: mirrors tests/regression/v7.9.0/F12-langfuse-telemetry-fidelity
// (record()/pass/fail/results + safeRead + process.exit). Auto-discovered by
// scripts/run-tests.cjs (v7.9.0 dir matches the version glob).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs');
const HOOK_CODEX = path.join(ROOT, '.codex', 'hooks', 'stop-hook.cjs');
const FIDELITY_REPORTER = path.join(ROOT, 'lib', 'fidelity-reporter.cjs');

// Import under test. Direct require is safe: the CLI block is guarded by
// `require.main === module` (stop-hook.cjs:357), so importing won't block on
// stdin. If this require ever throws (e.g. an import cycle introduced by T3),
// the whole suite fails at load — which is the intended early-warning.
const { buildRunLogEntry } = require(HOOK_PATH);

// Live constant: assert D1 against the real table so the test never drifts if
// the gate roster changes. MEDIA=11, COMPLEXA=17, SPEC=6 at time of writing.
const { MANDATORY_GATES_BY_COMPLEXITY } = require(FIDELITY_REPORTER);

let pass = 0;
let fail = 0;
const results = [];
const _tmpDirs = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }

// Make a throwaway run folder and seed the files it needs. `files` maps a
// filename to either a JS object (JSON.stringified) or a raw string (written
// verbatim — used for *.jsonl).
function makeRunFolder(slug, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `f13-${slug}-`));
  _tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files || {})) {
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

// Drive the function under test. repoRoot is ROOT so pipeline_doc_path resolves;
// its exact value is irrelevant to every assertion here.
function build(runFolder) {
  return buildRunLogEntry(runFolder, ROOT);
}

console.log('=== F13 RunLog entry defects (stop-hook buildRunLogEntry) ===');

try {
  // =========================================================================
  // D2 — classification read from orchestrator_decision (SSOT)
  // =========================================================================

  // -- S1 (main): orchestrator_decision present, no legacy classification.
  //    Current code ignores orchestrator_decision -> type/complexity/variant null. FAIL now.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s1', {
        'sentinel-state.json': {
          orchestrator_decision: {
            type: 'Bug Fix',
            complexity: 'MEDIA',
            pipeline_variant: 'bugfix-light',
          },
        },
      });
      const e = build(rf);
      ok = e.type === 'Bug Fix' && e.complexity === 'MEDIA' && e.variant === 'bugfix-light';
      why = `type=${JSON.stringify(e.type)} complexity=${JSON.stringify(e.complexity)} variant=${JSON.stringify(e.variant)} (want "Bug Fix"/"MEDIA"/"bugfix-light")`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S1: D2 main — type/complexity/variant resolved from orchestrator_decision', ok, why);
  }

  // -- S2 (fallback): orchestrator_decision uses task_type instead of type.
  //    Fix reads od.type || od.task_type. Current code reads neither. FAIL now.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s2', {
        'sentinel-state.json': {
          orchestrator_decision: {
            task_type: 'Feature',
            complexity: 'COMPLEXA',
            variant: 'feature-heavy',
          },
        },
      });
      const e = build(rf);
      ok = e.type === 'Feature' && e.complexity === 'COMPLEXA' && e.variant === 'feature-heavy';
      why = `type=${JSON.stringify(e.type)} complexity=${JSON.stringify(e.complexity)} variant=${JSON.stringify(e.variant)} (want type from task_type)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S2: D2 fallback — type read from orchestrator_decision.task_type', ok, why);
  }

  // -- S3 (regression): legacy sentinel, only classification_post_orchestrator,
  //    no orchestrator_decision. Must still resolve. PASS now (current code path).
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s3', {
        'sentinel-state.json': {
          classification_post_orchestrator: {
            type: 'Feature',
            complexity: 'MEDIA',
            pipeline_variant: 'feature-light',
          },
        },
      });
      const e = build(rf);
      ok = e.type === 'Feature' && e.complexity === 'MEDIA' && e.variant === 'feature-light';
      why = `type=${JSON.stringify(e.type)} complexity=${JSON.stringify(e.complexity)} variant=${JSON.stringify(e.variant)} (legacy shape must keep working)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S3: D2 regression — legacy classification_post_orchestrator still resolves (no break)', ok, why);
  }

  // =========================================================================
  // D4 — date-only duration must not inflate
  // =========================================================================

  // -- S4 (main): started_at is date-only "2026-06-01". Current code Date.parse
  //    yields midnight-UTC and a huge positive duration vs now. Fix -> null. FAIL now.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s4', {
        'sentinel-state.json': { created_at: '2026-06-01' },
      });
      const e = build(rf);
      ok = e.duration_seconds === null;
      why = `duration_seconds=${JSON.stringify(e.duration_seconds)} (want null — date-only has no time component)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S4: D4 main — date-only started_at yields duration_seconds === null (no inflation)', ok, why);
  }

  // -- S5 (regression): full ISO timestamp a few seconds before now -> small
  //    finite duration >= 0. PASS now (current code already handles full ISO).
  {
    let ok = false, why = '';
    try {
      const startedAt = new Date(Date.now() - 5000).toISOString(); // 5s ago, full ISO w/ time
      const rf = makeRunFolder('s5', {
        'session.json': { started_at: startedAt },
      });
      const e = build(rf);
      ok = typeof e.duration_seconds === 'number'
        && Number.isFinite(e.duration_seconds)
        && e.duration_seconds >= 0
        && e.duration_seconds < 600; // sanity: nowhere near the inflated hours bug
      why = `duration_seconds=${JSON.stringify(e.duration_seconds)} (want small finite >= 0)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S5: D4 regression — full-ISO started_at gives a small finite duration >= 0', ok, why);
  }

  // -- S6 (edge): no started_at anywhere -> duration null. PASS now.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s6', {
        'sentinel-state.json': { orchestrator_decision: { type: 'Bug Fix', complexity: 'SIMPLES' } },
      });
      const e = build(rf);
      ok = e.duration_seconds === null;
      why = `duration_seconds=${JSON.stringify(e.duration_seconds)} (want null — no started_at)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S6: D4 edge — missing started_at yields duration_seconds === null', ok, why);
  }

  // =========================================================================
  // D1 — total_gates_expected + fidelity_score (currently hardcoded null)
  // =========================================================================

  // -- S7 (main): complexity resolves to MEDIA -> expected == live MEDIA length.
  //    Current code hardcodes null. FAIL now. Asserted against live constant.
  {
    let ok = false, why = '';
    try {
      const expectedMedia = MANDATORY_GATES_BY_COMPLEXITY.MEDIA.length; // 11 at time of writing
      const rf = makeRunFolder('s7', {
        'sentinel-state.json': {
          orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA', pipeline_variant: 'bugfix-light' },
        },
      });
      const e = build(rf);
      ok = e.total_gates_expected === expectedMedia;
      why = `total_gates_expected=${JSON.stringify(e.total_gates_expected)} (want MEDIA length=${expectedMedia})`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S7: D1 main — total_gates_expected === MANDATORY_GATES_BY_COMPLEXITY.MEDIA.length', ok, why);
  }

  // -- S8 (main): fidelity-report.json with fidelity_score 0.81 in folder ->
  //    returned fidelity_score === 0.81. Current code hardcodes null. FAIL now.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s8', {
        'sentinel-state.json': {
          orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA' },
        },
        'fidelity-report.json': { fidelity_score: 0.81 },
      });
      const e = build(rf);
      ok = e.fidelity_score === 0.81;
      why = `fidelity_score=${JSON.stringify(e.fidelity_score)} (want 0.81 from persisted fidelity-report.json)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S8: D1 main — fidelity_score read from persisted fidelity-report.json', ok, why);
  }

  // -- S9 (edge): complexity unknown/absent -> total_gates_expected null.
  //    PASS now (current code is null) AND must stay null after fix (graceful).
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s9', {
        // No orchestrator_decision, no classification, no session complexity.
        'sentinel-state.json': {},
      });
      const e = build(rf);
      ok = e.total_gates_expected === null;
      why = `total_gates_expected=${JSON.stringify(e.total_gates_expected)} (want null — complexity unknown)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S9: D1 edge — unknown/absent complexity yields total_gates_expected === null', ok, why);
  }

  // -- S10 (edge): no fidelity-report.json present -> fidelity_score null.
  //    PASS now AND must stay null after fix.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s10', {
        'sentinel-state.json': {
          orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA' },
        },
        // intentionally NO fidelity-report.json
      });
      const e = build(rf);
      ok = e.fidelity_score === null;
      why = `fidelity_score=${JSON.stringify(e.fidelity_score)} (want null — no fidelity-report.json)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S10: D1 edge — absent fidelity-report.json yields fidelity_score === null', ok, why);
  }

  // -- S11 (Spec additive): type Spec + COMPLEXA -> expected == COMPLEXA + SPEC.
  //    Current code hardcodes null. FAIL now. Asserted against live constants.
  {
    let ok = false, why = '';
    try {
      const expectedSpecComplexa =
        MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA.length + MANDATORY_GATES_BY_COMPLEXITY.SPEC.length; // 17 + 6 = 23
      const rf = makeRunFolder('s11', {
        'sentinel-state.json': {
          orchestrator_decision: { type: 'Spec', complexity: 'COMPLEXA', pipeline_variant: 'spec-heavy' },
        },
      });
      const e = build(rf);
      ok = e.total_gates_expected === expectedSpecComplexa;
      why = `total_gates_expected=${JSON.stringify(e.total_gates_expected)} (want COMPLEXA+SPEC=${expectedSpecComplexa})`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S11: D1 Spec — total_gates_expected === COMPLEXA.length + SPEC.length (live constant)', ok, why);
  }

  // =========================================================================
  // D3 — final_decision cascade (avoid premature UNKNOWN)
  // =========================================================================

  // -- S12 (main): no session.status, no sentinel.final_decision, but
  //    gate-decisions.jsonl has a CLOSEOUT_CONFIRM with decision CONFIRMED.
  //    DECISION_MAP CONFIRMED -> 'GO'. Current code -> 'UNKNOWN'. FAIL now.
  {
    let ok = false, why = '';
    try {
      const jsonl = [
        JSON.stringify({ gate: 'TDD_APPROVAL', decision: 'APPROVED' }),
        JSON.stringify({ gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED' }),
      ].join('\n') + '\n';
      const rf = makeRunFolder('s12', {
        'sentinel-state.json': {
          orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA' },
          // intentionally NO final_decision
        },
        // intentionally NO session.json (no session.status)
        'gate-decisions.jsonl': jsonl,
      });
      const e = build(rf);
      ok = e.final_decision === 'GO';
      why = `final_decision=${JSON.stringify(e.final_decision)} (want "GO" via DECISION_MAP[CONFIRMED], NOT "UNKNOWN")`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S12: D3 main — CLOSEOUT_CONFIRM/CONFIRMED derives final_decision "GO" (not UNKNOWN)', ok, why);
  }

  // -- S13 (regression): session.status "GO" present -> "GO" (highest
  //    precedence, unchanged). PASS now.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s13', {
        'session.json': { status: 'GO' },
        'sentinel-state.json': { orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA' } },
      });
      const e = build(rf);
      ok = e.final_decision === 'GO';
      why = `final_decision=${JSON.stringify(e.final_decision)} (want "GO" from session.status, top precedence)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S13: D3 regression — session.status "GO" wins (precedence unchanged)', ok, why);
  }

  // -- S14 (edge): nothing derivable at all -> "UNKNOWN". PASS now AND after fix.
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s14', {
        'sentinel-state.json': { orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA' } },
        // no session.status, no sentinel.final_decision, no gate-decisions.jsonl
      });
      const e = build(rf);
      ok = e.final_decision === 'UNKNOWN';
      why = `final_decision=${JSON.stringify(e.final_decision)} (want "UNKNOWN" — nothing derivable)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F13-S14: D3 edge — no signal anywhere yields final_decision "UNKNOWN"', ok, why);
  }

  // =========================================================================
  // Parity guard (T5) — .claude/.codex stop-hook.cjs byte-identical
  // =========================================================================

  // -- S15 (mirror): the two hook files must be byte-for-byte identical. They
  //    are currently identical; the mirror patch (T5) must keep them so. PASS now.
  {
    let ok = false, why = '';
    const a = safeRead(HOOK_PATH);
    const b = safeRead(HOOK_CODEX);
    if (a === null) { why = `${HOOK_PATH} missing`; }
    else if (b === null) { why = `${HOOK_CODEX} missing`; }
    else {
      ok = a === b;
      why = `byte-identical=${ok} (.claude vs .codex stop-hook.cjs must match)`;
    }
    record('F13-S15: T5 parity — .claude/.codex stop-hook.cjs byte-identical', ok, why);
  }
} finally {
  // Best-effort cleanup of all temp run folders.
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
