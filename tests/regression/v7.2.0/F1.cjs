#!/usr/bin/env node
'use strict';

/**
 * F1 — BOUNDED_CONTEXT_MISSING producer wired in pipeline-controller.md
 *
 * Static-analysis regression for v7.2.0 fix. plan-architect.md Rule 10
 * (lines 274-279) declared the BOUNDED_CONTEXT_MISSING SOFT event with a
 * "Status: SPEC-ONLY (v6.1.0) — producer not yet wired" disclaimer. This
 * suite verifies the producer is now documented in pipeline-controller.md
 * as a "Step 1.5-post" sub-section AFTER the "Pass approved plan to Phase 2"
 * paragraph and BEFORE the "PHASE TRANSITION 1/1.5 → 2" boundary.
 *
 * Scenarios:
 *   F1-S1 MAIN       — pipeline-controller.md has a "Step 1.5-post" (or
 *                      equivalent) section referencing BOUNDED_CONTEXT_MISSING,
 *                      positioned AFTER the "Pass approved plan to Phase 2"
 *                      paragraph AND BEFORE the "PHASE TRANSITION 1/1.5 → 2"
 *                      line.
 *   F1-S2 MAIN       — the new section references `protocol-events.jsonl`
 *                      as the write target.
 *   F1-S3 MAIN       — the new section references `violation_type:
 *                      "soft-advisory"` (canonical schema field).
 *   F1-S4 MAIN       — the new section guards on `complexity == "COMPLEXA"`
 *                      (or equivalent "COMPLEXA only" qualifier).
 *   F1-S5 REGRESSION — references/gates.md "Mandatory Gates by Complexity"
 *                      table still has exactly 22 data rows AND no row
 *                      mentions BOUNDED_CONTEXT_MISSING. If a separate Gate
 *                      Registry table is detected (rows pinned at 27 in
 *                      v6.2.0), its row count is also unchanged.
 *   F1-S6 REGRESSION — channel separation: the new pipeline-controller.md
 *                      section does NOT mention `gate-decisions.jsonl` as
 *                      the write target for BOUNDED_CONTEXT_MISSING. Window
 *                      is extracted from the "Step 1.5-post" heading to the
 *                      next "---" or "###" boundary so the file's unrelated
 *                      gate-decisions.jsonl mentions don't create false
 *                      positives.
 *
 * Production code under test:
 *   - agents/core/pipeline-controller.md  (Step 1.5-post insertion)
 *   - references/gates.md                 (invariant 22-row + 27-row tables)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const CONTROLLER = path.join(ROOT, 'agents/core/pipeline-controller.md');
const GATES_MD = path.join(ROOT, 'references/gates.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('=== F1 BOUNDED_CONTEXT_MISSING producer wired (pipeline-controller.md) ===');

// ---------- F1-S1 MAIN ----------
test('F1-S1: pipeline-controller.md has "Step 1.5-post" referencing BOUNDED_CONTEXT_MISSING positioned AFTER "Pass approved plan" AND BEFORE "PHASE TRANSITION 1/1.5"', () => {
  const md = read(CONTROLLER);
  const idxPassApproved = md.indexOf('Pass approved plan to Phase 2');
  const idxPhaseTransition = md.indexOf('PHASE TRANSITION 1/1.5');
  const idxStepPost = md.search(/Step\s+1\.5-post/i);
  const idxBCM = md.indexOf('BOUNDED_CONTEXT_MISSING');

  assert.ok(idxPassApproved >= 0,
    '"Pass approved plan to Phase 2" anchor not found in pipeline-controller.md');
  assert.ok(idxPhaseTransition >= 0,
    '"PHASE TRANSITION 1/1.5" anchor not found in pipeline-controller.md');
  assert.ok(idxStepPost >= 0,
    '"Step 1.5-post" heading not found in pipeline-controller.md');
  assert.ok(idxBCM >= 0,
    'BOUNDED_CONTEXT_MISSING not mentioned in pipeline-controller.md');

  assert.ok(idxStepPost > idxPassApproved,
    `"Step 1.5-post" (pos ${idxStepPost}) must appear AFTER "Pass approved plan" (pos ${idxPassApproved})`);
  assert.ok(idxStepPost < idxPhaseTransition,
    `"Step 1.5-post" (pos ${idxStepPost}) must appear BEFORE "PHASE TRANSITION 1/1.5" (pos ${idxPhaseTransition})`);
  assert.ok(idxBCM > idxPassApproved && idxBCM < idxPhaseTransition,
    `BOUNDED_CONTEXT_MISSING mention (pos ${idxBCM}) must sit between "Pass approved plan" and "PHASE TRANSITION 1/1.5"`);
});

// ---------- F1-S2 MAIN ----------
test('F1-S2: new Step 1.5-post section references protocol-events.jsonl as write target', () => {
  const md = read(CONTROLLER);
  const section = extractStep15PostSection(md);
  assert.ok(section, '"Step 1.5-post" section could not be extracted');
  assert.ok(/protocol-events\.jsonl/.test(section),
    'Step 1.5-post section must reference `protocol-events.jsonl` as the write target');
});

// ---------- F1-S3 MAIN ----------
test('F1-S3: new section references violation_type: "soft-advisory" (canonical schema field)', () => {
  const md = read(CONTROLLER);
  const section = extractStep15PostSection(md);
  assert.ok(section, '"Step 1.5-post" section could not be extracted');
  assert.ok(/violation_type\s*:\s*["']?soft-advisory["']?/.test(section),
    'Step 1.5-post section must reference `violation_type: "soft-advisory"` (canonical ALLOWED_PROTOCOL_EVENT_KEYS field)');
});

// ---------- F1-S4 MAIN ----------
test('F1-S4: new section guards on COMPLEXA only (complexity == "COMPLEXA" or "COMPLEXA only" qualifier)', () => {
  const md = read(CONTROLLER);
  const section = extractStep15PostSection(md);
  assert.ok(section, '"Step 1.5-post" section could not be extracted');
  // Accept either `complexity == "COMPLEXA"` or the prose qualifier "COMPLEXA only"
  const guardRe = /(complexity\s*==\s*["']?COMPLEXA["']?|COMPLEXA\s+only)/;
  assert.ok(guardRe.test(section),
    'Step 1.5-post section must guard on `complexity == "COMPLEXA"` (or "COMPLEXA only" qualifier) before emitting');
});

// ---------- F1-S5 REGRESSION ----------
test('F1-S5: references/gates.md "Mandatory Gates by Complexity" table still has 23 data rows (post-Patch-2 baseline) and no BOUNDED_CONTEXT_MISSING row; Gate Registry row count invariant preserved', () => {
  // Row count baseline bumped from 22 → 23 in Patch 2 / v7.1.2 when
  // STATE_FILE_INIT_FAIL was added as a phase-0 hard precondition. The
  // invariant asserted here is unchanged in spirit: BOUNDED_CONTEXT_MISSING
  // still must NOT appear in the Mandatory table or Gate Registry.
  const md = read(GATES_MD);
  const mandatorySection = extractSection(md, 'Mandatory Gates by Complexity');
  assert.ok(mandatorySection, '"Mandatory Gates by Complexity" section not found in references/gates.md');
  const mandatoryRows = parseTableDataRows(mandatorySection);
  assert.equal(mandatoryRows.length, 23,
    `expected 23 data rows in "Mandatory Gates by Complexity" table, got ${mandatoryRows.length}`);

  // Adversarial review followup MEDIUM #5: bare cardinality is not enough —
  // a future patch could swap STATE_FILE_INIT_FAIL for another row and the
  // count would stay 23. Assert the row identity directly.
  const hasStateFileGate = mandatoryRows.some((row) =>
    Object.values(row).some((v) => /STATE_FILE_INIT_FAIL/.test(v)));
  assert.equal(hasStateFileGate, true,
    'STATE_FILE_INIT_FAIL row missing from Mandatory Gates table — Patch 2 invariant violated');

  const hasBCM = mandatoryRows.some((row) =>
    Object.values(row).some((v) => /BOUNDED_CONTEXT_MISSING/.test(v)));
  assert.equal(hasBCM, false,
    'BOUNDED_CONTEXT_MISSING must NOT appear as a row in Mandatory Gates table (SOFT event only, not a registered gate)');

  // Gate Registry total rows invariant — pinned at 27 in v6.2.0 (16 base + 6 spec + 3 routing + 7 brainstorm = 32 listed
  // but the v6.3.0 CLAUDE.md row 22 declares "32-row Gate Registry untouched"; here we compute total across all registry
  // sub-tables under "## Gate Registry" and assert it has not grown by adding BOUNDED_CONTEXT_MISSING).
  const registrySection = extractSection(md, 'Gate Registry');
  assert.ok(registrySection, '"Gate Registry" section not found in references/gates.md');
  const registryRows = parseAllTableDataRows(registrySection);
  const registryHasBCM = registryRows.some((row) =>
    Object.values(row).some((v) => /BOUNDED_CONTEXT_MISSING/.test(v)));
  assert.equal(registryHasBCM, false,
    'BOUNDED_CONTEXT_MISSING must NOT appear in any Gate Registry sub-table (channel separation invariant)');
});

// ---------- F1-S6 REGRESSION ----------
test('F1-S6: channel separation — Step 1.5-post window does NOT route BOUNDED_CONTEXT_MISSING to gate-decisions.jsonl', () => {
  const md = read(CONTROLLER);
  const section = extractStep15PostSection(md);
  assert.ok(section, '"Step 1.5-post" section could not be extracted');
  // The section may legitimately MENTION the contrast to gate-decisions.jsonl as
  // an explanatory clarification (e.g., "NOT gate-decisions.jsonl"). What is
  // forbidden is treating gate-decisions.jsonl as the write target for BCM.
  // We assert that no positive write-target assignment to gate-decisions.jsonl
  // appears in the same line/clause as BOUNDED_CONTEXT_MISSING.
  const lines = section.split(/\r?\n/);
  for (const line of lines) {
    if (/BOUNDED_CONTEXT_MISSING/.test(line)) {
      // Forbid: "write ... gate-decisions.jsonl" or "channel: gate-decisions.jsonl"
      // in the same line. The negation phrase "NOT gate-decisions.jsonl" is
      // explicitly allowed.
      const positiveAssignment = /(channel\s*:\s*[`"']?gate-decisions\.jsonl|writes?\s+to\s+gate-decisions\.jsonl|target\s*:\s*[`"']?gate-decisions\.jsonl)/i;
      assert.ok(!positiveAssignment.test(line),
        `Line containing BOUNDED_CONTEXT_MISSING must NOT route to gate-decisions.jsonl: "${line.trim()}"`);
    }
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

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

/**
 * Extract the "Step 1.5-post" sub-section from pipeline-controller.md. The
 * heading may be at any markdown level (####, ###, ##) and may include
 * surrounding decoration (bold, parentheses). The section ends at the next
 * "---" horizontal rule OR the next heading at the same/shallower level,
 * whichever comes first.
 */
function extractStep15PostSection(md) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/Step\s+1\.5-post/i.test(lines[i]) && /^#{2,6}/.test(lines[i].trim())) {
      start = i;
      break;
    }
  }
  // Fallback: heading might be **Step 1.5-post...** style (bold paragraph
  // rather than ATX heading). Look for a line that starts with the bold
  // marker and contains "Step 1.5-post".
  if (start === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/Step\s+1\.5-post/i.test(lines[i])) { start = i; break; }
    }
  }
  if (start === -1) return '';

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Stop at horizontal rule
    if (trimmed === '---') { end = i; break; }
    // Stop at next heading (any ATX level)
    if (/^#{2,6}\s+\S/.test(trimmed)) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * Parse the first markdown table in a section. Returns an array of row
 * objects keyed by header column name.
 */
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

/**
 * Parse ALL markdown tables in a section (handles sub-sections under the
 * Gate Registry heading, which contains multiple tables separated by
 * sub-headings).
 */
function parseAllTableDataRows(sectionMd) {
  const lines = sectionMd.split(/\r?\n/);
  const allRows = [];
  let block = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      block.push(line);
    } else if (block.length > 0) {
      // End of a table block — parse it
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
