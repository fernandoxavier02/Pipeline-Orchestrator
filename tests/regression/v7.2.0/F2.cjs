#!/usr/bin/env node
'use strict';

/**
 * F2 — ATDD Step 1b bypass observability in quality-gate-router.md
 *
 * Static-analysis regression for v7.2.0 fix. The quality-gate-router Step 1b
 * declared a Bypass clause (SIMPLES OR type=Spec) but emitted NO trace when
 * bypassed, so auditors could not distinguish bypass-by-design from a broken
 * handler. This suite verifies the bypass path now emits an AUDIT-level
 * `ATDD_STEP_1B_BYPASS` entry to `gate-decisions.jsonl` with the canonical
 * schema fields.
 *
 * Scenarios:
 *   F2-S1 MAIN       — quality-gate-router.md contains a clause about ATDD
 *                      Step 1b bypass logging (positioned inside or right
 *                      after the existing Step 1b block).
 *   F2-S2 MAIN       — bypass-log clause references "AUDIT" hardness class.
 *   F2-S3 MAIN       — bypass-log clause references `gate-decisions.jsonl`
 *                      as the write target (AUDIT-class events live in the
 *                      gate-decisions stream, NOT protocol-events.jsonl).
 *   F2-S4 MAIN       — bypass-log clause names at least one bypass reason
 *                      (SIMPLES OR Spec).
 *   F2-S5 REGRESSION — references/gates.md "Mandatory Gates by Complexity"
 *                      table still has exactly 22 data rows AND no row is
 *                      named ATDD_STEP_1B_BYPASS in the Gate Registry sub-
 *                      tables (AUDIT-class events are implicit in the
 *                      hardness taxonomy, no row needed).
 *   F2-S6 REGRESSION — cross-check: 22-row Mandatory table count AND the
 *                      registry sub-table aggregate count both unchanged
 *                      (defense-in-depth against an accidental row add).
 *
 * Production code under test:
 *   - agents/quality/quality-gate-router.md (Step 1b bypass logging insertion)
 *   - references/gates.md                   (invariant 22-row + 27-row tables)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const ROUTER = path.join(ROOT, 'agents/quality/quality-gate-router.md');
const GATES_MD = path.join(ROOT, 'references/gates.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('=== F2 ATDD Step 1b bypass observability (quality-gate-router.md) ===');

// ---------- F2-S1 MAIN ----------
test('F2-S1: quality-gate-router.md contains a bypass-logging clause for Step 1b (mentions ATDD_STEP_1B_BYPASS)', () => {
  const md = read(ROUTER);
  // Window: from "#### Step 1b" to the next "###"/"####" heading at same/shallower level.
  const block = extractStep1bWindow(md);
  assert.ok(block, 'Step 1b region could not be extracted');
  assert.ok(/ATDD_STEP_1B_BYPASS/.test(block),
    'Step 1b region must declare a bypass-logging clause naming gate `ATDD_STEP_1B_BYPASS`');
});

// ---------- F2-S2 MAIN ----------
test('F2-S2: bypass-log clause references AUDIT hardness class', () => {
  const md = read(ROUTER);
  const block = extractStep1bWindow(md);
  assert.ok(block, 'Step 1b region could not be extracted');
  // Find the clause that mentions ATDD_STEP_1B_BYPASS and assert AUDIT appears
  // within the same clause (we extract a sub-window around the gate name).
  const clause = extractClauseAround(block, 'ATDD_STEP_1B_BYPASS');
  assert.ok(clause, 'Could not isolate the bypass-log clause');
  assert.ok(/\bAUDIT\b/.test(clause),
    'bypass-log clause must reference `AUDIT` hardness class (v6.2+ telemetry-only)');
});

// ---------- F2-S3 MAIN ----------
test('F2-S3: bypass-log clause references gate-decisions.jsonl as the write target', () => {
  const md = read(ROUTER);
  const block = extractStep1bWindow(md);
  assert.ok(block, 'Step 1b region could not be extracted');
  const clause = extractClauseAround(block, 'ATDD_STEP_1B_BYPASS');
  assert.ok(clause, 'Could not isolate the bypass-log clause');
  assert.ok(/gate-decisions\.jsonl/.test(clause),
    'bypass-log clause must route to `gate-decisions.jsonl` (AUDIT-class stream)');
  // Defense-in-depth: must NOT route to protocol-events.jsonl (that is SOFT).
  assert.ok(!/protocol-events\.jsonl/.test(clause),
    'bypass-log clause must NOT route to `protocol-events.jsonl` (wrong channel for AUDIT class)');
});

// ---------- F2-S4 MAIN ----------
test('F2-S4: bypass-log clause names at least one bypass reason (SIMPLES OR Spec)', () => {
  const md = read(ROUTER);
  const block = extractStep1bWindow(md);
  assert.ok(block, 'Step 1b region could not be extracted');
  const clause = extractClauseAround(block, 'ATDD_STEP_1B_BYPASS');
  assert.ok(clause, 'Could not isolate the bypass-log clause');
  assert.ok(/SIMPLES|Spec/.test(clause),
    'bypass-log clause must name at least one bypass reason — `SIMPLES` or `Spec`');
});

// ---------- F2-S5 REGRESSION ----------
test('F2-S5: references/gates.md Mandatory table has 23 rows (post-Patch-2 baseline) AND no ATDD_STEP_1B_BYPASS row in Gate Registry', () => {
  // Row count baseline bumped from 22 → 23 in Patch 2 / v7.1.2 when
  // STATE_FILE_INIT_FAIL was added as a phase-0 hard precondition. The
  // ATDD_STEP_1B_BYPASS invariant asserted here is unchanged in spirit.
  const md = read(GATES_MD);
  const mandatorySection = extractSection(md, 'Mandatory Gates by Complexity');
  assert.ok(mandatorySection, '"Mandatory Gates by Complexity" section not found');
  const mandatoryRows = parseTableDataRows(mandatorySection);
  assert.equal(mandatoryRows.length, 23,
    `expected 23 data rows in "Mandatory Gates by Complexity" table, got ${mandatoryRows.length}`);

  // Adversarial review followup MEDIUM #5: assert the +1 row is specifically
  // STATE_FILE_INIT_FAIL, not some other unauthorized row that happens to
  // keep the count at 23.
  const hasStateFileGate = mandatoryRows.some((row) =>
    Object.values(row).some((v) => /STATE_FILE_INIT_FAIL/.test(v)));
  assert.equal(hasStateFileGate, true,
    'STATE_FILE_INIT_FAIL row missing from Mandatory Gates table — Patch 2 invariant violated');

  const mandatoryHasBypass = mandatoryRows.some((row) =>
    Object.values(row).some((v) => /ATDD_STEP_1B_BYPASS/.test(v)));
  assert.equal(mandatoryHasBypass, false,
    'ATDD_STEP_1B_BYPASS must NOT appear in Mandatory Gates table (AUDIT class is implicit in hardness taxonomy)');

  const registrySection = extractSection(md, 'Gate Registry');
  assert.ok(registrySection, '"Gate Registry" section not found');
  const registryRows = parseAllTableDataRows(registrySection);
  const registryHasBypass = registryRows.some((row) =>
    Object.values(row).some((v) => /ATDD_STEP_1B_BYPASS/.test(v)));
  assert.equal(registryHasBypass, false,
    'ATDD_STEP_1B_BYPASS must NOT appear in any Gate Registry sub-table (no new row needed for AUDIT-class telemetry)');
});

// ---------- F2-S6 REGRESSION ----------
test('F2-S6: cross-check — 23-row Mandatory count AND aggregate Gate Registry count (33) both at post-Patch-2 baseline (defense-in-depth)', () => {
  // Baseline bumped in Patch 2 / v7.1.2 — STATE_FILE_INIT_FAIL added one row
  // to Mandatory (22 → 23) AND one row to the Gate Registry base sub-table
  // (32 → 33). The defense-in-depth invariant asserted here is unchanged
  // in spirit: no UNAUTHORIZED row may be added by v7.2.0 work.
  const md = read(GATES_MD);
  const mandatorySection = extractSection(md, 'Mandatory Gates by Complexity');
  const mandatoryRows = parseTableDataRows(mandatorySection);
  assert.equal(mandatoryRows.length, 23,
    `Mandatory Gates row count must be 23 (got ${mandatoryRows.length})`);

  const registrySection = extractSection(md, 'Gate Registry');
  const registryRows = parseAllTableDataRows(registrySection);
  // The Gate Registry now aggregates 43 data rows across its 5 sub-tables
  // (18 base + 6 spec + 4 routing + 7 brainstorm + 8 spec-authoring = 43) post-v8.0.0.
  // v8.0.0 added the 8 spec-authoring telemetry gates (IDEATION_*, DESIGN_INTERROGATOR_FORCED,
  // SPEC_REVIEW_FINDINGS, SPEC_SEALED, SPEC_AMENDED) — all AUDIT/SOFT, none mandatory, so the
  // Mandatory Gates table stays at 23. No UNAUTHORIZED row may have been added beyond these.
  assert.equal(registryRows.length, 43,
    `Gate Registry aggregate row count must be 43 (got ${registryRows.length}) — no UNAUTHORIZED row may have been added beyond the v8.0.0 spec-authoring gates`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

/**
 * Extract the Step 1b region from quality-gate-router.md. Window starts at
 * the "#### Step 1b" heading and ends at the next ATX heading at depth <= 4
 * (i.e. the next "#### Step", "### ", or "## " line). Captures everything
 * the agent declares about Step 1b — including any bypass-logging sub-clause
 * appended after the Output flag paragraph.
 */
