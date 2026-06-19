#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.7.0) — step-ledger-gate live CLI safety smoke tests.
//
// The ordering LOGIC is proven in F4 (decideAgentSpawn). Here we prove the hook
// wrapper is SAFE: it loads, fail-opens with no state, ignores non-Agent tools,
// and stays inert when the ledger is not yet stamped — so registering it cannot
// freeze anything before the stamping wiring lands.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GATE = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-gate.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-f5-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function run(payload, env) {
  return spawnSync(process.execPath, [GATE], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}

console.log('=== F5 v8.7.0 — step-ledger-gate live safety ===');

test('F5-1 — no pipeline state → allow (fail-open, no freeze)', (dir) => {
  const r = run({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' }, cwd: dir }, { PIPELINE_STEP_LEDGER_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

test('F5-2 — non-Agent tool → allow', (dir) => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'a.js') }, cwd: dir }, { PIPELINE_STEP_LEDGER_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

test('F5-3 — malformed stdin → exit 0, no crash (fail-open)', () => {
  const r = spawnSync(process.execPath, [GATE], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal((r.stdout || '').trim(), '');
});

console.log(`\n=== F5 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
