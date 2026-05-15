#!/usr/bin/env node
'use strict';

/**
 * F3 — fidelity-reporter library.
 *
 * Covers:
 *   - MAIN-01  generateFidelityReport computes the correct score from a real
 *              gate-decisions.jsonl, writes fidelity-report.md + .json,
 *              returns ok=true with numeric score in [0,1].
 *   - EDGE-01  Empty gate-decisions.jsonl → ok=true, fidelityScore=null,
 *              mandatoryTriggered=0, report files still written.
 *   - EDGE-02  Malformed line is skipped, warnings[] gets at least one entry,
 *              valid lines are still processed.
 *
 * Production code under test (NOT yet implemented — these tests MUST FAIL):
 *   - lib/fidelity-reporter.cjs (does not exist yet)
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

function mkPipelineDoc(label) {
  const repoRoot = path.join(os.tmpdir(), `f3-fidelity-${label}-${process.pid}-${Date.now()}`);
  const docPath = path.join(repoRoot, '.pipeline/docs/test-run');
  fs.mkdirSync(docPath, { recursive: true });
  return { repoRoot, pipelineDocPath: docPath };
}

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }

function writeJsonl(filePath, lines) {
  fs.writeFileSync(filePath, lines.map((l) => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
}

// Sample gate decision lines mirroring the real schema (matches gate-decisions.jsonl).
function gate(name, hardness, decision) {
  return {
    gate: name,
    hardness,
    phase: '2',
    decision,
    decided_by: 'test',
    timestamp: '2026-05-15T00:00:00Z',
    detail: 'fixture',
    confidence_impact: 0,
  };
}

console.log('=== F3 lib/fidelity-reporter.cjs — MAIN-01 ===');

test('generateFidelityReport returns ok=true with real fixture (3 mandatory + 5 hard)', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('main01a');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    // We pick MANDATORY gate names from the reporter's own export so the
    // fixture stays in sync with whatever the implementation declares.
    const complexa = reporter.MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA || [];
    assert.ok(complexa.length >= 3, 'reporter must declare >= 3 COMPLEXA mandatory gates for this fixture');
    const lines = [
      gate(complexa[0], 'HARD', 'TRIGGERED'),
      gate(complexa[1], 'HARD', 'TRIGGERED'),
      gate(complexa[2], 'HARD', 'TRIGGERED'),
      gate('HARD_EXTRA_1', 'HARD', 'TRIGGERED'),
      gate('HARD_EXTRA_2', 'HARD', 'TRIGGERED'),
      gate('HARD_EXTRA_3', 'HARD', 'TRIGGERED'),
      gate('HARD_EXTRA_4', 'HARD', 'TRIGGERED'),
      gate('HARD_EXTRA_5', 'HARD', 'TRIGGERED'),
    ];
    writeJsonl(path.join(pipelineDocPath, 'gate-decisions.jsonl'), lines);
    const result = reporter.generateFidelityReport({
      pipelineDocPath,
      complexity: 'COMPLEXA',
      type: 'Feature',
      repoRoot,
    });
    assert.equal(result.ok, true, 'expected ok=true');
    assert.equal(result.mandatoryTriggered, 3,
      `expected mandatoryTriggered=3, got ${result.mandatoryTriggered}`);
    assert.ok(result.mandatoryExpected > 0,
      `mandatoryExpected must be > 0 (got ${result.mandatoryExpected})`);
    assert.ok(typeof result.fidelityScore === 'number',
      `fidelityScore must be a number, got ${typeof result.fidelityScore}`);
    // TEST-2: pin the EXACT score instead of accepting any value in [0,1].
    // mandatoryExpected for COMPLEXA + Feature is the length of the
    // MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA array (no SPEC additions).
    assert.equal(result.mandatoryExpected, complexa.length,
      `mandatoryExpected must equal COMPLEXA length (${complexa.length}), got ${result.mandatoryExpected}`);
    const expectedScore = 3 / result.mandatoryExpected;
    assert.ok(Math.abs(result.fidelityScore - expectedScore) < 0.0001,
      `fidelityScore must equal 3/${result.mandatoryExpected} (~${expectedScore.toFixed(4)}), got ${result.fidelityScore}`);
  } finally { rmrf(repoRoot); }
});

test('generateFidelityReport writes fidelity-report.md and fidelity-report.json', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('main01b');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    const complexa = reporter.MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA || [];
    writeJsonl(path.join(pipelineDocPath, 'gate-decisions.jsonl'), [
      gate(complexa[0], 'HARD', 'TRIGGERED'),
    ]);
    const result = reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'COMPLEXA', type: 'Feature', repoRoot,
    });
    assert.ok(fs.existsSync(path.join(pipelineDocPath, 'fidelity-report.md')),
      'fidelity-report.md was not written');
    assert.ok(fs.existsSync(path.join(pipelineDocPath, 'fidelity-report.json')),
      'fidelity-report.json was not written');
    // Report paths echoed in result
    assert.equal(result.mdPath, path.join(pipelineDocPath, 'fidelity-report.md'));
    assert.equal(result.jsonPath, path.join(pipelineDocPath, 'fidelity-report.json'));
    // JSON content parses and has fidelity_score numeric
    const j = JSON.parse(fs.readFileSync(result.jsonPath, 'utf8'));
    assert.ok('fidelity_score' in j, 'fidelity-report.json missing fidelity_score');
  } finally { rmrf(repoRoot); }
});

console.log('');
console.log('=== F3 EDGE-01 — empty gate-decisions.jsonl ===');

test('empty file → ok=true, fidelityScore=null, mandatoryTriggered=0', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('edge01a');
  try {
    fs.writeFileSync(path.join(pipelineDocPath, 'gate-decisions.jsonl'), '');
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    const result = reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'SIMPLES', type: 'Feature', repoRoot,
    });
    assert.equal(result.ok, true, 'must not crash on empty file');
    assert.equal(result.fidelityScore, null,
      `fidelityScore must be null on empty file, got ${result.fidelityScore}`);
    assert.equal(result.mandatoryTriggered, 0,
      `mandatoryTriggered must be 0 on empty file, got ${result.mandatoryTriggered}`);
  } finally { rmrf(repoRoot); }
});

test('empty file → report files still written (with null/zero values)', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('edge01b');
  try {
    fs.writeFileSync(path.join(pipelineDocPath, 'gate-decisions.jsonl'), '');
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'SIMPLES', type: 'Feature', repoRoot,
    });
    assert.ok(fs.existsSync(path.join(pipelineDocPath, 'fidelity-report.md')),
      'md report must be written even on empty input');
    assert.ok(fs.existsSync(path.join(pipelineDocPath, 'fidelity-report.json')),
      'json report must be written even on empty input');
  } finally { rmrf(repoRoot); }
});

console.log('');
console.log('=== F3 EDGE-02 — malformed line skipped, valid lines processed ===');

test('malformed line is skipped, warnings array gets >= 1 entry', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('edge02a');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    const complexa = reporter.MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA || [];
    assert.ok(complexa.length >= 5, 'fixture requires reporter to declare >= 5 COMPLEXA mandatory gates');
    const lines = [
      JSON.stringify(gate(complexa[0], 'HARD', 'TRIGGERED')),
      JSON.stringify(gate(complexa[1], 'HARD', 'TRIGGERED')),
      'NOT_JSON{{{',                                       // <-- corrupted
      JSON.stringify(gate(complexa[2], 'HARD', 'TRIGGERED')),
      JSON.stringify(gate(complexa[3], 'HARD', 'TRIGGERED')),
      JSON.stringify(gate(complexa[4], 'HARD', 'TRIGGERED')),
    ];
    fs.writeFileSync(path.join(pipelineDocPath, 'gate-decisions.jsonl'), lines.join('\n') + '\n');
    const result = reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'COMPLEXA', type: 'Feature', repoRoot,
    });
    assert.equal(result.ok, true, 'reporter must not crash on a malformed line');
    assert.ok(Array.isArray(result.warnings), 'result.warnings must be an array');
    assert.ok(result.warnings.length >= 1,
      `expected at least 1 warning for the malformed line, got ${result.warnings.length}`);
    // 5 valid lines mapping to mandatory gates → mandatoryTriggered should be 5.
    assert.equal(result.mandatoryTriggered, 5,
      `expected mandatoryTriggered=5 (only valid lines counted), got ${result.mandatoryTriggered}`);
  } finally { rmrf(repoRoot); }
});

test('malformed line does not appear in fidelity-report.json data', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('edge02b');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    const complexa = reporter.MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA || [];
    const lines = [
      JSON.stringify(gate(complexa[0], 'HARD', 'TRIGGERED')),
      'GARBAGE_LINE_!!!',
      JSON.stringify(gate(complexa[1], 'HARD', 'TRIGGERED')),
    ];
    fs.writeFileSync(path.join(pipelineDocPath, 'gate-decisions.jsonl'), lines.join('\n') + '\n');
    reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'COMPLEXA', type: 'Feature', repoRoot,
    });
    const jsonText = fs.readFileSync(path.join(pipelineDocPath, 'fidelity-report.json'), 'utf8');
    assert.ok(!/GARBAGE_LINE/.test(jsonText),
      'fidelity-report.json must not contain the malformed line text');
  } finally { rmrf(repoRoot); }
});

console.log('');
console.log('=== F3 DEAD-1 — invalid complexity rejected ===');

test('invalid complexity returns ok=false with descriptive error', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('dead01a');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    const result = reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'SIMPLE', type: 'Feature', repoRoot,
    });
    assert.equal(result.ok, false, 'expected ok=false for invalid complexity');
    assert.ok(/invalid complexity/i.test(result.error),
      `error must mention invalid complexity, got "${result.error}"`);
  } finally { rmrf(repoRoot); }
});

console.log('');
console.log('=== F3 SEC-1/SEC-2 — path traversal guards ===');

test('relative repoRoot is rejected with path-traversal error', () => {
  // Use a writable cwd so the test does not blow up just because the relative
  // path can't exist on disk. We provide ANY non-absolute repoRoot and expect
  // the guard to fire before any filesystem I/O.
  const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
  const result = reporter.generateFidelityReport({
    pipelineDocPath: path.join(os.tmpdir(), 'whatever'),
    complexity: 'SIMPLES',
    type: 'Feature',
    repoRoot: '.pipeline/relative',
  });
  assert.equal(result.ok, false, 'expected ok=false on relative repoRoot');
  assert.ok(/path-traversal/i.test(result.error),
    `error must mention path-traversal, got "${result.error}"`);
});

test('pipelineDocPath outside repoRoot is rejected', () => {
  const { repoRoot } = mkPipelineDoc('sec02');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    // pipelineDocPath outside the repo tree
    const outsideDoc = path.join(os.tmpdir(), `f3-outside-${process.pid}-${Date.now()}`);
    fs.mkdirSync(outsideDoc, { recursive: true });
    try {
      const result = reporter.generateFidelityReport({
        pipelineDocPath: outsideDoc,
        complexity: 'SIMPLES',
        type: 'Feature',
        repoRoot,
      });
      assert.equal(result.ok, false, 'expected ok=false when doc is outside repo');
      assert.ok(/path-traversal/i.test(result.error),
        `error must mention path-traversal, got "${result.error}"`);
    } finally { rmrf(outsideDoc); }
  } finally { rmrf(repoRoot); }
});

console.log('');
console.log('=== F3 SEC-3/SEC-7 — unknown hardness/decision replaced + MD pipe escaped ===');

test('unknown hardness/decision are replaced with (invalid) in the JSON report', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('sec03a');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    const complexa = reporter.MANDATORY_GATES_BY_COMPLEXITY.COMPLEXA || [];
    writeJsonl(path.join(pipelineDocPath, 'gate-decisions.jsonl'), [
      gate(complexa[0], 'EVIL_HARDNESS', 'EVIL_DECISION'),
      // Also produce an "other gate" (not in mandatory set) with bad enums.
      gate('SOME_OTHER_GATE', 'EVIL_HARDNESS', 'EVIL_DECISION'),
    ]);
    reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'COMPLEXA', type: 'Feature', repoRoot,
    });
    const j = JSON.parse(fs.readFileSync(path.join(pipelineDocPath, 'fidelity-report.json'), 'utf8'));
    // The mandatory entry corresponding to complexa[0] should be marked
    // triggered=true with hardness/decision replaced by (invalid).
    const found = j.mandatory_gates.find((g) => g.gate === complexa[0]);
    assert.ok(found, `mandatory gate ${complexa[0]} not present in report`);
    assert.equal(found.hardness, '(invalid)', `unknown hardness must be replaced, got "${found.hardness}"`);
    assert.equal(found.decision, '(invalid)', `unknown decision must be replaced, got "${found.decision}"`);
    // And the "other" gate too
    const other = (j.other_gates || []).find((g) => g.gate === 'SOME_OTHER_GATE');
    assert.ok(other, 'other_gates must include SOME_OTHER_GATE');
    assert.equal(other.hardness, '(invalid)');
    assert.equal(other.decision, '(invalid)');
  } finally { rmrf(repoRoot); }
});

test('pipe characters in fields are escaped in the Markdown report', () => {
  const { repoRoot, pipelineDocPath } = mkPipelineDoc('sec03b');
  try {
    const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
    // Use an "other gate" (non-mandatory) so we can inject a pipe through
    // the gate name itself.
    writeJsonl(path.join(pipelineDocPath, 'gate-decisions.jsonl'), [
      gate('MALICIOUS|GATE|NAME', 'HARD', 'TRIGGERED'),
    ]);
    reporter.generateFidelityReport({
      pipelineDocPath, complexity: 'SIMPLES', type: 'Feature', repoRoot,
    });
    const md = fs.readFileSync(path.join(pipelineDocPath, 'fidelity-report.md'), 'utf8');
    // The raw "MALICIOUS|GATE|NAME" without escaping would create 2 extra
    // pivot columns. After escapeMdCell, the pipes must be backslash-escaped.
    assert.ok(md.includes('MALICIOUS\\|GATE\\|NAME'),
      'pipes inside gate names must be backslash-escaped in the Markdown table');
    assert.ok(!/\| MALICIOUS\|GATE\|NAME \|/.test(md),
      'raw unescaped pipes must not appear in the Markdown table');
  } finally { rmrf(repoRoot); }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
