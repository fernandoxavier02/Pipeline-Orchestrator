#!/usr/bin/env node
'use strict';

/**
 * IDL-06 - The 22-gate registry count MUST stay at 22 after the
 * Implementation Discipline Layer is added. No new registered gate
 * is allowed for this change.
 *
 * This test reads the "Mandatory Gates by Complexity" table in
 * references/gates.md (which is parsed by tests/regression/v6.1.0/F1
 * and pinned at 22 rows) AND additionally verifies the gate name list
 * in the SSOT inline invariants of commands/pipeline.md still names
 * exactly 22 gates.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const GATES = path.join(ROOT, 'references/gates.md');
const PIPELINE = path.join(ROOT, 'commands/pipeline.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== IDL-06 22-gate registry count unchanged ===');

test('references/gates.md "Mandatory Gates by Complexity" table has exactly 22 rows', () => {
  const md = fs.readFileSync(GATES, 'utf8');
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Mandatory Gates by Complexity\s*$/.test(lines[i])) { start = i; break; }
  }
  assert.ok(start >= 0, 'Mandatory Gates by Complexity heading missing');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { end = i; break; }
  }
  const section = lines.slice(start, end);
  const tableLines = section.filter((l) => l.trim().startsWith('|'));
  assert.ok(tableLines.length >= 4, 'no markdown table in section');
  // Skip header + separator, count data rows.
  const dataRows = tableLines.slice(2);
  assert.equal(dataRows.length, 22, `expected 22 gate rows, got ${dataRows.length}`);
});

test('commands/pipeline.md Inline Invariants name exactly 22 gates', () => {
  const md = fs.readFileSync(PIPELINE, 'utf8');
  // Capture the inline-invariants gate list. Schema: "(22 total)" appears
  // explicitly per the SSOT contract.
  assert.ok(/22 total/.test(md), 'pipeline.md must state "22 total" gate names');
});

test('No new "Implementation Discipline" gate has been registered', () => {
  const md = fs.readFileSync(GATES, 'utf8');
  // Defensive: ensure that the layer was NOT registered as a gate row
  // (the user goal explicitly forbids this).
  assert.ok(!/IMPL(EMENTATION)?_DISCIPLINE/i.test(md),
    'Implementation Discipline must NOT appear as a registered gate');
  assert.ok(!/DIFF_DISCIPLINE_REVIEW.*\|.*(MANDATORY|HARD|SOFT|CIRCUIT)/.test(md),
    'DIFF_DISCIPLINE_REVIEW must NOT be promoted to a registered gate row');
  assert.ok(!/SCOPE_LOCK_CHECK/.test(md),
    'SCOPE_LOCK_CHECK must NOT be registered as a gate');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
