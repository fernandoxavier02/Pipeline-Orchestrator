#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * lib/contracts/e2e-eval.cjs — SSOT for the E2E self-evaluation harness.
 *
 * Single source of truth for the score weights, the closed glitch-kind
 * vocabulary, the process-hygiene severity map, the signed sentinel-state
 * marker names, and the path policy for the self-eval fix loop. Consumed by:
 *   - lib/e2e-evaluator.cjs                 (the pure deterministic engine)
 *   - .claude/hooks/e2e-eval-gate.cjs       (the Stop-event trigger + markers)
 *   - commands/self-eval.md                 (the parent-driven approval loop, prose)
 *   - agents/quality/e2e-evaluator-diagnostic.md (the read-only proposer, prose)
 *
 * Mirrors the lib/contracts/gate-decision.cjs pattern: plain CommonJS with
 * `// @ts-check` + JSDoc, no build step, no devDependency. Created 2026-06-26
 * for the self-improvement loop feature (plan: reactive-purring-yao).
 *
 * DESIGN NOTE: the E2E events are AUDIT-class signals derived from the run's
 * own immutable trace (step_ledger + gate-decisions.jsonl + protocol-events.jsonl).
 * This module introduces NO new GATE into references/gates.md — the Iron Law
 * (Mandatory Gates table + Gate Registry) stays untouched, exactly as the
 * BRAINSTORM_BYPASS / PLAN_MODE_BYPASS audit events did.
 *
 * @typedef {'missing_step'|'missing_gate'|'out_of_order'|'hygiene_violation'} GlitchKind
 */

const SCHEMA_VERSION = '1.0.0';

/**
 * e2e_score weights (sum = 1.0). The score is a weighted blend of four
 * sub-scores, each in [0,1]; higher = a more faithful execution. When a
 * sub-score is N/A for a run (e.g. StepCompletion for a skill-dispatched
 * report-only Audit that the agent ledger never tracked), it is DROPPED and the
 * remaining weights are renormalized — never defaulted to 1 (which would inflate)
 * nor to 0 (which would unfairly punish).
 *
 *   StepCompletion — stamped agent-steps ∩ expected ÷ expected   (step_ledger)
 *   GateCoverage   — fidelity_score (= mandatoryTriggered/Expected, reused)
 *   OrderIntegrity — chain valid ? 1 : in-order-prefix ÷ expected
 *   ProcessHygiene — 1 − min(1, Σ severity(protocol-events) ÷ cap)
 */
const SCORE_WEIGHTS = Object.freeze({
  stepCompletion: 0.30,
  gateCoverage: 0.30,
  orderIntegrity: 0.15,
  processHygiene: 0.25,
});

/** The closed glitch-kind vocabulary. Anything outside this is a programming error. */
const GLITCH_KINDS = Object.freeze({
  MISSING_STEP: 'missing_step',       // an expected agent-step was never stamped
  MISSING_GATE: 'missing_gate',       // a mandatory gate never fired in gate-decisions.jsonl
  OUT_OF_ORDER: 'out_of_order',       // stamped steps are not an in-order prefix
  HYGIENE_VIOLATION: 'hygiene_violation', // a protocol-events.jsonl audit event
});
const GLITCH_KIND_SET = new Set(Object.values(GLITCH_KINDS));

/**
 * Process-hygiene severity per protocol-event. A bypass / violation means a
 * REQUIRED workflow step was silently skipped (weight 1.0). A tamper / unsigned
 * signal is a weaker hint (0.5). Unknown events default to 0.5 (AUDIT). The cap
 * normalizes the sum: HYGIENE_SEVERITY_CAP full-weight violations drive
 * ProcessHygiene to 0.
 */
