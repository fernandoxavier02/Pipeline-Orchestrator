#!/usr/bin/env node
'use strict';

// =============================================================================
// consecutive-failure-counter.cjs — deterministic STOP_RULE (PURE)
// =============================================================================
// Audit items A2 (checkpoint) + A3 (sanity). The prose rule "stop after 2
// consecutive failures" was a circuit breaker that nothing in code counted.
// This is the code decision: a signed-state counter is incremented on each
// checkpoint/sanity FAIL and reset to 0 on PASS; once it reaches `max` (default
// 2), an ADVANCE agent (review-orchestrator / final-validator) spawn is DENIED —
// the run is stuck failing and must change approach, not keep grinding. The fix
// path (executor-fix, re-checkpoint) stays open.
//
// PURE + deterministic. Never throws. Mirrors decideFixLoop. The counter is
// maintained by recordCheckpointVerdict (scripts/record-step.cjs); the gate that
// reads it is .claude/hooks/checkpoint-verdict-gate.cjs (shared with A1).
// =============================================================================

const DEFAULT_MAX = 2;
const BLOCKED_WHEN_TRIPPED = new Set(['review-orchestrator', 'final-validator']);

function buildReason(leaf, failures, max) {
  return (
    `STOP_RULE: ${failures} falha(s) consecutiva(s) de checkpoint/sanidade (teto ${max}). ` +
    `A abordagem atual não está convergindo — NÃO avance disparando ${leaf}. Conserte a ` +
    `causa-raiz ou mude de abordagem antes de prosseguir.`
  );
}

// PURE decision. ctx: { agentLeaf, failures, max, enforce }
function decideConsecutiveFailures(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const leaf = ctx.agentLeaf;
  if (typeof leaf !== 'string' || !BLOCKED_WHEN_TRIPPED.has(leaf)) return { decision: 'allow' };
  const failures = Number.isFinite(ctx.failures) ? ctx.failures : 0;
  const max = Number.isFinite(ctx.max) && ctx.max > 0 ? ctx.max : DEFAULT_MAX;
  if (failures < max) return { decision: 'allow', failures, max };
  if (String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, failures, max };
  }
  return { decision: 'block', failures, max, reason: buildReason(leaf, failures, max) };
}

module.exports = { decideConsecutiveFailures, buildReason, DEFAULT_MAX, BLOCKED_WHEN_TRIPPED };
