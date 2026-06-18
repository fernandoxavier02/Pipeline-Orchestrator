#!/usr/bin/env node
// =============================================================================
// F33 — deterministic STEP 1.7 brainstorm bypass hook (v7.14.0 B2)
// =============================================================================
// First BEHAVIORAL coverage of STEP 1.7 enforcement. The historical contract
// is prose-only (4 events in 245 runs, 1 out-of-vocabulary violation). This
// suite mirrors the F29 (Plan Mode) harness: it spawns the REAL dispatch-guard
// as a child process with a crafted sentinel-state.json fixture and asserts the
// actual effect on protocol-events.jsonl + the PreToolUse permission decision.
//
// Targets the NEW handleBrainstormDispatch block (B2) that does NOT exist yet,
// plus references/step-1-7-enforcement.json (D4) that does NOT exist yet, so
// every scenario is RED until B2 lands.
//
//   S1  MEDIA/COMPLEXA WITHOUT step_1_7, explicit warn escape -> BRAINSTORM_BYPASS + allow (v8.3.0: default is deny — see F36)
//   S2  same, PIPELINE_BRAINSTORM_ENFORCEMENT=deny -> permission deny referencing STEP 1.7
//   S3  sentinel WITH a valid step_1_7 block       -> ZERO BRAINSTORM_BYPASS (happy path)
//   S4  SIMPLES sentinel WITHOUT step_1_7          -> ZERO event (SIMPLES exempt)
//   S5  unreadable/corrupt sentinel + warn         -> allow, no crash (fail-open)
//   S6  unreadable/corrupt sentinel + deny         -> deny (fail-closed)
//   S7  references/step-1-7-enforcement.json missing -> embedded fallback still
//                                                       detects executor-controller (fail-closed detection)
//   S8  Skill-path bypass (SEC-B2-003): a pipeline-orchestrator feature-* skill
//       IS enforced; a third-party plugin skill sharing the prefix is NOT denied;
//       (S8c, RR2) the same in-scope feature-* skill under deny mode -> permission deny
//   S9  cache-poisoning (SEC-B2-001): a registry with empty targets:[] must NOT
//       cache an empty roster — embedded fallback still detects the bypass
//   S10 dedup (SEC-B2-004): two dispatches of the SAME leaf in one run emit the
//       BRAINSTORM_BYPASS event EXACTLY once (per-leaf marker suppresses the 2nd)
//   S11 dedup boundary (SEC-B2-004): two DIFFERENT leaves each emit their own event
//       (the per-leaf marker is keyed by leaf, not a single run-wide flag)
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f33-'));
  _tmp.push(d);
  return d;
}

// Write a sentinel-state.json into docPath. `state` is the object; when state
// is the literal string '__CORRUPT__' a non-JSON blob is written instead.
function writeSentinel(docPath, state) {
  const p = path.join(docPath, 'sentinel-state.json');
  if (state === '__CORRUPT__') {
    fs.writeFileSync(p, '{ this is : not, valid json ]]]');
  } else {
    fs.writeFileSync(p, JSON.stringify(state, null, 2));
  }
}

// Spawn the real dispatch-guard with an Agent dispatch payload. `repoRoot`
// lets S7 point PIPELINE_REPO_ROOT at a sandbox with NO enforcement registry.
function dispatch(docPath, subagent, prompt, enforce, repoRoot) {
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: subagent, prompt: prompt || '' },
  });
  const env = {
    ...process.env,
    PIPELINE_DOC_PATH: docPath,
    PIPELINE_REPO_ROOT: repoRoot || ROOT,
  };
  if (enforce) env.PIPELINE_BRAINSTORM_ENFORCEMENT = enforce;
  const res = spawnSync(process.execPath, [HOOK], { input: payload, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && j.hookSpecificOutput) decision = j.hookSpecificOutput; } catch (_e) { /* */ }
  }
  return { decision, stderr: res.stderr || '', status: res.status };
}

