#!/usr/bin/env node
// =============================================================================
// F29 — deterministic Plan Mode bypass hook (v7.11.0 B4, AUDIT-001/002/006)
// =============================================================================
// First BEHAVIORAL coverage of Plan Mode enforcement (the historical contract
// was prose-only with zero hook backstop). Spawns the REAL dispatch-guard as a
// child process with crafted Agent dispatch payloads and asserts the actual
// effect on protocol-events.jsonl + the permission decision:
//   S1  mandatory agent, 1st dispatch, no PLAN_MODE_RESULTS -> PLAN_MODE_DISPATCH_PENDING + allow
//   S2  mandatory agent, dispatch WITH PLAN_MODE_RESULTS     -> clears pending, no bypass event
//   S3  mandatory agent re-dispatched, explicit warn escape   -> PLAN_MODE_BYPASS + allow (v8.3.0: default is deny; warn is opt-in — see F36)
//   S4  same re-dispatch under PIPELINE_PLAN_MODE_ENFORCEMENT=deny -> deny decision
//   S5  non-mandatory agent                                  -> no event, allow
//   S6  roster is read from the JSON SSOT (rename in JSON changes detection)
//   S7  Achado #7 reality: a legit round-trip (pending then results) leaves ZERO bypass events
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'dispatch-guard.cjs');

let pass = 0; let fail = 0; const out = [];
function record(name, ok, why) {
  if (ok) { pass++; out.push(`  [PASS] ${name}`); }
  else { fail++; out.push(`  [FAIL] ${name}: ${why}`); }
}

const _tmp = [];
function makeDocPath() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f29-'));
  _tmp.push(d);
  return d;
}

function dispatch(docPath, subagent, prompt, enforce, runId) {
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: subagent, prompt: prompt || '' } });
  const env = { ...process.env, PIPELINE_DOC_PATH: docPath, PIPELINE_REPO_ROOT: ROOT, PIPELINE_RUN_ID: runId || '' };
  if (enforce) env.PIPELINE_PLAN_MODE_ENFORCEMENT = enforce;
  const res = spawnSync(process.execPath, [HOOK], { input: payload, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && j.hookSpecificOutput) decision = j.hookSpecificOutput; } catch (_e) { /* */ }
  }
  return { decision, stderr: res.stderr || '', status: res.status };
}

