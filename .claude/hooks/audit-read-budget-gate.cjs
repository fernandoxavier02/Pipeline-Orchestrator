#!/usr/bin/env node
'use strict';

// =============================================================================
// audit-read-budget-gate.cjs — v8.13.0 — PreToolUse BLOCKER (Read|Grep|Glob)
// =============================================================================
// Closes the read-only escape (see lib/audit-read-budget.cjs header). The
// pipeline-arm-gate always-allows reads so a diagnostic is never frozen; that
// lets an AUDIT / UX Simulation run be done entirely inline. This gate counts
// investigation reads in the governed-UNARMED window (via the signed ledger,
// incremented by the sibling PostToolUse counter) and DENIES the (budget+1)th
// read for the read-only-escapable types — forcing the agent to ARM the run.
//
// Pure brain = lib/audit-read-budget.cjs decideAuditReadBudget(ctx). I/O here.
// Window derivation REUSES pipeline-arm-gate exports (markerIsTampered,
// resolveArmTtlMs, runStateContext, isPipelineDocWrite, isPipelineTarget) — SSOT,
// no second scheme. Fail-OPEN on any error (never freeze the harness on a read).
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let budget = null;
try { budget = require('../../lib/audit-read-budget.cjs'); } catch { budget = null; }
let armGate = null;
try { armGate = require('./pipeline-arm-gate.cjs'); } catch { armGate = null; }

const ARM_TTL_DEFAULT_MS = 30 * 60 * 1000;

function toolNameOf(payload) {
  return typeof (payload && payload.tool_name) === 'string' ? payload.tool_name : '(unknown)';
}

// Read the signed arm-pending marker for the fields the budget needs
// (requested_at, type, workflow), honouring the SAME tamper-verify + TTL the
// arm-gate uses. The arm-gate's own readArmPending returns only {workflow}, so
// we read the marker directly here (reusing its verify + TTL helpers).
function readMarker(dir) {
  try {
    const p = path.join(dir, '.pipeline', 'pipeline-arm-pending.json');
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (armGate && typeof armGate.markerIsTampered === 'function' && armGate.markerIsTampered(m)) return null;
    const ts = Date.parse(m && m.requested_at);
    if (!Number.isFinite(ts)) return null;
    const ttl = (armGate && typeof armGate.resolveArmTtlMs === 'function') ? armGate.resolveArmTtlMs() : ARM_TTL_DEFAULT_MS;
    if (Date.now() - ts > ttl) return null;
    return {
      requested_at: m.requested_at,
      workflow: typeof m.workflow === 'string' ? m.workflow : undefined,
      type: typeof m.type === 'string' ? m.type : undefined,
    };
  } catch { return null; }
}

// A read is "coordination" (not counted, not blocked) when it targets .pipeline/
// or pipeline-runs/. Reuse the arm-gate containment check for BOTH file_path
// (Read/Grep) and path (Glob/Grep).
function isAlignedRead(payload, dir) {
  if (!armGate || typeof armGate.isPipelineDocWrite !== 'function') return false;
  const ti = (payload && payload.tool_input) || {};
  for (const f of [ti.file_path, ti.path]) {
    if (typeof f === 'string' && f) {
      try { if (armGate.isPipelineDocWrite({ tool_input: { file_path: f } }, dir)) return true; } catch { /* ignore */ }
    }
  }
  // also exempt an Agent/Skill pipeline target (defensive — matcher is reads, but
  // keep parity with the arm-gate's pipelineAligned).
  if (typeof armGate.isPipelineTarget === 'function') {
    try { if (armGate.isPipelineTarget(payload)) return true; } catch { /* ignore */ }
  }
  return false;
}

function gatherContext(payload) {
  if (!payload || typeof payload !== 'object' || !budget) return null;
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return null;
  const marker = readMarker(dir);
  if (!marker) return { toolName: toolNameOf(payload), armPending: false };
  const rs = (armGate && typeof armGate.runStateContext === 'function')
    ? armGate.runStateContext(dir) : { runActive: false, corrupt: false };
  const budgeted = budget.READ_ONLY_ESCAPABLE_TYPES.has(marker.type);
  const armId = budget.armIdFor(marker.requested_at);
  const ledger = budget.readLedger(dir, armId);
  return {
    toolName: toolNameOf(payload),
    armPending: true,
    runActive: rs.runActive,
    budgeted,
    pipelineAligned: isAlignedRead(payload, dir),
    count: ledger.count,
    budget: budget.resolveReadBudget(),
    enforce: budget.resolveAuditEnforce(),
    workflow: marker.workflow,
  };
}

function handlePreToolUse(payload) {
  if (!budget) return { decision: 'allow' };
  const ctx = gatherContext(payload);
  if (!ctx) return { decision: 'allow' };
  return budget.decideAuditReadBudget(ctx);
}

function toHookOutput(result) {
  if (result && result.decision === 'block') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.reason,
      },
    };
  }
  return null;
}

if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (c) => { stdin += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const out = toHookOutput(handlePreToolUse(payload));
      if (out) process.stdout.write(JSON.stringify(out));
      process.exit(0);
    } catch (err) {
      // Fail-OPEN: never freeze the harness on a bad payload or internal error.
      process.stderr.write(`audit-read-budget-gate error: ${err.message}\n`);
      process.exit(0);
    }
  });
}

module.exports = { readMarker, isAlignedRead, gatherContext, handlePreToolUse, toHookOutput };
