#!/usr/bin/env node
/**
 * tests/unit/spec-routing-dispatch.test.js
 *
 * Unit tests for the Spec-aware dispatch / routing logic (Wave 3-spec, v4.11.0).
 *
 * Once the classifier emits an `orchestrator_decision` with a pipeline_variant, the
 * dispatch layer is responsible for invoking the right Skill with the right args:
 *
 *   - pipeline_variant starts with "spec-" → invoke pipeline-orchestrator:<variant>
 *     and pass spec_context THROUGH untouched (so downstream agents read requirements/
 *     design/tasks without re-loading).
 *   - pipeline_variant === "audit-light"   → invoke audit skill (UNCHANGED, no spec dispatch).
 *   - pipeline_variant === "bugfix-light"  → invoke bugfix skill (UNCHANGED).
 *
 * The contract is: spec dispatch is ADDITIVE. Existing variants must keep working
 * exactly as before — no regressions.
 *
 * The routeVariant() function below is the executable specification — left as a
 * throwing stub so the runner reports concrete RED failures until Phase 2.
 *
 * SSOT for the rules: .pipeline/docs/Pre-Heavy-action/2026-05-05-v4-11-0-spec-classifier-routing/
 *                     03-pre-planner.md (briefing) → routing/dispatch section.
 *
 * Run: node --test tests/unit/spec-routing-dispatch.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Frozen SSOT: skill name prefix ──────────────────────────────────────────────────

const SKILL_PREFIX = 'pipeline-orchestrator:';

// ─── Inline spec function (RED stub) ─────────────────────────────────────────────────
//
// routeVariant(orchestrator_decision)
//   orchestrator_decision: {
//     type, complexity, pipeline_variant, spec_context, signal_used, flags_emitted
//   }
//
// Returns:
//   { skill_invoked: string, args_passed: object }
//
// Contract:
//   - "spec-*" variants → skill_invoked = "pipeline-orchestrator:<variant>"
//                          args_passed.spec_context === decision.spec_context (intact)
//   - "audit-light"     → skill_invoked = "pipeline-orchestrator:audit-light"
//                          args_passed has NO spec_context
//   - "bugfix-light"    → skill_invoked = "pipeline-orchestrator:bugfix-light"
//                          args_passed has NO spec_context
//   - any "spec-*" without spec_context is a programming error (defensive throw allowed,
//     but for now we just assert that args.spec_context is whatever the decision carries).

function routeVariant(orchestrator_decision) {
  // GREEN-phase implementation (Wave 3-spec, v4.11.0).
  // Mirrors the dispatch block documented in agents/core/pipeline-controller.md
  // Phase 2 — additive spec routing (3 spec-* variants → spec skill; existing
  // bugfix/audit/feature variants pass through untouched).
  //
  // Routing key: pipeline_variant string (NOT type field — see "Sanity" test).
  const decision = orchestrator_decision || {};
  const variant  = decision.pipeline_variant;

  // ─── Spec dispatch path ───────────────────────────────────────────────────
  if (typeof variant === 'string' && variant.startsWith('spec-')) {
    return {
      skill_invoked: `${SKILL_PREFIX}${variant}`,
      args_passed: {
        // spec_context passes THROUGH untouched (by reference, not deep-cloned).
        spec_context: decision.spec_context,
        // Carry the rest of the decision so downstream agents can read classification.
        type:                decision.type,
        complexity:          decision.complexity,
        pipeline_variant:    variant,
        signal_used:         decision.signal_used,
        flags_emitted:       decision.flags_emitted,
      },
    };
  }

  // ─── Existing variants (UNCHANGED behavior) ──────────────────────────────
  // No spec_context contamination — args_passed has NO spec_context key at all.
  return {
    skill_invoked: `${SKILL_PREFIX}${variant}`,
    args_passed: {
      type:             decision.type,
      complexity:       decision.complexity,
      pipeline_variant: variant,
    },
  };
}

// ─── Exports ───────────────────────────────────────────────────────────────────────

module.exports = {
  routeVariant,
  SKILL_PREFIX,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────────

if (require.main === module) {

  // ─── Scenario 6: spec-* variants invoke spec skill with spec_context intact ──────

  test('Scenario 6a: spec-heavy variant → invokes pipeline-orchestrator:spec-heavy', () => {
    const specCtx = {
      path: '.specs/auth/',
      requirements: '# Requirements ...',
      design:       '# Design ...',
      tasks:        '# Tasks ...',
      acceptance_criteria: ['AC1', 'AC2'],
    };
    const decision = {
      type: 'Spec',
      complexity: 'HEAVY',
      pipeline_variant: 'spec-heavy',
      spec_context: specCtx,
      signal_used: 'signal_1_explicit_path',
      flags_emitted: [],
    };
    const result = routeVariant(decision);
    assert.equal(result.skill_invoked, `${SKILL_PREFIX}spec-heavy`);
    // spec_context must pass through BY REFERENCE (same object), not deep-cloned and lost.
    assert.equal(result.args_passed.spec_context, specCtx,
      'spec_context must be passed through intact to the spec-heavy skill');
  });

  test('Scenario 6b: spec-light variant → invokes pipeline-orchestrator:spec-light', () => {
    const specCtx = {
      path: '.specs/feature-x/',
      requirements: '...',
      design: '...',
      tasks: '...',
      acceptance_criteria: ['AC1'],
    };
    const decision = {
      type: 'Spec',
      complexity: 'SIMPLES',
      pipeline_variant: 'spec-light',
      spec_context: specCtx,
      signal_used: 'signal_2_flag',
      flags_emitted: [],
    };
    const result = routeVariant(decision);
    assert.equal(result.skill_invoked, `${SKILL_PREFIX}spec-light`);
    assert.deepStrictEqual(result.args_passed.spec_context, specCtx,
      'spec-light variant must also receive spec_context intact');
  });

  // ─── Scenario 7: existing variants must NOT enter spec dispatch path ─────────────

  test('Scenario 7a: audit-light variant → invokes audit skill (no spec_context)', () => {
    const decision = {
      type: 'Audit',
      complexity: 'SIMPLES',
      pipeline_variant: 'audit-light',
      spec_context: null,
      signal_used: null,
      flags_emitted: [],
    };
    const result = routeVariant(decision);
    assert.equal(result.skill_invoked, `${SKILL_PREFIX}audit-light`);
    assert.equal(result.args_passed.spec_context, undefined,
      'audit-light args must NOT carry a spec_context (would imply spec dispatch contamination)');
  });

  test('Scenario 7b: bugfix-light variant → invokes bugfix skill (no spec_context)', () => {
    const decision = {
      type: 'Bug Fix',
      complexity: 'SIMPLES',
      pipeline_variant: 'bugfix-light',
      spec_context: null,
      signal_used: null,
      flags_emitted: [],
    };
    const result = routeVariant(decision);
    assert.equal(result.skill_invoked, `${SKILL_PREFIX}bugfix-light`);
    assert.equal(result.args_passed.spec_context, undefined,
      'bugfix-light args must NOT carry a spec_context');
  });

  // ─── Sanity: variant prefix detection is the discriminator, not the type field ──

  test('Sanity: variant string discriminates dispatch (not the type field)', () => {
    // Even if someone passes type='Spec' but variant='audit-light' (programming bug
    // upstream), routing follows VARIANT, not type. This locks the contract.
    const decision = {
      type: 'Spec',                       // misclassified upstream
      complexity: 'SIMPLES',
      pipeline_variant: 'audit-light',    // but variant says audit-light
      spec_context: null,
      signal_used: null,
      flags_emitted: [],
    };
    const result = routeVariant(decision);
    assert.equal(result.skill_invoked, `${SKILL_PREFIX}audit-light`,
      'Routing must follow pipeline_variant string, not the type field');
  });

} // end if (require.main === module)
