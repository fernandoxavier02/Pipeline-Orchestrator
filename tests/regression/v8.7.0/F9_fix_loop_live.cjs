#!/usr/bin/env node
'use strict';

// =============================================================================
// F9 (v8.7.0) — fix-loop cap, live: gate denies the (max+1)th executor-fix and
// the stamp hook counts each executor-fix completion. The cap LOGIC is proven in
// F8; here we prove the wiring end-to-end on the real hooks + the counter writer.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GATE = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-gate.cjs');
const STAMP = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { recordFixAttempt } = require('../../../scripts/record-step.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let root;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixloop-f9-'));
    fn(root);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }
  }
}
function setup(root, stateObj) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, 'sentinel-state.json'), JSON.stringify({ run_id: 'r', pipeline_doc_path: docDir, ...stateObj }, null, 2));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-18T12:00:00.000Z' }, null, 2));
  return docDir;
}
function attemptsOf(docDir) {
  return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')).fix_loop_attempts;
}
function run(hook, payload, docDir, extraEnv) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: docDir, ...(extraEnv || {}) },
  });
}
const FIX = { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-fix' } };

console.log('=== F9 v8.7.0 — fix-loop cap live ===');

test('F9-1 — recordFixAttempt increments the signed counter', (root) => {
  const docDir = setup(root, { pipeline_active: true });
  assert.equal(recordFixAttempt(docDir).fix_loop_attempts, 1);
  assert.equal(recordFixAttempt(docDir).fix_loop_attempts, 2);
  assert.equal(attemptsOf(docDir), 2);
});

test('F9-2 — stamp hook counts an executor-fix completion', (root) => {
  const docDir = setup(root, { pipeline_active: true });
  const r = run(STAMP, { ...FIX, cwd: docDir }, docDir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(attemptsOf(docDir), 1);
});

test('F9-3 — gate DENIES executor-fix at the cap (attempts=3, deny mode)', (root) => {
  const docDir = setup(root, { pipeline_active: true, fix_loop_attempts: 3 });
  const r = run(GATE, { ...FIX, cwd: root }, docDir, { PIPELINE_FIX_LOOP_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /FIX_LOOP_EXHAUSTED/);
});

test('F9-4 — gate ALLOWS executor-fix under the cap (attempts=2)', (root) => {
  const docDir = setup(root, { pipeline_active: true, fix_loop_attempts: 2 });
  const r = run(GATE, { ...FIX, cwd: root }, docDir, { PIPELINE_FIX_LOOP_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

// HIGH-2 — a big in-state fix_loop_max must NOT defeat the cap. State can only
// LOWER the cap (clamp to the lib DEFAULT_MAX=3). With attempts=3 and a forged
// max=9999, the gate must STILL deny.
test('F9-5 — huge in-state fix_loop_max is CLAMPED to the default (still denies at 3)', (root) => {
  const docDir = setup(root, { pipeline_active: true, fix_loop_attempts: 3, fix_loop_max: 9999 });
  const r = run(GATE, { ...FIX, cwd: root }, docDir, { PIPELINE_FIX_LOOP_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /FIX_LOOP_EXHAUSTED/);
  // the reason reports the CLAMPED cap (3), not the forged 9999.
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /teto 3/);
});

test('F9-6 — a smaller in-state fix_loop_max is honoured (state may LOWER the cap)', (root) => {
  // max=1, attempts=1 → at the cap → deny. Proves clamp uses min(state, default).
  const docDir = setup(root, { pipeline_active: true, fix_loop_attempts: 1, fix_loop_max: 1 });
  const r = run(GATE, { ...FIX, cwd: root }, docDir, { PIPELINE_FIX_LOOP_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny');
});

console.log(`\n=== F9 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
