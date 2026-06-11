#!/usr/bin/env node
// =============================================================================
// F25 — Telemetry correlation + fidelity keep-max (v7.11.0 B2)
// AUDIT-003 (run_id propagation), AUDIT-004 (fidelity keep-max),
// AUDIT-010 (timestamp derivation + clock-skew guard), AUDIT-015b (cascade).
// =============================================================================
// RED-first contract:
//   S1  readSentinelData surfaces an explicit run_id field from sentinel-state
//   S2  run_id falls back to the run-FOLDER basename when the field is absent
//   S3  pipeline_doc_path is surfaced as a sanitizer-safe RELATIVE path
//       (no drive letter, no backslashes) — never '' when a state was found
//   S4  buildTraceMetadata preserves the run_id + relative doc path end-to-end
//   S5  ensureFidelityReport KEEP-MAX upgrade: existing report with LOWER
//       mandatory_triggered is REGENERATED (frozen-undercount healed)
//   S6  ensureFidelityReport never-downgrade: existing report with HIGHER
//       mandatory_triggered stays byte-identical
//   S7  report created on a LATER teardown when the first had no gate data
//   S8  buildRunLogEntry derives timestamp_start from the sentinel pipeline_id
//       ISO prefix when session.started_at and created_at are both absent
//   S9  clock-skew guard: end < start  ->  duration_seconds null (entry intact)
//   S10 cascade (AUDIT-015b): two teardowns with growing gate-decisions ->
//       the second entry carries a fidelity_score >= the first, strictly >
//       when the mandatory-trigger count grew
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const stopHook = require(path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs'));
const lfHook = require(path.join(ROOT, '.claude', 'hooks', 'langfuse-hook.cjs'));

const { ensureFidelityReport, buildRunLogEntry } = stopHook;
const { readSentinelData, buildTraceMetadata } = lfHook;

let pass = 0; let fail = 0; const out = [];
function record(name, ok, why) {
  if (ok) { pass++; out.push(`  [PASS] ${name}`); }
  else { fail++; out.push(`  [FAIL] ${name}: ${why}`); }
}

const TMP_BASE = path.join(ROOT, '.pipeline', 'docs', 'Pre-F25-action');
fs.mkdirSync(TMP_BASE, { recursive: true });
const _dirs = [];
function makeRunFolder(slug, files) {
  const dir = fs.mkdtempSync(path.join(TMP_BASE, `f25-${slug}-`));
  _dirs.push(dir);
  for (const [name, content] of Object.entries(files || {})) {
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

const SENTINEL_MEDIA = {
  pipeline_id: '2026-06-11T10:00:00Z_bugfix-light',
  orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA', pipeline_variant: 'bugfix-light' },
};

const GD_SMALL = [
  JSON.stringify({ gate: 'TDD_APPROVAL', decision: 'APPROVED', hardness: 'HARD' }),
].join('\n') + '\n';

const GD_GROWN = GD_SMALL + [
  JSON.stringify({ gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED', hardness: 'SOFT' }),
  JSON.stringify({ gate: 'INFO_GATE_BLOCKED', decision: 'NOT_TRIGGERED', hardness: 'HARD' }),
  JSON.stringify({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', hardness: 'SOFT' }),
].join('\n') + '\n';

function withDocPathEnv(dir, fn) {
  const prev = process.env.PIPELINE_DOC_PATH;
  process.env.PIPELINE_DOC_PATH = dir;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.PIPELINE_DOC_PATH;
    else process.env.PIPELINE_DOC_PATH = prev;
  }
}

console.log('=== F25 telemetry correlation + fidelity keep-max (v7.11.0 B2) ===');

// ── S1: explicit run_id surfaces ─────────────────────────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s1', {
      'sentinel-state.json': { ...SENTINEL_MEDIA, run_id: 'r-explicit-99' },
    });
    const sd = withDocPathEnv(rf, () => readSentinelData());
    ok = sd.run_id === 'r-explicit-99';
    why = `run_id=${JSON.stringify(sd.run_id)} (want 'r-explicit-99')`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S1: readSentinelData surfaces explicit run_id', ok, why);
}

// ── S2: run_id falls back to run-folder basename ─────────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s2', { 'sentinel-state.json': SENTINEL_MEDIA });
    const sd = withDocPathEnv(rf, () => readSentinelData());
    ok = sd.run_id === path.basename(rf);
    why = `run_id=${JSON.stringify(sd.run_id)} (want folder basename '${path.basename(rf)}')`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S2: run_id falls back to run-folder basename (AUDIT-003)', ok, why);
}

// ── S3: pipeline_doc_path relative + sanitizer-safe ──────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s3', { 'sentinel-state.json': SENTINEL_MEDIA });
    const sd = withDocPathEnv(rf, () => readSentinelData());
    const v = sd.pipeline_doc_path || '';
    ok = v.length > 0 && !/^[A-Za-z]:/.test(v) && !v.includes('\\') && v.includes(path.basename(rf));
    why = `pipeline_doc_path=${JSON.stringify(v)} (want non-empty relative fwd-slash path containing run folder name)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S3: pipeline_doc_path surfaced as relative sanitizer-safe path', ok, why);
}

// ── S4: buildTraceMetadata end-to-end ────────────────────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s4', { 'sentinel-state.json': SENTINEL_MEDIA });
    const sd = withDocPathEnv(rf, () => readSentinelData());
    const meta = buildTraceMetadata(sd);
    ok = meta.run_id === path.basename(rf)
      && typeof meta.pipeline_doc_path === 'string'
      && meta.pipeline_doc_path.length > 0
      && meta.type === 'Bug Fix' && meta.complexity === 'MEDIA';
    why = `meta=${JSON.stringify({ run_id: meta.run_id, doc: meta.pipeline_doc_path, type: meta.type })}`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S4: buildTraceMetadata carries run_id + non-empty doc path', ok, why);
}

// ── S5: keep-max upgrade ─────────────────────────────────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s5', {
      'sentinel-state.json': SENTINEL_MEDIA,
      'gate-decisions.jsonl': GD_GROWN,
      'fidelity-report.json': { mandatory_triggered: 0, fidelity_score: 0, _marker: 'FROZEN-UNDERCOUNT' },
    });
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA);
    const j = JSON.parse(fs.readFileSync(path.join(rf, 'fidelity-report.json'), 'utf8'));
    ok = j._marker === undefined && Number(j.mandatory_triggered) > 0;
    why = `after ensure: mandatory_triggered=${j.mandatory_triggered} marker=${j._marker} (want regenerated, >0, no marker)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S5: keep-max UPGRADES a frozen undercount report (AUDIT-004)', ok, why);
}

// ── S6: never-downgrade ──────────────────────────────────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s6', {
      'sentinel-state.json': SENTINEL_MEDIA,
      'gate-decisions.jsonl': GD_SMALL,
      'fidelity-report.json': { mandatory_triggered: 999, fidelity_score: 1, _marker: 'HIGH-WATERMARK' },
    });
    const before = fs.readFileSync(path.join(rf, 'fidelity-report.json'), 'utf8');
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA);
    const after = fs.readFileSync(path.join(rf, 'fidelity-report.json'), 'utf8');
    ok = before === after;
    why = ok ? 'high-watermark preserved byte-identical' : 'report was DOWNGRADED (keep-max violated)';
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S6: keep-max never downgrades a higher report', ok, why);
}

