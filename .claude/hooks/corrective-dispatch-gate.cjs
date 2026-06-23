#!/usr/bin/env node
'use strict';

// =============================================================================
// corrective-dispatch-gate.cjs — v8.12.0 — SPEC 006 Batch 4 — LAYER A→B bridge.
// =============================================================================
// WHAT THIS IS. A PostToolUse OBSERVER that DRAINS the arm-gate's on-disk
// corrective-trigger channel and dispatches a corrective for each REAL governed
// deny, by delegating to the COMPLETE engine lib/corrective-dispatch.cjs.
//
// WHY A DRAIN, NOT A tool_response WATCH (final-review H1 fix — SEC-2 + ARCH
// RISK-1). The producer (pipeline-arm-gate.cjs) denies at PreToolUse via
// hookSpecificOutput.permissionDecision:'deny'. A PreToolUse deny PREVENTS the
// tool from running, so NO PostToolUse event for that tool ever fires carrying the
// deny verdict in tool_response — the harness never transcribes a prior hook's
// verdict into tool_response. Keying off tool_response.decision==='block' was
// therefore DEAD-WIRED in production: Layer-A correctives fired ZERO. The real
// emission is the arm-gate's OWN deny path, which now ADDITIVELY writes a SIGNED
// corrective-trigger to .pipeline/state/corrective-triggers.jsonl. THIS observer
// drains that channel on a real PostToolUse event (which DOES fire for the next
// allowed tool — Read/Grep/the next Edit that gets through — exactly when a pending
// deny trigger should be processed), routing each fresh trigger through the engine.
// The engine ALWAYS writes the on-disk re-dispatch record to
//   <cwd>/.pipeline/state/corrective-redispatch.jsonl
// (kind:"corrective_redispatch") — the NFR5 recovery artifact that covers recovery
// even when the agent-teams (SendMessage) channel is off. The drain is at-most-once
// (a consumed-marker under a lock), so a trigger is never double-fired.
//
// BACKWARD-COMPAT tool_response PATH. The pure handler ALSO still acts on a
// directly-supplied tool_response deny shape (the shape the B4 unit fixtures feed
// handlePostToolUse). In production that shape never arrives via the harness — the
// drain is the live path — but honouring it keeps the pure handler usable by a
// caller that already holds the deny descriptor in hand.
//
// PURE OBSERVER POSTURE (it has NO tool channel of its own):
//   - NEVER blocks the harness, NEVER emits a block/deny decision, NEVER throws,
//     ALWAYS exits 0. A hook that crashes freezes the harness — so any internal
//     failure is caught and degrades to a no-op.
//   - It does NOT attempt SendMessage itself (it cannot — it has no tool access).
//     Transport selection (SendMessage primary vs on-disk fallback) is the ENGINE's
//     concern; the on-disk record is the recovery path the orchestrating context
//     (or a fresh re-dispatch) rehydrates from.
//
// SSOT REUSE (no forking): the corrective DECISION + the on-disk write + the audit
// + the idempotency ledger + the circuit breaker + the trigger producer/drain all
// live in lib/corrective-dispatch.cjs. This hook is a THIN ADAPTER.
//
// CLI ENTRY (require.main === module): read the PostToolUse JSON payload from
// stdin, call handlePostToolUse, ALWAYS process.exit(0).
// =============================================================================

// Optional require: a missing engine degrades this observer to a clean no-op
// rather than a crash (the absent engine cannot break the harness). The engine is
// shipped + complete, so the live path always finds it.
let engine = null;
try { engine = require('../../lib/corrective-dispatch.cjs'); } catch { engine = null; }

const DEFAULT_OBSERVER = 'corrective-dispatch-gate';

// The two invariants the arm-gate surfaces as a DENY (mirrors decideArmGate).
const DENY_INVARIANTS = new Set(['NOT_ARMED', 'CORRUPT_STATE']);

// ---- backward-compat deny detection (defensive: every field access guarded) ---
// A directly-supplied tool_response deny shape: tool_response.decision === 'block'
// WITH a tool_response.invariant_id in {NOT_ARMED, CORRUPT_STATE}. This is the B4
// unit-fixture path; in production the drain (below) is the live path.
function isArmDeny(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const tr = payload.tool_response;
  if (!tr || typeof tr !== 'object') return false;
  if (tr.decision !== 'block') return false;
  return typeof tr.invariant_id === 'string' && DENY_INVARIANTS.has(tr.invariant_id);
}

