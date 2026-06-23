#!/usr/bin/env node
'use strict';

// =============================================================================
// corrective-error-signal-gate.cjs — v8.12.0 — SPEC 006 Batch 5 — LAYER B observer.
// =============================================================================
// WHAT THIS IS. A SubagentStop OBSERVER that watches a governed subagent finish.
// On an IN-EXECUTION FAILURE VERDICT — the agent ended WITHOUT a valid
// PIPELINE_AGENT_RESULT_V1 block, OR it self-reported an error — it:
//   (1) EMITS exactly one ErrorSignal onto the on-disk channel via the SHIPPED
//       engine appendErrorSignal(cwd, signal) → .pipeline/state/error-signals.jsonl;
//   (2) then routes THAT SAME just-emitted signal (the only genuinely-fresh signal
//       THIS call produced) through the SHIPPED engine dispatchCorrective(signal,
//       { cwd }) in FIRE-AND-CONTINUE mode (returns immediately; halted:false,
//       blocking:false; writes the on-disk corrective_redispatch record). Dedup (N
//       observers of one defect → 1 corrective) and reset-on-observed-fix (a
//       recurrence in a NEW occurrence_window → a fresh corrective) are the ENGINE's
//       on-disk ledger, not new policy.
//
//   WHY NOT DRAIN-AND-RE-ROUTE THE WHOLE CHANNEL. The channel is append-only and
//   never acked/cleared, so it accumulates every signal ever written. Re-routing the
//   FULL history each call AND re-stamping every drained line with THIS call's live
//   occurrence_window would mint a NEW dedup key for an OLD already-fixed signal
//   (the ledger stored it under its old window), firing a SPURIOUS corrective for an
//   already-healthy agent — amplifying with channel length. We do NOT need the drain
//   to get dedup: the engine's on-disk ledger collapses N observers to one. The
//   channel stays the durable on-disk record (NFR5) — we WRITE to it (appendErrorSignal)
//   but never blindly re-route its accumulated history.
//
// PURE OBSERVER POSTURE (it has NO tool channel of its own):
//   - NEVER blocks the harness, NEVER emits a block/deny decision, NEVER throws,
//     ALWAYS exits 0. A clean finish (valid result block, no self-reported error) is
//     a complete no-op. Malformed / empty / missing channel degrades silently.
//
// SSOT REUSE (no forking):
//   - The corrective DECISION + the on-disk write + the audit + the idempotency
//     ledger + the circuit breaker all live in lib/corrective-dispatch.cjs. This hook
//     is a THIN ADAPTER mirroring Batch 4's corrective-dispatch-gate.cjs.
//   - The valid-result-block detection reuses the SHIPPED strict parser
//     lib/contracts/pipeline-agent-result.cjs::parseResultBlock (the SAME contract
//     subagent-stop-commit-hook.cjs keys off). A missing parser degrades to "no
//     valid block" (a failure verdict only ever errs toward EMIT, never toward a
//     false clean-finish), but the live path always finds the shipped module.
//
// RESET-ON-FIX + WINDOW PROVENANCE (CONFIRMED against the SHIPPED engine — H2 fix):
//   The engine has NO ledger-reset API. The dedup key is derived from
//   (run_id, agent_ref, invariant_id, occurrence_window). The ONLY way to get a
//   FRESH corrective for a post-fix recurrence is a DIFFERENT occurrence_window.
//   CRITICALLY, that occurrence_window is derived by the engine from AUTHORITATIVE
//   ON-DISK run state (resolveOccurrenceWindow — the run's fix-cycle/phase marker),
//   NOT from the SubagentStop payload (final-review SEC-1: a payload window is
//   attacker-influenced and would let a hostile agent collapse distinct failures to
//   one key). So the observer passes NO occurrence_window at all; the engine recomputes
//   it from disk: N re-observations within ONE fix-cycle dedup to one corrective, and a
//   recurrence AFTER the run advances to a new fix-cycle → a new on-disk window → a new
//   key → a fresh corrective. Reset-on-fix is driven by real run-state advancing.
//
// CLI ENTRY (require.main === module): read the SubagentStop JSON payload from
// stdin, call handleSubagentStop, ALWAYS process.exit(0). NEVER emit a block
// decision (it is an OBSERVER, not the commit gate). Form mirrors the CLI sections
// of corrective-dispatch-gate.cjs + machine-evidence-hook.cjs (SSOT).
// =============================================================================

// Optional require: a missing engine degrades this observer to a clean no-op rather
// than a crash (the absent engine cannot break the harness). The engine is shipped +
// complete, so the live path always finds it.
let engine = null;
try { engine = require('../../lib/corrective-dispatch.cjs'); } catch { engine = null; }

