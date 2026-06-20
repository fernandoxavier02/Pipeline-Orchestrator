#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.9.0) — Wave 2: generic phase-verdict gates (audit A5-A9). A stamped
// verdict (ssot/info-gate/plan/final-review/final-decision) DENIES the governed
// downstream spawn. Pure brain + recorder allowlist + live CLI + real stamp.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GUARD = require('../../../lib/phase-verdict-guard.cjs');
const REC = require('../../../scripts/record-step.cjs');
const GATE = path.resolve(__dirname, '../../../.claude/hooks/phase-verdict-gate.cjs');
const STAMP = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), Object.assign({
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-20T12:00:00.000Z' }, null, 2));
  return docDir;
}
function readState(docDir) { return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')); }
function gate(root, docDir, leaf, env) {
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: `pipeline-orchestrator:x:${leaf}` }, cwd: root }),
    encoding: 'utf8', env: { ...process.env, PIPELINE_PHASE_VERDICT_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir, ...(env || {}) },
  });
}
function denied(r, code) {
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(not denied!)');
  if (code) assert.match(out.hookSpecificOutput.permissionDecisionReason, code);
}

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-f3-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F3 v8.9.0 — phase-verdict gates (A5-A9) ===');

// ---- pure brain -------------------------------------------------------------
test('F3-1 — A6 SSOT conflict blocks the forward chain', () => {
  const r = GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: { ssot_status: 'conflict' }, enforce: 'deny' });
  assert.equal(r.decision, 'block'); assert.equal(r.code, 'SSOT_CONFLICT');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'finishing-branch', state: { ssot_status: 'conflict' } }).decision, 'block');
});
test('F3-2 — A7 info-gate blocked stops plan/executor only', () => {
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'plan-architect', state: { info_gate: 'blocked' } }).decision, 'block');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: { info_gate: 'blocked' } }).decision, 'block');
  // info-gate blocked does NOT block finishing-branch (not in that rule's leaves)
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'finishing-branch', state: { info_gate: 'blocked' } }).decision, 'allow');
});
test('F3-3 — A8 plan rejected blocks executor', () => {
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: { plan_status: 'rejected' } }).code, 'PLAN_REJECTED');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: { plan_status: 'approved' } }).decision, 'allow');
});
test('F3-4 — A5 open CRITICAL + A9 NO-GO block finishing-branch', () => {
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'finishing-branch', state: { final_review_verdict: 'critical_open' } }).code, 'FINAL_ADVERSARIAL_REWORK');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'finishing-branch', state: { final_decision: 'NO-GO' } }).code, 'GO_NOGO_BLOCK');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'finishing-branch', state: { final_decision: 'GO' } }).decision, 'allow');
});
test('F3-5 — ungoverned/clean/warn/malformed → allow', () => {
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'sentinel', state: { ssot_status: 'conflict' } }).decision, 'allow');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: {} }).decision, 'allow');
  assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: { plan_status: 'rejected' }, enforce: 'warn' }).warn, true);
  assert.equal(GUARD.decidePhaseVerdict(null).decision, 'allow');
});

// ---- recorder allowlist -----------------------------------------------------
liveTest('F3-6 — recordPhaseVerdict honors the allowlist (anti-injection)', (root) => {
  const docDir = seedRun(root, {});
  assert.equal(REC.recordPhaseVerdict(docDir, 'plan_status', 'rejected').ok, true);
  assert.equal(readState(docDir).plan_status, 'rejected');
  assert.equal(REC.recordPhaseVerdict(docDir, 'plan_status', 'totally-made-up').ok, false); // bad value
  assert.equal(REC.recordPhaseVerdict(docDir, 'pipeline_active', 'false').ok, false);        // field not in allowlist
  assert.equal(readState(docDir).pipeline_active, true, 'must not write a non-allowlisted field');
});

