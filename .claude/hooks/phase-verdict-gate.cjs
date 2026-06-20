#!/usr/bin/env node
'use strict';

// =============================================================================
// phase-verdict-gate.cjs — v8.9.0 (PreToolUse:Agent)
// =============================================================================
// Enforces audit A5-A9: deny a governed agent spawn when a stamped phase verdict
// blocks it (SSOT conflict, info-gate blocked, plan rejected, open final CRITICAL,
// NO-GO). The pure decision lives in lib/phase-verdict-guard.cjs; this is the thin
// I/O wrapper. Mirrors checkpoint-verdict-gate.cjs / batch-review-gate.cjs.
//
// SAFE BY CONSTRUCTION: active runs only; CORRUPT_SENTINEL fails CLOSED for a
// governed leaf; ungoverned agents always allowed; default deny with a warn escape;
// fail-open on missing/corrupt state or any error.
// =============================================================================

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let guard = null;
try { guard = require('../../lib/phase-verdict-guard.cjs'); } catch { guard = null; }

function decide(payload) {
  if (!guard || typeof guard.decidePhaseVerdict !== 'function') return { decision: 'allow' };
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name !== 'Agent') return { decision: 'allow' };
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return { decision: 'allow' };

  let state;
  try { state = eg && eg.findActiveSentinelState(dir); } catch { return { decision: 'allow' }; }
  if (!state) return { decision: 'allow' };

  const ti = payload.tool_input || {};
  const leaf = String(ti.subagent_type || '').split(':').pop().trim();
  if (!leaf || !guard.governedLeaves().has(leaf)) return { decision: 'allow' };

  const enforce = process.env.PIPELINE_PHASE_VERDICT_ENFORCEMENT || 'deny';

  if (eg && state === eg.CORRUPT_SENTINEL) {
    if (String(enforce).toLowerCase() === 'warn') return { decision: 'allow', warn: true };
    return {
      decision: 'block',
      reason:
        'PHASE_VERDICT_STATE_CORRUPT: o sentinel-state assinado não passa na verificação de ' +
        `integridade, então os vereditos de fase não são confiáveis e o spawn de ${leaf} é ` +
        'BLOQUEADO. Recrie/re-assine o estado pelo controller antes de prosseguir.',
    };
  }

  if (state.pipeline_active !== true) return { decision: 'allow' };

  return guard.decidePhaseVerdict({ agentLeaf: leaf, state, enforce });
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
      process.stderr.write('phase-verdict-gate error: ' + e.message + '\n');
      process.exit(0);
    }
  });
}

module.exports = { decide };
