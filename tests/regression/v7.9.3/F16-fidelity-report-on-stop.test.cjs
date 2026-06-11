#!/usr/bin/env node
// =============================================================================
// F16 — Fidelity report generated on stop (stop-hook, v7.9.3 BUG 2)
// =============================================================================
// TDD RED-phase suite for BUG 2: fidelity_score was 100% null in run-log.jsonl
// because lib/fidelity-reporter.cjs was only invoked from Step 3d of the
// pipeline-controller agent prose — a path that almost never completes. The
// only fidelity-report.json in repo history dates to 2026-05-15. The fix has
// the stop-hook lazily generate the report itself, just before
// buildRunLogEntry, so the score lands in the log on every session teardown.
//
// CONTRACT under test (from the approved IMPLEMENTATION_PLAN):
//   stop-hook.cjs exports ensureFidelityReport(runFolder, repoRoot, sentinel)
//     -> when gate-decisions.jsonl exists AND fidelity-report.json is absent:
//        lazy-require lib/fidelity-reporter.cjs (resolved via the hook's own
//        plugin root, NOT the payload cwd), call generateFidelityReport, write
//        fidelity-report.json into runFolder, and return the numeric score.
//     -> when fidelity-report.json already exists: DO NOT overwrite it
//        (idempotent); return the existing score / a non-error result.
//     -> when gate-decisions.jsonl is absent: skip silently, create nothing,
//        return without throwing.
//     -> when the generator throws: swallow the error, create nothing, return
//        without throwing (soft-fail; teardown must reach exit 0).
//
// RED-phase expectation (against CURRENT v7.9.2 code, which exports only
// { handleStop, buildRunLogEntry, findActiveRunFolder, langfuseFlushAndCleanup }
// and never generates a report at stop time):
//   FAIL now: S1 S2 S3 S4 S5  (ensureFidelityReport is undefined -> the test
//             detects the missing export and fails the assertion).
//   PASS now: S6  (the .claude/.codex mirrors are already byte-identical; the
//             parity invariant must STAY true after the Batch 2 patch).
//
// Direct require of the hook is safe (CLI guarded by require.main === module).
// Harness mold mirrors F13/F14/F15. Auto-discovered by scripts/run-tests.cjs.
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

// Import under test. Safe direct require (CLI guarded by require.main === module).
const hook = require(HOOK_PATH);
const { ensureFidelityReport } = hook;

