#!/usr/bin/env node
'use strict';

// =============================================================================
// step-ledger-gate.cjs — v8.7.0 (PreToolUse:Agent)
// =============================================================================
// Enforces phase/step ORDER on agent spawns: an agent that marks step N is
// denied until every required step before N is stamped in the run's signed
// state (state.step_ledger). One gate for pipeline / spec / brainstorm via
// lib/step-ledger.cjs manifests.
//
// SAFE BY CONSTRUCTION:
//  - inert until stamping is wired: only enforces when state.step_ledger is an
//    array (absent → allow, migration-tolerant);
//  - only acts on an ACTIVE run (pipeline_active === true);
//  - ungoverned agents (sentinel, executor sub-agents, …) always allowed;
//  - default ROLLOUT mode = deny (the agent→step map now covers every workflow
//    and has been dogfooded; escape to PIPELINE_STEP_LEDGER_ENFORCEMENT=warn);
//  - fail-open on missing/corrupt state or any error.
// =============================================================================

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let ledger = null;
try { ledger = require('../../lib/step-ledger.cjs'); } catch { ledger = null; }
let fixLoop = null;
let FIX_LOOP_DEFAULT_MAX = 3;
try {
  fixLoop = require('../../lib/fix-loop.cjs');
  if (fixLoop && Number.isFinite(fixLoop.DEFAULT_MAX) && fixLoop.DEFAULT_MAX > 0) {
    FIX_LOOP_DEFAULT_MAX = fixLoop.DEFAULT_MAX;
  }
} catch { fixLoop = null; }

function workflowKeyFromState(state) {
  if (state && typeof state.workflow_key === 'string' && state.workflow_key) return state.workflow_key;
  if (state && state.task_type === 'Spec') return 'Spec';
  return 'FULL';
}

function decide(payload) {
  if (!ledger || typeof ledger.decideAgentSpawn !== 'function') return { decision: 'allow' };
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name !== 'Agent') return { decision: 'allow' };
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return { decision: 'allow' };

  let state;
  try { state = eg && eg.findActiveSentinelState(dir); } catch { return { decision: 'allow' }; }
  if (!state || (eg && state === eg.CORRUPT_SENTINEL)) return { decision: 'allow' };
  if (state.pipeline_active !== true) return { decision: 'allow' };

  const ti = payload.tool_input || {};
  const leaf = String(ti.subagent_type || '').split(':').pop();

  // Fix-loop cap (independent of the step ledger): deny the (max+1)th executor-fix.
  if (leaf === 'executor-fix' && fixLoop && typeof fixLoop.decideFixLoop === 'function') {
    // Clamp the in-state cap to the lib default — a big number in state must NOT
    // be able to defeat the loop-breaker (HIGH-2). State can only LOWER the cap.
    const stateMax = (Number.isFinite(state.fix_loop_max) && state.fix_loop_max > 0)
      ? state.fix_loop_max
      : FIX_LOOP_DEFAULT_MAX;
    return fixLoop.decideFixLoop({
      attempts: Number.isFinite(state.fix_loop_attempts) ? state.fix_loop_attempts : 0,
      max: Math.min(stateMax, FIX_LOOP_DEFAULT_MAX),
      enforce: process.env.PIPELINE_FIX_LOOP_ENFORCEMENT || 'deny',
    });
  }

  // Step order (inert until step_ledger is stamped).
  if (!Array.isArray(state.step_ledger)) return { decision: 'allow' };
  return ledger.decideAgentSpawn({
    workflowKey: workflowKeyFromState(state),
    agentType: ti.subagent_type,
    stampedSteps: state.step_ledger,
    enforce: process.env.PIPELINE_STEP_LEDGER_ENFORCEMENT || 'deny',
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
      process.stderr.write('step-ledger-gate error: ' + e.message + '\n');
      process.exit(0);
    }
  });
}

module.exports = { decide, workflowKeyFromState };
