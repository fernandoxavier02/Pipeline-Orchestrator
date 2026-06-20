#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.8.0) — B1: gate-log-gate default flip warn → deny (AUDIT-001).
//
// TDD RED phase. The five user-APPROVED B1 scenarios as labeled sub-checks, in
// the repo's F-test style (pure Node, node:assert, process.exit(1) on failure).
//
// ----------------------------------------------------------------------------
// EXPECTED RED SPLIT — read before running.
// ----------------------------------------------------------------------------
// The pure brain lib/gate-log-guard.cjs::decideGateLog ALREADY defaults to deny
// when `enforce` is omitted (line `String(ctx.enforce || 'deny')`). So the
// unit-level default check is a GUARD that passes today and must stay green.
//
// The actual bug is in the HOOK wrapper .claude/hooks/gate-log-gate.cjs, which
// passes `process.env.PIPELINE_GATE_LOG_ENFORCEMENT || 'warn'` — i.e. it injects
// 'warn' as the hook-level default, neutralizing the lib default. The NEW-BEHAVIOR
// check spawns the hook as a child process with a governed agent + a missing
// required gate and NO env var, and asserts the hook emits a deny decision.
// Pre-fix the hook is silent (allow/warn) → that assertion FAILS → valid RED.
//
//   NEW-BEHAVIOR (must FAIL now, on an assertion — valid RED):
//     B1-REG-2  live hook, no env var, governed agent, missing gate → deny
//
//   INVARIANT-GUARD (PASS now, must STAY passing — by design):
//     B1-MAIN   decideGateLog default (omitted enforce) → block
//     B1-REG-1  decideGateLog enforce:'warn' → allow + warn
//     B1-EDGE-1 live hook, env=warn, governed, missing gate → allow (empty)
//     B1-EDGE-2 decideGateLog ungoverned agent → allow
//
// Each check is tagged [NEW] or [GUARD] so the split is visible in the output.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GUARD = '../../../lib/gate-log-guard.cjs';
const GATE = path.resolve(__dirname, '../../../.claude/hooks/gate-log-gate.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

// Seed an ACTIVE, SIGNED run under <root>/.pipeline/ + a gate-decisions.jsonl
// containing exactly the gate lines in `loggedGates`. Mirrors F1/F2's seedRun.
function seedRun(root, loggedGates) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-19T12:00:00.000Z' }, null, 2)
  );
  const trail = (loggedGates || []).map((g) => JSON.stringify({ gate: g, hardness: 'HARD' })).join('\n');
  fs.writeFileSync(path.join(docDir, 'gate-decisions.jsonl'), trail ? trail + '\n' : '');
  return docDir;
}

function runHook(payload, env) {
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    // Clone env but DELETE the enforcement var so "no env var" means exactly that
    // (process.env may already carry it from an outer shell).
    env: (() => {
      const e = { ...process.env, ...(env || {}) };
      if (!env || !('PIPELINE_GATE_LOG_ENFORCEMENT' in env)) delete e.PIPELINE_GATE_LOG_ENFORCEMENT;
      return e;
    })(),
  });
}

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatelog-f3-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== F3 v8.8.0 — B1 gate-log default deny (RED: NEW fail, GUARD pass) ===');

// ---- B1-MAIN [GUARD] decideGateLog default (omitted enforce) → block --------
// The pure brain already deny-by-default; this guards that it does not regress.
test('B1-MAIN [GUARD] decideGateLog with enforce OMITTED for a governed leaf + missing gate → block (deny default)', () => {
  const { decideGateLog } = require(GUARD);
  const r = decideGateLog({ agentLeaf: 'final-validator', loggedGates: [] }); // ADVERSARIAL_GATE missing, no enforce
  assert.equal(r.decision, 'block', 'omitted enforce must default to deny → block');
  assert.deepEqual(r.missing, ['ADVERSARIAL_GATE']);
});

// ---- B1-REG-1 [GUARD] decideGateLog enforce:'warn' → allow + warn -----------
test('B1-REG-1 [GUARD] decideGateLog enforce:"warn" for a governed leaf + missing gate → allow + warn (escape preserved)', () => {
  const { decideGateLog } = require(GUARD);
  const r = decideGateLog({ agentLeaf: 'final-validator', loggedGates: [], enforce: 'warn' });
  assert.equal(r.decision, 'allow', 'warn must allow');
  assert.equal(r.warn, true, 'warn escape must set warn:true');
});

// ---- B1-REG-2 [NEW] live hook default must be deny (no env var) --------------
// THE RED CHECK. The hook currently injects 'warn' as its own default, so with no
// env var set it stays silent (allow). Once B1 flips the hook default to 'deny',
// this emits a real deny permission decision.
liveTest('B1-REG-2 [NEW] LIVE hook, NO env var, governed agent (executor-controller) + missing TDD_APPROVAL → deny (default must be deny)', (root) => {
  const docDir = seedRun(root, ['SOME_OTHER_GATE']); // TDD_APPROVAL deliberately NOT logged
  const r = runHook(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: root },
    { PIPELINE_DOC_PATH: docDir } // NOTE: no PIPELINE_GATE_LOG_ENFORCEMENT
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(
    out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision,
    'deny',
    r.stdout || '(empty stdout — hook still defaults to warn; expected deny by default)'
  );
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /GATE_LOG_MISSING|TDD_APPROVAL/);
});

// ---- B1-EDGE-1 [GUARD] env=warn relaxes the (new) deny default → allow -------
liveTest('B1-EDGE-1 [GUARD] LIVE hook, env=warn, governed agent + missing gate → allow (empty stdout; env overrides deny)', (root) => {
  const docDir = seedRun(root, ['SOME_OTHER_GATE']);
  const r = runHook(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: root },
    { PIPELINE_DOC_PATH: docDir, PIPELINE_GATE_LOG_ENFORCEMENT: 'warn' }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '', 'warn env must keep the hook silent (allow)');
});

// ---- B1-EDGE-2 [GUARD] ungoverned agent unaffected by default change --------
test('B1-EDGE-2 [GUARD] decideGateLog for an UNGOVERNED agent (plan-architect) with no gates logged → allow (never blocked)', () => {
  const { decideGateLog } = require(GUARD);
  const r = decideGateLog({ agentLeaf: 'plan-architect', loggedGates: [] }); // default (deny) mode, but ungoverned
  assert.equal(r.decision, 'allow', 'ungoverned agents are never blocked regardless of default mode');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED for [NEW]; [GUARD] should NOT appear here):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
