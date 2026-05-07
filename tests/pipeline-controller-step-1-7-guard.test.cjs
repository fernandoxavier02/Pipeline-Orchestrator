#!/usr/bin/env node
/**
 * tests/pipeline-controller-step-1-7-guard.test.cjs
 *
 * Test for Achado #5 — STEP 1.7 classification consistency guard.
 *
 * On --resume / PREP_RUN_ID load, the controller must (a) re-classify, (b)
 * compare reclassified.complexity vs manifest.complexity, (c) on mismatch
 * write a TRACE event "classification_discrepancy" with manifest, reclassified,
 * action: trust_manifest, and (d) NEVER halt or prompt for the discrepancy.
 *
 * The contract is documentary — this test asserts the contract is fully
 * specified in the agent file so a real implementer (or hook) can read off
 * the spec without inventing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENT = fs.readFileSync(
  path.join(REPO_ROOT, 'agents', 'core', 'pipeline-controller.md'),
  'utf8'
);

test('STEP 1.7 contains a "Classification consistency guard" subsection', () => {
  const idx = AGENT.search(/Classification consistency guard/);
  assert.ok(idx >= 0, 'STEP 1.7 must include a Classification consistency guard subsection (Achado 5)');
});

test('Guard names the literal TRACE event tag "classification_discrepancy"', () => {
  assert.match(AGENT, /classification_discrepancy/,
    'Agent file must contain the literal event tag classification_discrepancy');
});

test('Guard names the literal action tag "trust_manifest"', () => {
  assert.match(AGENT, /trust_manifest/,
    'Agent file must contain the literal action tag trust_manifest');
});

test('Guard explicitly states no-halt / no-prompt rule', () => {
  const idx = AGENT.search(/Classification consistency guard/);
  const slice = AGENT.slice(idx, idx + 2500);
  assert.match(slice, /MUST NOT halt|MUST NOT prompt|MUST not halt|MUST not prompt/,
    'Guard must explicitly forbid halting or prompting on discrepancy');
});

test('Guard references both manifest and reclassified values', () => {
  const idx = AGENT.search(/Classification consistency guard/);
  const slice = AGENT.slice(idx, idx + 2500);
  assert.match(slice, /manifest:/, 'Guard must reference the manifest value field');
  assert.match(slice, /reclassified:/, 'Guard must reference the reclassified value field');
});

test('Guard preserves the existing recursion bound (depth ≤ 2 + circuit breaker)', () => {
  // Achado 5 must NOT regress the v5.1 STEP_1_7_RECURSION_GUARD invariant.
  assert.match(AGENT, /STEP_1_7_RECURSION_GUARD/,
    'Recursion guard invariant must remain after Achado 5 patch');
  assert.match(AGENT, /AT MOST TWICE per pipeline invocation/,
    'Recursion bound (≤ 2) must remain documented');
});
