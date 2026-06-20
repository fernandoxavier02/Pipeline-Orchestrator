#!/usr/bin/env node
'use strict';

// =============================================================================
// phase-verdict-guard.cjs — generic deterministic verdict gates (PURE)
// =============================================================================
// Audit items A5-A9. Five prose-only flow rules share ONE shape: an agent
// produces a VERDICT, and a later agent must be blocked from spawning based on it.
// Each verdict is recorded into the HMAC-signed state by recordPhaseVerdict
// (scripts/record-step.cjs); this gate reads it and DENIES the governed spawn.
//
//   A6 SSOT_CONFLICT  — ssot_status='conflict'        → block the whole forward chain
//   A7 INFO_GATE_BLOCKED — info_gate='blocked'        → block plan-architect / executor
//   A8 PLAN_REJECTED  — plan_status='rejected'        → block executor-controller
//   A5 FINAL_ADVERSARIAL_REWORK — final_review_verdict='critical_open' → block finishing-branch
//   A9 GO_NOGO_BLOCK  — final_decision='NO-GO'        → block finishing-branch (closeout)
//
// PURE + deterministic. Never throws. Same shape as the other guards. The I/O
// wrapper is .claude/hooks/phase-verdict-gate.cjs.
//
// ponytail: the verdict is agent-recorded (a verdict file the stamp reads) — same
// trust floor as the batch-review completion count. Upgrade path: derive the
// verdict from the producing agent's structured artifact, not a written field.
// =============================================================================

const RULES = [
  // A6 — a source-of-truth conflict blocks the ENTIRE forward chain.
  {
    code: 'SSOT_CONFLICT', field: 'ssot_status', blockValues: ['conflict'],
    leaves: ['information-gate', 'plan-architect', 'executor-controller', 'review-orchestrator', 'sanity-checker', 'final-validator', 'finishing-branch'],
    reason: () => 'SSOT_CONFLICT: há um conflito de fonte de verdade registrado — resolva-o antes de prosseguir (não dá para planejar/executar/fechar sobre fontes contraditórias).',
  },
  // A7 — a blocked information gate stops planning/execution.
  {
    code: 'INFO_GATE_BLOCKED', field: 'info_gate', blockValues: ['blocked'],
    leaves: ['plan-architect', 'executor-controller'],
    reason: () => 'INFO_GATE_BLOCKED: o portão de informação está BLOQUEADO — resolva as lacunas críticas antes de planejar ou executar.',
  },
  // A8 — a rejected plan must not reach the executor.
  {
    code: 'PLAN_REJECTED', field: 'plan_status', blockValues: ['rejected'],
    leaves: ['executor-controller'],
    reason: () => 'PLAN_REJECTED: o plano foi rejeitado — volte ao planejamento (Fase 1) antes de executar.',
  },
  // A5 — an open CRITICAL from the final review blocks closeout.
  {
    code: 'FINAL_ADVERSARIAL_REWORK', field: 'final_review_verdict', blockValues: ['critical_open'],
    leaves: ['finishing-branch'],
    reason: () => 'FINAL_ADVERSARIAL_REWORK: a revisão adversarial final tem achado CRÍTICO em aberto — conserte (volte à Fase 2) antes de fechar.',
  },
  // A9 — a NO-GO decision blocks closeout / push.
  {
    code: 'GO_NOGO_BLOCK', field: 'final_decision', blockValues: ['NO-GO', 'NO_GO', 'NOGO'],
    leaves: ['finishing-branch'],
    reason: (f, v) => `GO_NOGO_BLOCK: o validador final decidiu ${v} — não feche, faça push ou abra PR sem resolver as pendências.`,
  },
];

// PURE decision. ctx: { agentLeaf, state (the signed state object), enforce }
function decidePhaseVerdict(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const leaf = ctx.agentLeaf;
  if (typeof leaf !== 'string' || !leaf) return { decision: 'allow' };
  const state = (ctx.state && typeof ctx.state === 'object') ? ctx.state : {};
  const warn = String(ctx.enforce || 'deny').toLowerCase() === 'warn';

  for (const rule of RULES) {
    if (!rule.leaves.includes(leaf)) continue;
    const v = state[rule.field];
    if (typeof v === 'string' && rule.blockValues.includes(v)) {
      if (warn) return { decision: 'allow', warn: true, code: rule.code };
      return { decision: 'block', code: rule.code, reason: rule.reason(rule.field, v) };
    }
  }
  return { decision: 'allow' };
}

// Returns the union of every leaf governed by some rule (the I/O gate uses this to
// short-circuit ungoverned spawns before touching state).
function governedLeaves() {
  const s = new Set();
  for (const r of RULES) for (const l of r.leaves) s.add(l);
  return s;
}

module.exports = { decidePhaseVerdict, governedLeaves, RULES };
