#!/usr/bin/env node
'use strict';

/**
 * F14 — Defense-in-depth invariant on references/gates.md.
 *
 * gates.md is in CHANGE_CONTRACT.forbidden_files for the v6.3.0 batch — it
 * MUST NOT be touched while wiring batch-adversarial-discipline. This test
 * pins the row counts of both canonical tables so any accidental edit
 * (added/removed gate, accidental row tweak) fails CI.
 *
 * F1 already pins the 22-row Mandatory count and column-by-column sums;
 * F14 additionally pins the Gate Registry row count (currently 32 data
 * rows across the four sub-tables: Core 16 + Spec 6 + Routing 3 +
 * Brainstorm 7) and re-pins the Mandatory 22 count as a belt-and-braces
 * cross-check.
 *
 * EXPECTED STATE on first run: PASSES. If the implementer accidentally
 * edits gates.md, this test catches it before diff-discipline does.
 *
 * Test-bug note: the original scenario draft expected "27" Registry rows.
 * Reality check against current `references/gates.md` (lines 21-82) shows
 * 32 rows — the v6.2.0 brainstorm clarification gates (7 rows) pushed the
 * total beyond the draft figure. The invariant is "match current state",
 * so the assertion uses the verified count.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F14.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'references/gates.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F14 gates.md unchanged-count defense-in-depth ===');

test('references/gates.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('Gate Registry section contains 48 data rows (Core 19 + Spec 6 + Routing 4 + Brainstorm 7 + Spec-authoring 8 + Spec-authoring-enforcement 4) post-v8.6.0 merge of v8.5.0+v8.6.0', () => {
  // Bumped from 32 → 35: +1 STATE_FILE_INIT_FAIL (Patch 2 / v7.1.2, Core),
  // +1 PROTOCOL_HANDSHAKE_TIMEOUT (Patch 3 / v7.1.2, Core),
  // +1 STRICT_SPEC_REJECTION (Patch 4 / v7.1.2, Routing).
  // 35 → 43: +8 spec-authoring telemetry gates (v8.0.0).
  // 43 → 47: +4 spec-authoring enforcement AUDIT gates (v8.5.0) —
  // SPEC_AUTHORING_INCOMPLETE, SPEC_AUTHORING_STEP_BYPASS,
  // SPEC_CONTRACT_DISCIPLINE_MISSING, PARALLEL_DISPATCH_VIOLATION.
  // 47 → 48: +1 ADVERSARIAL_LOOP_BREAKER (v8.6.0, Core 18→19). The v8.6.0
  // branch forked off v8.4.0 (43) and was merged on top of v8.5.0 (47),
  // so the final registry is 47 + 1 = 48.
  const content = fs.readFileSync(TARGET, 'utf8');
  const rows = countDataRowsBetween(content, /^##\s+Gate Registry\s*$/m, /^##\s+Mandatory Gates by Complexity\s*$/m);
  assert.equal(rows, 48, `expected 48 data rows in Gate Registry section, got ${rows}`);
});

test('Mandatory Gates by Complexity section contains 24 data rows (v8.6.0 +ADVERSARIAL_LOOP_BREAKER)', () => {
  // Bumped from 22 → 23 in Patch 2 / v7.1.2 (STATE_FILE_INIT_FAIL is mandatory
  // across SIMPLES/MEDIA/COMPLEXA). PROTOCOL_HANDSHAKE_TIMEOUT is registered
  // in the Gate Registry but is conditional, not in the Mandatory table.
  const content = fs.readFileSync(TARGET, 'utf8');
  const rows = countDataRowsBetween(content, /^##\s+Mandatory Gates by Complexity\s*$/m, /^##\s+\S/m);
  assert.equal(rows, 24, `expected 24 data rows in Mandatory section, got ${rows}`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

function countDataRowsBetween(md, startRegex, endRegex) {
  const lines = md.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRegex.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) {
    throw new Error('start anchor not found in gates.md');
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (endRegex.test(lines[i])) { endIdx = i; break; }
  }
  const section = lines.slice(startIdx + 1, endIdx);
  let count = 0;
  for (const raw of section) {
    const l = raw.trim();
    if (!l.startsWith('|')) continue;
    // Skip header rows ("| Gate |" or any header listing column names)
    if (/^\|\s*Gate\s*\|/i.test(l)) continue;
    // Skip separator rows ("|---|---|...")
    if (/^\|[\s\-:|]+\|$/.test(l)) continue;
    count++;
  }
  return count;
}
