#!/usr/bin/env node
'use strict';

// =============================================================================
// batch-review-gate.cjs — v8.8.0 (PreToolUse:Agent)
// =============================================================================
// Enforces the per-batch adversarial review BEFORE advancing. Before a batch-
// boundary agent (checkpoint-validator = the NEXT batch) or the closure agent
// (final-validator) is spawned, the run's signed state must show
// batch_reviews_done >= batch_checkpoints_done — i.e. every checkpointed batch
// already had its adversarial review. The pure decision lives in
// lib/batch-review-guard.cjs; this is the thin I/O wrapper. Mirrors
// step-ledger-gate.cjs / gate-log-gate.cjs exactly.
//
// SAFE BY CONSTRUCTION:
//  - only acts on an ACTIVE run (pipeline_active === true);
//  - findActiveSentinelState already VERIFIES the HMAC signature — a present-but-
//    invalid signature returns CORRUPT_SENTINEL (fail-open below), so a forged
//    signed state cannot be laundered into a "valid active run" (SEC-1 posture);
//  - ungoverned agents (everything except checkpoint-validator / final-validator)
//    always allowed;
//  - default ROLLOUT mode = DENY (escape/relax via PIPELINE_BATCH_REVIEW_ENFORCEMENT=warn);
//  - absent counters in legacy runs → treated as 0 (migration-tolerant);
//  - fail-open on missing/corrupt state or any error.
// =============================================================================

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let guard = null;
try { guard = require('../../lib/batch-review-guard.cjs'); } catch { guard = null; }

function decide(payload) {
  if (!guard || typeof guard.decideBatchReview !== 'function') return { decision: 'allow' };
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name !== 'Agent') return { decision: 'allow' };
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return { decision: 'allow' };

  let state;
  try { state = eg && eg.findActiveSentinelState(dir); } catch { return { decision: 'allow' }; }
  if (!state) return { decision: 'allow' };

  const ti = payload.tool_input || {};
  const leaf = String(ti.subagent_type || '').split(':').pop().trim();
  // Ungoverned agents are NEVER blocked — not even on a corrupt/inactive state
  // (avoids deadlocking unrelated spawns). Leaf is trimmed so "final-validator "
  // can't slip past the exact-match GOVERNED set.
  if (!leaf || !guard.GOVERNED.has(leaf)) return { decision: 'allow' };

  const enforce = process.env.PIPELINE_BATCH_REVIEW_ENFORCEMENT || 'deny';

  // CRITICAL (adversarial fix): a governed spawn against a present-but-invalidly-
  // signed authoritative state must FAIL CLOSED, mirroring every other consumer of
  // CORRUPT_SENTINEL (edit-guard corruptResult, dispatch-pending, plan-gate). This
  // gate was the lone fail-OPEN consumer — a one-byte tamper of the signed state
  // would have disabled it and let an unreviewed batch advance. Warn is the escape.
  if (eg && state === eg.CORRUPT_SENTINEL) {
    if (String(enforce).toLowerCase() === 'warn') return { decision: 'allow', warn: true };
    return {
      decision: 'block',
      reason:
        'BATCH_REVIEW_STATE_CORRUPT: o sentinel-state assinado deste run não passa na ' +
        'verificação de integridade (HMAC), então os contadores de revisão por batch não ' +
        `são confiáveis e o spawn de ${leaf} é BLOQUEADO. Recrie/re-assine o estado pelo ` +
        'controller (lib/sentinel-state-signer.cjs) antes de avançar ou fechar.',
    };
  }

  if (state.pipeline_active !== true) return { decision: 'allow' };

  return guard.decideBatchReview({
    agentLeaf: leaf,
    checkpointsDone: Number.isFinite(state.batch_checkpoints_done) ? state.batch_checkpoints_done : 0,
    reviewsDone: Number.isFinite(state.batch_reviews_done) ? state.batch_reviews_done : 0,
    enforce,
  });
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      const out = decide(JSON.parse(s));
      if (out && out.decision === 'block') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: out.reason },
        }));
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('batch-review-gate error: ' + e.message + '\n');
      process.exit(0);
    }
  });
}

module.exports = { decide };