// Optional require: the SHIPPED strict result-block parser (SSOT). Its absence means
// we cannot positively confirm a clean finish, so we treat the verdict as a failure
// (emit-side bias is the safe direction for an observer); the live path always loads it.
let resultContract = null;
try { resultContract = require('../../lib/contracts/pipeline-agent-result.cjs'); } catch { resultContract = null; }

const DEFAULT_OBSERVER = 'corrective-error-signal-gate';

// The in-execution failure verdict invariant — the SAME id subagent-stop-commit-hook
// keys off for a missing/invalid result block. LAYER B (R8) is fire-and-continue.
//
// DELIBERATELY a SINGLE invariant for this observer (MEDIUM-2 disposition, R8.4):
// for a SubagentStop observer the only defect it can ever observe is "this governed
// agent finished WITHOUT a valid result" — that IS one defect class per agent per
// occurrence_window. The dedup tuple (run_id, agent_ref, invariant_id,
// occurrence_window) therefore collapses two same-window same-agent observations of
// THIS one defect class to one corrective by design (intended anti-spam; a recurrence
// in a new window still gets a fresh corrective). We do NOT mint finer invariants
// here (YAGNI) — there is no second defect class for this observer to discriminate.
const FAILURE_INVARIANT = 'SUBAGENTSTOP_RESULT_MISSING';

// ---- governance guard --------------------------------------------------------
// The observer only acts on a GOVERNED subagent finishing — that requires a non-empty
// agent_type (the finishing governed leaf). A payload with no agent_type is not a
// governed verdict at all (not-governed / malformed) → a complete no-op, never an emit.
function isGovernedVerdict(payload) {
  return !!(payload && typeof payload === 'object'
    && typeof payload.agent_type === 'string' && payload.agent_type);
}

// ---- failure-verdict detection (defensive: every field access guarded) -------
// A FAILURE VERDICT (for a governed subagent) is: last_assistant_message has NO valid
// PIPELINE_AGENT_RESULT_V1 block (parseResultBlock(...).ok === false) OR
// self_reported_error === true. A valid result block AND no self-reported error = a
// clean finish = NOT a failure. (The governance guard is checked by the caller first.)
function isFailureVerdict(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.self_reported_error === true) return true;
  const msg = payload.last_assistant_message;
  if (typeof msg !== 'string') return true; // no parseable final text → not a clean finish
  if (!resultContract || typeof resultContract.parseResultBlock !== 'function') {
    return true; // cannot confirm a clean finish → treat as a failure (emit-side bias)
  }
  const parsed = resultContract.parseResultBlock(msg);
  return !(parsed && parsed.ok === true);
}

// Build the engine's raw ErrorSignal from the SubagentStop failure payload. Strings
// pass through cleanly — the engine sanitizes (CR/LF/control strip + length cap) every
// field by construction, so no unbounded attacker-controlled string can ride into the
// signal/record.
//
// agent_ref is the DEFECT's responsible agent — the finishing governed leaf's
// agent_type — NOT the per-observer agent_id. The dedup key is derived from
// (run_id, agent_ref, invariant_id, occurrence_window): keying on agent_type makes N
// distinct observers of ONE defect (different agent_id, same agent_type) collapse to
// ONE corrective (R8.4). The observer identity (agent_id) rides in detail for audit
// only, never in the dedup tuple. The engine ALSO cross-checks on-disk state and
// prefers the authoritative disk value when present.
function buildSignal(payload) {
  const agentRef = typeof payload.agent_type === 'string' ? payload.agent_type : '';
  const observerId = (typeof payload.agent_id === 'string' && payload.agent_id)
    ? payload.agent_id : '';
  return {
    run_id: typeof payload.run_id === 'string' ? payload.run_id : '',
    observer: DEFAULT_OBSERVER,
    invariant_id: FAILURE_INVARIANT,
    agent_ref: agentRef,
    detail: observerId, // observer identity for audit only — excluded from the dedup key
    detected_at: new Date().toISOString(),
    // R8 in-execution corrective is fire-and-continue: NEVER halts, blocking:false.
    blocking: false,
    // H2 (final-review SEC-1): occurrence_window is DELIBERATELY NOT forwarded from the
    // payload. The SubagentStop payload is attacker/agent-influenced — a hostile agent
    // pinning a fixed window would collapse distinct real failures to one dedup key and
    // silence self-healing. The engine derives occurrence_window from AUTHORITATIVE
    // on-disk run state (resolveOccurrenceWindow) and IGNORES any caller-supplied value;
    // reset-on-observed-fix comes from the run-state fix-cycle marker advancing, NOT a
    // payload field. So the observer passes NO window — disk is the single source.
  };
}

