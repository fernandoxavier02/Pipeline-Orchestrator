#!/usr/bin/env node
'use strict';

// =============================================================================
// F6 (v8.19.0) — Enforcer: an emit-and-hoist INTERMEDIATE stop on a governed
// sub-orchestrator leaf is ALLOWED and does NOT bump the correction counter.
//
// CRITICAL defect (adversarial review): v8.19.0 made spec-controller a GOVERNED
// LEAF of the Spec workflow, so subagent-stop-commit-hook now requires a fenced
// PIPELINE_AGENT_RESULT_V1 block on EVERY spec-controller SubagentStop. BUT the
// spec-controller is a SUB-ORCHESTRATOR that drives ~13 steps by EMIT-AND-HOIST
// (agents/core/spec-controller.md:21-30, references/gate-request-protocol.md): at
// each intermediate step it ends its turn with a bare
//   STATUS: AWAITING_DISPATCH_RESULTS | AWAITING_GATE_RESPONSES | AWAITING_PLAN_MODE_RESULTS
// — NOT a result block. Only Step 9 (seal) emits the block. Pre-fix each such hoist
// is treated as a missing result → block + bump subagent_corrections[run::spec-controller]
// → at 3 it converts to terminal_state=hard_failed → the spec run is KILLED MID-AUTHORING.
//
// EXPECTED RED (before the fix): a hoist STATUS line on an armed governed spec leaf is
//   BLOCKED (want allow) and bumps the counter; four hoists at the cap reach hard_failed.
// EXPECTED GREEN (after the fix): the result-block requirement applies ONLY to a GENUINE
//   TERMINAL stop. A hoist → ALLOW, counter untouched, never hard_failed. A terminal stop
//   that is NOT an AWAITING_* hoist stays governed (prose → block; valid block → allow).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f6-subagent-stop-hoist-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/subagent-stop-commit-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

const VALID_BLOCK = [
  '=== PIPELINE_AGENT_RESULT_V1 ===',
  JSON.stringify({ status: 'completed', summary: 'SPEC AUTHORING COMPLETE — run sealed', metrics: { requirements: 3 }, next_agent: '' }),
  '=== END PIPELINE_AGENT_RESULT_V1 ===',
].join('\n');
const PROSE_ONLY = 'SPEC AUTHORING COMPLETE. Voice scorecard: 3 requirements, 2 decisions, 1 finding fixed. STOP.';

// Realistic emit-and-hoist intermediate stops: a protocol block followed by a bare
// AWAITING_* status line — exactly what the spec-controller emits at every mid-step.
const HOIST_DISPATCH = [
  '=== DISPATCH_REQUEST v1 ===',
  'dispatch_id: step-2-spec-init',
  'target_kind: skill',
  'target_name: pipeline-orchestrator:spec-init',
  'description: run spec-init',
  '=== END DISPATCH_REQUEST ===',
  '',
  'STATUS: AWAITING_DISPATCH_RESULTS',
  'pending: [step-2-spec-init]',
].join('\n');
const HOIST_GATE = [
  '=== GATE_REQUEST v1 ===',
  'gate_id: explore-q1',
  'question: qual o escopo?',
  'header: Escopo',
  'options:',
  '  - label: "A"',
  '    description: "trade-off A"',
  '=== END GATE_REQUEST ===',
  '',
  'STATUS: AWAITING_GATE_RESPONSES',
  'pending: [explore-q1]',
].join('\n');
const HOIST_PLAN = [
  '=== PLAN_MODE_REQUEST v1 ===',
  'plan_id: design-plan-1',
  'research_scope: |',
  '  research the existing module',
  '=== END PLAN_MODE_REQUEST ===',
  '',
  'STATUS: AWAITING_PLAN_MODE_RESULTS',
].join('\n');

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rspec', pipeline_active: true, pipeline_doc_path: docDir,
    state_version: 1, current_phase: 'author', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rspec', updated_at: '2026-06-29T00:00:00.000Z' }, null, 2));
  return { docDir, statePath };
}
function run(payload, env) {
  const base = { ...process.env }; delete base.PIPELINE_SUBAGENTSTOP_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function payload(root, agentType, lastMsg) {
  return { hook_event_name: 'SubagentStop', agent_type: agentType, agent_id: `id-${agentType}`, last_assistant_message: lastMsg, cwd: root };
}
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function correctionCount(p) {
  const s = readState(p) || {};
  const c = s.subagent_corrections || {};
  return Number.isFinite(c['rspec::spec-controller']) ? c['rspec::spec-controller'] : 0;
}

const SPEC = { spec_authoring_progress: { intake: 'done', requirements: 'done' } };

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f6-substop-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F6 v8.19.0 — emit-and-hoist intermediate stops are not policed ===');

// ---- F6-S1: AWAITING_DISPATCH_RESULTS hoist → allow, counter NOT bumped ------
liveTest('F6-S1 [allow] AWAITING_DISPATCH_RESULTS intermediate hoist is allowed and does not bump the counter', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', HOIST_DISPATCH), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a dispatch hoist must be ALLOWED (RED today: governed → block)');
  assert.equal(correctionCount(statePath), 0, 'a legitimate hoist must NOT bump subagent_corrections (RED today: bumped to 1)');
});