// Spawn the real dispatch-guard with a Skill dispatch payload (SEC-B2-003 path).
function dispatchSkill(docPath, skillName, enforce, repoRoot) {
  const payload = JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: skillName },
  });
  const env = {
    ...process.env,
    PIPELINE_DOC_PATH: docPath,
    PIPELINE_REPO_ROOT: repoRoot || ROOT,
  };
  if (enforce) env.PIPELINE_BRAINSTORM_ENFORCEMENT = enforce;
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

// A Phase-2 executor agent — the canonical STEP 1.7 enforcement target.
const EXECUTOR = 'pipeline-orchestrator:executor:executor-controller';

// A valid step_1_7 state block uses one of the 4 canonical branch values.
function step17(branch) {
  return { decision: branch, prep_run_id: branch === 'dispatch-brainstorm' ? 'prep-001' : null, timestamp: new Date().toISOString() };
}

console.log('=== F33 deterministic STEP 1.7 brainstorm bypass hook (v7.14.0 B2) ===');

// S1 — MEDIA without step_1_7 under explicit warn escape -> BRAINSTORM_BYPASS + allow
// (v8.3.0: default flipped warn->deny; warn is now the opt-in escape — deny-default proven in F36)
{
  const dp = makeDocPath();
  writeSentinel(dp, { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } });
  const r = dispatch(dp, EXECUTOR, 'execute phase 2', 'warn');
  const ev = events(dp);
  const ok = r.decision === null
    && ev.some((e) => e.event === 'BRAINSTORM_BYPASS')
    && /BRAINSTORM_WARN/.test(r.stderr);
  record('F33-S1: MEDIA without step_1_7 under PIPELINE_BRAINSTORM_ENFORCEMENT=warn -> BRAINSTORM_BYPASS + warn (allow)', ok,
    `decision=${JSON.stringify(r.decision)} stderrHasWarn=${/BRAINSTORM_WARN/.test(r.stderr)} events=${ev.map((e) => e.event).join(',')}`);
}

// S2 — deny mode -> permission deny with corrective message referencing STEP 1.7
{
  const dp = makeDocPath();
  writeSentinel(dp, { orchestrator_decision: { type: 'Feature', complexity: 'COMPLEXA' } });
  const r = dispatch(dp, EXECUTOR, 'execute phase 2', 'deny');
  const ok = !!r.decision && r.decision.permissionDecision === 'deny'
    && /STEP 1\.7|BRAINSTORM/i.test(r.decision.permissionDecisionReason || '');
  record('F33-S2: deny mode -> permission deny referencing STEP 1.7', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)} reason=${(r.decision && r.decision.permissionDecisionReason || '').slice(0, 60)}`);
}

// S3 — valid step_1_7 block -> ZERO bypass event (happy path)
{
  const dp = makeDocPath();
  writeSentinel(dp, {
    orchestrator_decision: { type: 'Feature', complexity: 'COMPLEXA' },
    step_1_7: step17('dispatch-brainstorm'),
  });
  const r = dispatch(dp, EXECUTOR, 'execute phase 2');
  const ev = events(dp);
  const ok = r.decision === null && !ev.some((e) => e.event === 'BRAINSTORM_BYPASS');
  record('F33-S3: valid step_1_7 block -> zero BRAINSTORM_BYPASS (happy path)', ok,
    `decision=${JSON.stringify(r.decision)} events=${ev.map((e) => e.event).join(',')}`);
}

// S4 — SIMPLES without step_1_7 -> exempt, zero event
{
  const dp = makeDocPath();
  writeSentinel(dp, { orchestrator_decision: { type: 'Bug Fix', complexity: 'SIMPLES' } });
  const r = dispatch(dp, EXECUTOR, 'execute phase 2');
  const ev = events(dp);
  const ok = r.decision === null && !ev.some((e) => e.event === 'BRAINSTORM_BYPASS');
  record('F33-S4: SIMPLES without step_1_7 -> exempt, zero event', ok,
    `decision=${JSON.stringify(r.decision)} events=${ev.map((e) => e.event).join(',')}`);
}

// S5 — corrupt sentinel + warn -> allow, no crash (fail-open)
// (v8.3.0: warn is now explicit since the default flipped to deny — see S6 for corrupt+deny=fail-closed)
{
  const dp = makeDocPath();
  writeSentinel(dp, '__CORRUPT__');
  process.env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT = 'warn'; // isolate the sealed-spec handler (B4/v8.5.0) — S5 tests the brainstorm fail-open, not the sealed-spec handoff
  const r = dispatch(dp, EXECUTOR, 'execute phase 2', 'warn');
  delete process.env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT;
  const ok = r.decision === null && r.status === 0;
  record('F33-S5: corrupt sentinel + warn -> allow, no crash (fail-open)', ok,
    `decision=${JSON.stringify(r.decision)} status=${r.status}`);
}

// S6 — corrupt sentinel + deny -> deny (fail-closed)
{
  const dp = makeDocPath();
  writeSentinel(dp, '__CORRUPT__');
  const r = dispatch(dp, EXECUTOR, 'execute phase 2', 'deny');
  const ok = !!r.decision && r.decision.permissionDecision === 'deny';
  record('F33-S6: corrupt sentinel + deny -> deny (fail-closed)', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)}`);
}

