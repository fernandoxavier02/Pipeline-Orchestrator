#!/usr/bin/env node
/**
 * tests/unit/spec-sentinel-checkpoints.test.js
 *
 * Unit tests for sentinel checkpoint activation under Spec variants (Wave 3-spec, v4.11.0).
 *
 * The sentinel guard enforces that checkpoints only fire for the variant they belong to.
 * Without this guard, a non-spec pipeline could accidentally trigger spec-only validation
 * (e.g. tasks.md [x] completion check) and break flow.
 *
 * Contract:
 *   - pipeline_variant === "spec-heavy" + checkpoint === "post_format_gate"
 *       → activated=true, reason mentions "spec-heavy".
 *   - pipeline_variant === "implement-heavy" + checkpoint === "post_format_gate"
 *       → activated=false (guard prevents — not spec).
 *   - pipeline_variant === "spec-light" + checkpoint === "phase_2_to_3"
 *       → activated=true, BUT uses the OVERRIDE "post_phase_2_to_3_spec" which
 *         validates tasks.md [x] completion (not the default phase_2_to_3 logic).
 *   - pipeline_variant === "implement-heavy" + checkpoint === "phase_2_to_3"
 *       → activated=true with default behavior (no spec override).
 *
 * SSOT for the rules: references/sentinel-integration.md +
 *                     .pipeline/docs/Pre-Heavy-action/2026-05-05-v4-11-0-spec-classifier-routing/
 *                     03-pre-planner.md (briefing) → sentinel section.
 *
 * Run: node --test tests/unit/spec-sentinel-checkpoints.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Frozen SSOT: spec-only checkpoints ──────────────────────────────────────────────

const SPEC_ONLY_CHECKPOINTS = Object.freeze([
  'post_format_gate',          // verifies requirements/design/tasks parseability
  'post_phase_2_to_3_spec',    // verifies tasks.md [x] completion (override)
]);

const SPEC_VARIANTS = Object.freeze(['spec-light', 'spec-heavy', 'spec-audit-only']);

// ─── Inline spec function (RED stub) ─────────────────────────────────────────────────
//
// evaluateSentinelCheckpoints(state, checkpoint_name)
//   state: { pipeline_variant: string, ...other state fields }
//   checkpoint_name: string — name of the checkpoint being evaluated
//
// Returns:
//   { activated: bool, reason: string, override_used?: string }
//
// Rules:
//   - SPEC_ONLY_CHECKPOINTS only fire when pipeline_variant ∈ SPEC_VARIANTS.
//   - For checkpoint="phase_2_to_3" + spec variant: activate but emit
//     override_used="post_phase_2_to_3_spec".
//   - For checkpoint="phase_2_to_3" + non-spec variant: activate with default behavior
//     (no override).

function evaluateSentinelCheckpoints(state, checkpoint_name) {
  // GREEN-phase implementation (Wave 3-spec, v4.11.0).
  // Mirrors the SPEC PIPELINE CHECKPOINTS section in agents/core/sentinel.md.
  //
  // Guard: spec-only checkpoints fire ONLY when pipeline_variant ∈ SPEC_VARIANTS.
  // Override: phase_2_to_3 + spec variant uses post_phase_2_to_3_spec (validates
  //           tasks.md [x] completion instead of default phase transition).
  state            = state || {};
  const variant    = state.pipeline_variant || '';
  const isSpec     = SPEC_VARIANTS.includes(variant);

  // ─── Spec-only checkpoint requested ──────────────────────────────────────
  if (SPEC_ONLY_CHECKPOINTS.includes(checkpoint_name)) {
    if (!isSpec) {
      return {
        activated: false,
        reason: `checkpoint "${checkpoint_name}" is spec-only — guard skip (variant="${variant}" is not a spec variant)`,
      };
    }
    return {
      activated: true,
      reason: `spec-only checkpoint "${checkpoint_name}" activated for ${variant}`,
    };
  }

  // ─── Default checkpoint phase_2_to_3 with spec variant → use spec override ─
  if (checkpoint_name === 'phase_2_to_3') {
    if (isSpec) {
      return {
        activated: true,
        reason: `phase_2_to_3 activated under ${variant} — spec override engaged`,
        override_used: 'post_phase_2_to_3_spec',
      };
    }
    return {
      activated: true,
      reason: `phase_2_to_3 activated under ${variant} — default behavior`,
    };
  }

  // ─── Other checkpoints (not in scope of Wave 3-spec) — pass-through ──────
  return {
    activated: true,
    reason: `checkpoint "${checkpoint_name}" — default (out of spec scope)`,
  };
}

// ─── Exports ───────────────────────────────────────────────────────────────────────

module.exports = {
  evaluateSentinelCheckpoints,
  SPEC_ONLY_CHECKPOINTS,
  SPEC_VARIANTS,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────────

if (require.main === module) {

  // ─── Scenario 8a: spec-heavy + post_format_gate → activated ──────────────────────

  test('Scenario 8a: spec-heavy + post_format_gate → activated=true', () => {
    const result = evaluateSentinelCheckpoints(
      { pipeline_variant: 'spec-heavy' },
      'post_format_gate'
    );
    assert.equal(result.activated, true);
    assert.match(result.reason, /spec-heavy|spec/i,
      'Reason should mention the variant or spec context');
  });

  // ─── Scenario 8b: implement-heavy + post_format_gate → guarded OFF ────────────────

  test('Scenario 8b: implement-heavy + post_format_gate → activated=false (guard)', () => {
    const result = evaluateSentinelCheckpoints(
      { pipeline_variant: 'implement-heavy' },
      'post_format_gate'
    );
    assert.equal(result.activated, false,
      'Sentinel guard must prevent spec-only checkpoints from firing on non-spec variants');
    assert.match(result.reason, /not.*spec|guard|skip/i,
      'Reason should explain why the checkpoint was skipped');
  });

  // ─── Scenario 8c: spec-light + phase_2_to_3 → uses tasks.md [x] override ──────────

  test('Scenario 8c: spec-light + phase_2_to_3 → activated with spec override', () => {
    const result = evaluateSentinelCheckpoints(
      { pipeline_variant: 'spec-light' },
      'phase_2_to_3'
    );
    assert.equal(result.activated, true);
    assert.equal(result.override_used, 'post_phase_2_to_3_spec',
      'spec-light must use the spec-specific override that validates tasks.md [x] completion');
  });

  // ─── Scenario 8d: implement-heavy + phase_2_to_3 → default behavior ───────────────

  test('Scenario 8d: implement-heavy + phase_2_to_3 → activated, no override', () => {
    const result = evaluateSentinelCheckpoints(
      { pipeline_variant: 'implement-heavy' },
      'phase_2_to_3'
    );
    assert.equal(result.activated, true,
      'Default phase_2_to_3 fires for non-spec variants');
    assert.equal(result.override_used, undefined,
      'No spec override should be applied for implement-heavy');
  });

  // ─── Sanity: SSOT shapes are frozen ──────────────────────────────────────────────

  test('Sanity: SPEC_ONLY_CHECKPOINTS and SPEC_VARIANTS are frozen', () => {
    assert.ok(Object.isFrozen(SPEC_ONLY_CHECKPOINTS));
    assert.ok(Object.isFrozen(SPEC_VARIANTS));
    assert.ok(SPEC_ONLY_CHECKPOINTS.includes('post_format_gate'));
    assert.ok(SPEC_ONLY_CHECKPOINTS.includes('post_phase_2_to_3_spec'));
    assert.ok(SPEC_VARIANTS.includes('spec-light'));
    assert.ok(SPEC_VARIANTS.includes('spec-heavy'));
    assert.ok(SPEC_VARIANTS.includes('spec-audit-only'),
      'spec-audit-only must be a recognized spec variant — sentinel guard treats it as spec');
    assert.equal(SPEC_VARIANTS.length, 3,
      'SPEC_VARIANTS must contain exactly 3 entries: spec-light, spec-heavy, spec-audit-only');
  });

  // ─── Scenario 8e: spec-audit-only + post_format_gate → activated ─────────────────
  //
  // spec-audit-only is the D4 closure-audit variant. The sentinel SSOT in
  // agents/core/sentinel.md (SPEC PIPELINE CHECKPOINTS) treats it as a spec variant,
  // and `.startsWith("spec-")` matches it. The frozen SPEC_VARIANTS array must agree
  // — otherwise the test fixture silently classifies spec-audit-only as non-spec
  // (NAME-1/ARCH-2 finding from Wave 3-spec adversarial review).

  test('Scenario 8e: spec-audit-only + post_format_gate → activated=true', () => {
    const result = evaluateSentinelCheckpoints(
      { pipeline_variant: 'spec-audit-only' },
      'post_format_gate'
    );
    assert.equal(result.activated, true,
      'spec-audit-only is a spec variant — post_format_gate must fire');
    assert.match(result.reason, /spec-audit-only|spec/i,
      'Reason should mention the variant or spec context');
  });

  // ─── Scenario 8f: spec-audit-only + phase_2_to_3 → uses spec override ────────────

  test('Scenario 8f: spec-audit-only + phase_2_to_3 → activated with spec override', () => {
    const result = evaluateSentinelCheckpoints(
      { pipeline_variant: 'spec-audit-only' },
      'phase_2_to_3'
    );
    assert.equal(result.activated, true);
    assert.equal(result.override_used, 'post_phase_2_to_3_spec',
      'spec-audit-only must use the spec-specific override that validates tasks.md [x] completion');
  });

} // end if (require.main === module)