// ---- F6-S2: AWAITING_GATE_RESPONSES + AWAITING_PLAN_MODE_RESULTS → allow ------
liveTest('F6-S2a [allow] AWAITING_GATE_RESPONSES intermediate hoist is allowed, counter untouched', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', HOIST_GATE), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a gate hoist must be ALLOWED');
  assert.equal(correctionCount(statePath), 0, 'a gate hoist must NOT bump the counter');
});
liveTest('F6-S2b [allow] AWAITING_PLAN_MODE_RESULTS intermediate hoist is allowed, counter untouched', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', HOIST_PLAN), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a plan-mode hoist must be ALLOWED');
  assert.equal(correctionCount(statePath), 0, 'a plan-mode hoist must NOT bump the counter');
});

// ---- F6-S3: many consecutive hoists never reach hard_failed ------------------
liveTest('F6-S3 [no-cap] four consecutive intermediate hoists never bump and never reach hard_failed', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  for (let i = 0; i < 4; i++) {
    const msg = [HOIST_DISPATCH, HOIST_GATE, HOIST_PLAN, HOIST_DISPATCH][i];
    const r = run(payload(root, 'spec-controller', msg), { PIPELINE_DOC_PATH: docDir });
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(decisionOf(r), 'block', `hoist #${i + 1} must be allowed`);
  }
  assert.equal(correctionCount(statePath), 0, 'no hoist may bump the counter (RED today: grows toward the cap)');
  assert.notEqual((readState(statePath) || {}).terminal_state, 'hard_failed', 'consecutive hoists must NEVER convert to hard_failed (RED today: cap → killed mid-authoring)');
});
liveTest('F6-S3b [no-cap-at-3] a hoist when the counter is already at the cap still allows and does NOT hard_fail', (root) => {
  // A hoist is a legitimate non-terminal handshake regardless of prior correction count —
  // it must short-circuit BEFORE the cap→hard_failed conversion. Contrast with F2-S4
  // (prose at the cap → hard_failed), which is the genuine terminal case.
  const { docDir, statePath } = seedRun(root, Object.assign({
    pipeline_active: true, subagent_corrections: { 'rspec::spec-controller': 3 },
  }, SPEC));
  const r = run(payload(root, 'spec-controller', HOIST_DISPATCH), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a hoist at the cap must still be allowed');
  assert.notEqual((readState(statePath) || {}).terminal_state, 'hard_failed', 'a hoist must NOT trip the cap→hard_failed conversion (RED today: it does)');
});

// ---- F6-S4: REGRESSION GUARD — terminal prose (NOT a hoist) still blocked -----
liveTest('F6-S4 [guard-block] a TERMINAL prose close (no AWAITING_* marker) on a governed spec leaf is still BLOCKED when armed', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'the original bug fix must stay: a non-hoist terminal prose close is BLOCKED (result missing)');
});

// ---- F6-S5: GUARD — terminal valid block still allowed -----------------------
liveTest('F6-S5 [guard-allow] a TERMINAL valid PIPELINE_AGENT_RESULT_V1 block is ALLOWED', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', VALID_BLOCK), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a valid terminal block must be allowed');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
