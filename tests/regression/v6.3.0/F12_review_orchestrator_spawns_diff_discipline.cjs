#!/usr/bin/env node
'use strict';

/**
 * F12 — agents/quality/review-orchestrator.md wires the new
 * diff-discipline-reviewer into Step 1 / Step 2 / Step 3 with input/output
 * schemas and fix-loop counter.
 *
 * EXPECTED RED STATE on first run: review-orchestrator does not yet spawn
 * diff-discipline.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F12.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'agents/quality/review-orchestrator.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readTarget() {
  return fs.readFileSync(TARGET, 'utf8');
}

console.log('=== F12 review-orchestrator.md spawns diff-discipline-reviewer ===');

test('agents/quality/review-orchestrator.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('Step 1 area mentions diff-discipline-reviewer', () => {
  const content = readTarget();
  // Look for "Step 1" followed by mention of diff-discipline-reviewer within
  // a reasonable window (next ~3000 chars or until "Step 2").
  const step1Idx = content.search(/(^|\n)#{1,6}.*Step\s*1\b|STEP\s*1\b|Step 1\b/);
  assert.ok(step1Idx >= 0, 'no Step 1 section anchor found');
  const step2Idx = content.search(/(^|\n)#{1,6}.*Step\s*2\b|STEP\s*2\b|Step 2\b/);
  const window = content.slice(step1Idx, step2Idx > step1Idx ? step2Idx : step1Idx + 4000);
  assert.ok(/diff-discipline-reviewer/.test(window),
    'Step 1 area must mention diff-discipline-reviewer');
});

test('contains DIFF_DISCIPLINE_INPUT: block (Step 2 input schema)', () => {
  const content = readTarget();
  assert.ok(/DIFF_DISCIPLINE_INPUT:/.test(content),
    'expected "DIFF_DISCIPLINE_INPUT:" yaml key');
});

test('Step 3 REVIEW_CONSOLIDATED contains diff_discipline: key', () => {
  const content = readTarget();
  assert.ok(/REVIEW_CONSOLIDATED/.test(content),
    'expected REVIEW_CONSOLIDATED structure');
  // Find the REVIEW_CONSOLIDATED block and check it contains diff_discipline:
  const idx = content.search(/REVIEW_CONSOLIDATED/);
  const window = content.slice(idx, idx + 4000);
  assert.ok(/diff_discipline:/.test(window),
    'REVIEW_CONSOLIDATED block must contain "diff_discipline:" key');
});

test('contains fix_loop_counters with diff_discipline_attempts sub-field', () => {
  const content = readTarget();
  assert.ok(/fix_loop_counters:/.test(content),
    'expected "fix_loop_counters:" key');
  assert.ok(/diff_discipline_attempts:/.test(content),
    'expected "diff_discipline_attempts:" sub-field');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
