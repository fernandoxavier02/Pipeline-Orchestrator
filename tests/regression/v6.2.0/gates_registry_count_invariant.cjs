#!/usr/bin/env node
'use strict';

/**
 * v6.2.0 — Gates registry count invariant.
 *
 * The Implementation Discipline Layer is explicitly NOT a new gate.
 * This test locks the 22-row "Mandatory Gates by Complexity" table in
 * references/gates.md and asserts that none of the new discipline names
 * (DIFF_DISCIPLINE_*, SCOPE_LOCK_*, CHANGE_CONTRACT_*, IMPLEMENTATION_DISCIPLINE_*)
 * appear as registered gate rows.
 *
 * If a future change accidentally promotes one of those names to a gate,
 * this test fails the build.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const GATES_MD = path.join(ROOT, 'references/gates.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== v6.2.0 gates registry count invariant ===');

const md = fs.readFileSync(GATES_MD, 'utf8');

function extractSection(md, headingText) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^(#{2,4})\\s+${escapeRegex(headingText)}\\s*$`));
    if (m) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  const stopRe = new RegExp(`^#{1,${level}}\\s+\\S`);
  for (let i = start + 1; i < lines.length; i++) {
    if (stopRe.test(lines[i])) { end = i; break; }
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

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

test('S1: Mandatory Gates by Complexity table still has exactly 22 rows', () => {
  const section = extractSection(md, 'Mandatory Gates by Complexity');
  const rows = parseTableDataRows(section);
  assert.equal(rows.length, 22,
    `expected 22 gate rows, got ${rows.length}`);
});

test('S2: no row name contains DIFF_DISCIPLINE / SCOPE_LOCK / CHANGE_CONTRACT / IMPLEMENTATION_DISCIPLINE', () => {
  const section = extractSection(md, 'Mandatory Gates by Complexity');
  const rows = parseTableDataRows(section);
  const forbidden = [
    /DIFF_DISCIPLINE/,
    /SCOPE_LOCK/,
    /CHANGE_CONTRACT/,
    /IMPLEMENTATION_DISCIPLINE/,
  ];
  for (const row of rows) {
    for (const cell of Object.values(row)) {
      for (const f of forbidden) {
        assert.ok(!f.test(cell),
          `gate row contains forbidden pattern ${f}: ${JSON.stringify(row)}`);
      }
    }
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