// ── S7: created on later teardown ────────────────────────────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s7', { 'sentinel-state.json': SENTINEL_MEDIA });
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA); // teardown 1 — no gate data
    const missing = !fs.existsSync(path.join(rf, 'fidelity-report.json'));
    fs.writeFileSync(path.join(rf, 'gate-decisions.jsonl'), GD_SMALL);
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA); // teardown 2 — gate data present
    const created = fs.existsSync(path.join(rf, 'fidelity-report.json'));
    ok = missing && created;
    why = `teardown1 skipped=${missing}, teardown2 created=${created}`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S7: report created on a later teardown once gate data exists', ok, why);
}

// ── S8: timestamp_start derived from pipeline_id ISO prefix ──────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s8', {
      'sentinel-state.json': SENTINEL_MEDIA, // pipeline_id carries the ISO prefix
      'gate-decisions.jsonl': GD_SMALL,
    });
    const entry = buildRunLogEntry(rf, ROOT);
    ok = entry.timestamp_start === '2026-06-11T10:00:00Z';
    why = `timestamp_start=${JSON.stringify(entry.timestamp_start)} (want '2026-06-11T10:00:00Z' from pipeline_id prefix)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S8: timestamp_start derives from sentinel pipeline_id ISO prefix (AUDIT-010)', ok, why);
}

// ── S9: clock-skew guard ─────────────────────────────────────────────────────
{
  let ok = false; let why = '';
  try {
    const future = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const rf = makeRunFolder('s9', {
      'sentinel-state.json': SENTINEL_MEDIA,
      'session.json': { started_at: future },
      'gate-decisions.jsonl': GD_SMALL,
    });
    const entry = buildRunLogEntry(rf, ROOT);
    ok = entry.duration_seconds === null && entry.timestamp_start === future;
    why = `duration_seconds=${entry.duration_seconds} (want null on end<start), start kept=${entry.timestamp_start === future}`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S9: end<start clock skew -> duration null, entry intact (AUDIT-010)', ok, why);
}

// ── S10: cascade — second teardown reflects grown score ──────────────────────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s10', {
      'sentinel-state.json': SENTINEL_MEDIA,
      'gate-decisions.jsonl': GD_SMALL,
    });
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA);
    const e1 = buildRunLogEntry(rf, ROOT);
    fs.writeFileSync(path.join(rf, 'gate-decisions.jsonl'), GD_GROWN);
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA);
    const e2 = buildRunLogEntry(rf, ROOT);
    ok = typeof e1.fidelity_score === 'number' && typeof e2.fidelity_score === 'number'
      && e2.fidelity_score > e1.fidelity_score;
    why = `score1=${e1.fidelity_score} score2=${e2.fidelity_score} (want strictly growing after more mandatory gates)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S10: cascade — run-log entry reflects regenerated score (AUDIT-015b)', ok, why);
}

