#!/usr/bin/env node
'use strict';

// =============================================================================
// F11 — Batch 4 (adversarial RISK-1): audit read-budget exempts dispatched agents
// =============================================================================
// The v8.13.0 audit read-budget blocked DISPATCHED sub-agents (the adversarial
// reviewers) because their reads counted against the PARENT's inline budget — the
// gate that defeats its own reviewer. Fix: once a pipeline-orchestrator AGENT is
// dispatched in the governed-unarmed audit window, mark the ledger and EXEMPT reads.
// BDD:
//   GIVEN a governed-unarmed Audit window where a pipeline-orchestrator agent was dispatched
//   WHEN  that dispatched agent reads dozens of files
//   THEN  the budget does NOT block (the dispatch satisfied the "don't audit inline" goal).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f11-audit-budget-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const budget = require(path.join(root, 'lib', 'audit-read-budget.cjs'));
const marker = require(path.join(root, '.claude', 'hooks', 'audit-dispatch-marker.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

// ---- brain: agentDispatched EXEMPTS even past budget --------------------------
check('brain: agentDispatched=true + count>>budget → allow (exemption)',
  budget.decideAuditReadBudget({ armPending: true, runActive: false, budgeted: true, agentDispatched: true, count: 50, budget: 12, enforce: 'deny' }).decision === 'allow');
check('brain: SEM agentDispatched + count>=budget → block (comportamento original)',
  budget.decideAuditReadBudget({ armPending: true, runActive: false, budgeted: true, agentDispatched: false, count: 12, budget: 12, enforce: 'deny' }).decision === 'block');

// ---- markDispatched + readLedger roundtrip ------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f11-'));
  try {
    const reqAt = new Date().toISOString();
    const armId = budget.armIdFor(reqAt);
    budget.bumpLedger(dir, { requested_at: reqAt, type: 'Audit' }); // count=1
    budget.bumpLedger(dir, { requested_at: reqAt, type: 'Audit' }); // count=2
    check('antes de despachar: dispatched=false', budget.readLedger(dir, armId).dispatched === false);
    budget.markDispatched(dir, { requested_at: reqAt, type: 'Audit' });
    const led = budget.readLedger(dir, armId);
    check('depois de markDispatched: dispatched=true', led.dispatched === true);
    check('markDispatched PRESERVA a contagem (nao zera)', led.count === 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- REGRESSAO (bug 2026-06-27): bumpLedger DEVE preservar dispatched ----------
// O contador PostToolUse chama bumpLedger apos CADA leitura. Se writeLedger nao
// preservar `dispatched`, a 1a leitura do agente despachado APAGA a isencao e a 2a
// volta a ser bloqueada — exatamente o que cegou os revisores adversariais ao vivo.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f11d-'));
  try {
    const reqAt = new Date().toISOString();
    const armId = budget.armIdFor(reqAt);
    budget.bumpLedger(dir, { requested_at: reqAt, type: 'Audit' });    // count=1
    budget.markDispatched(dir, { requested_at: reqAt, type: 'Audit' }); // dispatched=true
    check('apos markDispatched: dispatched=true', budget.readLedger(dir, armId).dispatched === true);
    budget.bumpLedger(dir, { requested_at: reqAt, type: 'Audit' });    // count=2 — NAO pode apagar dispatched
    budget.bumpLedger(dir, { requested_at: reqAt, type: 'Audit' });    // count=3
    const led = budget.readLedger(dir, armId);
    check('bumpLedger PRESERVA dispatched=true (isencao sobrevive as leituras seguintes)', led.dispatched === true);
    check('bumpLedger continua contando apos dispatch (count=3)', led.count === 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- hook: dispatching a pipeline-orchestrator agent in an Audit window marks it
function auditWindow() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f11h-'));
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  const reqAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, '.pipeline', 'pipeline-arm-pending.json'),
    JSON.stringify({ requested_at: reqAt, workflow: 'FULL/Audit', type: 'Audit' }));
  return { dir, armId: budget.armIdFor(reqAt) };
}
{
  const { dir, armId } = auditWindow();
  try {
    marker.mark({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }, cwd: dir });
    check('hook: despacho de agente pipeline-orchestrator → ledger marcado dispatched', budget.readLedger(dir, armId).dispatched === true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
{
  const { dir, armId } = auditWindow();
  try {
    marker.mark({ tool_name: 'Agent', tool_input: { subagent_type: 'some-other:agent' }, cwd: dir });
    check('hook: agente NAO-pipeline → NAO marca (sem exencao indevida)', budget.readLedger(dir, armId).dispatched === false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- FINAL-REVIEW SEC-1: ALLOWLIST — only read-heavy audit/review agents lift the budget.
// The CRITICAL case: the `sentinel` (always permitted by dispatch-pending-gate) must NOT lift it.
{
  const { dir, armId } = auditWindow();
  try {
    marker.mark({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' }, cwd: dir });
    check('SEC-1: despacho do SENTINELA → NAO marca (nao reabre o escape v8.13.0)', budget.readLedger(dir, armId).dispatched === false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
{
  const { dir, armId } = auditWindow();
  try {
    marker.mark({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' }, cwd: dir });
    check('SEC-1: despacho de task-orchestrator (fora da allowlist) → NAO marca', budget.readLedger(dir, armId).dispatched === false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
{
  const { dir, armId } = auditWindow();
  try {
    marker.mark({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:brainstorm:brainstorm-step-00-intake' }, cwd: dir });
    check('SEC-1: despacho de brainstorm (fora da allowlist) → NAO marca', budget.readLedger(dir, armId).dispatched === false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
{
  // CRUCIAL: real read-heavy audit/ux/adversarial agents must STILL mark — RISK-1 stays closed.
  for (const st of [
    'pipeline-orchestrator:executor:type-specific:audit-domain-analyzer',
    'pipeline-orchestrator:executor:type-specific:ux-simulator',
    'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner',
  ]) {
    const { dir, armId } = auditWindow();
    try {
      marker.mark({ tool_name: 'Agent', tool_input: { subagent_type: st }, cwd: dir });
      check(`SEC-1: agente read-heavy (${st.split(':').pop()}) CONTINUA marcando (RISK-1 fechado)`, budget.readLedger(dir, armId).dispatched === true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}

console.log(failures === 0 ? '\n>>> F11 PASS' : `\n>>> F11 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