// S7 — enforcement registry missing -> embedded fallback still detects target
{
  const dp = makeDocPath();
  writeSentinel(dp, { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } });
  // Point PIPELINE_REPO_ROOT at an EMPTY sandbox: references/step-1-7-enforcement.json
  // is absent there, forcing the embedded fallback target list (D4).
  const sandbox = makeDocPath();
  const r = dispatch(dp, EXECUTOR, 'execute phase 2', undefined, sandbox);
  const ev = events(dp);
  const ok = ev.some((e) => e.event === 'BRAINSTORM_BYPASS');
  record('F33-S7: registry missing -> embedded fallback still detects executor-controller (fail-closed)', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S8 — Skill path (SEC-B2-003): a pipeline-orchestrator feature-* skill IS
// enforced, but a third-party plugin skill sharing the prefix is NOT denied.
{
  // (a) Our own variant skill, in-scope MEDIA without step_1_7 -> BRAINSTORM_BYPASS.
  // (v8.3.0: warn escape to assert detection+allow; deny-default proven in F36 and S8c below)
  const dpOurs = makeDocPath();
  writeSentinel(dpOurs, { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } });
  const rOurs = dispatchSkill(dpOurs, 'pipeline-orchestrator:feature-light', 'warn');
  const evOurs = events(dpOurs);
  const okOurs = rOurs.decision === null && evOurs.some((e) => e.event === 'BRAINSTORM_BYPASS');
  record('F33-S8a: pipeline-orchestrator feature-* skill under warn -> BRAINSTORM_BYPASS (detected)', okOurs,
    `decision=${JSON.stringify(rOurs.decision)} events=${evOurs.map((e) => e.event).join(',')}`);

  // (b) Third-party plugin skill sharing the 'feature-' prefix -> NOT enforced.
  // Same in-scope state; under deny mode a false-positive would surface as a deny
  // AND a BRAINSTORM_BYPASS event. Neither must happen.
  const dpThird = makeDocPath();
  writeSentinel(dpThird, { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } });
  const rThird = dispatchSkill(dpThird, 'some-plugin:feature-x', 'deny');
  const evThird = events(dpThird);
  const okThird = (rThird.decision === null || rThird.decision.permissionDecision !== 'deny')
    && !evThird.some((e) => e.event === 'BRAINSTORM_BYPASS');
  record('F33-S8b: third-party feature-* skill -> NOT denied, zero event (namespace guard)', okThird,
    `decision=${JSON.stringify(rThird.decision)} events=${evThird.map((e) => e.event).join(',')}`);

  // (c) RR2: our own variant skill, in-scope, under DENY mode -> permission deny
  // referencing STEP 1.7 (proves the Skill path enforces, not just warns).
  const dpDeny = makeDocPath();
  writeSentinel(dpDeny, { orchestrator_decision: { type: 'Feature', complexity: 'COMPLEXA' } });
  const rDeny = dispatchSkill(dpDeny, 'pipeline-orchestrator:feature-heavy', 'deny');
  const okDeny = !!rDeny.decision && rDeny.decision.permissionDecision === 'deny'
    && /STEP 1\.7|BRAINSTORM/i.test(rDeny.decision.permissionDecisionReason || '');
  record('F33-S8c: pipeline-orchestrator feature-* skill + deny -> permission deny (Skill path enforces)', okDeny,
    `decision=${JSON.stringify(rDeny.decision && rDeny.decision.permissionDecision)} reason=${(rDeny.decision && rDeny.decision.permissionDecisionReason || '').slice(0, 60)}`);
}

