#!/usr/bin/env node
'use strict';

// =============================================================================
// T10 (v8.10.0) — REQ-DISPATCH-INDEX: agent_type field on the dispatch record.
// TDD RED phase. EXTENDS the SHIPPED .claude/hooks/dispatch-record-hook.cjs to
// add an `agent_type` field on the pending_dispatches record (sourced from
// tool_input.subagent_type). Covers the user-APPROVED scenarios T10-S1..S3.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The hook EXISTS and ships today, but it writes the record with the fields
//   { dispatch_id, run_id, subagent_type, target_agent_type, status,
//     correction_attempts, created_at }
// and NO `agent_type` field (see dispatch-record-hook.cjs:177-185). These tests
// spawn the real hook as a child process (exactly how Claude Code drives a
// PreToolUse hook) and assert the freshly-written record carries `agent_type`.
// Because the field is not emitted yet, the T10-S1/S2 assertions FAIL on a real
// ASSERTION (the record is written, just without agent_type) — a valid behavioral
// RED, NOT an ImportError/missing-file. T10-S3 (the regression pin on the shipped
// fields) PASSES today and must keep passing after the extension (it guards
// against accidental removal/rename while adding agent_type).
//
// Q3 / AC-3 posture for this telemetry-only task (no new deny):
//   This task adds a field; it never blocks. The allow/deny invariants are the
//   SHIPPED ones (governed-corrupt deny, absent allow) and are NOT re-tested here
//   — T10-S3 pins that adding agent_type left them untouched (decision unchanged).
//
// Determinism + CRLF-safety: payloads serialized once via JSON.stringify; the
// hook itself is CRLF-tolerant (it trims stdin). No wall-clock waits.
// =============================================================================

// DETERMINISTIC SIGNING (parity with F4): seed a STABLE HMAC key BEFORE requiring
// the signer so signing is active in this process AND every spawned child (env is
// inherited). Without this, a keyless CI runner writes UNSIGNED state — still fine
// for these allow-path tests, but seeding keeps the seed identical to F4 so the
// governed write path is exercised the same way on every machine.
process.env.PIPELINE_HMAC_SECRET = 't10-dispatch-agent-type-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/dispatch-record-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function hookExists() { return fs.existsSync(HOOK); }

// Seed a SIGNED active run + active-run pointer (mirrors F4's seedSignedRun).
function seedSignedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    state_version: 1, pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

// A governed Agent spawn payload. `subType` undefined → omit subagent_type entirely.
function agentPayload(root, toolUseId, subType) {
  const ti = { prompt: 'go' };
  if (subType !== undefined) ti.subagent_type = subType;
  const p = { tool_name: 'Agent', tool_input: ti, cwd: root };
  if (toolUseId !== undefined) p.tool_use_id = toolUseId;
  return p;
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-agenttype-t10-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T10 v8.10.0 — dispatch-record agent_type field (RED until dispatch-record-hook.cjs surfaces agent_type) ===');

// ---- T10-S1 [main] agent_type === subagent_type passed in -------------------
liveTest('T10-S1 [main] governed Agent spawn with subagent_type → record.agent_type equals it exactly', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir, statePath } = seedSignedRun(root);
  const subType = 'pipeline-orchestrator:executor:executor-implementer-task';
  const r = run(agentPayload(root, 'tu-s1', subType), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const pd = (readState(statePath) || {}).pending_dispatches || {};
  const rec = pd['tu-s1'];
  assert.ok(rec, 'the dispatch record must be written under the tool_use_id key');
  assert.ok(Object.prototype.hasOwnProperty.call(rec, 'agent_type'),
    'the record must carry an agent_type field (REQ-DISPATCH-INDEX) — not present today, this is the RED');
  assert.equal(rec.agent_type, subType,
    'agent_type must equal exactly the subagent_type that was passed in');
});

// ---- T10-S2 [edge] absent subagent_type → agent_type null, no crash ----------
liveTest('T10-S2 [edge] governed Agent spawn with NO subagent_type → record written, agent_type === null (no crash)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir, statePath } = seedSignedRun(root);
  const r = run(agentPayload(root, 'tu-s2', /* subType absent */ undefined), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr || '(hook crashed on absent subagent_type — must not)');
  const pd = (readState(statePath) || {}).pending_dispatches || {};
  const rec = pd['tu-s2'];
  assert.ok(rec, 'the record must still be written even with no subagent_type');
  assert.ok(Object.prototype.hasOwnProperty.call(rec, 'agent_type'),
    'agent_type must be PRESENT (as null) even when subagent_type is absent — not omitted');
  assert.equal(rec.agent_type, null,
    'absent subagent_type must record agent_type as null, never undefined/missing/crash');
});

// ---- T10-S3 [regression] shipped fields all preserved -----------------------
// This PASSES today (the fields ship) and must keep passing AFTER agent_type is
// added — the regression pin proving the additive change removed/renamed nothing.
liveTest('T10-S3 [regression] shipped record fields (dispatch_id/run_id/status/correction_attempts) unchanged', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir, statePath } = seedSignedRun(root);
  const subType = 'pipeline-orchestrator:quality:review-orchestrator';
  const r = run(agentPayload(root, 'tu-s3', subType), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const pd = (readState(statePath) || {}).pending_dispatches || {};
  const rec = pd['tu-s3'];
  assert.ok(rec, 'the dispatch record must exist');
  assert.equal(rec.dispatch_id, 'tu-s3', 'dispatch_id must still equal the tool_use_id');
  assert.equal(rec.run_id, 'r002', 'run_id must still be carried from state.run_id');
  assert.equal(rec.status, 'pending', 'status must still default to "pending"');
  assert.equal(rec.correction_attempts, 0, 'correction_attempts must still default to 0');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until dispatch-record-hook.cjs surfaces agent_type):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
