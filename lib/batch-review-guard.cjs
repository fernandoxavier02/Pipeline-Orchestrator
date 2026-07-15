#!/usr/bin/env node
'use strict';

// =============================================================================
// batch-review-guard.cjs — deterministic per-batch adversarial-review gate (PURE)
// =============================================================================
// The prose rule "run the adversarial review every batch BEFORE advancing"
// (commands/pipeline.md Inline Invariant #7, references/gates.md ADVERSARIAL_GATE)
// lived only in agent markdown. Nothing in CODE forced it, so a run could
// implement every batch, run the adversarial review once at the very end, and
// still pass — the exact failure this gate exists to make impossible.
//
// This is the code decision. Two append-only counters live in the run's signed
// state, each bumped by the PostToolUse:Agent stamp hook on a REAL agent
// completion (the LLM cannot increment them without actually spawning the agent):
//   - batch_checkpoints_done  ++ when checkpoint-validator finishes a batch
//   - batch_reviews_done      ++ when review-orchestrator (the per-batch
//                                adversarial coordinator) finishes
// Before a batch-boundary agent (checkpoint-validator, i.e. the NEXT batch) or
// the closure agent (final-validator) is spawned, we require:
//       batch_reviews_done >= batch_checkpoints_done
// i.e. every batch that already passed a checkpoint must have had its adversarial
// review. If reviews lag, the spawn is DENIED (deny default) / WARNED (escape).
//
// PURE + deterministic. NEVER throws. Same shape as decideFixLoop (fix-loop.cjs)
// and decideGateLog (gate-log-guard.cjs). The I/O wrapper that reads the signed
// state and counters is .claude/hooks/batch-review-gate.cjs.
//
// ponytail: counts REAL agent completions, not the review's actual findings — a
// review-orchestrator that spawns and returns nothing still counts. Same trust
// level as the step ledger. Upgrade path if gaming ever appears: have the stamp
// parse the review verdict before counting. Named ceiling, deliberate for v1.
// =============================================================================

// Agents whose spawn is GATED: a batch boundary (next batch) or the closure.
const GOVERNED = new Set(['checkpoint-validator', 'final-validator']);

function buildReason(leaf, checkpoints, reviews) {
  const lagging = checkpoints - reviews;
  return (
    `BATCH_REVIEW_MISSING: ${checkpoints} batch(es) passaram pelo checkpoint mas ` +
    `só ${reviews} tiveram revisão adversarial — ${lagging} batch(es) sem revisão. ` +
    `NÃO dispare ${leaf}: rode a revisão adversarial (review-orchestrator) do batch ` +
    `pendente ANTES de avançar/fechar. Acumular implementação e revisar só no fim é ` +
    `exatamente o furo que esta trava existe para impedir.`
  );
}

// PURE decision. ctx: { agentLeaf, checkpointsDone, reviewsDone, enforce }
function decideBatchReview(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const leaf = ctx.agentLeaf;
  if (typeof leaf !== 'string' || !GOVERNED.has(leaf)) return { decision: 'allow' };

  const checkpoints = Number.isFinite(ctx.checkpointsDone) ? ctx.checkpointsDone : 0;
  const reviews = Number.isFinite(ctx.reviewsDone) ? ctx.reviewsDone : 0;

  // A4 (audit): when the batch touched a SENSITIVE domain (auth/crypto/payment/
  // data-model), the adversarial review is MANDATORY and the `warn` escape is
  // DENIED — sensitive batches cannot be relaxed into a silent skip. For ordinary
  // batches the warn escape still applies (rollout).
  const sensitive = ctx.sensitive === true;

  // S5 (Requirement 2 — proportional consolidation): a signed, VERIFIED collapse
  // flag satisfies the invariant WITHOUT a per-batch review — the single surviving
  // 3-way final round covers the whole diff (2.1-2.4). Two independent signals:
  //   - review_consolidated   — 1-batch/SIMPLES collapse (2.1-2.3)
  //   - final_review_scheduled — bugfix-heavy wrapped, final round already scheduled (2.4)
  // The flag is honoured ONLY for a non-sensitive run: `sensitive` is re-derived
  // FRESH from the current domains_touched by the I/O wrapper on every spawn, so a
  // run that turned sensitive AFTER the flag was written loses the collapse and
  // falls back to the classic reviews>=checkpoints invariant (2.5 / TOCTOU close;
  // 8.9 — consolidation never eliminates the single round of a sensitive run). A
  // forged/unverified flag never reaches this pure brain: the wrapper only passes
  // it from an HMAC-verified state (an invalid signature fails closed upstream).
  const consolidated = ctx.reviewConsolidated === true || ctx.finalReviewScheduled === true;
  if (consolidated && !sensitive) {
    return { decision: 'allow', consolidated: true, checkpoints, reviews };
  }

  if (reviews >= checkpoints) return { decision: 'allow', checkpoints, reviews };
  if (!sensitive && String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, checkpoints, reviews };
  }
  let reason = buildReason(leaf, checkpoints, reviews);
  if (sensitive) {
    reason += ` Este batch tocou domínio SENSÍVEL (${(Array.isArray(ctx.domains) ? ctx.domains.join(', ') : 'auth/cripto/pagamento/dados')}) — a revisão é OBRIGATÓRIA e NÃO pode ser pulada.`;
  }
  return { decision: 'block', checkpoints, reviews, sensitive, reason };
}

module.exports = { decideBatchReview, buildReason, GOVERNED };
