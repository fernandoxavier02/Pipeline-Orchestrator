#!/usr/bin/env node
'use strict';

// =============================================================================
// fix-loop.cjs — v8.7.0 — deterministic fix-loop cap (replaces prose "max 3")
// =============================================================================
// The prose-only rule "stop after 3 fix attempts / 4 cycles" lived in agent
// markdown and depended on the LLM counting honestly. This is the code decision:
// once `attempts` reaches `max`, another executor-fix spawn is DENIED. The count
// is stamped into the signed state (state.fix_loop_attempts) by the stamp hook
// on each executor-fix completion; a PreToolUse gate reads it before the next
// executor-fix spawn. Pure + fail-open; warn is the explicit escape.
// =============================================================================

const DEFAULT_MAX = 3;

function decideFixLoop(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const attempts = Number.isFinite(ctx.attempts) ? ctx.attempts : 0;
  const max = Number.isFinite(ctx.max) && ctx.max > 0 ? ctx.max : DEFAULT_MAX;

  if (attempts < max) return { decision: 'allow', attempts, max };

  if (String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, attempts, max };
  }
  return {
    decision: 'block',
    attempts,
    max,
    reason:
      `FIX_LOOP_EXHAUSTED: ${attempts} tentativa(s) de conserto já feitas (teto ${max}). ` +
      `NÃO dispare outro executor-fix — pare o loop, mude de abordagem ou proponha alternativas ao usuário. ` +
      `Continuar a tentar o mesmo conserto é exatamente o loop infinito que esta trava existe para impedir.`,
  };
}

module.exports = { decideFixLoop, DEFAULT_MAX };
