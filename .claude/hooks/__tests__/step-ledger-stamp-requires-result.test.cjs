#!/usr/bin/env node
'use strict';

// =============================================================================
// step-ledger-stamp-requires-result.test.cjs — enforcement-audit Batch STAMP
// (DoD #6 "no step is stamped merely because Agent returned").
//
// ROOT CAUSE (audit 2026-06-21, finding F4, HIGH, verified): step-ledger-stamp's
// generic step stamp fired purely from tool_input.subagent_type — it never read
// payload.tool_response. A no-op / errored / still-launching (background) agent
// that merely RETURNED satisfied the ordering prerequisite that step-ledger-gate
// uses to unlock the next phase, so the pipeline could advance on empty work.
//
// FIX: stamp() declines to stamp the generic governed step unless the agent
// returned a USABLE result (present, not error/interrupt/async-launched).
// Fail-OPEN-to-not-stamp: declining never deadlocks — the gate fails open on an
// absent ledger, so the worst case is the controller re-dispatches real work.
// Default-on; legacy stamp-on-return restorable via PIPELINE_STAMP_REQUIRE_RESULT=off.
//
// This is BOTH a pure-function suite (hasUsableResult) AND a hook-as-process
// suite (stdin JSON -> sentinel-state.step_ledger side effect).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../step-ledger-stamp.cjs');
const mod = require('../step-ledger-stamp.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-req-result-'));
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
function run(dir, payload, extraEnv) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir, ...(extraEnv || {}) },
  });
}
const GOVERNED = { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' } };

console.log('=== step-ledger-stamp requires a usable result (DoD #6) ===');

// ---- pure function: hasUsableResult -----------------------------------------
test('pure — hasUsableResult is exported', () => {
  assert.equal(typeof mod.hasUsableResult, 'function', 'hasUsableResult must be exported for unit testing');
});
test('pure — absent result is NOT usable', () => {
  assert.equal(mod.hasUsableResult(undefined), false);
  assert.equal(mod.hasUsableResult(null), false);
});
test('pure — error / interrupt / async shapes are NOT usable', () => {
  assert.equal(mod.hasUsableResult({ is_error: true }), false);
  assert.equal(mod.hasUsableResult({ error: 'boom' }), false);
  assert.equal(mod.hasUsableResult({ interrupted: true }), false);
  assert.equal(mod.hasUsableResult({ async_launched: true }), false);
  assert.equal(mod.hasUsableResult({ status: 'failed' }), false);
  assert.equal(mod.hasUsableResult(''), false);
  assert.equal(mod.hasUsableResult('   '), false);
});
test('pure — a normal completed result IS usable', () => {
  assert.equal(mod.hasUsableResult({ ok: true }), true);
  assert.equal(mod.hasUsableResult({ content: [{ type: 'text', text: 'done' }] }), true);
  assert.equal(mod.hasUsableResult('classification complete'), true);
});
// Lock the classifier against future OVER-tightening (adversarial review SEC-1/
// CONC-1/ARCH-1): benign envelopes must stay usable so a real completion is never
// wrongly dropped into a deny-mode block. NEGATIVE_STATUS must not grow to swallow
// these without live evidence of real Agent tool_response shapes.
test('pure — benign envelopes (positive/neutral status, empty content) stay usable', () => {
  assert.equal(mod.hasUsableResult({ status: 'completed', content: [] }), true, 'completed envelope must be usable');
  assert.equal(mod.hasUsableResult({ status: 'success' }), true, 'success status must be usable');
  assert.equal(mod.hasUsableResult({ content: [] }), true, 'empty content[] (no negative flag) must be usable');
  assert.equal(mod.hasUsableResult({}), true, 'a bare present object with no negative flag must be usable');
});

// ---- hook-as-process: side effect on step_ledger ----------------------------
test('hook — governed agent WITH a usable result stamps its step', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  const r = run(dir, { ...GOVERNED, tool_response: { ok: true }, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(ledgerOf(dir), ['classify']);
});
test('hook — governed agent with NO tool_response does NOT stamp (DoD#6)', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  const r = run(dir, { ...GOVERNED, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(ledgerOf(dir), undefined, 'a no-result return must NOT advance the ledger');
});
test('hook — governed agent with an error result does NOT stamp', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  run(dir, { ...GOVERNED, tool_response: { is_error: true }, cwd: dir });
  assert.equal(ledgerOf(dir), undefined);
});
test('hook — background async_launched return does NOT stamp', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  run(dir, { ...GOVERNED, tool_response: { async_launched: true }, cwd: dir });
  assert.equal(ledgerOf(dir), undefined);
});
test('hook — env escape PIPELINE_STAMP_REQUIRE_RESULT=off restores legacy stamp-on-return', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  run(dir, { ...GOVERNED, cwd: dir }, { PIPELINE_STAMP_REQUIRE_RESULT: 'off' });
  assert.deepEqual(ledgerOf(dir), ['classify'], 'legacy escape must stamp even without a result');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