function extractStep1bWindow(md) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^####\s+Step\s+1b\b/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i];
    if (/^####\s+Step\s+\S/.test(t) || /^###\s+\S/.test(t) || /^##\s+\S/.test(t)) {
      end = i; break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * Extract a clause around a token — captures the line containing the token
 * plus the next 25 lines and previous 5 lines, joined. Used to isolate the
 * bypass-log clause inside the larger Step 1b window without false positives
 * from the rest of the section (e.g. activation paragraph or output YAML).
 */
function extractClauseAround(block, token) {
  const lines = block.split(/\r?\n/);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(token)) { idx = i; break; }
  }
  if (idx === -1) return '';
  const lo = Math.max(0, idx - 5);
  const hi = Math.min(lines.length, idx + 26);
  return lines.slice(lo, hi).join('\n');
}

/**
 * Extract a markdown section by exact heading text. Returns the slice from
 * the heading line through (but not including) the next heading of equal or
 * shallower level.
 */
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

function parseAllTableDataRows(sectionMd) {
  const lines = sectionMd.split(/\r?\n/);
  const allRows = [];
  let block = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      block.push(line);
    } else if (block.length > 0) {
      const rows = parseTableDataRows(block.join('\n'));
      allRows.push(...rows);
      block = [];
    }
  }
  if (block.length > 0) {
    const rows = parseTableDataRows(block.join('\n'));
    allRows.push(...rows);
  }
  return allRows;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
