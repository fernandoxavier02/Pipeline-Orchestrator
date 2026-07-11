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
// FINAL-REVIEW SEC-4 (SSOT): validated, injection-safe workflow label for the LLM-facing deny
// reason — delegated to the classifier (owns MODES+TYPES) so it can't drift from the arm-gate.
let wfClassifier = null;
try { wfClassifier = require('./pipeline-workflow-classifier.cjs'); } catch { wfClassifier = null; }
// Batch 3 (AUDIT-REPORT.md §4 P1 / CR6): same-directory sibling, not `../../`
// (this file lives in lib/, next-action.cjs is a lib/ sibling here).
let nextActionLib = null;
try { nextActionLib = require('./next-action.cjs'); } catch { nextActionLib = null; }
function subagentFallbackSuffix() {
  try {
    if (nextActionLib && typeof nextActionLib.buildSubagentFallbackClause === 'function') {
      return ' ' + nextActionLib.buildSubagentFallbackClause();
    }
  } catch (e) {
    // Fail-OPEN (the deny itself must still fire) but make the drop OBSERVABLE
    // (round-2 security review, LOW finding): without this stderr line a
    // failure here silently re-introduces the exact CR6 deadlock this clause
    // exists to close, with no telemetry trail. The stderr write is itself
    // wrapped (round-3 security review, N2): a synchronous throw from a broken
    // stderr would otherwise escape this catch (a catch does NOT catch its own
    // throw) and convert the fail-closed deny into a silent allow.
    try {
      process.stderr.write('[audit-read-budget] subagent-fallback clause dropped: ' + ((e && e.message) || 'unknown') + '\n');
    } catch { /* stderr failure must never break the deny */ }
  }
  return '';
}
function safeWorkflowLabel(workflow) {
  if (wfClassifier && typeof wfClassifier.safeWorkflowLabel === 'function') return wfClassifier.safeWorkflowLabel(workflow);
  return sanitizeWorkflow(workflow); // fallback (classifier absent): char-clean only
}
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
  // Batch 4 (adversarial RISK-1): once a pipeline-orchestrator AGENT has been dispatched
  // in this window, the inline-read budget no longer applies. The budget exists to force
  // the PARENT to ARM/DISPATCH instead of running an audit forever inline — a DISPATCHED
  // agent (the auditor / the adversarial reviewer) reading dozens of files is the LEGITIMATE
  // work, not the inline-escape the budget targets. (This is what blocked the dispatched
  // reviewers live: their reads counted against the parent's inline budget.)
  if (ctx.agentDispatched) return { decision: 'allow' };
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

// AUDIT-005 (v8.17.0): closed-vocabulary tokens that machine consumers
// pattern-match (in the corrective descriptor AND in the prose reason suffix).
// Frozen so a typo here can't drift the contract.
const CORRECTIVE_ACTION_DISPATCH_AGENT = 'dispatch_agent';
const AGENT_TYPE_AUDIT_INTAKE = 'audit-intake';

function buildAuditInlineReason(tool, workflow, count, budget) {
  const safeWf = safeWorkflowLabel(workflow);
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  const wf = safeWf ? ` (workflow detectado: ${safeWf})` : '';
  // AUDIT-005 (v8.17.0): even a parent that ONLY reads the prose reason gets
  // a machine-parseable suffix — `corrective_action=<token>
  // agent_type=<token>` — so it can pattern-match the recovery action without
  // walking the structured payload. The suffix is on its own line so a naïve
  // grep finds it without false positives from the explanatory prose.
  //
  // Batch 3 (AUDIT-REPORT.md §4 P1 / CR6, + a second finding along the way):
  // this reason used to say "ARME o run: crie {PIPELINE_DOC_PATH}/sentinel-
  // state.json ... à mão" — a hand-write recipe for enforcement state. That is
  // the EXACT anti-pattern v8.20.0 already closed for pipeline-arm-gate.cjs's
  // own NOT_ARMED/CORRUPT_STATE messages (self-write recipes let a steered
  // agent forge a fake armed state — CLAUDE.md v4.2 changelog); this message
  // was simply never updated to match. Replaced with the same safe, single
  // reachable action used everywhere else, plus the subagent-fallback clause
  // (a subagent has neither the Agent tool this message named nor a way to
  // "arm" anything by hand — its only real exit is the DISPATCH_REQUEST block).
  return (
    `AUDIT_RAN_INLINE: você invocou um pipeline read-only${wf} e já fez ${count} leituras de ` +
    `investigação (teto ${budget}) SEM armar o run — isso é uma auditoria sendo conduzida inline em vez de ` +
    `pela orquestração. NÃO continue a auditoria como conversa avulsa. PRÓXIMA AÇÃO (única): ` +
    `Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", prompt: <a tarefa original>) — ` +
    `NUNCA escreva sentinel-state.json/active-run.json à mão. A ferramenta '${safeTool}' ` +
    `fica bloqueada até o run existir. Diagnóstico leve (poucas leituras) segue liberado; o teto é por janela e ` +
    `ajustável via PIPELINE_AUDIT_READ_BUDGET. Recovery automático: o marcador expira por timeout, nunca trava pra sempre. ` +
    `[corrective_action=${CORRECTIVE_ACTION_DISPATCH_AGENT} agent_type=${AGENT_TYPE_AUDIT_INTAKE}]` +
    subagentFallbackSuffix()
  );
}