// ---- live gate --------------------------------------------------------------
liveTest('F3-7 — LIVE: each verdict denies the right governed spawn', (root) => {
  let docDir = seedRun(root, { ssot_status: 'conflict' });
  denied(gate(root, docDir, 'executor-controller'), /SSOT_CONFLICT/);
  fs.rmSync(path.join(root, '.pipeline'), { recursive: true, force: true });
  docDir = seedRun(root, { info_gate: 'blocked' });
  denied(gate(root, docDir, 'plan-architect'), /INFO_GATE_BLOCKED/);
  fs.rmSync(path.join(root, '.pipeline'), { recursive: true, force: true });
  docDir = seedRun(root, { plan_status: 'rejected' });
  denied(gate(root, docDir, 'executor-controller'), /PLAN_REJECTED/);
  fs.rmSync(path.join(root, '.pipeline'), { recursive: true, force: true });
  docDir = seedRun(root, { final_decision: 'NO-GO' });
  denied(gate(root, docDir, 'finishing-branch'), /GO_NOGO_BLOCK/);
});
liveTest('F3-8 — LIVE: corrupt state + governed → deny; ungoverned + no state → allow', (root) => {
  const docDir = seedRun(root, { plan_status: 'rejected' });
  const p = path.join(docDir, 'sentinel-state.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')); raw.run_id = 'tampered'; fs.writeFileSync(p, JSON.stringify(raw));
  denied(gate(root, docDir, 'executor-controller'), /CORRUPT/);
  const r2 = gate(root, docDir, 'sentinel');
  assert.equal((r2.stdout || '').trim(), '', 'ungoverned must allow even on corrupt state');
});
liveTest('F3-9 — LIVE: warn env relaxes a real block', (root) => {
  const docDir = seedRun(root, { plan_status: 'rejected' });
  const r = gate(root, docDir, 'executor-controller', { PIPELINE_PHASE_VERDICT_ENFORCEMENT: 'warn' });
  assert.equal((r.stdout || '').trim(), '');
});

// ---- real stamp -------------------------------------------------------------
liveTest('F3-10 — REAL stamp: plan-architect verdict file → plan_status; gate then denies executor', (root) => {
  const docDir = seedRun(root, {});
  fs.writeFileSync(path.join(docDir, 'plan-verdict.json'), JSON.stringify({ plan_status: 'rejected' }));
  const r = spawnSync(process.execPath, [STAMP], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:quality:plan-architect' }, cwd: root }),
    encoding: 'utf8', env: { ...process.env, PIPELINE_DOC_PATH: docDir },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readState(docDir).plan_status, 'rejected');
  denied(gate(root, docDir, 'executor-controller'), /PLAN_REJECTED/);
});

test('F3-11 — clean verdicts NEVER block (no false-deadlock)', () => {
  const clean = [
    { final_decision: 'GO' }, { final_decision: 'CONDITIONAL' }, { final_review_verdict: 'clean' },
    { plan_status: 'approved' }, { info_gate: 'resolved' }, { ssot_status: 'ok' },
  ];
  for (const st of clean) {
    assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'finishing-branch', state: st }).decision, 'allow', JSON.stringify(st));
    assert.equal(GUARD.decidePhaseVerdict({ agentLeaf: 'executor-controller', state: st }).decision, 'allow', JSON.stringify(st));
  }
});
liveTest('F3-12 — corrective transition re-opens the gate (INTENDED: clearing requires re-running the producer)', (root) => {
  // The block is real while rejected; the ONLY way to clear it in signed state is a
  // fresh recordPhaseVerdict (which live happens only on a real producing-agent
  // re-spawn — the LLM cannot hand-edit the HMAC-signed state). Honesty of that
  // re-run is the documented ceiling, identical to every other verdict gate.
  const docDir = seedRun(root, {});
  REC.recordPhaseVerdict(docDir, 'plan_status', 'rejected');
  denied(gate(root, docDir, 'executor-controller'), /PLAN_REJECTED/);
  REC.recordPhaseVerdict(docDir, 'plan_status', 'approved'); // legit re-plan → approved
  const r = gate(root, docDir, 'executor-controller');
  assert.equal((r.stdout || '').trim(), '', 'an approved re-plan must re-open execution');
});

console.log(`\n=== F3 v8.9.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