// Build the engine's raw signal from a directly-supplied tool_response deny shape.
// The engine sanitizes every field + derives occurrence_window from on-disk state,
// so no attacker-controlled string or window rides into the signal/record.
function buildSignal(payload) {
  const tr = payload.tool_response;
  const corrective = (tr && tr.corrective && typeof tr.corrective === 'object') ? tr.corrective : {};
  const invariantId = tr.invariant_id;
  return {
    run_id: typeof payload.run_id === 'string' ? payload.run_id : '',
    observer: typeof payload.observer === 'string' && payload.observer
      ? payload.observer
      : DEFAULT_OBSERVER,
    invariant_id: invariantId,
    agent_ref: typeof corrective.agent_ref === 'string' ? corrective.agent_ref : '',
    detail: typeof corrective.what_failed === 'string' ? corrective.what_failed : '',
    fix_instruction: typeof corrective.fix_instruction === 'string' ? corrective.fix_instruction : '',
    detected_at: new Date().toISOString(),
    // R4: a CORRUPT_STATE / NOT_ARMED gate trip is BLOCKING — honour the descriptor's
    // flag (true for an R4 gate trip); only an explicit `true` rides true.
    blocking: corrective.blocking === true,
  };
}

// ---- pure handler the unit tests call directly ------------------------------
// handlePostToolUse(payload) -> { acted, dispatched, reason, result?, drained?, ... }
//   acted      true IFF this call dispatched at least one corrective (drain OR the
//              backward-compat tool_response deny path).
//   dispatched true IFF at least one corrective was dispatched this call.
//   reason     'deny' | 'drain' | 'allow' | 'no-engine' | 'error'.
//   result     the raw dispatchCorrective(...) return (tool_response path) OR the
//              drain descriptor.
// MUST NOT throw on ANY input. The whole body is wrapped so an internal failure
// still returns a well-formed non-acting descriptor.
function handlePostToolUse(payload) {
  try {
    if (!engine) {
      return { acted: false, dispatched: false, reason: 'no-engine' };
    }
    const cwd = (payload && typeof payload.cwd === 'string' && payload.cwd) ? payload.cwd : undefined;

    // (1) BACKWARD-COMPAT: a directly-supplied tool_response deny shape (B4 fixtures).
    if (isArmDeny(payload) && typeof engine.dispatchCorrective === 'function') {
      const signal = buildSignal(payload);
      const result = engine.dispatchCorrective(signal, { cwd });
      return {
        acted: true,
        dispatched: !!(result && result.dispatched),
        reason: 'deny',
        result,
      };
    }

    // (2) LIVE PATH: drain the arm-gate's on-disk corrective-trigger channel. A real
    // PostToolUse event (for the next allowed tool) is exactly when a pending deny
    // trigger should be processed. The drain is at-most-once + engine-dedup-backed.
    if (cwd && typeof engine.drainCorrectiveTriggers === 'function') {
      const drain = engine.drainCorrectiveTriggers(cwd);
      if (drain && drain.drained > 0) {
        return {
          acted: drain.dispatched > 0,
          dispatched: drain.dispatched > 0,
          reason: 'drain',
          drained: drain.drained,
          dispatched_count: drain.dispatched,
          result: drain,
        };
      }
    }

    // Nothing to do (no deny shape, no pending trigger) → complete no-op.
    return { acted: false, dispatched: false, reason: 'allow' };
  } catch {
    // Fail-safe by construction: any internal failure → no-op, never a throw.
    return { acted: false, dispatched: false, reason: 'error' };
  }
}

// CLI entry point (form-identical to pipeline-arm-gate.cjs / machine-evidence-hook.cjs).
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(String(stdin).trim() || '{}');
      handlePostToolUse(payload);
    } catch (err) {
      // Parse/internal error → still exit 0. An observer NEVER blocks the harness.
      process.stderr.write(`corrective-dispatch-gate error: ${err && err.message ? err.message : err}\n`);
    }
    // NEVER blocks: no decision output, always exit 0.
    process.exit(0);
  });
}

module.exports = {
  handlePostToolUse,
  isArmDeny,
  buildSignal,
  DENY_INVARIANTS,
  DEFAULT_OBSERVER,
};
