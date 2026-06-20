#!/usr/bin/env node
'use strict';

// =============================================================================
// checkpoint-verdict-gate.cjs — v8.9.0 (PreToolUse:Agent)
// =============================================================================
// Enforces audit A1 (don't advance on a RED build) + A2/A3 (STOP_RULE: stop after
// 2 consecutive checkpoint/sanity failures). Before an ADVANCE agent
// (review-orchestrator / final-validator) is spawned, it reads the signed state's
// last_checkpoint_verdict and consecutive_checkpoint_failures and DENIES if the
// last verdict is `fail` (A1) or the consecutive count hit the cap (A2/A3). The
// fix path (executor-fix, re-run checkpoint-validator) is NOT governed. The pure
// decisions live in lib/checkpoint-verdict.cjs + lib/consecutive-failure-counter.cjs.
// Mirrors batch-review-gate.cjs exactly.
//
// SAFE BY CONSTRUCTION: active runs only; CORRUPT_SENTINEL fails CLOSED for a
// governed leaf (mirrors batch-review); ungoverned agents always allowed; absent
// verdict/counter → allow (migration-tolerant); default deny with a warn escape;
// fail-open on missing/corrupt state or any error.
// =============================================================================

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let cpv = null;
try { cpv = require('../../lib/checkpoint-verdict.cjs'); } catch { cpv = null; }
let cfc = null;
try { cfc = require('../../lib/consecutive-failure-counter.cjs'); } catch { cfc = null; }

function decide(payload) {
  if (!cpv || typeof cpv.decideCheckpointVerdict !== 'function') return { decision: 'allow' };
  if (!cfc || typeof cfc.decideConsecutiveFailures !== 'function') return { decision: 'allow' };
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name !== 'Agent') return { decision: 'allow' };
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return { decision: 'allow' };

  let state;
  try { state = eg && eg.findActiveSentinelState(dir); } catch { return { decision: 'allow' }; }
  if (!state) return { decision: 'allow' };

  const ti = payload.tool_input || {};
  const leaf = String(ti.subagent_type || '').split(':').pop().trim();
  // Governed = the union of the two advance-blocking sets (both are
  // {review-orchestrator, final-validator}). Ungoverned → never blocked.
  const governed = cpv.BLOCKED_WHEN_RED.has(leaf) || cfc.BLOCKED_WHEN_TRIPPED.has(leaf);
  if (!leaf || !governed) return { decision: 'allow' };

  const enforce = process.env.PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT || 'deny';

  // Corrupt authoritative state → fail CLOSED for a governed advance (SEC posture
  // shared with batch-review-gate). Warn is the escape.
  if (eg && state === eg.CORRUPT_SENTINEL) {
    if (String(enforce).toLowerCase() === 'warn') return { decision: 'allow', warn: true };
    return {
      decision: 'block',
      reason:
        'CHECKPOINT_STATE_CORRUPT: o sentinel-state assinado não passa na verificação de ' +
        `integridade, então o veredito do checkpoint não é confiável e o spawn de ${leaf} é ` +
        'BLOQUEADO. Recrie/re-assine o estado pelo controller antes de avançar.',
    };
  }

  if (state.pipeline_active !== true) return { decision: 'allow' };

  // A1: don't advance while the last checkpoint is RED.
  const a1 = cpv.decideCheckpointVerdict({
    agentLeaf: leaf,
    lastVerdict: typeof state.last_checkpoint_verdict === 'string' ? state.last_checkpoint_verdict : null,
    enforce,
  });
  if (a1.decision === 'block') return a1;

  // A1b (adversarial fix): closing (final-validator) must not be reachable with a
  // batch that was checkpointed but whose verdict was NEVER recorded green — that
  // was the "skip the checkpoint entirely and close clean" hole. Report-only runs
  // (no checkpoints) are unaffected. A recorded `fail` is already caught by A1.
  // OPT-IN (PIPELINE_REQUIRE_GREEN_CLOSE=true): batch_checkpoints_done is stamped
  // unconditionally, but last_checkpoint_verdict is only populated once the
  // checkpoint-validator PRODUCER emits checkpoint-verdict.json. Until producers are
  // wired this rule would deadlock closure (checkpoints>0, verdict null), so it is
  // OFF by default and activates only when the operator opts in (producers present).
  if (leaf === 'final-validator' && process.env.PIPELINE_REQUIRE_GREEN_CLOSE === 'true') {
    const checkpoints = Number.isFinite(state.batch_checkpoints_done) ? state.batch_checkpoints_done : 0;
    const lv = typeof state.last_checkpoint_verdict === 'string' ? state.last_checkpoint_verdict : null;
    if (checkpoints > 0 && lv !== 'pass') {
      if (String(enforce).toLowerCase() === 'warn') return { decision: 'allow', warn: true };
      return {
        decision: 'block',
        reason:
          'CHECKPOINT_NOT_GREEN: este run teve checkpoint(s) de batch mas nenhum veredito ' +
          'verde registrado — não dá para FECHAR (final-validator) sem um checkpoint que ' +
          'passou. Rode o checkpoint-validator até passar antes de fechar.',
      };
    }
  }

  // A2/A3: circuit-break after N consecutive failures.
  return cfc.decideConsecutiveFailures({
    agentLeaf: leaf,
    failures: Number.isFinite(state.consecutive_checkpoint_failures) ? state.consecutive_checkpoint_failures : 0,
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
      process.stderr.write('checkpoint-verdict-gate error: ' + e.message + '\n');
      process.exit(0);
    }
  });
}

module.exports = { decide };
