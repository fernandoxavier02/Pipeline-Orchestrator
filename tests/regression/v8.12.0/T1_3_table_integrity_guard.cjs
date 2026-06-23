#!/usr/bin/env node
'use strict';

/**
 * T1.3 (v8.12.0) — F1-STYLE TABLE-INTEGRITY GUARD for spec
 * 006-enforcement-fail-closed-arming. Satisfies: R1.6, NFR2.
 *
 * The Iron Law of spec 006 is that the whole change lives in existing
 * hooks/libs/tests and adds NO new Mandatory/Registry gate row. The corrective
 * dispatch (R4/R8) is an AUDIT-class behavior, NOT a new registry gate. This
 * guard pins both canonical tables in references/gates.md at their pre-spec
 * counts so any accidental row add/remove by this spec fails the suite.
 *
 * Canonical counts (verified against the existing F1 / F14 guards):
 *   - Gate Registry .......................... 49 data rows
 *     (tests/regression/v6.3.0/F14_gates_md_unchanged_count.cjs, post-v8.8.0)
 *   - Mandatory Gates by Complexity .......... 24 data rows
 *     (tests/regression/v6.1.0/F1_gates_mandatory_section.cjs, post-v8.6.0)
 *
 * EXPECTED STATE on first run: PASSES (spec 006 must NOT have touched the
 * tables). If a later batch of this spec accidentally adds a gate row, this
 * test catches it before diff-discipline does — a belt-and-braces cross-check
 * mirroring F14's role for v6.3.0.
 *
 * Style mirrors the canonical F1 (v6.1.0) + F14 (v6.3.0) table guards: same
 * section-extraction + data-row-counting approach, same row-skip rules
 * (header + separator), no new dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'references/gates.md');

// Canonical pre-spec-006 counts. These MUST equal the figures pinned by the
// existing F1/F14 guards; if F14 bumps them in a deliberate future Iron-Law
// change, this guard is updated in lockstep. Spec 006 itself bumps NEITHER.
const EXPECTED_REGISTRY_ROWS = 49;
const EXPECTED_MANDATORY_ROWS = 24;

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T1.3 v8.12.0 — gates.md table-integrity guard (spec 006 adds NO gate row) ===');

test('references/gates.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test(`Gate Registry section is UNCHANGED at ${EXPECTED_REGISTRY_ROWS} data rows (R1.6 / NFR2)`, () => {
  const content = fs.readFileSync(TARGET, 'utf8');
  const rows = countDataRowsBetween(
    content,
    /^##\s+Gate Registry\s*$/m,
    /^##\s+Mandatory Gates by Complexity\s*$/m,
  );
  assert.equal(rows, EXPECTED_REGISTRY_ROWS,
    `spec 006 must NOT add/remove a Gate Registry row: expected ${EXPECTED_REGISTRY_ROWS}, got ${rows}`);
});

test(`Mandatory Gates by Complexity section is UNCHANGED at ${EXPECTED_MANDATORY_ROWS} data rows (R1.6 / NFR2)`, () => {
  const content = fs.readFileSync(TARGET, 'utf8');
  const rows = countDataRowsBetween(
    content,
    /^##\s+Mandatory Gates by Complexity\s*$/m,
    /^##\s+\S/m,
  );
  assert.equal(rows, EXPECTED_MANDATORY_ROWS,
    `spec 006 must NOT add/remove a Mandatory gate row: expected ${EXPECTED_MANDATORY_ROWS}, got ${rows}`);
});

test('No spec-006 corrective vocab (ARM_CORRECTIVE_*/EXEC_ERROR_CORRECTIVE) leaked into the Mandatory table', () => {
  // The R4/R8 correctives are AUDIT-class events, never mandatory-by-complexity
  // gate rows. Guard against a future batch wiring them into the wrong table.
  const content = fs.readFileSync(TARGET, 'utf8');
  const lines = content.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Mandatory Gates by Complexity\s*$/.test(lines[i])) { startIdx = i; break; }
  }
  assert.ok(startIdx >= 0, 'Mandatory Gates by Complexity heading not found');
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { endIdx = i; break; }
  }
  const section = lines.slice(startIdx + 1, endIdx).join('\n');
  assert.ok(!/ARM_CORRECTIVE_|EXEC_ERROR_CORRECTIVE|ENFORCEMENT_SURFACE_UNVERIFIED/.test(section),
    'spec-006 corrective/assurance events must NOT appear as Mandatory gate rows (they are AUDIT-class)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers (mirror F14 v6.3.0) ----------

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
