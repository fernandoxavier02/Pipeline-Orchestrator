#!/usr/bin/env node
'use strict';

// =============================================================================
// F7 (v8.7.0) — step-ledger-stamp (PostToolUse:Agent) live CLI.
//
// Proves the auto-stamp end-to-end: a governed agent completion stamps its step
// into the signed state.step_ledger; ungoverned agents and inactive runs stamp
// nothing. This is what makes the ordering deterministic without the LLM.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-f7-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function seed(dir, obj) { fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(obj, null, 2)); }
function ledgerOf(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'sentinel-state.json'), 'utf8')).step_ledger; }
  catch { return undefined; }
}
function run(dir, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir },
  });
}

console.log('=== F7 v8.7.0 — step-ledger auto-stamp live ===');

test('F7-1 — governed agent completion stamps its step', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  const r = run(dir, { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' }, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(ledgerOf(dir), ['classify']);
});

test('F7-2 — second governed agent appends in order', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix', step_ledger: ['classify'] });
  run(dir, { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:information-gate' }, cwd: dir });
  assert.deepEqual(ledgerOf(dir), ['classify', 'info-gate']);
});

test('F7-3 — ungoverned agent (sentinel) stamps nothing', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  run(dir, { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' }, cwd: dir });
  assert.equal(ledgerOf(dir), undefined);
});

test('F7-4 — inactive run stamps nothing', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: false, task_type: 'Bug Fix' });
  run(dir, { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' }, cwd: dir });
  assert.equal(ledgerOf(dir), undefined);
});

console.log(`\n=== F7 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
