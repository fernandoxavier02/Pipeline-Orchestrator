#!/usr/bin/env node
// =============================================================================
// F36 — enforcement default flip warn→deny (v8.3.0, AUDIT-001/SEC-001)
// =============================================================================
// A auditoria 2026-06-17 (4 subagentes) achou a causa-raiz de o parent nunca
// despachar subagentes: o enforcement de Plan Mode e Brainstorm tinha default
// `warn` (avisa mas PERMITE). Evidência: dispatch-guard.cjs:411 e :590.
// v8.3.0 vira o default para `deny` (OBRIGA). O escape `=warn` continua válido.
// Spawna o dispatch-guard real (igual F29) e afirma o efeito.
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
function makeDocPath() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f36-')); _tmp.push(d); return d; }

// dispatch with the two enforcement env-vars EXPLICITLY cleared unless overridden,
// so we test the true DEFAULT (no env set).
function dispatch(docPath, subagent, prompt, override) {
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: subagent, prompt: prompt || '' } });
  const env = { ...process.env, PIPELINE_DOC_PATH: docPath, PIPELINE_REPO_ROOT: ROOT };
  delete env.PIPELINE_PLAN_MODE_ENFORCEMENT;
  delete env.PIPELINE_BRAINSTORM_ENFORCEMENT;
  if (override) Object.assign(env, override);
  const res = spawnSync(process.execPath, [HOOK], { input: payload, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && j.hookSpecificOutput) decision = j.hookSpecificOutput; } catch (_e) { /* */ }
  }
  return { decision, stderr: res.stderr || '' };
}

const PLAN_FQN = 'pipeline-orchestrator:executor:type-specific:audit-intake';

console.log('=== F36 enforcement default flip warn->deny (v8.3.0) ===');

// S1 — Plan Mode: re-dispatch sem PLAN_MODE_RESULTS, SEM env → DENY (default v8.3.0)
{
  const dp = makeDocPath();
  dispatch(dp, PLAN_FQN, 'first dispatch');
  const r = dispatch(dp, PLAN_FQN, 'second dispatch, no payload');
  const ok = !!r.decision && r.decision.permissionDecision === 'deny'
    && /PLAN_MODE/.test(r.decision.permissionDecisionReason || '');
  record('F36-S1: plan-mode re-dispatch sem results, DEFAULT → DENY', ok,
    `decision=${JSON.stringify(r.decision && r.decision.permissionDecision)}`);
}

// S2 — Plan Mode: escape explícito =warn → allow + stderr warn (escape preservado)
{
  const dp = makeDocPath();
  dispatch(dp, PLAN_FQN, 'first dispatch', { PIPELINE_PLAN_MODE_ENFORCEMENT: 'warn' });
  const r = dispatch(dp, PLAN_FQN, 'second dispatch', { PIPELINE_PLAN_MODE_ENFORCEMENT: 'warn' });
  const ok = r.decision === null && /PLAN_MODE_WARN/.test(r.stderr);
  record('F36-S2: plan-mode escape =warn → allow + warn (escape preservado)', ok,
    `decision=${JSON.stringify(r.decision)} warn=${/PLAN_MODE_WARN/.test(r.stderr)}`);
}

// S3 — Plan Mode: 1ª dispatch (sem pending) SEM env → allow (não bloqueia o início)
{
  const dp = makeDocPath();
  const r = dispatch(dp, PLAN_FQN, 'first dispatch only');
  const ok = r.decision === null;
  record('F36-S3: plan-mode 1ª dispatch (default deny) ainda permite o início', ok,
    `decision=${JSON.stringify(r.decision)}`);
}

// S4 — sem PIPELINE_DOC_PATH (fora de run) → allow (ambiente sem pipeline intocado)
{
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: PLAN_FQN, prompt: 'x' } });
  const env = { ...process.env };
  delete env.PIPELINE_DOC_PATH;
  delete env.PIPELINE_PLAN_MODE_ENFORCEMENT;
  const res = spawnSync(process.execPath, [HOOK], { input: payload, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) { if (!line.trim()) continue; try { const j = JSON.parse(line); if (j && j.hookSpecificOutput) decision = j.hookSpecificOutput; } catch (_e) { /* */ } }
  const ok = decision === null;
  record('F36-S4: sem PIPELINE_DOC_PATH (fora de run) → allow', ok, `decision=${JSON.stringify(decision)}`);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
