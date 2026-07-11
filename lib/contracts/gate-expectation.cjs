#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * lib/contracts/gate-expectation.cjs — PURE LEAF (zero require of lib/).
 *
 * SSOT for the gate-expectation ruler (v2): the frozen 3-class gate taxonomy and
 * the pure `recalibratedExpectedGates` selector that filters a caller-injected
 * baseSet down to the gates a run should ACTUALLY be measured against, given the
 * run's failure contexts and reached phases.
 *
 * Created 2026-07-09 (Slice S2, task 3.2) per
 * `.kiro/specs/workflow-audit-remediation/design.md` "GateExpectation — contrato
 * (bloco completo)". Contract pinned by `tests/regression/v8.21.0/F1_*`.
 *
 * Consumed downstream (Batches 2/3 — WIRED):
 *   - lib/e2e-evaluator.cjs   (evaluator wiring, task 3.3)  — imports RULER_VERSION +
 *     recalibratedExpectedGates and recalibrates the expected gate set per run
 *   - lib/fidelity-reporter.cjs (reporter wiring, task 3.4) — shares the selector via
 *     the evaluator-threaded recalibratedExpected (its useRecalibrated branch)
 *
 * D6 — RULER_VERSION is DEFINED here once and EXPORTED; downstream consumers
 * IMPORT it rather than re-hardcoding '2' (single source of truth, no duplication).
 *
 * PURITY GUARANTEES: no IO, no hidden state, no input mutation, deterministic.
 * The baseSet is INJECTED by the caller (who calls mandatorySetFor) — the leaf
 * never reaches into lib/, which is what keeps it cycle-free.
 *
 * @typedef {'happy-path'|'exception-only'|'phase-conditional'} GateClass
 * @typedef {'sealed'|'closed_go'|'hard_failed'|'aborted'} TerminalStage
 */

// Ruler version stamp. Bump on any change to the taxonomy or selector semantics.
// SSOT — imported (not duplicated) by the evaluator + reporter.
const RULER_VERSION = '2';

/**
 * Frozen: gate name -> GateClass. Covers 1:1 the UNION of
 * MANDATORY_GATES_BY_COMPLEXITY (26 gates: SIMPLES 11 + MEDIA +2 + COMPLEXA +5 +
 * SPEC +6 + SPEC_AUTHORING +2). Every mandatory gate has an EXPLICIT class — the
 * conservative unknown->happy-path default (in the selector) must never mask a
 * forgotten classification (pinned by F1-10 parity). A gate absent from this map
 * is treated as 'happy-path' (conservative: stays required, never silently dropped).
 *
 * @type {Readonly<Record<string, GateClass>>}
 */
const GATE_CLASS = Object.freeze({
  // --- 6 happy-path (expected unconditionally on a clean run) --------------
  COMPLEXITY_GATE: 'happy-path',
  TDD_APPROVAL: 'happy-path',
  ADVERSARIAL_GATE: 'happy-path',
  CLOSEOUT_CONFIRM: 'happy-path',
  SPEC_SEALED: 'happy-path',
  SPEC_REVIEW_FINDINGS: 'happy-path',

  // --- 17 exception-only (expected IFF failureContexts carries the gate) ---
  STATE_FILE_INIT_FAIL: 'exception-only',
  INFO_GATE_BLOCKED: 'exception-only',
  CHECKPOINT_FAIL: 'exception-only',
  PLAN_REJECTED: 'exception-only',
  ADVERSARIAL_BLOCK: 'exception-only',
  FIX_LOOP_EXHAUSTED: 'exception-only',
  ADVERSARIAL_LOOP_BREAKER: 'exception-only',
  MICRO_GATE_GAP: 'exception-only',
  STOP_RULE: 'exception-only',
  FINAL_ADVERSARIAL_REWORK: 'exception-only',
  ADVERSARIAL_GATE_MANDATORY: 'exception-only',
  SSOT_CONFLICT: 'exception-only',
  STALE_CONTEXT: 'exception-only',
  SPEC_ARTIFACT_MISSING: 'exception-only',
  SPEC_FORMAT_GATE_FAIL: 'exception-only',
  SPEC_CONTENT_REVIEW_NOGO: 'exception-only',
  SPEC_AC_TRACEABILITY_GAP: 'exception-only',

  // --- 3 phase-conditional (expected IFF the mapped phase was reached) -----
  FINAL_ADVERSARIAL_GATE: 'phase-conditional',
  SPEC_POST_IMPL_FAIL: 'phase-conditional',
  ADVERSARIAL_LOOP_CHECKPOINT: 'phase-conditional',
});

/**
 * INTERNAL (not exported): phase-conditional gate -> the phase that must appear
 * in `phasesReached` for the gate to be expected.
 * @type {Readonly<Record<string, string>>}
 */
