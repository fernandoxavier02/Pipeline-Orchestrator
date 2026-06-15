#!/usr/bin/env node
'use strict';
// F3 (v8.0.0) — (a) the 3 new agents are in the dispatch-guard FQN table so Skill()
// mis-calls are deflected; (b) the run-004 sealed spec has the contract-grade shape.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../..');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// pipeline-runs/ is gitignored working-state; verify-if-present so this passes in a clean CI checkout.
const RUN004 = path.join(ROOT, 'pipeline-runs/004-spec-workflow-command/01-spec');
const HAVE_004 = fs.existsSync(path.join(RUN004, 'spec.json'));
function testOpt(name, fn) { if (!HAVE_004) { console.log(`  [SKIP] ${name} (pipeline-runs/ is gitignored working-state)`); return; } test(name, fn); }

console.log('=== F3 v8.0.0 dispatch-guard table + run-004 sealed spec ===');

test('dispatch-guard AGENT_LEAF_TO_FQN registers the 3 new agents with correct FQNs', () => {
  const s = read('.claude/hooks/dispatch-guard.cjs');
  assert.match(s, /'spec-controller':\s*'pipeline-orchestrator:core:spec-controller'/, 'spec-controller');
  assert.match(s, /'spec-adversarial-critic':\s*'pipeline-orchestrator:executor:type-specific:spec-adversarial-critic'/, 'spec-adversarial-critic');
  assert.match(s, /'step-01c-ideation':\s*'pipeline-orchestrator:brainstorm:brainstorm-step-01c-ideation'/, 'step-01c-ideation');
});

testOpt('run-004 spec.json is sealed with the full contract shape', () => {
  const j = JSON.parse(read('pipeline-runs/004-spec-workflow-command/01-spec/spec.json'));
  assert.equal(j.phase, 'sealed', 'phase=sealed');
  assert.equal(j.ready_for_implementation, true, 'ready_for_implementation=true');
  assert.equal(j.spec_version, 1, 'spec_version=1');
  assert.ok(j.sealed_at, 'sealed_at present');
  assert.ok(j.sealed_spec && Array.isArray(j.sealed_spec.artifacts), 'sealed_spec pointer present');
  assert.equal(j.sealed_spec.artifacts.length, 5, 'sealed_spec lists 5 artifacts');
  for (const k of ['requirements', 'design', 'tasks']) {
    assert.equal(j.approvals[k].approved, true, `${k} approved`);
  }
});

testOpt('run-004 ships all five sealed artifacts on disk', () => {
  const dir = 'pipeline-runs/004-spec-workflow-command/01-spec';
  for (const f of ['spec.json', 'requirements.md', 'design.md', 'tasks.md', 'research.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, dir, f)), `${f} must exist`);
  }
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
