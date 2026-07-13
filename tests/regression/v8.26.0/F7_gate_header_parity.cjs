#!/usr/bin/env node
'use strict';

/**
 * Lock 2 — Gate Registry header/row parity (workflow-audit-remediation, S3 / task 4.1).
 *
 * Requirement 6.2: the numeric count declared in the prose header of
 * `references/gates.md` ("... the <N>-gate registry ...") must equal the REAL
 * number of Gate Registry rows counted mechanically from the same file.
 *
 * NEITHER side is hard-coded: the declared number is parsed from the header and
 * the actual number is counted from the registry section, so the test pins the
 * invariant "header == rows" without embedding either value.
 *
 * Iron Law (S3): this test READS gates.md; it never mutates the registry rows.
 * The Mandatory Gates table is explicitly excluded from the row count (only the
 * "Gate Registry" section is counted).
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

const GATES = path.join(ROOT, 'references', 'gates.md');
const md = fs.readFileSync(GATES, 'utf8');
const lines = md.split('\n');

// Declared header number: "... the <N>-gate registry ..."
function declaredHeaderCount() {
  const m = md.match(/(\d+)-gate registry/);
  return m ? Number(m[1]) : null;
}

// Mechanically count Gate Registry rows: within the "## Gate Registry" section
// (up to the next "## " heading — the Mandatory Gates table), count markdown
// table rows whose FIRST cell is an ALL-CAPS gate identifier. The "| Gate |"
// header rows (Title-case) and "|---|" separators are excluded by the pattern.
function countRegistryRows() {
  let start = -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Gate Registry\s*$/.test(lines[i])) { start = i; break; }
  }
  assert.ok(start !== -1, 'gates.md must contain a "## Gate Registry" section');
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && !/^###/.test(lines[i])) { end = i; break; }
  }
  const ROW_RE = /^\|\s*[A-Z][A-Z0-9_]*\s*\|/;
  let n = 0;
  for (let i = start + 1; i < end; i++) if (ROW_RE.test(lines[i])) n++;
  return n;
}

console.log('=== Lock 2 — gates.md header vs real registry rows ===');

const declared = declaredHeaderCount();
const rows = countRegistryRows();

test('gates.md declares a "<N>-gate registry" header count', () => {
  assert.ok(declared !== null, 'gates.md prose must declare "<N>-gate registry"');
});

test('gates.md registry rows are countable (> 0)', () => {
  assert.ok(rows > 0, `counted ${rows} registry rows`);
});

test(`declared header (${declared}) === real registry rows (${rows})`, () => {
  assert.equal(declared, rows,
    `references/gates.md header says "${declared}-gate registry" but the Gate Registry section has ${rows} rows`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
