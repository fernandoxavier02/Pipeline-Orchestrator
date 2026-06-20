#!/usr/bin/env node
'use strict';

// =============================================================================
// gate-log-guard.cjs — v8.7.0 — deterministic gate-logging enforcement (PURE)
// =============================================================================
// The audit trail (gate-decisions.jsonl) was prose-only: the controller was
// "supposed to" log each gate decision, but nothing in code forced it — a phase
// could transition with NO gate logged. This is the code decision: before a
// phase-transition agent is spawned, the prior phase's REQUIRED gate(s) must
// already be present in gate-decisions.jsonl. If not, the spawn is DENIED (deny
// mode) / WARNED (rollout default).
//
// PURE + deterministic. The I/O gate that reads gate-decisions.jsonl and maps a
// spawned agent leaf to its required-before set is a thin wrapper layered on top
// (.claude/hooks/gate-log-gate.cjs). NEVER throws; warn mode is the escape.
// EXACT same shape as decideStep (step-ledger.cjs) / decideFixLoop (fix-loop.cjs).
// =============================================================================

// Map: <agent-leaf> → [<gate names that must be logged before this agent spawns>].
// Seeded SMALL and conservative from references/gates.md using REAL gate names.
// Agents NOT in this map are UNGOVERNED (always allowed). When unsure whether a
// gate is truly required before an agent, leave that agent UNMAPPED rather than
// guess — a wrong mapping that blocks a legitimate spawn is worse than no mapping.
//
// Justification (each entry traceable to references/gates.md):
//  - 'executor-controller' (the 'execute' phase) runs after the TDD phase.
//    TDD_APPROVAL is HARD and mandatory for SIMPLES/MEDIA/COMPLEXA — tests must
//    be approved before implementation begins. So before execution is dispatched,
//    TDD_APPROVAL must have been logged.
//  - 'final-validator' (the 'final' Pa de Cal phase) runs after the per-batch
//    adversarial review. ADVERSARIAL_GATE is mandatory for SIMPLES+ — the final
//    validator should not run before at least one adversarial gate decision was
//    recorded (its outcome may be SKIPPED; what we require is that the DECISION
//    was logged, i.e. the gate name appears in the trail).
//  - 'plan-architect' is intentionally UNMAPPED: nothing is required before it.
const REQUIRED_GATES_BEFORE = {
  'executor-controller': ['TDD_APPROVAL'],
  'final-validator': ['ADVERSARIAL_GATE'],
};

function buildGateLogReason(agentLeaf, missing) {
  return (
    `GATE_LOG_MISSING: ${agentLeaf} requires these gate decisions logged first: ` +
    `[${missing.join(', ')}]`
  );
}

// PURE decision. ctx: { agentLeaf, loggedGates (array|Set of gate names), enforce }
function decideGateLog(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const leaf = ctx.agentLeaf;
  if (typeof leaf !== 'string' || !leaf) return { decision: 'allow' };

  const required = REQUIRED_GATES_BEFORE[leaf];
  if (!Array.isArray(required) || required.length === 0) {
    return { decision: 'allow' }; // ungoverned agent
  }

  const logged = ctx.loggedGates instanceof Set
    ? ctx.loggedGates
    : new Set(Array.isArray(ctx.loggedGates) ? ctx.loggedGates : []);
  const missing = required.filter((g) => !logged.has(g));
  if (missing.length === 0) return { decision: 'allow' };

  if (String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, missing };
  }
  return { decision: 'block', missing, reason: buildGateLogReason(leaf, missing) };
}

// Parse gate-decisions.jsonl text → Set of `gate` field values from VALID lines.
// Each line is one JSON object with a `gate` key (references/gates.md / audit-trail.md).
// Malformed lines (not JSON, no string `gate`) are ignored — never throws.
//
// Optional run-scoping (SEC-3, scope-lock-hook REFACTOR_SCOPE_LOCK check): when
// `wantRunId` is provided AND a parsed entry carries a `run_id` field, the entry is
// counted ONLY if entry.run_id === wantRunId — so a STALE / RECYCLED entry from a
// PRIOR run that happens to share the trail file cannot satisfy THIS run's scope.
// An entry WITHOUT a run_id (legacy/manual) is still counted, for backward-compat —
// path-scoping at the call site already bounds the trail to one run. When wantRunId
// is undefined (the gate-log-gate caller), behavior is identical to the 1-arg form.
function parseLoggedGates(jsonlText, wantRunId) {
  const out = new Set();
  if (typeof jsonlText !== 'string' || !jsonlText) return out;
  const want = (typeof wantRunId === 'string' && wantRunId) ? wantRunId : null;
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (obj && typeof obj === 'object' && typeof obj.gate === 'string') {
      // run_id-scoping: if we know the active run_id AND this entry is stamped with a
      // run_id, drop entries that belong to a DIFFERENT run (stale/recycled trail).
      if (want && typeof obj.run_id === 'string' && obj.run_id && obj.run_id !== want) continue;
      // Trim surrounding whitespace so a trailing space from a manual edit
      // ({"gate":"TDD_APPROVAL "}) still matches the required gate name. Case is
      // deliberately preserved — gate names are uppercase by convention and a
      // case fold could collide distinct names.
      const gate = obj.gate.trim();
      if (gate) out.add(gate);
    }
  }
  return out;
}

module.exports = { decideGateLog, parseLoggedGates, buildGateLogReason, REQUIRED_GATES_BEFORE };
