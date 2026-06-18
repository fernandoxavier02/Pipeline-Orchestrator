#!/usr/bin/env node
'use strict';

/**
 * F1 — gates.md "Mandatory Gates by Complexity" section + PIPELINE COMPLETE
 * regression for the new Fidelity line.
 *
 * Covers:
 *   - MAIN-03      gates.md table has 23 rows + counts match
 *                  MANDATORY_GATES_BY_COMPLEXITY in lib/fidelity-reporter.cjs
 *                  (was 22 before Patch 2 / v7.1.2 which added STATE_FILE_INIT_FAIL
 *                  as a phase-0 hard precondition gate, mandatory across all 3
 *                  complexity buckets).
 *   - REGRESSION-02 pipeline-controller.md PIPELINE COMPLETE block still
 *                  has pre-existing lines (Gate Decisions, FINAL DECISION,
 *                  Documentation) AFTER the new "Fidelity:" line is inserted.
 *
 * Production code under test (NOT yet implemented — these tests MUST FAIL):
 *   - lib/fidelity-reporter.cjs            (does not exist yet)
 *   - references/gates.md section          (not added yet)
 *   - agents/core/pipeline-controller.md   ("Fidelity:" line not added yet)
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

console.log('=== F1 gates.md Mandatory Gates by Complexity ===');

test('references/gates.md contains "## Mandatory Gates by Complexity" heading', () => {
  const gatesPath = path.join(ROOT, 'references/gates.md');
  const content = fs.readFileSync(gatesPath, 'utf8');
  assert.ok(
    /^##\s+Mandatory Gates by Complexity\s*$/m.test(content),
    'expected "## Mandatory Gates by Complexity" heading'
  );
});

test('Mandatory section has a table with SIMPLES / MEDIA / COMPLEXA columns', () => {
  const content = fs.readFileSync(path.join(ROOT, 'references/gates.md'), 'utf8');
  const section = extractSection(content, 'Mandatory Gates by Complexity');
  assert.ok(/\|\s*Gate\s*\|/i.test(section), 'table header missing "Gate" column');
  assert.ok(/SIMPLES/.test(section), 'missing SIMPLES column');
  assert.ok(/MEDIA/.test(section), 'missing MEDIA column');
  assert.ok(/COMPLEXA/.test(section), 'missing COMPLEXA column');
});

test('Mandatory table has exactly 24 gate rows (one per gate name)', () => {
  // Bumped from 22 to 23 in Patch 2 / v7.1.2 — STATE_FILE_INIT_FAIL added.
  // Bumped from 23 to 24 in v8.6.0 — ADVERSARIAL_LOOP_BREAKER added (CIRCUIT_BREAKER),
  // mandatory across SIMPLES/MEDIA/COMPLEXA (deliberate Iron Law change).
  const content = fs.readFileSync(path.join(ROOT, 'references/gates.md'), 'utf8');
  const section = extractSection(content, 'Mandatory Gates by Complexity');
  const dataRows = parseTableDataRows(section);
  assert.equal(dataRows.length, 24, `expected 24 gate rows in table, got ${dataRows.length}`);
});

test('lib/fidelity-reporter.cjs exports MANDATORY_GATES_BY_COMPLEXITY object', () => {
  const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
  assert.ok(reporter.MANDATORY_GATES_BY_COMPLEXITY, 'missing MANDATORY_GATES_BY_COMPLEXITY export');
  const m = reporter.MANDATORY_GATES_BY_COMPLEXITY;
  assert.ok(Array.isArray(m.SIMPLES), 'SIMPLES must be an array of gate names');
  assert.ok(Array.isArray(m.MEDIA), 'MEDIA must be an array of gate names');
  assert.ok(Array.isArray(m.COMPLEXA), 'COMPLEXA must be an array of gate names');
});

test('Mandatory counts in gates.md table match MANDATORY_GATES_BY_COMPLEXITY in reporter', () => {
  const content = fs.readFileSync(path.join(ROOT, 'references/gates.md'), 'utf8');
  const section = extractSection(content, 'Mandatory Gates by Complexity');
  const dataRows = parseTableDataRows(section);
  // Count rows where each column is marked mandatory (we accept the common
  // markdown checkmark conventions: ✓ / x / Yes).
  const tableCount = (col) =>
    dataRows.filter((row) => /[✓xX✔]/.test(row[col] || '') || /yes/i.test(row[col] || '')).length;
  const counts = {
    SIMPLES: tableCount('SIMPLES'),
    MEDIA: tableCount('MEDIA'),
    COMPLEXA: tableCount('COMPLEXA'),
  };
  const reporter = require(path.join(ROOT, 'lib/fidelity-reporter.cjs'));
  const m = reporter.MANDATORY_GATES_BY_COMPLEXITY;
  assert.equal(counts.SIMPLES, m.SIMPLES.length,
    `SIMPLES: table=${counts.SIMPLES} vs reporter=${m.SIMPLES.length}`);
  assert.equal(counts.MEDIA, m.MEDIA.length,
    `MEDIA: table=${counts.MEDIA} vs reporter=${m.MEDIA.length}`);
  assert.equal(counts.COMPLEXA, m.COMPLEXA.length,
    `COMPLEXA: table=${counts.COMPLEXA} vs reporter=${m.COMPLEXA.length}`);
});

console.log('');
console.log('=== REGRESSION-02 pipeline-controller PIPELINE COMPLETE block ===');

test('pipeline-controller.md has new "Fidelity:" line inside PIPELINE COMPLETE block', () => {
  const md = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  const block = extractPipelineCompleteBlock(md);
  assert.ok(block, 'PIPELINE COMPLETE block not found');
  assert.ok(/\|\s*Fidelity:/.test(block),
    'PIPELINE COMPLETE block must contain a "Fidelity:" line (regression-02)');
});

test('PIPELINE COMPLETE block still has "Gate Decisions:" pre-existing line', () => {
  const md = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  const block = extractPipelineCompleteBlock(md);
  assert.ok(/\|\s*Gate Decisions:/.test(block),
    'pre-existing "Gate Decisions:" line was removed');
});

test('PIPELINE COMPLETE block still has "FINAL DECISION:" pre-existing line', () => {
  const md = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  const block = extractPipelineCompleteBlock(md);
  assert.ok(/\|\s*FINAL DECISION:/.test(block),
    'pre-existing "FINAL DECISION:" line was removed');
});

test('PIPELINE COMPLETE block still has "Documentation:" pre-existing line', () => {
  const md = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  const block = extractPipelineCompleteBlock(md);
  assert.ok(/\|\s*Documentation:/.test(block),
    'pre-existing "Documentation:" line was removed');
});

test('PIPELINE COMPLETE block: "Fidelity:" appears AFTER "Gate Decisions:"', () => {
  const md = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  const block = extractPipelineCompleteBlock(md);
  const idxGate = block.search(/\|\s*Gate Decisions:/);
  const idxFid = block.search(/\|\s*Fidelity:/);
  assert.ok(idxGate >= 0, 'Gate Decisions line missing');
  assert.ok(idxFid >= 0, 'Fidelity line missing');
  assert.ok(idxFid > idxGate,
    'Fidelity line should be placed AFTER Gate Decisions line in the closing block');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

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
  // Find the first markdown table inside the section, return data rows as
  // objects keyed by header.
  const lines = sectionMd.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return [];
  const header = lines[0].split('|').map((c) => c.trim()).filter(Boolean);
  // line 1 is the separator (---). Data rows start at lines[2].
  const data = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.trim());
    // Strip leading/trailing empty cells from outer pipes.
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length === 0) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    data.push(row);
  }
  return data;
}

function extractPipelineCompleteBlock(md) {
  // The block is wrapped in a fenced code block. We look for the
  // "PIPELINE COMPLETE" banner line and capture until the closing
  // "+======...======+" line.
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/PIPELINE COMPLETE\s+.*FINAL DECISION/.test(lines[i])) { start = i - 1; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 2; i < lines.length; i++) {
    if (/^\+={5,}\+/.test(lines[i])) { end = i + 1; break; }
  }
  return lines.slice(start, end).join('\n');
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