const HYGIENE_SEVERITY_CAP = 3;
const HYGIENE_DEFAULT_SEVERITY = 0.5;
const HYGIENE_EVENT_SEVERITY = Object.freeze({
  PLAN_MODE_BYPASS: 1.0,
  BRAINSTORM_BYPASS: 1.0,
  INLINE_WORK_BLOCKED: 1.0,
  SPEC_AUTHORING_INCOMPLETE: 1.0,
  SPEC_AUTHORING_STEP_BYPASS: 1.0,
  SPEC_CONTRACT_DISCIPLINE_MISSING: 1.0,
  PARALLEL_DISPATCH_VIOLATION: 1.0,
  ADVERSARIAL_EVIDENCE_MISSING: 1.0,
  PLAN_MODE_DISPATCH_PENDING: 0.5,
  BRAINSTORM_EVIDENCE_MISSING: 0.5,
  BRAINSTORM_STATE_UNSIGNED: 0.5,
  BOUNDED_CONTEXT_MISSING: 0.25,
});

/** @param {string} eventName @returns {number} severity weight in [0,1] */
function severityForEvent(eventName) {
  if (typeof eventName !== 'string' || !eventName) return HYGIENE_DEFAULT_SEVERITY;
  const v = HYGIENE_EVENT_SEVERITY[eventName.trim()];
  return typeof v === 'number' ? v : HYGIENE_DEFAULT_SEVERITY;
}

/** Map a numeric severity weight to a human label for the report / glitch. */
function severityLabel(weight) {
  if (weight >= 1.0) return 'high';
  if (weight >= 0.5) return 'medium';
  return 'low';
}

/**
 * Signed sentinel-state marker fields owned by the E2E harness. They live INSIDE
 * the HMAC-signed sentinel-state (never a side file) so they are tamper-evident,
 * via the same persist()/writeSignedState path stop-gate-hook uses.
 *
 *   e2e_eval_pending     — set when the deterministic eval found glitches and the
 *                          Stop was blocked to force the parent into /self-eval.
 *   e2e_eval_completed   — set when the self-eval loop finished (or was forced by
 *                          the continuity cap). When true, the Stop hook allows.
 *   e2e_continuity_attempts — how many times the Stop was blocked for THIS run's
 *                          eval; the cap converts a non-converging loop to allow.
 */
const MARKERS = Object.freeze({
  PENDING: 'e2e_eval_pending',
  COMPLETED: 'e2e_eval_completed',
  CONTINUITY: 'e2e_continuity_attempts',
});

/** After this many Stop blocks for the same run's eval, force-complete + allow. */
const CONTINUITY_CAP = 3;

/**
 * Path policy for the fix loop (consumed by commands/self-eval.md prose).
 *
 *   ROUTE_THROUGH_PIPELINE — a fix touching any of these is NEVER applied inline;
 *     it is handed to /pipeline-orchestrator:bugfix so it gets TDD + adversarial
 *     review + scope-lock. These are the enforcement surfaces that, if patched
 *     blind, could blind the very fiscalization that guarantees the pipeline.
 *   NEVER_AUTO_EDIT — invariants that require explicit human action, never an
 *     auto-applied or pipeline-routed fix: the gate registry and the HMAC key.
 */
const ROUTE_THROUGH_PIPELINE = Object.freeze([
  '.claude/hooks/',
  'lib/',
  'hooks/hooks.json',
  'hooks.json',
]);
const NEVER_AUTO_EDIT = Object.freeze([
  'references/gates.md',
  '.hmac-key',
]);

/** @param {unknown} kind @returns {kind is GlitchKind} */
function isGlitchKind(kind) {
  return typeof kind === 'string' && GLITCH_KIND_SET.has(kind);
}

module.exports = {
  SCHEMA_VERSION,
  SCORE_WEIGHTS,
  GLITCH_KINDS,
  GLITCH_KIND_SET,
  HYGIENE_SEVERITY_CAP,
  HYGIENE_DEFAULT_SEVERITY,
  HYGIENE_EVENT_SEVERITY,
  severityForEvent,
  severityLabel,
  MARKERS,
  CONTINUITY_CAP,
  ROUTE_THROUGH_PIPELINE,
  NEVER_AUTO_EDIT,
  isGlitchKind,
};