function events(docPath) {
  try {
    return fs.readFileSync(path.join(docPath, 'protocol-events.jsonl'), 'utf8')
      .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { return []; }
}

const FQN = 'pipeline-orchestrator:executor:type-specific:audit-intake';

console.log('=== F29 deterministic Plan Mode bypass hook (v7.11.0 B4) ===');

// S1 — first dispatch -> pending event + allow
{
  const dp = makeDocPath();
  const r = dispatch(dp, FQN, 'do the audit intake');
  const ev = events(dp);
  const ok = r.decision === null
    && ev.some((e) => e.event === 'PLAN_MODE_DISPATCH_PENDING' && e.agent === 'audit-intake')
    && !ev.some((e) => e.event === 'PLAN_MODE_BYPASS');
  record('F29-S1: first dispatch without results -> PLAN_MODE_DISPATCH_PENDING + allow', ok,
    `decision=${JSON.stringify(r.decision)} events=${ev.map((e) => e.event).join(',')}`);
}

// S2 — dispatch WITH results clears pending, no bypass
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch');                              // pending
  const r = dispatch(dp, FQN, 'PLAN_MODE_RESULTS:\n  status: done'); // fulfilled
  const ev = events(dp);
  const ok = r.decision === null && !ev.some((e) => e.event === 'PLAN_MODE_BYPASS');
  record('F29-S2: dispatch WITH PLAN_MODE_RESULTS clears pending, no bypass', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S3 — re-dispatch under explicit warn escape -> bypass + allow
// (v8.3.0: default flipped warn->deny; warn is now the opt-in escape — deny-default proven in F36-S1)
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch', 'warn');           // pending
  const r = dispatch(dp, FQN, 'second dispatch, still no payload', 'warn'); // bypass
  const ev = events(dp);
  const ok = r.decision === null
    && ev.some((e) => e.event === 'PLAN_MODE_BYPASS' && e.agent === 'audit-intake')
    && /PLAN_MODE_WARN/.test(r.stderr);
  record('F29-S3: re-dispatch under PIPELINE_PLAN_MODE_ENFORCEMENT=warn -> PLAN_MODE_BYPASS + warn (allow)', ok,
    `decision=${JSON.stringify(r.decision)} stderrHasWarn=${/PLAN_MODE_WARN/.test(r.stderr)} events=${ev.map((e) => e.event).join(',')}`);
}

// S4 — re-dispatch under deny mode -> deny decision
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch', 'deny');
  const r = dispatch(dp, FQN, 'second dispatch', 'deny');
  const ok = !!r.decision && r.decision.permissionDecision === 'deny'
    && /PLAN_MODE/.test(r.decision.permissionDecisionReason || '');
  record('F29-S4: re-dispatch under PIPELINE_PLAN_MODE_ENFORCEMENT=deny -> deny', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)}`);
}

// S5 — non-mandatory agent -> nothing
{
  const dp = makeDocPath();
  const r = dispatch(dp, 'pipeline-orchestrator:core:sanity-checker', 'no plan mode here');
  const ev = events(dp);
  const ok = r.decision === null && ev.length === 0;
  record('F29-S5: non-mandatory agent -> no plan-mode events, allow', ok,
    `events=${ev.map((e) => e.event).join(',')} decision=${JSON.stringify(r.decision)}`);
}

// S6 — roster read from JSON SSOT (a known leaf is detected via its fqn)
{
  const dp = makeDocPath();
  // dispatch using the bare leaf split — controller may pass fqn; the hook also
  // recognizes the leaf. Use plan-architect's fqn to prove the JSON drives it.
  const r = dispatch(dp, 'pipeline-orchestrator:quality:plan-architect', 'plan it');
  const ev = events(dp);
  const ok = ev.some((e) => e.event === 'PLAN_MODE_DISPATCH_PENDING' && e.agent === 'plan-architect');
  record('F29-S6: roster from JSON SSOT detects plan-architect', ok,
    `events=${ev.map((e) => `${e.event}:${e.agent}`).join(',')}`);
}

// S7 — full legit round-trip leaves zero bypass events
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first');                                   // pending
  dispatch(dp, FQN, 'PLAN_MODE_RESULTS:\n  ok: true\nproceed');  // fulfilled
  const ev = events(dp);
  const ok = !ev.some((e) => e.event === 'PLAN_MODE_BYPASS');
  record('F29-S7: legit round-trip leaves zero PLAN_MODE_BYPASS events', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S8 — SEC-B4-001/005: stale pending from a PRIOR run_id does not false-positive
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch', undefined, 'run-A'); // pending under run-A
  // new run reuses the same docPath but a different run_id -> first dispatch is fresh
  const r = dispatch(dp, FQN, 'first dispatch of run B', undefined, 'run-B');
  const ev = events(dp);
  const bypassB = ev.filter((e) => e.event === 'PLAN_MODE_BYPASS');
  const ok = r.decision === null && bypassB.length === 0;
  record('F29-S8: stale pending from prior run_id does not trigger bypass (SEC-B4-001)', ok,
    `decision=${JSON.stringify(r.decision)} bypassCount=${bypassB.length}`);
}

// S9 — SEC-B4-002: a passing mention of PLAN_MODE_RESULTS deep in prose does NOT clear pending
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch', undefined, 'run-C');                       // pending
  // re-dispatch whose prompt MENTIONS the literal mid-prose but is not a payload
  const r = dispatch(dp, FQN, 'Reminder: do NOT skip. The PLAN_MODE_RESULTS payload must be prepended by the parent.', undefined, 'run-C');
  const ev = events(dp);
  const ok = ev.some((e) => e.event === 'PLAN_MODE_BYPASS' && e.agent === 'audit-intake');
  record('F29-S9: mid-prose PLAN_MODE_RESULTS mention does not clear pending (SEC-B4-002)', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S10 — SEC-B4-003: a third-party agent sharing the leaf name is NOT tracked
{
  const dp = makeDocPath();
  const r = dispatch(dp, 'other-plugin:group:audit-intake', 'unrelated', undefined, 'run-D');
  const ev = events(dp);
  const ok = r.decision === null && ev.length === 0;
  record('F29-S10: third-party agent with colliding leaf not tracked (SEC-B4-003)', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S11 — SEC-R2-001: a no-run_id (null) prior pending does not leak into a run_id session
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch', undefined, '');       // no run_id -> file stores run_id:null
  const r = dispatch(dp, FQN, 'first dispatch run E', undefined, 'run-E'); // fresh for run-E
  const ev = events(dp);
  const ok = r.decision === null && !ev.some((e) => e.event === 'PLAN_MODE_BYPASS');
  record('F29-S11: null-run_id prior pending does not leak into a run_id session (SEC-R2-001)', ok,
    `decision=${JSON.stringify(r.decision)} events=${ev.map((e) => e.event).join(',')}`);
}

// S12 — SEC-R2-002: indented PLAN_MODE_RESULTS mention does NOT clear pending
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'first dispatch', undefined, 'run-F');
  const r = dispatch(dp, FQN, 'Context:\n  PLAN_MODE_RESULTS noted here for reference\nProceed.', undefined, 'run-F');
  const ev = events(dp);
  const ok = ev.some((e) => e.event === 'PLAN_MODE_BYPASS' && e.agent === 'audit-intake');
  record('F29-S12: indented PLAN_MODE_RESULTS mention does not clear pending (SEC-R2-002)', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S13 — log-amplification guard: 3rd dispatch after a bypass emits only ONE bypass total
{
  const dp = makeDocPath();
  dispatch(dp, FQN, 'd1', undefined, 'run-G'); // pending
  dispatch(dp, FQN, 'd2', undefined, 'run-G'); // bypass #1 + clears pending
  dispatch(dp, FQN, 'd3', undefined, 'run-G'); // fresh pending again (not a 2nd bypass)
  const ev = events(dp);
  const bypassCount = ev.filter((e) => e.event === 'PLAN_MODE_BYPASS').length;
  const ok = bypassCount === 1;
  record('F29-S13: bypass clears pending — no per-dispatch log amplification', ok,
    `bypassCount=${bypassCount} events=${ev.map((e) => e.event).join(',')}`);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
