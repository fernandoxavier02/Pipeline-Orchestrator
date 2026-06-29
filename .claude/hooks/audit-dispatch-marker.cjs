#!/usr/bin/env node
'use strict';

// =============================================================================
// audit-dispatch-marker.cjs — Batch 4 (adversarial RISK-1) — PreToolUse:Agent
// =============================================================================
// When a pipeline-orchestrator: AGENT is DISPATCHED in the governed-UNARMED
// read-only (Audit / UX Simulation) window, mark the per-arm read-ledger
// `dispatched:true` so audit-read-budget-gate.cjs EXEMPTS the dispatched agent's
// reads. The budget exists to force the PARENT to ARM/DISPATCH instead of running an
// audit forever INLINE; once it dispatches the proper agent, that agent's reads are
// legitimate. (Live failure this fixes: the dispatched adversarial reviewers were
// blocked by the parent's inline read budget — RISK-1.)
//
// This hook ONLY marks — it NEVER returns a decision, so it can never block a
// dispatch. Fail-silent: a marker must never throw into the harness.
// =============================================================================

let budget = null;
try { budget = require('../../lib/audit-read-budget.cjs'); } catch { budget = null; }
// Batch 5 (ARCH-1): depend on the SSOT lib for marker reading instead of require()'ing a
// SIBLING HOOK (pipeline-arm-gate) just to borrow its predicates — drops the hook→hook edge.
let armPending = null;
try { armPending = require('../../lib/arm-pending.cjs'); } catch { armPending = null; }

function readMarker(dir, sessionId) {
  return armPending && typeof armPending.readArmPendingMarker === 'function'
    ? armPending.readArmPendingMarker(dir, sessionId)
    : null;
}

function mark(payload) {
  try {
    if (!budget || typeof budget.markDispatched !== 'function') return;
    if (!payload || payload.tool_name !== 'Agent') return;
    const st = (payload.tool_input && payload.tool_input.subagent_type) || '';
    if (typeof st !== 'string' || !st.startsWith('pipeline-orchestrator:')) return;
    // FINAL-REVIEW SEC-1 (supersedes the Batch-4 denylist): an ALLOWLIST of the read-heavy
    // audit/review agent families the budget actually targets. The Batch-4 denylist left every
    // non-listed agent as a budget-lift vector — most dangerously the `sentinel`, which
    // dispatch-pending-gate ALWAYS permits, so dispatching it re-opened the v8.13.0 inline-audit
    // escape (mark dispatched → budget lifted → audit forever inline, zero audit agents dispatched).
    // An allowlist fails toward KEEPING the budget enforced (a non-matching agent simply doesn't
    // lift it) — the correct bias for a security gate. RISK-1 stays closed because every adversarial
    // / audit / ux / review agent the budget was wrongly blinding IS covered by these families.
    // ponytail: substring allowlist of read-heavy families; add a family only if a NEW read-heavy
    // audit/review agent type is introduced that legitimately needs the read exemption.
    // (`audit` already covers audit-intake; `intake`/`explore` are omitted because they collide
    // with brainstorm-step-00-intake / brainstorm-step-01-explore, which must NOT lift the budget.)
    if (!/(adversarial|audit|ux-|review|critic|scanner|simulator|analyzer|compliance|accessibility)/i.test(st)) return;
    const dir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
    // v8.18.0: session isolation
    const sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
    const marker = readMarker(dir, sessionId);
    if (!marker) return; // no governed window → nothing to exempt
    budget.markDispatched(dir, { requested_at: marker.requested_at, workflow: marker.workflow, type: marker.type });
  } catch { /* fail-silent — a marker must never block a dispatch */ }
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => { try { mark(JSON.parse(String(s).trim() || '{}')); } catch { /* ignore */ } process.exit(0); });
}

module.exports = { mark, readMarker };
