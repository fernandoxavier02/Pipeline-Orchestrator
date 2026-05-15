#!/usr/bin/env node
'use strict';

/**
 * F2 — run-log library + sanitizer regression.
 *
 * Covers:
 *   - MAIN-02       appendRunLog adds a valid 12-field JSONL line; a second
 *                   call appends a second line.
 *   - EDGE-03       appendRunLog auto-creates .pipeline/ dir + run-log.jsonl
 *                   when missing.
 *   - REGRESSION-01 sanitizeDetail from lib/jsonl-sanitizer.cjs still works
 *                   the same way after lib/run-log.cjs is introduced
 *                   (round-trip preserved, no copy of the function).
 *
 * Production code under test (NOT yet implemented — these tests MUST FAIL):
 *   - lib/run-log.cjs (does not exist yet)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

// Required 12-field schema (per plan):
//   run_id, timestamp_start, timestamp_end, type, complexity, variant,
//   total_gates_triggered, total_gates_expected, fidelity_score,
//   duration_seconds, final_decision, pipeline_doc_path
const REQUIRED_FIELDS = [
  'run_id', 'timestamp_start', 'timestamp_end', 'type', 'complexity',
  'variant', 'total_gates_triggered', 'total_gates_expected',
  'fidelity_score', 'duration_seconds', 'final_decision', 'pipeline_doc_path',
];

function sampleEntry(overrides = {}) {
  return Object.assign({
    run_id: 'run-test-' + process.pid,
    timestamp_start: '2026-05-15T00:00:00Z',
    timestamp_end: '2026-05-15T00:10:00Z',
    type: 'Feature',
    complexity: 'COMPLEXA',
    variant: 'feature-heavy',
    total_gates_triggered: 18,
    total_gates_expected: 22,
    fidelity_score: 0.8182,
    duration_seconds: 600,
    final_decision: 'GO',
    pipeline_doc_path: '.pipeline/docs/Pre-Heavy-action/2026-05-15-fidelity',
  }, overrides);
}

function mkTmpRoot(label) {
  const dir = path.join(os.tmpdir(), `f2-run-log-${label}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }

console.log('=== F2 lib/run-log.cjs — MAIN-02 ===');

test('appendRunLog returns ok=true on a valid 12-field entry', () => {
  const tmp = mkTmpRoot('main02a');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    const result = runLog.appendRunLog(tmp, sampleEntry());
    assert.equal(result.ok, true, `appendRunLog failed: ${result.error || 'unknown'}`);
  } finally { rmrf(tmp); }
});

test('appended line parses as valid JSON with all 12 required fields', () => {
  const tmp = mkTmpRoot('main02b');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    runLog.appendRunLog(tmp, sampleEntry());
    const lines = fs.readFileSync(path.join(tmp, '.pipeline/run-log.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1, 'expected exactly 1 line after first append');
    const parsed = JSON.parse(lines[0]);
    for (const f of REQUIRED_FIELDS) {
      assert.ok(f in parsed, `missing required field "${f}"`);
    }
  } finally { rmrf(tmp); }
});

test('appendRunLog called twice produces two lines', () => {
  const tmp = mkTmpRoot('main02c');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    runLog.appendRunLog(tmp, sampleEntry({ run_id: 'run-1' }));
    runLog.appendRunLog(tmp, sampleEntry({ run_id: 'run-2' }));
    const lines = fs.readFileSync(path.join(tmp, '.pipeline/run-log.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 2, `expected 2 lines, got ${lines.length}`);
    assert.equal(JSON.parse(lines[0]).run_id, 'run-1');
    assert.equal(JSON.parse(lines[1]).run_id, 'run-2');
  } finally { rmrf(tmp); }
});

test('readRunLog returns array of entries (helper API)', () => {
  const tmp = mkTmpRoot('main02d');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    runLog.appendRunLog(tmp, sampleEntry({ run_id: 'r-a' }));
    runLog.appendRunLog(tmp, sampleEntry({ run_id: 'r-b' }));
    const entries = runLog.readRunLog(tmp);
    assert.ok(Array.isArray(entries), 'readRunLog must return an array');
    assert.equal(entries.length, 2);
    assert.equal(entries[0].run_id, 'r-a');
    assert.equal(entries[1].run_id, 'r-b');
  } finally { rmrf(tmp); }
});

test('readRunLog on a repo with no run-log.jsonl returns []', () => {
  const tmp = mkTmpRoot('main02e');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    const entries = runLog.readRunLog(tmp);
    assert.ok(Array.isArray(entries));
    assert.equal(entries.length, 0);
  } finally { rmrf(tmp); }
});

console.log('');
console.log('=== F2 EDGE-03 — auto-creates .pipeline/ dir ===');

test('appendRunLog creates .pipeline/ dir when missing', () => {
  const tmp = mkTmpRoot('edge03a');
  try {
    assert.equal(fs.existsSync(path.join(tmp, '.pipeline')), false,
      'precondition: .pipeline/ must NOT exist initially');
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    const result = runLog.appendRunLog(tmp, sampleEntry());
    assert.equal(result.ok, true, `appendRunLog failed: ${result.error || 'unknown'}`);
    assert.equal(fs.existsSync(path.join(tmp, '.pipeline')), true,
      '.pipeline/ should have been created');
    assert.equal(fs.existsSync(path.join(tmp, '.pipeline/run-log.jsonl')), true,
      'run-log.jsonl should have been created');
  } finally { rmrf(tmp); }
});

test('After auto-create, first line has all 12 required fields', () => {
  const tmp = mkTmpRoot('edge03b');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    runLog.appendRunLog(tmp, sampleEntry());
    const lines = fs.readFileSync(path.join(tmp, '.pipeline/run-log.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    for (const f of REQUIRED_FIELDS) {
      assert.ok(f in parsed, `missing required field "${f}" on auto-created file`);
    }
  } finally { rmrf(tmp); }
});

console.log('');
console.log('=== F2 REGRESSION-01 — sanitizeDetail round-trip preserved ===');

test('lib/run-log.cjs imports cleanly (does not throw)', () => {
  // Module-level smoke test: required by REGRESSION-01 ("require does not
  // throw on import"). Important: this fails today because the lib does not
  // exist yet — that is the expected RED state.
  require(path.join(ROOT, 'lib/run-log.cjs'));
});

test('jsonl-sanitizer.sanitizeDetail still strips newlines + tabs (pre-existing)', () => {
  const jsonl = require(path.join(ROOT, 'lib/jsonl-sanitizer.cjs'));
  assert.equal(jsonl.sanitizeDetail('a\nb\tc\r\nd'), 'a b c d');
});

test('jsonl-sanitizer.sanitizeDetail still truncates long strings (pre-existing)', () => {
  const jsonl = require(path.join(ROOT, 'lib/jsonl-sanitizer.cjs'));
  const long = 'x'.repeat(600);
  const out = jsonl.sanitizeDetail(long);
  assert.ok(out.length <= 200, `expected truncation to 200, got length ${out.length}`);
});

test('jsonl-sanitizer.sanitizeDetail handles null/undefined safely (pre-existing)', () => {
  const jsonl = require(path.join(ROOT, 'lib/jsonl-sanitizer.cjs'));
  // Pre-existing behavior: does not throw on null/undefined. Pinning the
  // exact returned shape would over-constrain; we only assert "safe call".
  const a = jsonl.sanitizeDetail(null);
  const b = jsonl.sanitizeDetail(undefined);
  // Round-trip through JSON.stringify must succeed (truly safe value).
  assert.doesNotThrow(() => JSON.stringify({ detail: a }),
    'sanitizeDetail(null) result must be JSON-serializable');
  assert.doesNotThrow(() => JSON.stringify({ detail: b }),
    'sanitizeDetail(undefined) result must be JSON-serializable');
});

test('run-log appends sanitized text — round-trip through sanitizer is JSON-safe', () => {
  const tmp = mkTmpRoot('reg01');
  try {
    const runLog = require(path.join(ROOT, 'lib/run-log.cjs'));
    const entry = sampleEntry({
      final_decision: 'GO with "quotes" and\nnewline and \ttab',
    });
    const result = runLog.appendRunLog(tmp, entry);
    assert.equal(result.ok, true, `appendRunLog failed: ${result.error || 'unknown'}`);
    const line = fs.readFileSync(path.join(tmp, '.pipeline/run-log.jsonl'), 'utf8').trim();
    // Must parse — that proves sanitizer ran successfully on the field.
    const parsed = JSON.parse(line);
    assert.ok(!/\n/.test(parsed.final_decision),
      'sanitized field must not contain raw newlines after round-trip');
  } finally { rmrf(tmp); }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
