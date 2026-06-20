#!/usr/bin/env node
'use strict';

// =============================================================================
// checkpoint-verdict.cjs — deterministic "don't advance on a RED build" gate (PURE)
// =============================================================================
// Audit item A1. The prose rule "if the build/tests fail, stop — don't advance"
// (CHECKPOINT_FAIL / STOP_RULE) was never read by any hook. This is the code
// decision: the checkpoint-validator records a verdict (pass|fail) into the
// signed state; before an ADVANCE agent (review-orchestrator = the per-batch
// adversarial review, or final-validator = closure) is spawned, if the last
// checkpoint verdict is `fail`, the spawn is DENIED. The fix path stays open —
// executor-fix and a re-run checkpoint-validator are NOT governed, so you can
// repair and re-check; you just can't move PAST a red checkpoint.
//
// PURE + deterministic. Never throws. Same shape as fix-loop / batch-review /
// gate-log guards. The I/O wrapper is .claude/hooks/checkpoint-verdict-gate.cjs.
//
// ponytail: records the verdict the checkpoint produced, not an independent
// re-run (a hook can't run the build). Upgrade path: capture the real command
// exit code into the verdict file so the recorded fact is the process result,
// not the agent's opinion. Named ceiling, deliberate for v1.
// =============================================================================

// Agents whose spawn means "advancing PAST the checkpoint". Blocked while RED.
const BLOCKED_WHEN_RED = new Set(['review-orchestrator', 'final-validator']);

function buildReason(leaf) {
  return (
    `CHECKPOINT_RED: o último checkpoint (build/test) falhou — não avance disparando ` +
    `${leaf} enquanto estiver vermelho. Rode executor-fix e re-rode o checkpoint-validator ` +
    `até passar. Avançar pra revisão/fechamento com o build quebrado é exatamente o que ` +
    `esta trava existe para impedir.`
  );
}

// PURE decision. ctx: { agentLeaf, lastVerdict ('pass'|'fail'|null), enforce }
function decideCheckpointVerdict(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const leaf = ctx.agentLeaf;
  if (typeof leaf !== 'string' || !BLOCKED_WHEN_RED.has(leaf)) return { decision: 'allow' };
  // Only a recorded FAIL blocks. Unknown/absent (null) → allow (migration-tolerant):
  // a run that never recorded a verdict is not assumed red.
  if (ctx.lastVerdict !== 'fail') return { decision: 'allow', lastVerdict: ctx.lastVerdict || null };
  if (String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, lastVerdict: 'fail' };
  }
  return { decision: 'block', lastVerdict: 'fail', reason: buildReason(leaf) };
}

// Normalize an arbitrary recorded verdict value to 'pass' | 'fail' | null.
// Accepts {verdict:'pass'|'fail'}, a bare string, or a boolean (true=pass).
function normalizeVerdict(raw) {
  if (raw === true) return 'pass';
  if (raw === false) return 'fail';
  const v = (typeof raw === 'object' && raw) ? raw.verdict : raw;
  if (typeof v !== 'string') return null;
  const low = v.trim().toLowerCase();
  if (low === 'pass' || low === 'passed' || low === 'green' || low === 'ok') return 'pass';
  if (low === 'fail' || low === 'failed' || low === 'red') return 'fail';
  return null;
}

module.exports = { decideCheckpointVerdict, normalizeVerdict, buildReason, BLOCKED_WHEN_RED };