// ── S11: keep-max restore never leaves a contradictory fresh .md (SEC-2) ────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s11', {
      'sentinel-state.json': SENTINEL_MEDIA,
      'gate-decisions.jsonl': GD_SMALL,
      // prior pair: high-watermark .json WITHOUT a companion .md
      'fidelity-report.json': { mandatory_triggered: 999, fidelity_score: 1, _marker: 'HW' },
    });
    ensureFidelityReport(rf, ROOT, SENTINEL_MEDIA);
    const j = JSON.parse(fs.readFileSync(path.join(rf, 'fidelity-report.json'), 'utf8'));
    const mdExists = fs.existsSync(path.join(rf, 'fidelity-report.md'));
    ok = j._marker === 'HW' && !mdExists;
    why = `json restored=${j._marker === 'HW'}, contradictory fresh md removed=${!mdExists}`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S11: keep-max restore removes orphan fresh .md (SEC-2)', ok, why);
}

// ── S12: date-only created_at must not mask pipeline_id full ISO (SEC-5) ────
{
  let ok = false; let why = '';
  try {
    const rf = makeRunFolder('s12', {
      'sentinel-state.json': { ...SENTINEL_MEDIA, created_at: '2026-06-11' },
      'gate-decisions.jsonl': GD_SMALL,
    });
    const entry = buildRunLogEntry(rf, ROOT);
    ok = entry.timestamp_start === '2026-06-11T10:00:00Z' && typeof entry.duration_seconds === 'number';
    why = `timestamp_start=${JSON.stringify(entry.timestamp_start)} duration=${entry.duration_seconds} (want full ISO from pipeline_id + numeric duration)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F25-S12: date-only created_at does not mask pipeline_id ISO start (SEC-5)', ok, why);
}

// ── cleanup + summary ────────────────────────────────────────────────────────
try { fs.rmSync(TMP_BASE, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