// S9 — cache-poisoning regression (SEC-B2-001): a registry with empty targets:[]
// must NOT cache an empty roster. We point PIPELINE_REPO_ROOT at a sandbox whose
// references/step-1-7-enforcement.json has targets:[] (empty). The empty array is
// treated as a LOAD FAILURE, so the hook falls through to the next candidate /
// embedded fallback, and the executor-controller bypass is STILL detected.
{
  const dp = makeDocPath();
  writeSentinel(dp, { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } });
  const sandbox = makeDocPath();
  fs.mkdirSync(path.join(sandbox, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, 'references', 'step-1-7-enforcement.json'),
    JSON.stringify({ version: 'poison', skill_prefixes: [], targets: [] }, null, 2),
  );
  const r = dispatch(dp, EXECUTOR, 'execute phase 2', undefined, sandbox);
  const ev = events(dp);
  const ok = ev.some((e) => e.event === 'BRAINSTORM_BYPASS');
  record('F33-S9: empty targets:[] does NOT poison cache -> fallback still detects bypass', ok,
    `events=${ev.map((e) => e.event).join(',')}`);
}

// S10 — dedup (SEC-B2-004): the SAME leaf dispatched TWICE in one run emits the
// BRAINSTORM_BYPASS event EXACTLY once. The per-leaf marker (session-scoped; here
// via the no-run_id freshness fallback) suppresses the second event so a retry
// loop on the same in-scope task does not flood protocol-events.jsonl.
{
  const dp = makeDocPath();
  const sentinel = { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } };
  writeSentinel(dp, sentinel);
  dispatch(dp, EXECUTOR, 'execute phase 2');           // 1st — should emit
  dispatch(dp, EXECUTOR, 'execute phase 2 (retry)');   // 2nd — should be suppressed
  const ev = events(dp).filter((e) => e.event === 'BRAINSTORM_BYPASS');
  const ok = ev.length === 1;
  record('F33-S10: same leaf dispatched twice -> exactly ONE BRAINSTORM_BYPASS (dedup)', ok,
    `bypassCount=${ev.length}`);
}

// S11 — dedup boundary (SEC-B2-004): two DIFFERENT leaves in the same run each
// emit their OWN event. Proves the marker is keyed by leaf, not a single run-wide
// flag (a run-wide flag would suppress the second distinct leaf's bypass).
{
  const dp = makeDocPath();
  writeSentinel(dp, { orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' } });
  dispatch(dp, EXECUTOR, 'execute phase 2');                                  // executor-controller
  dispatch(dp, 'pipeline-orchestrator:quality:plan-architect', 'plan it');   // plan-architect (distinct leaf)
  const ev = events(dp).filter((e) => e.event === 'BRAINSTORM_BYPASS');
  const agents = new Set(ev.map((e) => e.agent));
  const ok = ev.length === 2 && agents.has('executor-controller') && agents.has('plan-architect');
  record('F33-S11: two distinct leaves -> two BRAINSTORM_BYPASS events (per-leaf marker)', ok,
    `bypassCount=${ev.length} agents=${Array.from(agents).join(',')}`);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