// CorrectivePayload-shaped descriptor (design §3) — NO hard dep on the corrective
// engine; the orchestrating context turns this into the actual payload. Strings
// sanitized so nothing attacker-controlled rides downstream.
//
// AUDIT-005 (v8.17.0): adds closed-vocabulary machine-readable fields
// `corrective_action: "dispatch_agent"` + `agent_type: "audit-intake"` so a
// parent consuming the structured payload can dispatch the right recovery
// agent without parsing prose. Backward-compatible: existing fields
// (invariant_id, what_failed, what_is_missing, fix_instruction,
// resume_instruction, workflow, blocking) are preserved unchanged.
function buildAuditCorrectiveDescriptor(tool, workflow) {
  const safeWf = safeWorkflowLabel(workflow);
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  return {
    invariant_id: 'AUDIT_RAN_INLINE',
    what_failed: 'read-only pipeline (Audit/UX Simulation) ran inline past the read budget without arming',
    what_is_missing: 'the run armed via the signed pipeline command (never a hand-written state file)',
    // Batch 3 adversarial review (round 2, MEDIUM): this structured field had
    // the SAME self-write-recipe anti-pattern already fixed in the prose
    // buildAuditInlineReason above ("write the signed sentinel-state ... by
    // hand") — a hand-write recipe lets a steered agent forge a fake armed
    // state (the v8.20.0 lesson this whole class of fix follows). Both
    // surfaces now say the same single safe thing.
    fix_instruction: 'Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", prompt: <a tarefa original>) — nunca escreva sentinel-state.json/active-run.json à mão',
    resume_instruction: `resume the blocked ${safeTool} after the run is armed`,
    workflow: safeWf || undefined,
    blocking: true, // LAYER-A hard block stays in force while recovering
    corrective_action: CORRECTIVE_ACTION_DISPATCH_AGENT, // AUDIT-005 (v8.17.0)
    agent_type: AGENT_TYPE_AUDIT_INTAKE,                  // AUDIT-005 (v8.17.0)
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
    if (ledgerIsTampered(obj)) return { count: 0, dispatched: false };
    if (obj.arm_id !== armId) return { count: 0, dispatched: false };
    return { count: Number.isFinite(obj.count) ? obj.count : 0, dispatched: obj.dispatched === true };
  } catch { return { count: 0, dispatched: false }; }
}

// Batch 5 (ARCH-3): ONE signed-write path for the governed-read ledger. bumpLedger and
// markDispatched were ~50 lines of byte-identical lock + read-prev + sign + temp-rename
// logic; they now differ ONLY by the `buildOverrides(prev)` they pass (increment count vs set
// dispatched). Behavior-identical — per-arm keying, tamper-check on read-prev, signing and
// exclusive lock unchanged. Fully guarded — a ledger-write failure must NEVER throw into the
// (never-blocking) hooks. `buildOverrides(prev)` returns an object of field overrides spread LAST
// onto `next` (it does NOT mutate in place), so a `count` it returns WINS over the base
// `count: prev` (JS object-literal last-key-wins): bumpLedger returns {count: prev+1} → increments;
// markDispatched returns {dispatched:true} (no count) → count preserved. Returns `next`, or null.
function writeLedger(cwd, marker, buildOverrides) {
  try {
    const requestedAt = marker && marker.requested_at;
    const armId = armIdFor(requestedAt);
    const p = ledgerPath(cwd);
    try { fs.mkdirSync(stateDir(cwd), { recursive: true }); } catch { /* exists */ }

    const doWrite = () => {
      let prev = 0, prevDispatched = false;
      try {
        const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!ledgerIsTampered(obj) && obj.arm_id === armId) {
          if (Number.isFinite(obj.count)) prev = obj.count;
          prevDispatched = obj.dispatched === true; // BUGFIX (2026-06-27): carry the dispatch-exemption across writes
        }
      } catch { /* absent/unreadable → start at 0 */ }
      const next = {
        arm_id: armId,
        requested_at: requestedAt,
        workflow: typeof (marker && marker.workflow) === 'string' ? marker.workflow : undefined,
        type: typeof (marker && marker.type) === 'string' ? marker.type : undefined,
        count: prev,
        dispatched: prevDispatched, // BUGFIX: base preserves it; buildOverrides (markDispatched) may still set true
        last_at: new Date().toISOString(),
        ...buildOverrides(prev),
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
      return next;
    };

    if (lock && typeof lock.withLock === 'function') return lock.withLock(p, doWrite);
    return doWrite();
  } catch { return null; }
}

// Increment under exclusive lock; reset to 0 on a new /pipeline (arm_id mismatch). Returns
// the new count (or null on failure).
function bumpLedger(cwd, marker) {
  const next = writeLedger(cwd, marker, (prev) => ({ count: prev + 1 }));
  return next ? next.count : null;
}

// Batch 4 (adversarial RISK-1): mark the per-arm ledger `dispatched:true` (count PRESERVED)
// so the budget exempts the dispatched agent's reads. Same signed-write path as bumpLedger.
function markDispatched(cwd, marker) {
  const next = writeLedger(cwd, marker, () => ({ dispatched: true }));
  return next ? true : null;
}

module.exports = {
  markDispatched,
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