const PHASE_FOR_GATE = Object.freeze({
  FINAL_ADVERSARIAL_GATE: 'final',
  // BATCH-3 LANDMINE (backlog FIND-S2-02): the 'post-impl' phase below has NO
  // confirmed producer in the signed step-ledger — step-ledger.cjs manifests emit
  // no 'post-impl' value today. This mapping is INERT in THIS batch (PHASE_FOR_GATE
  // has no consumer yet), so nothing is broken now. BUT once Batch 3 (task 3.4)
  // derives `phasesReached` from the signed ledger, these 2 of the 26 gates would be
  // SILENTLY EXCLUDED from `expected` (their phase can never be reached). Batch 3
  // MUST reconcile the producer BEFORE deriving phasesReached from the ledger —
  // EITHER make step-ledger emit 'post-impl', OR remap these two gates to a phase the
  // ledger actually emits. Do NOT trust 'post-impl' to be reachable until then.
  SPEC_POST_IMPL_FAIL: 'post-impl',
  ADVERSARIAL_LOOP_CHECKPOINT: 'post-impl',
});

/**
 * Pure selector. baseSet is INJECTED (caller calls mandatorySetFor) — anti-cycle.
 *
 * Rules:
 *   - expected is always a SUBSET of baseSet (never invents a gate outside it);
 *   - 'happy-path' gate is UNCONDITIONALLY required;
 *   - 'exception-only' gate enters expected ONLY IF failureContexts includes it
 *     (EXACT NAME MATCH — documented interpretation, design.md line 149);
 *   - 'phase-conditional' gate enters expected ONLY IF its phase in phasesReached;
 *   - an UNKNOWN gate (absent from GATE_CLASS) defaults to 'happy-path'
 *     (conservative: it stays required, never silently dropped);
 *   - malformed input -> baseSet UNCHANGED + degraded:true (fail-safe: an error
 *     NEVER makes the ruler MORE permissive than today). EDGE: when the input is so
 *     unusable that baseSet itself is unreadable (null/primitive input, or a missing/
 *     non-array baseSet), the degraded fallback is an EMPTY `expected` — this is a
 *     "could-not-compute" signal, NOT an assertion that "no gate is required".
 *
 * CALLER CONTRACT (degraded semantics — load-bearing): a result carrying
 * `degraded:true` means the ruler could NOT compute an expectation from this input.
 * Callers MUST treat it as could-not-compute (e.g. fall back to the full mandatory
 * set, or surface the error) and MUST NEVER read `degraded:true` + `expected:[]` as
 * "the run is required to satisfy zero gates". Doing so would INVERT the core
 * invariant (an error making the ruler MORE permissive than today) — which this
 * contract forbids. Empty-with-degraded is the most-conservative "unknown", never
 * the most-permissive "nothing".
 *
 * @param {{ baseSet: string[], workflowKey?: string, variant?: string|null,
 *           terminalStage?: TerminalStage|null, complexity?: string|null,
 *           type?: string|null, failureContexts: string[], phasesReached?: string[] }} input
 * @returns {{ expected: string[], excluded: Array<{gate:string, class:GateClass, reason:string}>,
 *             rulerVersion: string, degraded?: boolean }}
 */