// ---- pure handler the unit tests S1/S2/S4/S5 call directly -------------------
// handleSubagentStop(payload) -> { emitted, dispatched, reason, result?, dispatched_count? }
//   emitted          true IFF the verdict was a failure we emitted a signal for.
//   dispatched       true IFF the just-emitted FRESH signal was dispatched this call.
//   reason           'failure' | 'ok' | 'not-governed' | 'malformed' | 'no-engine' | 'error'.
//   result           the dispatchCorrective(...) return for the routed signal (only when emitted).
//   dispatched_count how many FRESH correctives this call routed: 0 (deduped) or 1.
//                    We route ONLY the one just-emitted signal, so the count can never
//                    over-count the channel's accumulated history (MEDIUM-1).
// MUST be fire-and-continue and MUST NOT throw on ANY input — malformed/empty/missing
// channel degrades to { emitted:false, dispatched:false } with NO record written. The
// whole body is wrapped so an internal failure still returns a well-formed descriptor.
function handleSubagentStop(payload) {
  try {
    if (!payload || typeof payload !== 'object') {
      return { emitted: false, dispatched: false, reason: 'malformed' };
    }
    if (!isGovernedVerdict(payload)) {
      // No governed agent_type → not a governed verdict → complete no-op.
      return { emitted: false, dispatched: false, reason: 'not-governed' };
    }
    if (!isFailureVerdict(payload)) {
      // A clean finish (valid result block, no self-reported error) → complete no-op.
      return { emitted: false, dispatched: false, reason: 'ok' };
    }
    const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : null;
    if (!cwd) {
      // No cwd → cannot persist the signal/ledger on disk; a failure we could not
      // record is a silent no-op (never a throw, never a halt).
      return { emitted: false, dispatched: false, reason: 'malformed' };
    }
    // M3 (final-review DEAD-1): the live path emits via appendErrorSignal and routes
    // via dispatchCorrective ONLY — it does NOT drain the channel (readErrorSignals is
    // unused here). Requiring readErrorSignals in the capability guard was a vestige of
    // the removed drain-all design: a future engine refactor dropping that now-unused
    // export would falsely degrade this hook to no-engine and silently stop correctives.
    // Require ONLY what the live path actually calls.
    if (!engine || typeof engine.appendErrorSignal !== 'function'
      || typeof engine.dispatchCorrective !== 'function') {
      return { emitted: false, dispatched: false, reason: 'no-engine' };
    }

    const signal = buildSignal(payload);

    // (1) EMIT exactly one ErrorSignal onto the on-disk channel (engine builds the
    //     signed line + derives the dedup_key; never throws). The channel remains the
    //     durable on-disk record (NFR5) — it survives a dead hot agent.
    engine.appendErrorSignal(cwd, signal);

    // (2) Route ONLY the just-emitted signal — the single genuinely-fresh signal THIS
    //     call produced — through dispatchCorrective in fire-and-continue mode. We do
    //     NOT drain-and-re-route the channel's accumulated history: re-stamping an OLD
    //     already-fixed signal with THIS call's window would mint a new dedup key the
    //     ledger lacks and fire a SPURIOUS corrective for an already-healthy agent. The
    //     just-emitted signal already carries this call's live occurrence_window, so the
    //     engine recompute yields the right key (same window → deduped; new window →
    //     fresh), and the engine's on-disk dedup ledger — NOT a channel drain — is what
    //     collapses N observers of one defect to a single dispatched:true (R8.4).
    const result = engine.dispatchCorrective(
      Object.assign({}, signal, { blocking: false }),
      { cwd },
    );
    const dispatchedCount = (result && result.dispatched === true) ? 1 : 0;

    return {
      emitted: true,
      dispatched: dispatchedCount > 0,
      dispatched_count: dispatchedCount, // 0 (deduped) or 1 — never over-counts (MEDIUM-1)
      reason: 'failure',
      // A well-formed non-blocking descriptor is always surfaced (dispatchCorrective
      // never throws and always returns one, but stay defensive).
      result: result || { halted: false, blocking: false, dispatched: false },
    };
  } catch {
    // Fire-and-continue MUST NOT throw into the run. Degrade to a well-formed
    // non-emitting, non-dispatching, non-halting descriptor.
    return { emitted: false, dispatched: false, reason: 'error' };
  }
}

// CLI entry point (form-identical to corrective-dispatch-gate.cjs / machine-evidence-hook.cjs).
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(String(stdin).trim() || '{}');
      handleSubagentStop(payload);
    } catch (err) {
      // Parse/internal error → still exit 0. An observer NEVER blocks the harness.
      process.stderr.write(`corrective-error-signal-gate error: ${err && err.message ? err.message : err}\n`);
    }
    // NEVER blocks: no decision output, always exit 0.
    process.exit(0);
  });
}

module.exports = {
  handleSubagentStop,
  isGovernedVerdict,
  isFailureVerdict,
  buildSignal,
  FAILURE_INVARIANT,
  DEFAULT_OBSERVER,
};
