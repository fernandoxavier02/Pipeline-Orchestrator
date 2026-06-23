#!/usr/bin/env node
'use strict';

// =============================================================================
// lib/audit-read-budget.cjs — v8.13.0 — AUDIT READ-BUDGET (read-only escape fix)
// =============================================================================
// ROOT CAUSE this closes: pipeline-arm-gate.cjs blocks WORK_TOOLS in the
// governed window but ALWAYS allows Read/Grep/Glob (ALWAYS_ALLOW_TOOLS) so a
// diagnostic is never frozen. An AUDIT / UX Simulation run is PURE read-only
// work, so it runs entirely inline — the agent never arms the run nor dispatches
// the audit-* agents, and the orchestration is silently skipped (same bug class
// as v8.12.1 R1-SEC-2: enforcement tied to mutation events, blind to reads).
//
// FIX (volume is the honest signal): in the governed-UNARMED window, for the
// read-only-escapable types, count investigation reads in a signed ledger and
// BLOCK the (budget+1)th read — forcing the agent to ARM. Light diagnostics
// (a handful of reads) pass; a real audit (dozens of reads) trips the budget
// well before the report finishes.
//
// PURE BRAIN = decideAuditReadBudget(ctx) (no I/O — mirrors decideArmGate /
// decideFixLoop). Ledger I/O reuses lib/sentinel-state-signer.cjs (two-tier
// polarity) + lib/exclusive-lock.cjs (withLock), mirroring the corrective-dispatch
// per-window ledger. The hooks (blocker PreToolUse + counter PostToolUse) resolve
// budget/enforce/window and pass them in.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let signer = null;
try { signer = require('./sentinel-state-signer.cjs'); } catch { signer = null; }
let lock = null;
try { lock = require('./exclusive-lock.cjs'); } catch { lock = null; }

// Decision: ONLY the read-only report-only types escape via reads. Bug Fix /
// Feature / User Story / Refactor write, so the arm-gate already catches them on
// the first Edit/Write. Spec is excluded for v1 (its authoring writes into
// pipeline-runs/, which is pipelineAligned/allowed anyway).
const READ_ONLY_ESCAPABLE_TYPES = new Set(['Audit', 'UX Simulation']);

const DEFAULT_READ_BUDGET = 12;
const BUDGET_FLOOR = 1;

// env resolver — mirrors pipeline-arm-gate.resolveArmTtlMs: NaN/0/negative fall
// back to the default; a finite value at/above the floor wins (floored to int).
function resolveReadBudget() {
  const raw = Number(process.env.PIPELINE_AUDIT_READ_BUDGET);
  if (Number.isFinite(raw) && raw >= BUDGET_FLOOR) return Math.floor(raw);
  return DEFAULT_READ_BUDGET;
}

// enforce default = 'deny' (ships fail-closed, like PIPELINE_ARM_ENFORCEMENT).
// The ONLY downgrade is the explicit operator escape =warn. No second warn path.
function resolveAuditEnforce() {
  return String(process.env.PIPELINE_AUDIT_BUDGET_ENFORCEMENT || 'deny').toLowerCase();
}

// SEC: the workflow string comes from the on-disk marker → attacker-controllable,
// and is interpolated into the deny reason. Strip CR/LF/control, safe charset,
// cap length (same contract as pipeline-arm-gate.sanitizeWorkflow).
function sanitizeWorkflow(workflow) {
  if (typeof workflow !== 'string') return '';
  return workflow
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 _.:\/-]/g, '')
    .trim()
    .slice(0, 80);
}

// ---- PURE BRAIN -------------------------------------------------------------
// ctx: { toolName, armPending(bool), runActive(bool), budgeted(bool — pending
//        type ∈ READ_ONLY_ESCAPABLE_TYPES), pipelineAligned(bool), count(int),
//        budget(int), enforce('deny'|'warn'), workflow(string|undefined) }
// Short-circuit order mirrors decideArmGate. NO I/O, NO env reads here.
function decideAuditReadBudget(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  if (!ctx.armPending) return { decision: 'allow' };       // ungoverned session
  if (ctx.runActive) return { decision: 'allow' };         // already armed → satisfied
  if (!ctx.budgeted) return { decision: 'allow' };         // not a read-only-escapable type
  if (ctx.pipelineAligned) return { decision: 'allow' };   // coordination read (.pipeline/, pipeline-runs/)

  const count = Number.isFinite(ctx.count) ? ctx.count : 0;
  const budget = Number.isFinite(ctx.budget) ? ctx.budget : DEFAULT_READ_BUDGET;
  if (count < budget) return { decision: 'allow' };        // within the diagnostic budget

  const enforce = String(ctx.enforce || 'deny').toLowerCase();
  if (enforce === 'warn') return { decision: 'allow', warn: true };

  return {
    decision: 'block',
    invariant_id: 'AUDIT_RAN_INLINE',
    reason: buildAuditInlineReason(ctx.toolName, ctx.workflow, count, budget),
    count,
    budget,
    corrective: buildAuditCorrectiveDescriptor(ctx.toolName, ctx.workflow),
  };
}

// Shared window predicate for the PostToolUse counter: only count reads that are
// genuine governed-unarmed audit investigation (not coordination, not armed).
function isCountableRead(ctx) {
  if (!ctx || typeof ctx !== 'object') return false;
  return !!(ctx.armPending && !ctx.runActive && ctx.budgeted && !ctx.pipelineAligned);
}

