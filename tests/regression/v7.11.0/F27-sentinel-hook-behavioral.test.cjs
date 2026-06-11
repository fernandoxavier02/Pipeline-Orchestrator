#!/usr/bin/env node
// =============================================================================
// F27 — sentinel-hook BEHAVIORAL tests (v7.11.0 B3, AUDIT-009)
// =============================================================================
// First behavioral coverage of the repo's only deterministic enforcement
// mechanism. Each scenario spawns the REAL hook as a child process with a
// crafted PreToolUse stdin payload and asserts the actual permission decision:
//   S1  expected_next MISMATCH        -> permissionDecision deny
//   S2  expected_next MATCH           -> allow (no deny output)
//   S3  stale state (>300s)           -> allow + SENTINEL WARNING on stderr
//   S4  no state + non-bootstrap agent -> deny "No sentinel-state.json found"
//   S5  no state + bootstrap agent     -> allow (fail-open whitelist)
//   S6  PIPELINE_DOC_PATH env precedence beats cwd mtime scan
//   S7  non-pipeline agent             -> allow (hook does not interfere)
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'sentinel-hook.cjs');

let pass = 0; let fail = 0; const out = [];
function record(name, ok, why) {
  if (ok) { pass++; out.push(`  [PASS] ${name}`); }
  else { fail++; out.push(`  [FAIL] ${name}: ${why}`); }
}

const _tmp = [];
function makeCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f27-'));
  _tmp.push(dir);
  return dir;
}

function makeState(cwd, state, slug) {
  const runDir = path.join(cwd, '.pipeline', 'docs', 'Pre-Medium-action', slug || 'f27-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  return runDir;
}

function runHook(cwd, agentType, envExtra) {
  const payload = JSON.stringify({ tool_input: { subagent_type: agentType } });
  const env = { ...process.env, PIPELINE_DOC_PATH: '', PIPELINE_RUN_ID: '', ...(envExtra || {}) };
  const res = spawnSync(process.execPath, [HOOK], { input: payload, cwd, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j && j.hookSpecificOutput && j.hookSpecificOutput.permissionDecision) {
        decision = j.hookSpecificOutput;
      }
    } catch (_e) { /* non-JSON stdout line */ }
  }
  return { decision, stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

const FRESH_STATE = (expectedNext) => ({
  schema_version: 1,
  pipeline_active: true,
  pipeline_id: '2026-06-11T10:00:00Z_audit-heavy',
  last_updated: new Date().toISOString(),
  sequence_counter: 3,
  current_phase: '2',
  expected_next: expectedNext,
});

console.log('=== F27 sentinel-hook behavioral (v7.11.0 B3, AUDIT-009) ===');

// S1 — mismatch -> deny
{
  const cwd = makeCwd();
  makeState(cwd, FRESH_STATE('audit-intake'));
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  const ok = !!r.decision && r.decision.permissionDecision === 'deny'
    && /DIVERGENCE|expected/i.test(r.decision.permissionDecisionReason || '');
  record('F27-S1: expected_next mismatch -> deny', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} status=${r.status} stderr=${r.stderr.slice(0, 120)}`);
}

// S2 — match -> allow
{
  const cwd = makeCwd();
  makeState(cwd, FRESH_STATE('executor-controller'));
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  const ok = r.decision === null && r.status === 0;
  record('F27-S2: expected_next match -> allow', ok,
    `decision=${JSON.stringify(r.decision)} status=${r.status}`);
}

// S3 — stale state -> allow + warning
{
  const cwd = makeCwd();
  const stale = FRESH_STATE('executor-controller');
  stale.last_updated = new Date(Date.now() - 3600 * 1000).toISOString();
  makeState(cwd, stale);
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  // The hook surfaces staleness as an EXPLICIT allow decision whose
  // additionalContext carries the SENTINEL WARNING text (not a deny).
  const ok = !!r.decision && r.decision.permissionDecision === 'allow'
    && /SENTINEL WARNING/i.test(r.decision.additionalContext || '');
  record('F27-S3: stale state -> explicit allow with SENTINEL WARNING context', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} ctx=${String(r.decision && r.decision.additionalContext).slice(0, 80)}`);
}

// S4 — no state + non-bootstrap -> deny fail-closed
{
  const cwd = makeCwd();
  const r = runHook(cwd, 'pipeline-orchestrator:quality:plan-architect');
  const ok = !!r.decision && r.decision.permissionDecision === 'deny'
    && /No sentinel-state\.json found/i.test(r.decision.permissionDecisionReason || '');
  record('F27-S4: no state + non-bootstrap agent -> deny (fail-closed)', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)}`);
}

// S5 — no state + bootstrap agent -> allow fail-open
{
  const cwd = makeCwd();
  const r = runHook(cwd, 'pipeline-orchestrator:core:task-orchestrator');
  const ok = r.decision === null && r.status === 0;
  record('F27-S5: no state + bootstrap agent -> allow (fail-open whitelist)', ok,
    `decision=${JSON.stringify(r.decision)} status=${r.status}`);
}

// S6 — PIPELINE_DOC_PATH env precedence beats cwd mtime scan
{
  const cwd = makeCwd();
  // cwd-local decoy expects a DIFFERENT agent (would deny)
  makeState(cwd, FRESH_STATE('audit-intake'), 'decoy');
  // env-pointed folder (elsewhere) expects the spawned agent (must allow)
  const elsewhere = makeCwd();
  const envRun = makeState(elsewhere, FRESH_STATE('executor-controller'), 'env-run');
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller', { PIPELINE_DOC_PATH: envRun });
  const ok = r.decision === null && r.status === 0;
  record('F27-S6: PIPELINE_DOC_PATH env wins over cwd mtime scan', ok,
    `decision=${JSON.stringify(r.decision)} (deny means decoy won — precedence broken)`);
}

// S7 — non-pipeline agent -> hook does not interfere
{
  const cwd = makeCwd();
  const r = runHook(cwd, 'Explore');
  const ok = r.decision === null && r.status === 0;
  record('F27-S7: non-pipeline agent -> allow (no interference)', ok,
    `decision=${JSON.stringify(r.decision)} status=${r.status}`);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
