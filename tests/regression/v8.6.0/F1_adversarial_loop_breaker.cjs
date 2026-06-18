#!/usr/bin/env node
'use strict';

/**
 * F1 (v8.6.0) — Adversarial Loop-Breaker guardrail.
 *
 * STRUCTURAL / CONTRACT regression: asserts on file content, gate counts,
 * schema fields, and the one pure-data constant in lib/fidelity-reporter.cjs.
 * No process spawning, no temp dirs — only node:fs / node:path / node:assert
 * and a require() of lib/fidelity-reporter.cjs.
 *
 * Feature under test (NOT yet implemented — every assertion MUST FAIL on the
 * unmodified 8.4.0 worktree):
 *   - references/gates.md                 ADVERSARIAL_LOOP_BREAKER row +
 *                                         header count 43 -> 44, Mandatory
 *                                         table 23 -> 24 rows.
 *   - lib/fidelity-reporter.cjs           SIMPLES 6 -> 11, MEDIA 11 -> 13,
 *                                         COMPLEXA 17 -> 18 (all gain ALB; MEDIA
 *                                         also gains FIX_LOOP_EXHAUSTED per the
 *                                         cumulative rule, no exception).
 *   - references/sentinel-integration.md  adversarial_loop_count + escape_used.
 *   - references/complexity-matrix.md     SIMPLES Plan Mode Skip -> Automatic;
 *                                         no more "skip entirely".
 *   - commands/pipeline.md                Inline Invariants += ALB.
 *   - agents/core/pipeline-controller.md  Inline Invariants += ALB.
 *   - agents/core/adversarial-batch.md    frontmatter description: bounded
 *                                         outer-cycle model, not just "STOPS".
 *   - agents/executor/executor-fix.md     FIX_CONTEXT mode + REIMPLEMENT.
 *
 * Mirrors the harness of tests/regression/v6.1.0/F1_gates_mandatory_section.cjs
 * (extractSection / parseTableDataRows, copied verbatim and kept self-contained
 * per the established pattern) and tests/regression/v8.4.0/F6_spec_telemetry_bridge.cjs
 * (ROOT constant, pass/fail counters, self-running with process.exit).
 *
 * Scenario IDs (S1..S16) map to QUALITY_GATE_APPROVED in
 * .pipeline/docs/Pre-Complex-action/2026-06-18-adversarial-loop-breaker/03b-quality-gate-router.md
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('=== F1 v8.6.0 Adversarial Loop-Breaker guardrail ===');

// ---------------------------------------------------------------------------
// references/gates.md — registry row + counts
// ---------------------------------------------------------------------------

test('S1 — gates.md registry row ADVERSARIAL_LOOP_BREAKER exists with CIRCUIT_BREAKER hardness', () => {
  const content = read('references/gates.md');
  const row = findRegistryRow(content, 'ADVERSARIAL_LOOP_BREAKER');
  assert.ok(row, 'no markdown table row whose first cell is ADVERSARIAL_LOOP_BREAKER');
  assert.ok(
    /CIRCUIT_BREAKER/.test(row.join(' | ')),
    `ADVERSARIAL_LOOP_BREAKER row must declare CIRCUIT_BREAKER hardness; got: ${row.join(' | ')}`
  );
});

test('S2 — gates.md header reads "44-gate" registry', () => {
  const content = read('references/gates.md');
  const m = content.match(/(\d+)-gate registr/i);
  assert.ok(m, 'no "N-gate registry" header line found');
  assert.equal(Number(m[1]), 44, `header says ${m[1]}-gate registry, expected 44`);
});

test('S3 — Mandatory Gates by Complexity table has 24 data rows', () => {
  const content = read('references/gates.md');
  const section = extractSection(content, 'Mandatory Gates by Complexity');
  assert.ok(section, '"## Mandatory Gates by Complexity" section not found');
  const dataRows = parseTableDataRows(section);
  assert.equal(dataRows.length, 24, `expected 24 gate rows, got ${dataRows.length}`);
});

test('S4 — ADVERSARIAL_LOOP_BREAKER row in Mandatory table has a checkmark in SIMPLES, MEDIA, COMPLEXA', () => {
  const content = read('references/gates.md');
  const section = extractSection(content, 'Mandatory Gates by Complexity');
  assert.ok(section, '"## Mandatory Gates by Complexity" section not found');
  const dataRows = parseTableDataRows(section);
  const row = dataRows.find((r) => /ADVERSARIAL_LOOP_BREAKER/.test(r['Gate'] || Object.values(r)[0] || ''));
  assert.ok(row, 'no ADVERSARIAL_LOOP_BREAKER row in the Mandatory table');
  const checked = (v) => /[✓xX✔]/.test(v || '') || /yes/i.test(v || '');
  assert.ok(checked(row['SIMPLES']), `SIMPLES not checked for ALB: "${row['SIMPLES']}"`);
  assert.ok(checked(row['MEDIA']), `MEDIA not checked for ALB: "${row['MEDIA']}"`);
  assert.ok(checked(row['COMPLEXA']), `COMPLEXA not checked for ALB: "${row['COMPLEXA']}"`);
});

test('S4b — Mandatory table SIMPLES column has 11 checkmarks (incl. the 5 newly-mandatory gates)', () => {
  const content = read('references/gates.md');
  const section = extractSection(content, 'Mandatory Gates by Complexity');
  assert.ok(section, '"## Mandatory Gates by Complexity" section not found');
  const dataRows = parseTableDataRows(section);
  const checked = (v) => /[✓xX✔]/.test(v || '') || /yes/i.test(v || '');
  const colCount = (col) => dataRows.filter((r) => checked(r[col])).length;
  assert.equal(colCount('SIMPLES'), 11, `SIMPLES checkmarks = ${colCount('SIMPLES')}, expected 11`);
  assert.equal(colCount('MEDIA'), 13, `MEDIA checkmarks = ${colCount('MEDIA')}, expected 13`);
  assert.equal(colCount('COMPLEXA'), 18, `COMPLEXA checkmarks = ${colCount('COMPLEXA')}, expected 18`);

  // Cumulative rule (no exceptions): FIX_LOOP_EXHAUSTED is mandatory for SIMPLES,
  // so it MUST carry a MEDIA checkmark too (v8.6.0 correction — was a deliberate
  // non-cumulative exception, now removed).
  {
    const gn = (r) => (r['Gate'] || Object.values(r)[0] || '');
    const fle = dataRows.find((r) => /\bFIX_LOOP_EXHAUSTED\b/.test(gn(r)));
    assert.ok(fle, 'no FIX_LOOP_EXHAUSTED row in the Mandatory table');
    assert.ok(checked(fle['MEDIA']), `FIX_LOOP_EXHAUSTED must have a MEDIA checkmark; got "${fle['MEDIA']}"`);
  }

  // Each newly-SIMPLES-mandatory gate must carry a SIMPLES checkmark.
  const gateName = (r) => (r['Gate'] || Object.values(r)[0] || '');
  for (const name of ['PLAN_REJECTED', 'ADVERSARIAL_GATE', 'ADVERSARIAL_BLOCK', 'FIX_LOOP_EXHAUSTED', 'ADVERSARIAL_LOOP_BREAKER']) {
    const row = dataRows.find((r) => new RegExp(`\\b${name}\\b`).test(gateName(r)));
    assert.ok(row, `no Mandatory table row for ${name}`);
    assert.ok(checked(row['SIMPLES']), `${name} must have a SIMPLES checkmark; got "${row['SIMPLES']}"`);
  }
});

// ---------------------------------------------------------------------------
// lib/fidelity-reporter.cjs — MANDATORY_GATES_BY_COMPLEXITY
// ---------------------------------------------------------------------------

test('S5 — fidelity-reporter SIMPLES array has 11 items', () => {
  const reporter = require(path.join(ROOT, 'lib', 'fidelity-reporter.cjs'));
  const m = reporter.MANDATORY_GATES_BY_COMPLEXITY;
  assert.ok(m && Array.isArray(m.SIMPLES), 'MANDATORY_GATES_BY_COMPLEXITY.SIMPLES not an array');
  assert.equal(m.SIMPLES.length, 11, `SIMPLES length = ${m.SIMPLES.length}, expected 11`);
});

test('S6 — fidelity-reporter SIMPLES array contains the 5 newly-mandatory gates', () => {
  const reporter = require(path.join(ROOT, 'lib', 'fidelity-reporter.cjs'));
  const m = reporter.MANDATORY_GATES_BY_COMPLEXITY;
  for (const name of ['PLAN_REJECTED', 'ADVERSARIAL_GATE', 'ADVERSARIAL_BLOCK', 'ADVERSARIAL_LOOP_BREAKER', 'FIX_LOOP_EXHAUSTED']) {
    assert.ok(m.SIMPLES.includes(name), `SIMPLES missing ${name}`);
  }
});

test('S7 — fidelity-reporter MEDIA array has 13 items and includes ADVERSARIAL_LOOP_BREAKER + FIX_LOOP_EXHAUSTED', () => {
  const reporter = require(path.join(ROOT, 'lib', 'fidelity-reporter.cjs'));
  const m = reporter.MANDATORY_GATES_BY_COMPLEXITY;
  assert.equal(m.MEDIA.length, 13, `MEDIA length = ${m.MEDIA.length}, expected 13`);
  assert.ok(m.MEDIA.includes('ADVERSARIAL_LOOP_BREAKER'), 'MEDIA missing ADVERSARIAL_LOOP_BREAKER');
  assert.ok(m.MEDIA.includes('FIX_LOOP_EXHAUSTED'), 'MEDIA missing FIX_LOOP_EXHAUSTED (cumulative rule)');
});

test('S8 — fidelity-reporter COMPLEXA array has 18 items and includes ADVERSARIAL_LOOP_BREAKER', () => {
  const reporter = require(path.join(ROOT, 'lib', 'fidelity-reporter.cjs'));
  const m = reporter.MANDATORY_GATES_BY_COMPLEXITY;
  assert.equal(m.COMPLEXA.length, 18, `COMPLEXA length = ${m.COMPLEXA.length}, expected 18`);
  assert.ok(m.COMPLEXA.includes('ADVERSARIAL_LOOP_BREAKER'), 'COMPLEXA missing ADVERSARIAL_LOOP_BREAKER');
});

// ---------------------------------------------------------------------------
// references/sentinel-integration.md — review_state schema fields
// ---------------------------------------------------------------------------

test('S9 — sentinel-integration.md documents adversarial_loop_count', () => {
  const content = read('references/sentinel-integration.md');
  assert.ok(content.includes('adversarial_loop_count'),
    'sentinel-integration.md does not mention adversarial_loop_count');
});

test('S10 — sentinel-integration.md documents escape_used', () => {
  const content = read('references/sentinel-integration.md');
  assert.ok(content.includes('escape_used'),
    'sentinel-integration.md does not mention escape_used');
});

// ---------------------------------------------------------------------------
// references/complexity-matrix.md — Proportional Behavior table
// ---------------------------------------------------------------------------

test('S11 — complexity-matrix.md SIMPLES Plan Mode cell is not "Skip"', () => {
  const content = read('references/complexity-matrix.md');
  const row = findTableRowStarting(content, 'Plan Mode');
  assert.ok(row, 'no "Plan Mode" table row found');
  // Column order: Gate/Behavior | SIMPLES | MEDIA | COMPLEXA -> SIMPLES is index 1.
  const simplesCell = (row[1] || '').trim();
  assert.ok(
    !/^skip$/i.test(simplesCell),
    `Plan Mode SIMPLES cell must not be "Skip" (got "${simplesCell}")`
  );
});

test('S12 — complexity-matrix.md no longer contains the phrase "skip entirely"', () => {
  const content = read('references/complexity-matrix.md');
  assert.ok(!content.includes('skip entirely'),
    'the "skip entirely" phrase (SIMPLES adversarial loophole) must be removed');
});

// ---------------------------------------------------------------------------
// commands/pipeline.md + agents/core/pipeline-controller.md — Inline Invariants
// ---------------------------------------------------------------------------

test('S13 — commands/pipeline.md contains ADVERSARIAL_LOOP_BREAKER', () => {
  const content = read('commands/pipeline.md');
  assert.ok(content.includes('ADVERSARIAL_LOOP_BREAKER'),
    'commands/pipeline.md Inline Invariants missing ADVERSARIAL_LOOP_BREAKER');
});

test('S14 — agents/core/pipeline-controller.md contains ADVERSARIAL_LOOP_BREAKER', () => {
  const content = read('agents/core/pipeline-controller.md');
  assert.ok(content.includes('ADVERSARIAL_LOOP_BREAKER'),
    'pipeline-controller.md Inline Invariants missing ADVERSARIAL_LOOP_BREAKER');
});

// ---------------------------------------------------------------------------
// agents/core/adversarial-batch.md — frontmatter description (bounded model)
// ---------------------------------------------------------------------------

test('S15 — adversarial-batch.md frontmatter description references the outer cycle / escape, not just "STOPS"', () => {
  const content = read('agents/core/adversarial-batch.md');
  const desc = extractFrontmatterField(content, 'description');
  assert.ok(desc, 'no description field in adversarial-batch.md frontmatter');
  assert.ok(
    /cycle|escape|DIAGNOSE|REIMPLEMENT/i.test(desc),
    `description must reference the outer cycle counter or the DIAGNOSE-THEN-REIMPLEMENT escape; got: "${desc}"`
  );
});

// ---------------------------------------------------------------------------
// agents/executor/executor-fix.md — FIX_CONTEXT mode field
// ---------------------------------------------------------------------------

test('S16 — executor-fix.md FIX_CONTEXT schema documents a mode field and REIMPLEMENT value', () => {
  const content = read('agents/executor/executor-fix.md');
  assert.ok(content.includes('mode'), 'executor-fix.md does not document a mode field');
  assert.ok(content.includes('REIMPLEMENT'), 'executor-fix.md does not document REIMPLEMENT mode');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// helpers — extractSection + parseTableDataRows copied verbatim from
// tests/regression/v6.1.0/F1_gates_mandatory_section.cjs (self-contained).
// ---------------------------------------------------------------------------

function extractSection(md, headingText) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^##\\s+${escapeRegex(headingText)}\\s*$`).test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function parseTableDataRows(sectionMd) {
  const lines = sectionMd.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return [];
  const header = lines[0].split('|').map((c) => c.trim()).filter(Boolean);
  const data = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.trim());
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length === 0) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    data.push(row);
  }
  return data;
}

// Find a registry row by its first cell value anywhere in the file (returns
// the trimmed cell array, or null). Used by S1 — gate registry rows live in a
// table that is not under the "Mandatory Gates by Complexity" heading.
function findRegistryRow(md, gateName) {
  const lines = md.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length && new RegExp(`^\\*{0,2}${escapeRegex(gateName)}\\*{0,2}$`).test(cells[0])) {
      return cells;
    }
  }
  return null;
}

// Find the first markdown table row whose first cell starts with the given
// label (markdown bold markers tolerated). Returns the trimmed cell array.
function findTableRowStarting(md, label) {
  const lines = md.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    const first = (cells[0] || '').replace(/\*/g, '').trim();
    if (new RegExp(`^${escapeRegex(label)}\\b`, 'i').test(first)) {
      return cells;
    }
  }
  return null;
}

// Extract a scalar field value from the YAML frontmatter (text between the
// first two `---` fence lines). No YAML parser needed for a one-line scalar.
function extractFrontmatterField(md, field) {
  const lines = md.split(/\r?\n/);
  if (lines[0].trim() !== '---') return '';
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return '';
  const fm = lines.slice(1, end);
  for (const line of fm) {
    const m = line.match(new RegExp(`^${escapeRegex(field)}\\s*:\\s*(.*)$`));
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
