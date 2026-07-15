#!/usr/bin/env node
'use strict';

// =============================================================================
// F10 — Achado #7 parent-relay deadlock: sentinel-hook must exempt the N1
// orchestrator controllers from the expected_next divergence deny.
//
// ROOT CAUSE (reproduced live in runs 2026-07-15-s5-review-consolidation r1/r2):
// In parent-relay mode (subagents can't dispatch, so the parent re-dispatches the
// controller to PROCESS each completed N2 result), `expected_next` still names the
// N2 agent that just ran (e.g. "task-orchestrator"). When the parent re-dispatches
// `pipeline-controller` to run its Sentinel Checkpoint #1 (which is the ONLY place
// that advances expected_next), the sentinel-hook's divergence check denies it —
// a CIRCULAR deadlock: the controller can't advance expected_next without running,
// and can't run without advancing expected_next. The sentinel SEQUENCE_VALIDATION
// recovery also refuses because signed state still shows the N2 unresolved.
//
// The fix exempts the N1 orchestrators (pipeline-/spec-/brainstorm-controller) from
// the DIVERGENCE deny ONLY (all upstream HMAC/corrupt-state checks preserved) —
// they re-hydrate the SIGNED state and re-plan; they are never a mis-sequenced N2
// step. Mirrors the sentinel self-exemption.
//
// TDD: the controller-exemption cases FAIL against pre-fix code (RED). Genuine N2
// mis-sequence + positive-control match stay GREEN (fix must be surgical).
// Mirrors the F28 seed/pointer/runHook harness.
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'sentinel-hook.cjs');
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

let pass = 0, fail = 0;
const _tmp = [];
function makeCwd() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f10-')); _tmp.push(d); return d; }
function record(name, ok, why) {
  if (ok) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}: ${why}`); }
}
function seedSigned(cwd, expectedNext) {
  const runDir = path.join(cwd, '.pipeline', 'docs', 'Pre-Complexa-action', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  writeSignedState(path.join(runDir, 'sentinel-state.json'), {
    schema_version: 1,
    run_id: 'run',
    pipeline_active: true,
    pipeline_doc_path: runDir,
    current_phase: '0a',
    // The N2 agent that JUST ran — expected_next was never advanced because the
    // controller (which advances it) has not run since it emitted the N2 dispatch.
    expected_next: expectedNext,
    orchestrator_decision: null,
  });
  fs.mkdirSync(path.join(cwd, '.pipeline'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.pipeline', 'active-run.json'), JSON.stringify({
    pipeline_doc_path: runDir, run_id: 'run', updated_at: new Date().toISOString(),
  }, null, 2));
  return runDir;
}
function runHook(cwd, agentType) {
  const payload = JSON.stringify({ tool_input: { subagent_type: agentType } });
  const env = { ...process.env, PIPELINE_DOC_PATH: '', PIPELINE_RUN_ID: '' };
  const res = spawnSync(process.execPath, [HOOK], { input: payload, cwd, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && j.hookSpecificOutput) decision = j.hookSpecificOutput; } catch (_e) { /* */ }
  }
  return { decision, status: res.status, stderr: res.stderr || '' };
}
const denied = (r) => r.status === 2 || (r.decision && r.decision.permissionDecision === 'deny');
const allowed = (r) => !denied(r);

console.log('=== F10 — Achado #7 parent-relay exemption (sentinel-hook) ===');

// RED: parent re-dispatches the N1 controller while expected_next still names the
// N2 that just ran. Pre-fix → DIVERGENCE deny (the live deadlock). Post-fix → allow.
{
  const cwd = makeCwd();
  seedSigned(cwd, 'task-orchestrator');
  const r = runHook(cwd, 'pipeline-orchestrator:core:pipeline-controller');
  record('F10-1 [RED] pipeline-controller re-dispatch vs expected_next=task-orchestrator → allow (no relay deadlock)',
    allowed(r), `got deny (divergence) — the circular parent-relay deadlock. status=${r.status}`);
}
{
  const cwd = makeCwd();
  seedSigned(cwd, 'information-gate');
  const r = runHook(cwd, 'pipeline-orchestrator:core:spec-controller');
  record('F10-2 [RED] spec-controller re-dispatch vs expected_next=information-gate → allow',
    allowed(r), `got deny (divergence). status=${r.status}`);
}
{
  const cwd = makeCwd();
  seedSigned(cwd, 'task-orchestrator');
  const r = runHook(cwd, 'pipeline-orchestrator:core:brainstorm-controller');
  record('F10-3 [RED] brainstorm-controller re-dispatch vs expected_next=task-orchestrator → allow',
    allowed(r), `got deny (divergence). status=${r.status}`);
}

// SURGICAL: a genuine mis-sequenced N2 spawn must STILL be denied (the sentinel's
// whole purpose). The exemption must not leak to N2 agents.
{
  const cwd = makeCwd();
  seedSigned(cwd, 'task-orchestrator');
  const r = runHook(cwd, 'pipeline-orchestrator:core:final-validator');
  record('F10-4 genuine N2 mis-sequence (final-validator vs expected task-orchestrator) → still DENY',
    denied(r), `exemption leaked to an N2 agent — the sentinel is defeated. status=${r.status}`);
}

// POSITIVE CONTROL: the matching spawn is unchanged (allow).
{
  const cwd = makeCwd();
  seedSigned(cwd, 'task-orchestrator');
  const r = runHook(cwd, 'pipeline-orchestrator:core:task-orchestrator');
  record('F10-5 matching spawn (task-orchestrator == expected) → allow (unchanged)',
    allowed(r), `matching spawn wrongly denied. status=${r.status}`);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
