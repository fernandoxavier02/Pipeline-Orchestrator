#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.19.0) — Producer + co-ship gate (REQ-A1..A5, AC-1). Pins the
// spec-controller (agents/core/spec-controller.md) Step 9 to END on the terminal
// PIPELINE_AGENT_RESULT_V1 block, and co-ships that with the manifest Spec leaf so
// neither half can regress alone (the producer/enforcer must ship together — without
// the producer the armed gate would deadlock-loop a prose-only close).
//
// EXPECTED RED (before T5.2): Step 9 still ends with "Print the voice scorecard …
//   STOP." — no block template, no anti-prose instruction → fails.
// EXPECTED GREEN (after T5.2 + T1.2): Step 9 carries the closed-key block template
//   AND forbids a prose-only scorecard; the manifest governs spec-controller.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const PRODUCER = path.join(ROOT, 'agents/core/spec-controller.md');
const manifest = require(path.join(ROOT, 'lib/contracts/workflow-manifest.cjs'));

// Extract the "## Step 9 …" section (up to the next "## " heading).
function step9Section() {
  const body = fs.readFileSync(PRODUCER, 'utf8');
  const m = body.match(/\n##\s+Step 9\b[\s\S]*?(?=\n##\s)/);
  assert.ok(m, 'could not locate the "## Step 9" section in spec-controller.md');
  return m[0];
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F5 v8.19.0 — spec-controller Step 9 ends on the result block (+ co-ship) ===');

check('Step 9 contains the PIPELINE_AGENT_RESULT_V1 template with status and summary', () => {
  const s = step9Section();
  assert.ok(s.includes('=== PIPELINE_AGENT_RESULT_V1 ==='),
    'Step 9 must carry the terminal === PIPELINE_AGENT_RESULT_V1 === block template');
  assert.ok(/"status"/.test(s), 'the Step 9 block template must declare a "status" key');
  assert.ok(/"summary"/.test(s), 'the Step 9 block template must declare a "summary" key (REQ-A3)');
});

check('Step 9 forbids ending on a prose-only scorecard (REQ-A4)', () => {
  const s = step9Section();
  assert.ok(/final message MUST be/i.test(s),
    'Step 9 must instruct that the final message MUST be the result block (no prose-only ending)');
  assert.ok(/no .*text after|after the .*END/i.test(s),
    'Step 9 must forbid any text after the === END PIPELINE_AGENT_RESULT_V1 === line');
});

// ---- co-ship (AC-1): BOTH halves exist in ONE test --------------------------
check('co-ship: the manifest Spec leaf AND the producer template both exist', () => {
  // Enforcer half — the manifest governs spec-controller (Slice 1).
  assert.equal(manifest.isGovernedLeaf('spec-controller'), true,
    'manifest must govern spec-controller (without it the producer change is ungoverned)');
  // Producer half — Step 9 emits the block (Slice 5).
  const s = step9Section();
  assert.ok(s.includes('=== PIPELINE_AGENT_RESULT_V1 ==='),
    'producer must emit the block (without it the armed gate would deadlock-loop a prose close)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
