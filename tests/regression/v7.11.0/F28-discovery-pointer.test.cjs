#!/usr/bin/env node
// =============================================================================
// F28 — Discovery pointer file (v7.11.0 B3, AUDIT-005)
// =============================================================================
// Pins the deterministic `<cwd>/.pipeline/active-run.json` discovery pointer:
//   S1  sentinel-hook: pointer beats a NEWER decoy state (mtime scan would lose)
//   S2  sentinel-hook: pointer to a missing folder -> graceful fall-through
//   S3  sentinel-hook: pointer to pipeline_active=false -> ignored
//   S4  stop-hook findActiveRunFolder honors the pointer (direct call)
//   S5  stale pointer (updated_at > 24h) -> ignored, falls through to scan
//   S6  .claude/.codex stop-hook mirrors byte-identical
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'sentinel-hook.cjs');
const stopHook = require(path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs'));

let pass = 0; let fail = 0; const out = [];
function record(name, ok, why) {
  if (ok) { pass++; out.push(`  [PASS] ${name}`); }
  else { fail++; out.push(`  [FAIL] ${name}: ${why}`); }
}

const _tmp = [];
function makeCwd() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f28-')); _tmp.push(d); return d; }
function makeState(cwd, state, slug) {
  const runDir = path.join(cwd, '.pipeline', 'docs', 'Pre-Medium-action', slug);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  return runDir;
}
function writePointer(cwd, docPath, updatedAt) {
  fs.mkdirSync(path.join(cwd, '.pipeline'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.pipeline', 'active-run.json'), JSON.stringify({
    pipeline_doc_path: docPath, run_id: path.basename(docPath), updated_at: updatedAt || new Date().toISOString(),
  }, null, 2));
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
const STATE = (expectedNext, active) => ({
  schema_version: 1, pipeline_active: active !== false,
  pipeline_id: '2026-06-11T10:00:00Z_audit-heavy',
  last_updated: new Date().toISOString(), sequence_counter: 3,
  current_phase: '2', expected_next: expectedNext,
});

console.log('=== F28 discovery pointer (v7.11.0 B3, AUDIT-005) ===');

// S1 — pointer beats newer decoy
{
  const cwd = makeCwd();
  const target = makeState(cwd, STATE('executor-controller'), 'target');
  // decoy written AFTER target -> newer mtime; expects a different agent (would deny)
  makeState(cwd, STATE('audit-intake'), 'decoy');
  writePointer(cwd, target);
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  const ok = (r.decision === null || r.decision.permissionDecision === 'allow') && r.status === 0;
  record('F28-S1: pointer beats newer mtime decoy', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} (deny => decoy won)`);
}

// S2 — pointer to missing folder -> graceful fall-through (decoy still found)
{
  const cwd = makeCwd();
  makeState(cwd, STATE('executor-controller'), 'only');
  writePointer(cwd, path.join(cwd, 'nonexistent-folder'));
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  const ok = (r.decision === null || r.decision.permissionDecision === 'allow') && r.status === 0;
  record('F28-S2: broken pointer falls through to scan gracefully', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} status=${r.status}`);
}

// S3 — pointer to inactive state -> ignored, falls through to active decoy
{
  const cwd = makeCwd();
  const inactive = makeState(cwd, STATE('audit-intake', false), 'inactive');
  makeState(cwd, STATE('executor-controller'), 'active');
  writePointer(cwd, inactive);
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  const ok = (r.decision === null || r.decision.permissionDecision === 'allow') && r.status === 0;
  record('F28-S3: pointer to pipeline_active=false ignored', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} (deny => inactive pointer was honored)`);
}

// S4 — stop-hook findActiveRunFolder honors pointer
{
  let ok = false; let why = '';
  try {
    const cwd = makeCwd();
    const target = makeState(cwd, STATE('x'), 'target');
    makeState(cwd, STATE('y'), 'decoy-newer');
    writePointer(cwd, target);
    const found = stopHook.findActiveRunFolder(cwd);
    ok = !!found && path.resolve(found) === path.resolve(target);
    why = `found=${found} want=${target}`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F28-S4: stop-hook findActiveRunFolder honors pointer', ok, why);
}

// S5 — stale pointer ignored
{
  let ok = false; let why = '';
  try {
    const cwd = makeCwd();
    const old = makeState(cwd, STATE('x'), 'old-target');
    const fresh = makeState(cwd, STATE('y'), 'fresh');
    writePointer(cwd, old, new Date(Date.now() - 25 * 3600 * 1000).toISOString());
    const found = stopHook.findActiveRunFolder(cwd);
    ok = !!found && path.resolve(found) === path.resolve(fresh);
    why = `found=${found} want fresh=${fresh} (stale pointer must lose to mtime scan)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F28-S5: stale pointer (>24h) ignored', ok, why);
}

// S7 — SEC-1: poisoned pointer escaping the project tree is REJECTED
{
  const cwd = makeCwd();
  // decoy inside the project expects the spawned agent (must win after rejection)
  makeState(cwd, STATE('executor-controller'), 'legit');
  // poisoned pointer to a state OUTSIDE the project tree expecting a different agent
  const outside = makeCwd();
  const evil = makeState(outside, STATE('audit-intake'), 'evil');
  writePointer(cwd, evil);
  const r = runHook(cwd, 'pipeline-orchestrator:executor:executor-controller');
  const ok = (r.decision === null || r.decision.permissionDecision === 'allow') && r.status === 0;
  record('F28-S7: pointer escaping project tree rejected (SEC-1 containment)', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} (deny => outside pointer was honored)`);
}

// S8 — SEC-2: pointer without updated_at is treated as STALE (fail-closed)
{
  let ok = false; let why = '';
  try {
    const cwd = makeCwd();
    const old = makeState(cwd, STATE('x'), 'no-ts-target');
    const fresh = makeState(cwd, STATE('y'), 'fresh2');
    fs.mkdirSync(path.join(cwd, '.pipeline'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.pipeline', 'active-run.json'),
      JSON.stringify({ pipeline_doc_path: old, run_id: path.basename(old) })); // no updated_at
    const found = stopHook.findActiveRunFolder(cwd);
    ok = !!found && path.resolve(found) === path.resolve(fresh);
    why = `found=${found} want fresh=${fresh} (missing updated_at must NOT be fresh-forever)`;
  } catch (e) { why = `threw: ${e.message}`; }
  record('F28-S8: pointer without updated_at treated as stale (SEC-2)', ok, why);
}

// S6 — mirrors byte-identical
{
  const a = fs.readFileSync(path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs'));
  const b = fs.readFileSync(path.join(ROOT, '.codex', 'hooks', 'stop-hook.cjs'));
  const ha = crypto.createHash('sha256').update(a).digest('hex');
  const hb = crypto.createHash('sha256').update(b).digest('hex');
  record('F28-S6: .claude/.codex stop-hook byte-identical', ha === hb, `claude=${ha.slice(0, 12)} codex=${hb.slice(0, 12)}`);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