// Build a throwaway run folder INSIDE the repo root so the reporter's SEC-2
// containment guard (pipelineDocPath must resolve inside repoRoot) is satisfied.
// We use .pipeline/docs/.f16-tmp/<slug> and clean it up afterwards.
const TMP_BASE = path.join(ROOT, '.pipeline', 'docs', '.f16-tmp');
function makeRunFolder(slug, files) {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP_BASE, `f16-${slug}-`));
  _tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files || {})) {
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

// A minimal gate-decisions.jsonl with a couple of triggered gates so the
// reporter has something real to score.
const GATE_DECISIONS_JSONL = [
  JSON.stringify({ gate: 'STATE_FILE_INIT_FAIL', decision: 'PASS', hardness: 'CIRCUIT_BREAKER' }),
  JSON.stringify({ gate: 'TDD_APPROVAL', decision: 'APPROVED', hardness: 'HARD' }),
  JSON.stringify({ gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED', hardness: 'HARD' }),
].join('\n') + '\n';

const SENTINEL_MEDIA = {
  orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA', pipeline_variant: 'bugfix-light' },
};

// Defensive caller: ensureFidelityReport may not exist yet (RED).
function callEnsure(runFolder, repoRoot, sentinel) {
  if (typeof ensureFidelityReport !== 'function') {
    throw new TypeError('stop-hook does not export ensureFidelityReport (helper not implemented)');
  }
  return ensureFidelityReport(runFolder, repoRoot, sentinel);
}

console.log('=== F16 Fidelity report on stop (stop-hook ensureFidelityReport) ===');

try {
  // =========================================================================
  // S1 (main) — gera-quando-ausente: gate-decisions present, no report -> created
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s1', {
        'sentinel-state.json': SENTINEL_MEDIA,
        'gate-decisions.jsonl': GATE_DECISIONS_JSONL,
        // intentionally NO fidelity-report.json
      });
      callEnsure(rf, ROOT, SENTINEL_MEDIA);
      const reportPath = path.join(rf, 'fidelity-report.json');
      ok = fs.existsSync(reportPath);
      why = `fidelity-report.json exists=${ok} (want true — generated when absent + gate-decisions present)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F16-S1: main — report generated when absent and gate-decisions exist', ok, why);
  }

  // =========================================================================
  // S2 (main) — entry-usa-o-score: returned/persisted score is numeric, not null
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s2', {
        'sentinel-state.json': SENTINEL_MEDIA,
        'gate-decisions.jsonl': GATE_DECISIONS_JSONL,
      });
      callEnsure(rf, ROOT, SENTINEL_MEDIA);
      // After ensure, buildRunLogEntry must read a real numeric fidelity_score
      // from the freshly-written fidelity-report.json (not the historical null).
      const entry = hook.buildRunLogEntry(rf, ROOT);
      ok = typeof entry.fidelity_score === 'number' && Number.isFinite(entry.fidelity_score);
      why = `entry.fidelity_score=${JSON.stringify(entry.fidelity_score)} (want a finite number, not null)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F16-S2: main — run-log entry carries a numeric fidelity_score after ensure', ok, why);
  }

  // =========================================================================
  // S3 (regression, UPDATED v7.11.0 AUDIT-004) — keep-max never-downgrade:
  // an existing report with a HIGHER mandatory_triggered than the fresh count
  // stays byte-identical. (The old "never overwrite anything" contract was the
  // fidelity-freeze bug itself — upgrades are now pinned by F25-S5/S10.)
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s3', {
        'sentinel-state.json': SENTINEL_MEDIA,
        'gate-decisions.jsonl': GATE_DECISIONS_JSONL,
        // High-watermark report: more mandatory triggers than the fixture log
        // can ever produce — keep-max must preserve it untouched.
        'fidelity-report.json': { fidelity_score: 0.42, mandatory_triggered: 999, _marker: 'PRE-EXISTING' },
      });
      const reportPath = path.join(rf, 'fidelity-report.json');
      const before = fs.readFileSync(reportPath, 'utf8');
      callEnsure(rf, ROOT, SENTINEL_MEDIA);
      const after = fs.readFileSync(reportPath, 'utf8');
      ok = before === after;
      why = ok
        ? 'high-watermark report byte-identical after ensure (keep-max never-downgrade)'
        : 'high-watermark report was DOWNGRADED (keep-max violated)';
    } catch (err) { why = `threw: ${err.message}`; }
    record('F16-S3: regression — keep-max never downgrades an existing higher report', ok, why);
  }

  // =========================================================================
  // S4 (edge) — sem-gate-decisions-skip: no gate-decisions -> nothing created
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const rf = makeRunFolder('s4', {
        'sentinel-state.json': SENTINEL_MEDIA,
        // intentionally NO gate-decisions.jsonl, NO fidelity-report.json
      });
      let threw = false;
      try { callEnsure(rf, ROOT, SENTINEL_MEDIA); }
      catch (e) {
        // The ONLY tolerated throw here is the not-implemented marker (RED).
        // A real implementation must NOT throw on missing gate-decisions.
        threw = true; why = `threw: ${e.message}`;
      }
      if (!threw) {
        const created = fs.existsSync(path.join(rf, 'fidelity-report.json'));
        ok = created === false;
        why = `fidelity-report.json created=${created} (want false — skip silently with no gate-decisions)`;
      }
    } catch (err) { why = `threw: ${err.message}`; }
    record('F16-S4: edge — no gate-decisions.jsonl skips silently, creates nothing', ok, why);
  }

  // =========================================================================
  // S5 (edge) — soft-fail-em-erro: generator error is swallowed (no throw)
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      // Force the reporter to error by handing it a sentinel whose complexity is
      // an invalid enum (generateFidelityReport returns { ok:false, error } for
      // 'invalid complexity'). ensureFidelityReport must absorb that and NOT
      // throw, NOT create a corrupt report — teardown still reaches exit 0.
      const badSentinel = {
        orchestrator_decision: { type: 'Bug Fix', complexity: 'NONSENSE', pipeline_variant: 'bugfix-light' },
      };
      const rf = makeRunFolder('s5', {
        'sentinel-state.json': badSentinel,
        'gate-decisions.jsonl': GATE_DECISIONS_JSONL,
      });
      let threw = false;
      try { callEnsure(rf, ROOT, badSentinel); }
      catch (e) { threw = true; why = `threw: ${e.message}`; }
      // PASS only if ensure exists AND did not throw on the generator error.
      ok = (threw === false);
      if (ok) why = 'generator error absorbed; ensure returned without throwing';
    } catch (err) { why = `threw: ${err.message}`; }
    record('F16-S5: edge — generator error is soft-failed (ensure does not throw)', ok, why);
  }

  // =========================================================================
  // S6 (regression) — paridade espelho: .claude vs .codex stop-hook identical
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
    record('F16-S6: regression — .claude/.codex stop-hook.cjs sha256 identical', ok, why);
  }
} finally {
  // Best-effort cleanup of each temp run folder, then the shared base dir.
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
  try { fs.rmSync(TMP_BASE, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nF16 — Fidelity report on stop: ${pass}/${pass + fail}`);
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
