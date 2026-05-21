#!/usr/bin/env node
'use strict';

/**
 * F3 — BDD slice planner coverage (feature-vertical-slice-planner.md)
 *
 * Static-analysis regression for v7.2.0. Bug 2 of the v7.2.0 ATDD/BDD/DDD
 * telemetry-drift fix flagged that `feature-vertical-slice-planner.md`
 * Step 3b correctly instructs Gherkin `.feature` emission per slice, but
 * the contract was never exercised by an executed pipeline run (zero
 * historic Feature/User Story COMPLEXA runs in the audit trail) — so there
 * was no regression test pinning the contract. Future drift (deletion,
 * weakening, or rename of Step 3b) would have gone undetected. This suite
 * pins the BDD contract statically so any silent removal breaks CI.
 *
 * Scenarios:
 *   F3-S1 MAIN       — Step 3b heading exists and explicitly mentions
 *                      "BDD" or "Gherkin" (so the section identity is
 *                      load-bearing on the BDD contract, not just any
 *                      arbitrary Step 3b).
 *   F3-S2 MAIN       — Step 3b uses an imperative-enforcement keyword
 *                      (MUST / shall / REQUIRED / MANDATORY). The original
 *                      Bug 1 cousin in quality-gate-router was weakened to
 *                      soft "should" language; this guards Step 3b against
 *                      the same drift.
 *   F3-S3 MAIN       — Step 3b references the `.feature` file extension
 *                      (Gherkin convention; without it the emission target
 *                      is ambiguous).
 *   F3-S4 MAIN       — Step 3b mentions Given/When/Then (Gherkin core
 *                      grammar — the three keywords that define a scenario).
 *   F3-S5 REGRESSION — agents/executor/type-specific/feature-vertical-slice-
 *                      planner.md exists at all (file-presence guard so a
 *                      rename or accidental delete is caught by THIS test
 *                      and not by a downstream agent failing at runtime).
 *   F3-S6 REGRESSION — tests/regression/v7.2.0/ contains this F3 file
 *                      alongside F1 and F2 — defense-in-depth proof that
 *                      the v7.2.0 batch addressed the BDD coverage gap
 *                      (auditable trail in the test directory itself).
 *
 * Production code under test:
 *   - agents/executor/type-specific/feature-vertical-slice-planner.md
 *     (Step 3b: BDD Gherkin Artifact Emission)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const PLANNER = path.join(ROOT, 'agents/executor/type-specific/feature-vertical-slice-planner.md');
const V72_DIR = path.join(ROOT, 'tests/regression/v7.2.0');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('=== F3 BDD slice planner coverage (feature-vertical-slice-planner.md) ===');

// ---------- F3-S1 MAIN ----------
test('F3-S1: Step 3b heading exists and mentions BDD or Gherkin', () => {
  const md = read(PLANNER);
  // Step 3b heading at any ATX level (### / #### / ##) — capture the heading line.
  const lines = md.split(/\r?\n/);
  let headingIdx = -1;
  let headingText = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,6}\s+Step\s+3b\b/i.test(lines[i])) {
      headingIdx = i;
      headingText = lines[i];
      break;
    }
  }
  assert.ok(headingIdx >= 0,
    'Step 3b heading not found in feature-vertical-slice-planner.md');
  assert.ok(/BDD|Gherkin/i.test(headingText),
    `Step 3b heading must mention "BDD" or "Gherkin" (got: "${headingText.trim()}")`);
});

// ---------- F3-S2 MAIN ----------
test('F3-S2: Step 3b uses imperative-enforcement language (MUST/shall/REQUIRED/MANDATORY)', () => {
  const md = read(PLANNER);
  const section = extractStep3bSection(md);
  assert.ok(section, 'Step 3b section could not be extracted');
  // At least one of the canonical enforcement keywords must appear in the
  // section body — guards against future weakening to "should"/"may".
  const enforcement = /\b(MUST|MANDATORY|REQUIRED|shall)\b/;
  assert.ok(enforcement.test(section),
    'Step 3b must use imperative-enforcement language (MUST/MANDATORY/REQUIRED/shall)');
});

// ---------- F3-S3 MAIN ----------
test('F3-S3: Step 3b references the .feature file extension (Gherkin convention)', () => {
  const md = read(PLANNER);
  const section = extractStep3bSection(md);
  assert.ok(section, 'Step 3b section could not be extracted');
  assert.ok(/\.feature\b/.test(section),
    'Step 3b must reference the `.feature` file extension as the artifact target');
});

// ---------- F3-S4 MAIN ----------
test('F3-S4: Step 3b mentions Given/When/Then (Gherkin core grammar)', () => {
  const md = read(PLANNER);
  const section = extractStep3bSection(md);
  assert.ok(section, 'Step 3b section could not be extracted');
  // All three Gherkin core keywords must appear. They are individually
  // load-bearing — a scenario without any one of them is not a valid
  // Given/When/Then triple.
  assert.ok(/\bGiven\b/.test(section),
    'Step 3b must mention `Given` (Gherkin precondition keyword)');
  assert.ok(/\bWhen\b/.test(section),
    'Step 3b must mention `When` (Gherkin action keyword)');
  assert.ok(/\bThen\b/.test(section),
    'Step 3b must mention `Then` (Gherkin outcome keyword)');
});

// ---------- F3-S5 REGRESSION ----------
test('F3-S5: feature-vertical-slice-planner.md exists (file-presence guard)', () => {
  assert.ok(fs.existsSync(PLANNER),
    `feature-vertical-slice-planner.md must exist at ${PLANNER} — a rename or delete here breaks the BDD contract`);
  const stat = fs.statSync(PLANNER);
  assert.ok(stat.isFile(),
    'feature-vertical-slice-planner.md path must be a regular file (not a directory or symlink to nowhere)');
  assert.ok(stat.size > 0,
    'feature-vertical-slice-planner.md must not be empty');
});

// ---------- F3-S6 REGRESSION ----------
test('F3-S6: tests/regression/v7.2.0/ contains F1, F2, and this F3 file (coverage-gap audit trail)', () => {
  assert.ok(fs.existsSync(V72_DIR) && fs.statSync(V72_DIR).isDirectory(),
    `${V72_DIR} must exist as a directory`);
  const files = fs.readdirSync(V72_DIR);
  // Match either bare "F<N>.cjs" or "F<N>_<slug>.cjs" — the v7.2.0 naming
  // convention permits both (F1.cjs and F2.cjs are bare; F3 and F4 carry
  // explanatory slugs). `(?:_|\.)` enforces the boundary explicitly because
  // `\b` does not separate digit from underscore (both are word chars).
  assert.ok(files.some((f) => /^F1(?:_|\.).*\.cjs$|^F1\.cjs$/.test(f)),
    'tests/regression/v7.2.0/ must contain an F1*.cjs test (v7.2.0 Bug 0 / DDD producer)');
  assert.ok(files.some((f) => /^F2(?:_|\.).*\.cjs$|^F2\.cjs$/.test(f)),
    'tests/regression/v7.2.0/ must contain an F2*.cjs test (v7.2.0 Bug 1 / ATDD bypass)');
  assert.ok(files.some((f) => /^F3(?:_|\.).*\.cjs$|^F3\.cjs$/.test(f)),
    'tests/regression/v7.2.0/ must contain an F3*.cjs test (this BDD coverage-gap fix)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

/**
 * Extract the "Step 3b" section from feature-vertical-slice-planner.md.
 * Window starts at the ATX heading matching "Step 3b" and ends at the next
 * ATX heading at the same or shallower level (e.g., next "### Step 4" or
 * "## OUTPUT"). Captures all prose, code fences, and lists declared under
 * Step 3b.
 */
function extractStep3bSection(md) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,6})\s+Step\s+3b\b/i);
    if (m) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i];
    const m = t.match(/^(#{1,6})\s+\S/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}