function recalibratedExpectedGates(input) {
  const hasOwn = Object.prototype.hasOwnProperty;

  // --- Degraded fail-safe: non-object input, non-array baseSet, non-array
  //     failureContexts, or a present-but-wrong-type phasesReached -> fall back to
  //     the FULL baseSet (most-demanding ruler). Never throws; never becomes more
  //     permissive than the injected baseSet.
  const isObject = input !== null && typeof input === 'object';

  // SELECTOR-LEAF-4: read every field behind an own-property guard, inside a
  // try/catch, so a throwing getter or prototype pollution can NEVER break the
  // "never throws / never trusts a non-own value" guarantee — it degrades instead.
  let baseSet;
  let failureContexts;
  let phasesReachedRaw;
  let readOk = true;
  try {
    baseSet = isObject && hasOwn.call(input, 'baseSet') ? input.baseSet : undefined;
    failureContexts = isObject && hasOwn.call(input, 'failureContexts')
      ? input.failureContexts : undefined;
    phasesReachedRaw = isObject && hasOwn.call(input, 'phasesReached')
      ? input.phasesReached : undefined;
  } catch (_e) {
    readOk = false;
  }

  // SELECTOR-LEAF-2: build the degraded FULL-baseSet copy so it never throws on an
  // exotic element (a Symbol, or an object with a throwing toString). Sort with an
  // explicit String() comparator.
  // SELECTOR-LEAF-7: the `baseSet.slice()` copy is BUILT INSIDE the try/catch too —
  // a hostile element behind a throwing getter makes `.slice()` itself throw, and
  // that copy previously ran OUTSIDE the guard (and the old catch fallback called
  // `.slice()` a SECOND time, re-throwing on the same element). On ANY failure
  // return [] — coherent with the documented "could-not-compute -> empty +
  // degraded:true" contract (empty-with-degraded is the most-conservative unknown,
  // never the most-permissive nothing).
  const degradedExpected = () => {
    if (!Array.isArray(baseSet)) return [];
    try {
      const copy = baseSet.slice();
      return copy.sort((a, b) => String(a).localeCompare(String(b)));
    } catch (_e) {
      return [];
    }
  };

  // SELECTOR-LEAF-3: a phasesReached that is PRESENT but of the wrong type (e.g. a
  // string) is degraded — symmetric with baseSet/failureContexts. A null/undefined/
  // absent phasesReached is NOT malformed and safely proceeds as [].
  const phasesReachedWrongType = phasesReachedRaw !== undefined
    && phasesReachedRaw !== null
    && !Array.isArray(phasesReachedRaw);

  if (!readOk || !isObject || !Array.isArray(baseSet)
      || !Array.isArray(failureContexts) || phasesReachedWrongType) {
    return {
      expected: degradedExpected(),
      excluded: [],
      rulerVersion: RULER_VERSION,
      degraded: true,
    };
  }

  // --- Tolerant normalization: null/undefined/absent phasesReached -> [].
  const phasesReached = Array.isArray(phasesReachedRaw) ? phasesReachedRaw : [];

  /** @type {string[]} */
  const expected = [];
  /** @type {Array<{gate:string, class:GateClass, reason:string}>} */
  const excluded = [];
  // SELECTOR-LEAF-5: set true if ANY baseSet element throws during per-gate
  // classification (see the loop's body try/catch) — a partial/degraded signal.
  // SELECTOR-LEAF-6: also set true if an element cannot even be RETRIEVED (a
  // throwing getter) — see the retrieval guard at the top of the loop.
  let degraded = false;

  // SELECTOR-LEAF-6: iterate by INDEX (not for-of) so element RETRIEVAL itself is
  // guarded. A hostile baseSet element behind a throwing getter makes the for-of
  // iterator's `.next()` throw BEFORE the body's try/catch is entered (`gate` is
  // never bound) — the exception would escape recalibratedExpectedGates uncaught,
  // breaking the documented "never throws" guarantee. baseSet is a genuine Array
  // here (Array.isArray verified above), so `.length` is a safe, non-configurable
  // own data property and index reads bypass any poisoned Symbol.iterator. Reading
  // `baseSet[i]` inside its OWN try/catch preserves the guarantee: an unreadable
  // element cannot be classified (there is no value to keep required), so it flags
  // degraded:true and is skipped — the degraded contract (could-not-compute) is the
  // authoritative fail-safe; a readable sibling is still classified normally. The
  // per-element body try/catch below is kept INTACT (it guards classification of a
  // RETRIEVED-but-exotic element, e.g. a throwing toString — SELECTOR-LEAF-5).
  for (let i = 0; i < baseSet.length; i++) {
    let gate;
    try {
      gate = baseSet[i];
    } catch (_e) {
      degraded = true;
      continue;
    }
    // SELECTOR-LEAF-5: the per-gate classification below coerces `gate` to a
    // property key (ToPropertyKey invokes toString/valueOf/Symbol.toPrimitive);
    // an exotic/malicious element can THROW there. Catch it per-element and route
    // the element through the SAME conservative default (kept required) so a single
    // bad element can never break the "never throws" guarantee nor relax the ruler.
    try {
      // Conservative default: an unknown gate stays required (happy-path).
      // SELECTOR-LEAF-1: own-property guard so a gate name colliding with an
      // inherited Object.prototype key (toString, constructor, valueOf,
      // hasOwnProperty, __proto__) can NEVER resolve to the inherited (truthy)
      // value and skip the conservative `|| 'happy-path'` fallback.
      const cls = (hasOwn.call(GATE_CLASS, gate) && GATE_CLASS[gate]) || 'happy-path';

      if (cls === 'happy-path') {
        expected.push(gate);
        continue;
      }

      if (cls === 'exception-only') {
        // EXACT NAME MATCH against the run's failure contexts.
        if (failureContexts.includes(gate)) {
          expected.push(gate);
        } else {
          excluded.push({
            gate,
            class: cls,
            reason: 'exception-only gate not in failureContexts (no matching failure occurred)',
          });
        }
        continue;
      }

      // phase-conditional: required only if its mapped phase was reached.
      // SELECTOR-LEAF-1: own-property guard mirrors the GATE_CLASS lookup so an
      // inherited-key collision can never masquerade as a real phase mapping.
      const phase = hasOwn.call(PHASE_FOR_GATE, gate) ? PHASE_FOR_GATE[gate] : undefined;
      if (phase !== undefined && phasesReached.includes(phase)) {
        expected.push(gate);
      } else {
        excluded.push({
          gate,
          class: cls,
          reason: `phase-conditional gate not expected — phase '${phase}' not in phasesReached`,
        });
      }
    } catch (_e) {
      // Unclassifiable element (threw during property-key coercion): keep it
      // required (conservative default) — NEVER drop it, which would relax the ruler.
      degraded = true;
      expected.push(gate);
    }
  }

  const result = { expected, excluded, rulerVersion: RULER_VERSION };
  if (degraded) result.degraded = true;
  return result;
}

module.exports = {
  GATE_CLASS,
  RULER_VERSION,
  recalibratedExpectedGates,
};
