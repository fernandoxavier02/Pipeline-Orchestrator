#!/usr/bin/env node
'use strict';

/**
 * D6 — feature-vertical-slice-planner.md "Step 3b" BDD/Gherkin emission contract.
 *
 * Covers (8 scenarios from QUALITY_GATE_APPROVED batch 2-of-4):
 *   - D6-S1  MAIN       Step 3b heading exists AND appears AFTER Step 3
 *   - D6-S2  MAIN       Step 3b instructs emission of a .feature per slice under .pipeline/artifacts/bdd/
 *   - D6-S3  MAIN       Step 3b specifies Gherkin minimum template (Feature: + Scenario: + Given/When/Then)
 *   - D6-S4  MAIN       OUTPUT YAML gains bdd_artifact per slice + top-level bdd_artifacts_emitted count
 *   - D6-S5  REGRESSION Step 3 "Vertical Slice Definition" untouched (4 key phrases verbatim)
 *   - D6-S6  REGRESSION Existing OUTPUT YAML slice fields preserved (id/description/acceptance_criteria/files_in_scope/dependencies/risk_level)
 *   - D6-S7  EDGE       Naming pattern SLICE-NN.feature flat (zero-padded, no subdirectories)
 *   - D6-S8  EDGE       bdd_artifact example path matches .pipeline/artifacts/bdd/SLICE-NN.feature
 *
 * Production file under test (NOT yet modified — most tests MUST FAIL):
 *   - agents/executor/type-specific/feature-vertical-slice-planner.md
 *     (Step 3b does not exist; bdd_artifact / bdd_artifacts_emitted not in OUTPUT YAML)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const PLANNER_PATH = path.join(ROOT, 'agents/executor/type-specific/feature-vertical-slice-planner.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readPlanner() {
  return fs.readFileSync(PLANNER_PATH, 'utf8');
}

console.log('=== D6 feature-vertical-slice-planner BDD Gherkin Step 3b ===');

// ---------- MAIN scenarios ----------

test('D6-S1: Step 3b heading exists AND appears after Step 3', () => {
  const content = readPlanner();
  const step3Idx = content.search(/^###\s+Step\s+3:/m);
  const step3bIdx = content.search(/^###\s+Step\s+3b:/m);
  assert.ok(step3Idx >= 0, 'Step 3 heading not found (sanity check)');
  assert.ok(step3bIdx >= 0, 'Step 3b heading missing — expected "### Step 3b:" heading');
  assert.ok(
    step3bIdx > step3Idx,
    `Step 3b must appear AFTER Step 3 (got 3=${step3Idx}, 3b=${step3bIdx})`,
  );
});

test('D6-S2: Step 3b instructs emission of a .feature file per slice under .pipeline/artifacts/bdd/', () => {
  const content = readPlanner();
  const block = extractStep3bBlock(content);
  assert.ok(block, 'Step 3b block not found');
  assert.ok(/\.feature/.test(block),
    'Step 3b must mention .feature file extension');
  assert.ok(/per\s+slice/i.test(block) || /each\s+slice/i.test(block),
    'Step 3b must state .feature emission is PER SLICE (not single global file)');
  assert.ok(/\.pipeline\/artifacts\/bdd\//.test(block),
    'Step 3b must specify output path under .pipeline/artifacts/bdd/');
});

test('D6-S3: Step 3b specifies Gherkin minimum template (Feature + Scenario with Given/When/Then)', () => {
  const content = readPlanner();
  const block = extractStep3bBlock(content);
  assert.ok(block, 'Step 3b block not found');
  assert.ok(/Feature:/.test(block),
    'Step 3b must require a "Feature:" line in the minimum Gherkin template');
  assert.ok(/Scenario:/.test(block),
    'Step 3b must require at least one "Scenario:" block');
  assert.ok(/\bGiven\b/.test(block),
    'Step 3b minimum template must include "Given" keyword');
  assert.ok(/\bWhen\b/.test(block),
    'Step 3b minimum template must include "When" keyword');
  assert.ok(/\bThen\b/.test(block),
    'Step 3b minimum template must include "Then" keyword');
});

test('D6-S4: OUTPUT YAML gains bdd_artifact per slice AND top-level bdd_artifacts_emitted count', () => {
  const content = readPlanner();
  const yaml = extractOutputYamlBlock(content);
  assert.ok(yaml, 'OUTPUT YAML block (VSA_PLAN) not found');
  assert.ok(/bdd_artifact\s*:/.test(yaml),
    'OUTPUT YAML must contain bdd_artifact: field inside slice entries');
  // bdd_artifact must be inside the slices: list (between "slices:" and the next sibling block).
  const slicesBlock = extractSlicesBlock(yaml);
  assert.ok(slicesBlock, 'slices: block not found inside OUTPUT YAML');
  assert.ok(/bdd_artifact\s*:/.test(slicesBlock),
    'bdd_artifact: must live INSIDE each slice entry (not at top level)');
  assert.ok(/^\s*bdd_artifacts_emitted\s*:/m.test(yaml),
    'OUTPUT YAML must contain top-level bdd_artifacts_emitted: count field');
});

console.log('');
console.log('=== REGRESSION scenarios ===');

test('D6-S5: Existing Step 3 Vertical Slice Definition block untouched (4 key phrases verbatim)', () => {
  const content = readPlanner();
  assert.ok(/independently testable and deployable/.test(content),
    'Pre-existing phrase "independently testable and deployable" was removed/altered');
  assert.ok(/cross all necessary layers/.test(content),
    'Pre-existing phrase "cross all necessary layers" was removed/altered');
  assert.ok(/Order slices by dependency/.test(content),
    'Pre-existing phrase "Order slices by dependency" was removed/altered');
  assert.ok(/Risk level/.test(content),
    'Pre-existing phrase "Risk level" was removed/altered');
});

test('D6-S6: Existing OUTPUT YAML slice fields preserved (id/description/acceptance_criteria/files_in_scope/dependencies/risk_level)', () => {
  const content = readPlanner();
  const yaml = extractOutputYamlBlock(content);
  assert.ok(yaml, 'OUTPUT YAML block (VSA_PLAN) not found');
  const slicesBlock = extractSlicesBlock(yaml);
  assert.ok(slicesBlock, 'slices: block not found inside OUTPUT YAML');
  const requiredFields = [
    'id',
    'description',
    'acceptance_criteria',
    'files_in_scope',
    'dependencies',
    'risk_level',
  ];
  for (const field of requiredFields) {
    // YAML list entries can be written as "    - id: ..." or "      id: ..."
    // (continuation lines after the dash). Accept either form.
    const re = new RegExp(`^\\s*(?:-\\s+)?${field}\\s*:`, 'm');
    assert.ok(re.test(slicesBlock),
      `Pre-existing slice field "${field}:" was removed/renamed in OUTPUT YAML`);
  }
});

console.log('');
console.log('=== EDGE CASE scenarios ===');

test('D6-S7: Naming pattern SLICE-NN.feature is flat (zero-padded, no subdirectories)', () => {
  const content = readPlanner();
  const block = extractStep3bBlock(content);
  assert.ok(block, 'Step 3b block not found');
  // Must mention SLICE-NN.feature naming pattern (or a concrete zero-padded example like SLICE-01.feature).
  assert.ok(
    /SLICE-NN\.feature/.test(block) || /SLICE-\d{2}\.feature/.test(block),
    'Step 3b must document flat naming pattern "SLICE-NN.feature" (zero-padded two-digit)',
  );
  // Must NOT introduce a subdirectory between bdd/ and the filename:
  //   ALLOWED: .pipeline/artifacts/bdd/SLICE-01.feature
  //   FORBIDDEN: .pipeline/artifacts/bdd/SLICE-01/main.feature
  const subdirRe = /\.pipeline\/artifacts\/bdd\/SLICE-[^/\s]*\/[^\s]+\.feature/;
  assert.ok(!subdirRe.test(block),
    'Step 3b must NOT introduce subdirectories per slice (files flat under bdd/)');
});

test('D6-S8: bdd_artifact example path matches .pipeline/artifacts/bdd/SLICE-NN.feature', () => {
  const content = readPlanner();
  const yaml = extractOutputYamlBlock(content);
  assert.ok(yaml, 'OUTPUT YAML block (VSA_PLAN) not found');
  const slicesBlock = extractSlicesBlock(yaml);
  assert.ok(slicesBlock, 'slices: block not found inside OUTPUT YAML');
  // Extract the value of the first bdd_artifact entry (allowing the placeholder
  // form "SLICE-NN" or a concrete zero-padded number like SLICE-01).
  const match = slicesBlock.match(/bdd_artifact\s*:\s*["']?([^"'\s\n#]+)["']?/);
  assert.ok(match, 'bdd_artifact: example value not found inside slices: block');
  const value = match[1];
  const valid =
    /^\.pipeline\/artifacts\/bdd\/SLICE-NN\.feature$/.test(value) ||
    /^\.pipeline\/artifacts\/bdd\/SLICE-\d{2}\.feature$/.test(value);
  assert.ok(valid,
    `bdd_artifact example value "${value}" does not match .pipeline/artifacts/bdd/SLICE-NN.feature (flat, zero-padded)`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

function extractStep3bBlock(md) {
  // Captures from "### Step 3b:" up to the next "### " sibling or end of file.
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Step\s+3b:/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s+\S/.test(lines[i]) || /^---\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function extractOutputYamlBlock(md) {
  // Locate the "## OUTPUT" section and capture the fenced ```yaml block inside.
  const lines = md.split(/\r?\n/);
  let outIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+OUTPUT\s*$/.test(lines[i])) { outIdx = i; break; }
  }
  if (outIdx === -1) return '';
  // Find next fenced code block starting with ```yaml
  let fenceStart = -1;
  for (let i = outIdx + 1; i < lines.length; i++) {
    if (/^```ya?ml\s*$/.test(lines[i])) { fenceStart = i + 1; break; }
    if (/^##\s+\S/.test(lines[i])) break; // bail if we hit next H2 first
  }
  if (fenceStart === -1) return '';
  let fenceEnd = lines.length;
  for (let i = fenceStart; i < lines.length; i++) {
    if (/^```\s*$/.test(lines[i])) { fenceEnd = i; break; }
  }
  return lines.slice(fenceStart, fenceEnd).join('\n');
}

function extractSlicesBlock(yaml) {
  // Within the YAML block, capture from the "slices:" key down to the next
  // top-level (same-indent or lower) sibling key.
  const lines = yaml.split(/\r?\n/);
  let start = -1;
  let baseIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)slices\s*:\s*$/);
    if (m) { start = i; baseIndent = m[1].length; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // A new sibling key has indent <= baseIndent AND is not a list item ("- ...").
    const m = line.match(/^(\s*)([^\s-][^:]*)\s*:/);
    if (m && m[1].length <= baseIndent) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}
