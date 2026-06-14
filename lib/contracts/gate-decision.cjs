#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * lib/contracts/gate-decision.cjs — SSOT for the gate-decisions.jsonl schema.
 *
 * Single source of truth for the canonical decision vocabulary, hardness
 * vocabulary, schema version, and the full allowed-key set of a
 * GateDecisionEntry. Consumed by:
 *   - lib/gate-decision-writer.cjs   (write-side enum enforcement)
 *   - lib/jsonl-sanitizer.cjs        (allowed-key filtering)
 *   - lib/fidelity-reporter.cjs      (read-side validation)
 *   - agents/core/final-validator.md (parse rules, prose)
 *   - agents/core/pipeline-controller.md + references/audit-trail.md (prose)
 *
 * Created 2026-06-14 (Phase 1 of the contract-enforcement plan) to kill the
 * schema drift documented in
 * docs/audits/2026-06-14-typescript-contract-enforcement/01-audit-verdict.md:
 * the v7.1.0 writer emits 13 keys per line (8 base + 5 correlation), but the
 * prose parse-rules in three core files still demanded "exactly these 8 keys"
 * and looked for a non-canonical `RESOLVED` decision the writer never emits.
 *
 * This module is plain CommonJS with `// @ts-check` + JSDoc — no build step,
 * no devDependency, no .cts compilation. The runtime guarantee comes from the
 * `throw TypeError` in the writer, not from static types.
 *
 * @typedef {'BLOCKED'|'DISPATCHED'|'SKIPPED'|'APPROVED'|'CONFIRMED'|'REJECTED'|'TRIGGERED'|'NOT_TRIGGERED'} GateDecision
 * @typedef {'MANDATORY'|'HARD'|'CIRCUIT_BREAKER'|'SOFT'|'AUDIT'} GateHardness
 */

// Schema version of a gate-decisions.jsonl line. Bump on any payload-field
// change. Kept in lock-step with gate-decision-writer.cjs (which re-exports it).
const SCHEMA_VERSION = '1';

/**
 * The 8-value canonical decision vocabulary, in 3 buckets:
 *   runtime_emitted:    BLOCKED, DISPATCHED, SKIPPED
 *   user_gate_resolved: APPROVED, CONFIRMED, REJECTED
 *   pipeline_outcome:   TRIGGERED, NOT_TRIGGERED
 * Anything outside this set is a write-time TypeError in the writer.
 * Note: `RESOLVED` is intentionally NOT a member — historical prose referenced
 * it but the writer never emitted it (see audit verdict §1.1).
 */
const CANONICAL_DECISIONS = new Set([
  'BLOCKED',
  'DISPATCHED',
  'SKIPPED',
  'APPROVED',
  'CONFIRMED',
  'REJECTED',
  'TRIGGERED',
  'NOT_TRIGGERED',
]);

/** The 5-class hardness vocabulary (matches references/gates.md). */
const CANONICAL_HARDNESS = new Set([
  'MANDATORY',
  'HARD',
  'CIRCUIT_BREAKER',
  'SOFT',
  'AUDIT',
]);

/** The 8 base event fields present on every GateDecisionEntry since v6.0.0. */
const BASE_GATE_DECISION_KEYS = Object.freeze([
  'gate', 'hardness', 'phase', 'decision', 'decided_by',
  'timestamp', 'detail', 'confidence_impact',
]);

/**
 * The 5 correlation-envelope fields injected by gate-decision-writer.cjs
 * since v7.1.0. They allow aggregate analytics across runs without folder-path
 * joins. A line carrying these is canonical, NOT anomalous.
 */
const CORRELATION_KEYS = Object.freeze([
  'run_id', 'plugin_version', 'schema_version', 'type', 'complexity',
]);

/**
 * The full canonical key set of a GateDecisionEntry: 8 base + 5 correlation.
 * A line whose keys are a subset of this is conformant. A line with keys
 * OUTSIDE this set is anomalous. A line missing the correlation envelope is
 * legacy (pre-v7.1.0) — acceptable with a warning, not a fatal anomaly.
 */
const ALLOWED_GATE_DECISION_KEYS = Object.freeze([
  ...BASE_GATE_DECISION_KEYS,
  ...CORRELATION_KEYS,
]);

/**
 * @param {unknown} decision
 * @returns {decision is GateDecision}
 */
function isCanonicalDecision(decision) {
  return typeof decision === 'string' && CANONICAL_DECISIONS.has(decision);
}

/**
 * @param {unknown} hardness
 * @returns {hardness is GateHardness}
 */
function isCanonicalHardness(hardness) {
  return typeof hardness === 'string' && CANONICAL_HARDNESS.has(hardness);
}

module.exports = {
  SCHEMA_VERSION,
  CANONICAL_DECISIONS,
  CANONICAL_HARDNESS,
  BASE_GATE_DECISION_KEYS,
  CORRELATION_KEYS,
  ALLOWED_GATE_DECISION_KEYS,
  isCanonicalDecision,
  isCanonicalHardness,
};