function buildAuditInlineReason(tool, workflow, count, budget) {
  const safeWf = sanitizeWorkflow(workflow);
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  const wf = safeWf ? ` (workflow detectado: ${safeWf})` : '';
  return (
    `AUDIT_RAN_INLINE: você invocou um pipeline read-only${wf} e já fez ${count} leituras de ` +
    `investigação (teto ${budget}) SEM armar o run — isso é uma auditoria sendo conduzida inline em vez de ` +
    `pela orquestração. NÃO continue a auditoria como conversa avulsa. ARME o run: crie ` +
    `{PIPELINE_DOC_PATH}/sentinel-state.json + <cwd>/.pipeline/active-run.json com pipeline_active:true, ` +
    `OU despache um agente pipeline-orchestrator: (ex.: audit-intake) via Agent tool. A ferramenta '${safeTool}' ` +
    `fica bloqueada até o run existir. Diagnóstico leve (poucas leituras) segue liberado; o teto é por janela e ` +
    `ajustável via PIPELINE_AUDIT_READ_BUDGET. Recovery automático: o marcador expira por timeout, nunca trava pra sempre.`
  );
}

// CorrectivePayload-shaped descriptor (design §3) — NO hard dep on the corrective
// engine; the orchestrating context turns this into the actual payload. Strings
// sanitized so nothing attacker-controlled rides downstream.
function buildAuditCorrectiveDescriptor(tool, workflow) {
  const safeWf = sanitizeWorkflow(workflow);
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  return {
    invariant_id: 'AUDIT_RAN_INLINE',
    what_failed: 'read-only pipeline (Audit/UX Simulation) ran inline past the read budget without arming',
    what_is_missing: 'an armed run (signed sentinel-state + active-run pointer) or a dispatched pipeline-orchestrator: agent',
    fix_instruction: 'arm the run: write the signed sentinel-state + active-run pointer, or dispatch a pipeline-orchestrator: agent (e.g. audit-intake)',
    resume_instruction: `resume the blocked ${safeTool} after the run is armed`,
    workflow: safeWf || undefined,
    blocking: true, // LAYER-A hard block stays in force while recovering
  };
}

// ---- LEDGER I/O (signed, .pipeline/state/governed-read-ledger.json) ---------
function stateDir(cwd) { return path.join(cwd, '.pipeline', 'state'); }
function ledgerPath(cwd) { return path.join(stateDir(cwd), 'governed-read-ledger.json'); }

// arm_id binds the ledger to ONE /pipeline invocation. A new invocation → new
// requested_at → new arm_id → the old ledger is ignored (count resets to 0).
function armIdFor(requestedAt) {
  return crypto.createHash('sha256').update(String(requestedAt == null ? '' : requestedAt)).digest('hex');
}

// Two-tier verify on read: present+INVALID signature → treat as count 0 (reject
// the forged ledger — fail-safe, only makes the gate block SOONER); unsigned /
// key-unavailable → tolerate. arm_id mismatch → 0 (reset-on-new-/pipeline).
function ledgerIsTampered(obj) {
  if (!signer || typeof signer.verifyState !== 'function') return false;
  let v;
  try { v = signer.verifyState(obj, { key: signer.readHmacKey() }); } catch { return false; }
  if (!v || typeof v !== 'object') return false;
  if (v.unsigned) return process.env.PIPELINE_HMAC_STRICT === 'true';
  if (v.key_unavailable) return false;
  return v.valid !== true;
}

function readLedger(cwd, armId) {
  try {
    const obj = JSON.parse(fs.readFileSync(ledgerPath(cwd), 'utf8'));
    if (ledgerIsTampered(obj)) return { count: 0 };
    if (obj.arm_id !== armId) return { count: 0 };
    return { count: Number.isFinite(obj.count) ? obj.count : 0 };
  } catch { return { count: 0 }; }
}

// Increment under exclusive lock; reset to 0 when the ledger's arm_id doesn't
// match the current marker (new /pipeline). Signed write via temp+rename. Fully
// guarded — a counter failure must NEVER throw into the (never-blocking) hook.
function bumpLedger(cwd, marker) {
  try {
    const requestedAt = marker && marker.requested_at;
    const armId = armIdFor(requestedAt);
    const p = ledgerPath(cwd);
    try { fs.mkdirSync(stateDir(cwd), { recursive: true }); } catch { /* exists */ }

    const doWrite = () => {
      let prev = 0;
      try {
        const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!ledgerIsTampered(obj) && obj.arm_id === armId && Number.isFinite(obj.count)) prev = obj.count;
      } catch { /* absent/unreadable → start at 0 */ }
      const next = {
        arm_id: armId,
        requested_at: requestedAt,
        workflow: typeof (marker && marker.workflow) === 'string' ? marker.workflow : undefined,
        type: typeof (marker && marker.type) === 'string' ? marker.type : undefined,
        count: prev + 1,
        last_at: new Date().toISOString(),
      };
      let toWrite = next;
      try {
        if (signer && typeof signer.signState === 'function') {
          const key = typeof signer.getOrCreateHmacKey === 'function' ? signer.getOrCreateHmacKey() : undefined;
          toWrite = signer.signState(next, key);
        }
      } catch { toWrite = next; } // signing failed → write unsigned (tolerated on read)
      const tmp = `${p}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(toWrite));
      fs.renameSync(tmp, p);
      return next.count;
    };

    if (lock && typeof lock.withLock === 'function') return lock.withLock(p, doWrite);
    return doWrite();
  } catch { return null; }
}

module.exports = {
  decideAuditReadBudget,
  isCountableRead,
  resolveReadBudget,
  resolveAuditEnforce,
  sanitizeWorkflow,
  buildAuditInlineReason,
  buildAuditCorrectiveDescriptor,
  armIdFor,
  ledgerPath,
  readLedger,
  bumpLedger,
  READ_ONLY_ESCAPABLE_TYPES,
  DEFAULT_READ_BUDGET,
};
