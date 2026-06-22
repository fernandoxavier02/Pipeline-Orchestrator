#!/usr/bin/env node
'use strict';

// =============================================================================
// B4 (v8.11.0) — REQ-SUBAGENTSTOP-DEFAULT-ON readiness lock. The SubagentStop
// commit gate is now ARMED by default. That is only SAFE while EVERY governed
// (result_required) agent in the FULL spine actually emits a parseable
// PIPELINE_AGENT_RESULT_V1 block — otherwise the default-on gate would block a
// legitimate run. This test fails LOUDLY if a future edit removes the result
// block from any governed agent (the exact deadlock the adversarial review flagged).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const manifest = require(path.join(ROOT, 'lib/contracts/workflow-manifest.cjs'));
const resultContract = require(path.join(ROOT, 'lib/contracts/pipeline-agent-result.cjs'));

const FULL = (manifest.WORKFLOWS && manifest.WORKFLOWS.FULL)
  || (typeof manifest.workflow === 'function' ? manifest.workflow('FULL') : null);

// Build basename → absolute path for every agent .md under agents/.
function indexAgents(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) indexAgents(p, acc);
    else if (entry.isFile() && entry.name.endsWith('.md')) acc[entry.name.replace(/\.md$/, '')] = p;
  }
  return acc;
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== B4 v8.11.0 — SubagentStop default-on readiness (every governed agent emits a result block) ===');

check('FULL spine is present in the manifest', () => {
  assert.ok(FULL && FULL.agents_by_step && FULL.step_obligations, 'manifest must expose the FULL spine');
});

// Collect the governed agents (steps whose obligation is result_required:true).
const governed = new Set();
if (FULL && FULL.agents_by_step) {
  for (const step of Object.keys(FULL.agents_by_step)) {
    const ob = FULL.step_obligations[step];
    if (ob && ob.result_required) for (const a of FULL.agents_by_step[step]) governed.add(a);
  }
}

check('there is at least one governed agent to protect', () => {
  assert.ok(governed.size > 0, 'expected a non-empty set of result_required agents');
});

const agentIndex = indexAgents(path.join(ROOT, 'agents'), {});
const { BEGIN } = resultContract;

for (const agent of governed) {
  check(`governed agent "${agent}" exists AND emits a PIPELINE_AGENT_RESULT_V1 block`, () => {
    const md = agentIndex[agent];
    assert.ok(md, `no agents/**/${agent}.md found — a governed agent must exist`);
    const body = fs.readFileSync(md, 'utf8');
    assert.ok(body.includes('PIPELINE_AGENT_RESULT_V1'),
      `${agent}.md must instruct emitting a PIPELINE_AGENT_RESULT_V1 block (default-on SubagentStop would otherwise block it)`);
    // The block fence the agent emits must be the SAME one the parser recognizes.
    assert.ok(body.includes(BEGIN), `${agent}.md must use the canonical block fence "${BEGIN}" the parser accepts`);
  });
}

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks:');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
