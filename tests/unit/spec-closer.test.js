#!/usr/bin/env node
/**
 * tests/unit/spec-closer.test.js
 *
 * Unit tests for the spec-closer agent (Phase 3 closure).
 *
 * The agent itself is a markdown spec at agents/executor/spec-closer.md (not under
 * type-specific/ because closure is variant-agnostic).
 *
 * This test file re-implements the deterministic logic the agent is contracted to follow:
 *
 *   - Progressive scoring (NOT weighted_sum) per phase.
 *   - 6 phases sum to exactly 100 in the PASS column.
 *   - Phase 1 / Phase 2 FAIL → STOP (no score computation).
 *   - Audit-only mode skips phase 3 (Implementation), max raw = 75, normalized = (raw/75)*100.
 *   - Grade label tiers with explicit boundary semantics at 90, 75, 50.
 *
 * The closeoutSpec() function below is the executable specification. If the agent's prose
 * drifts from this logic, this test breaks — that is intentional (executable contract).
 *
 * SSOT for the scoring table: agents/executor/spec-closer.md → "Progressive Scoring".
 * Re-resolved in: .specs/plans/spec-workflow-integration.open-questions-resolved.md Q3.
 * Original source: D:/Projeto Pulsar/.claude/.../HEAVY_08_CONFIDENCE_DASHBOARD.md (lines 33-48).
 *
 * Run: node tests/unit/spec-closer.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Progressive scoring table (frozen SSOT, no inline magic numbers elsewhere) ──────

const PROGRESSIVE_SCORING = Object.freeze({
  phase_1:  Object.freeze({ PASS: 15, WARN: 10, FAIL: 'STOP' }),
  phase_2:  Object.freeze({ PASS: 20, WARN: 15, FAIL: 'STOP' }),
  phase_3:  Object.freeze({ PASS: 25, WARN: 20, FAIL: 5      }),
  phase_4a: Object.freeze({ PASS: 25, WARN: 18, FAIL: 5      }),
  phase_4b: Object.freeze({ PASS: 10, WARN: 7,  FAIL: 2      }),
  phase_4c: Object.freeze({ PASS: 5,  WARN: 3,  FAIL: 0      }),
});

// Phases included in each mode.
const FULL_MODE_PHASES     = Object.freeze(['phase_1', 'phase_2', 'phase_3', 'phase_4a', 'phase_4b', 'phase_4c']);
const AUDIT_ONLY_PHASES    = Object.freeze(['phase_1', 'phase_2', 'phase_4a', 'phase_4b', 'phase_4c']);

// Audit-only normalization: max raw = 75 (no phase_3), final = (raw/75)*100.
const AUDIT_ONLY_MAX_RAW = 75;
const FULL_MODE_MAX_RAW  = 100;

const GRADE_LABELS = Object.freeze({
  PRODUCTION_READY:        'PRODUCTION READY',
  DEPLOY_WITH_MONITORING:  'DEPLOY WITH MONITORING',
  REMEDIATION_NEEDED:      'REMEDIATION NEEDED',
  NOT_READY:               'NOT READY',
});

// Tier boundaries — explicit so off-by-one is visible.
const GRADE_TIERS = Object.freeze({
  PRODUCTION_READY_MIN:        90,   // score >= 90
  DEPLOY_WITH_MONITORING_MIN:  75,   // 75 <= score < 90
  REMEDIATION_NEEDED_MIN:      50,   // 50 <= score < 75
  // < 50 → NOT READY
});

// ─── Sanity locks (executed at module load) ─────────────────────────────────────────

(() => {
  // Full mode PASS column must sum to exactly 100.
  const fullPass = FULL_MODE_PHASES.reduce((s, p) => s + PROGRESSIVE_SCORING[p].PASS, 0);
  if (fullPass !== 100) {
    throw new Error(`SSOT violation: full-mode PASS column must sum to 100, got ${fullPass}`);
  }
  // Audit-only PASS column must sum to exactly 75.
  const auditPass = AUDIT_ONLY_PHASES.reduce((s, p) => s + PROGRESSIVE_SCORING[p].PASS, 0);
  if (auditPass !== AUDIT_ONLY_MAX_RAW) {
    throw new Error(`SSOT violation: audit-only PASS column must sum to ${AUDIT_ONLY_MAX_RAW}, got ${auditPass}`);
  }
  // WARN column sanity (full): 10+15+20+18+7+3 = 73.
  const fullWarn = FULL_MODE_PHASES.reduce((s, p) => s + PROGRESSIVE_SCORING[p].WARN, 0);
  if (fullWarn !== 73) {
    throw new Error(`SSOT violation: full-mode WARN column must sum to 73, got ${fullWarn}`);
  }
  // FAIL column for phases 3..4c (since phase_1/2 FAIL → STOP).
  // 5 + 5 + 2 + 0 = 12.
  const fullFail = ['phase_3', 'phase_4a', 'phase_4b', 'phase_4c']
    .reduce((s, p) => s + PROGRESSIVE_SCORING[p].FAIL, 0);
  if (fullFail !== 12) {
    throw new Error(`SSOT violation: full-mode FAIL column (phases 3..4c) must sum to 12, got ${fullFail}`);
  }
})();

// ─── Helpers ────────────────────────────────────────────────────────────────────────

function pointsForStatus(phase, status) {
  const row = PROGRESSIVE_SCORING[phase];
  if (!row) {
    throw new Error(`Unknown phase: ${phase}`);
  }
  if (!Object.prototype.hasOwnProperty.call(row, status)) {
    throw new Error(`Unknown status "${status}" for phase ${phase}`);
  }
  return row[status]; // integer or "STOP"
}

function gradeForScore(score) {
  if (score >= GRADE_TIERS.PRODUCTION_READY_MIN) return GRADE_LABELS.PRODUCTION_READY;
  if (score >= GRADE_TIERS.DEPLOY_WITH_MONITORING_MIN) return GRADE_LABELS.DEPLOY_WITH_MONITORING;
  if (score >= GRADE_TIERS.REMEDIATION_NEEDED_MIN) return GRADE_LABELS.REMEDIATION_NEEDED;
  return GRADE_LABELS.NOT_READY;
}

// ─── Top-level: closeoutSpec ────────────────────────────────────────────────────────
//
// Inputs:
//   phaseResults: { phase_1: 'PASS'|'WARN'|'FAIL', ..., phase_4c: ... }
//                 phase_3 is omitted/ignored when mode === 'audit-only'.
//   mode: 'full' | 'audit-only'   (default 'full')
//
// Returns:
//   { decision: 'CLOSED', score, raw_score, grade, mode, phase_results: {phase: {status, points}} }
//   or
//   { decision: 'STOPPED', reason: 'phase_<n> FAIL' }
//
// Determinism: same inputs → same outputs.

function closeoutSpec({ phaseResults, mode = 'full' } = {}) {
  if (!phaseResults || typeof phaseResults !== 'object') {
    throw new Error('phaseResults is required');
  }
  if (mode !== 'full' && mode !== 'audit-only') {
    throw new Error(`Unknown mode: ${mode} (expected 'full' or 'audit-only')`);
  }

  // STOP rule for phase 1 / phase 2 FAIL — must be checked BEFORE any scoring.
  for (const phase of ['phase_1', 'phase_2']) {
    if (phaseResults[phase] === 'FAIL') {
      return {
        decision: 'STOPPED',
        reason: `${phase} FAIL`,
      };
    }
  }

  const phases = mode === 'audit-only' ? AUDIT_ONLY_PHASES : FULL_MODE_PHASES;
  const maxRaw = mode === 'audit-only' ? AUDIT_ONLY_MAX_RAW : FULL_MODE_MAX_RAW;

  const phaseResultsOut = {};
  let rawScore = 0;
  for (const phase of phases) {
    const status = phaseResults[phase];
    if (!status) {
      throw new Error(`Missing status for ${phase} in mode=${mode}`);
    }
    const pts = pointsForStatus(phase, status);
    if (pts === 'STOP') {
      // Should never reach here — phase_1/2 FAIL was filtered above. Defensive.
      return { decision: 'STOPPED', reason: `${phase} FAIL` };
    }
    phaseResultsOut[phase] = { status, points: pts };
    rawScore += pts;
  }

  // Normalize for audit-only mode so grade labels align with full-mode tiers.
  // Round to 2 decimals at the output boundary so reports/spec.json/JSONL never carry
  // platform-dependent floats like 70.66666666666667. Full mode is naturally integer.
  const finalScoreRaw = mode === 'audit-only'
    ? (rawScore / AUDIT_ONLY_MAX_RAW) * 100
    : rawScore;
  const finalScore = mode === 'audit-only'
    ? Math.round(finalScoreRaw * 100) / 100
    : finalScoreRaw;

  const grade = gradeForScore(finalScore);

  return {
    decision: 'CLOSED',
    score: finalScore,
    raw_score: rawScore,
    grade,
    mode,
    max_raw: maxRaw,
    phase_results: phaseResultsOut,
  };
}

// ─── Exports ───────────────────────────────────────────────────────────────────────

module.exports = {
  closeoutSpec,
  pointsForStatus,
  gradeForScore,
  PROGRESSIVE_SCORING,
  GRADE_LABELS,
  GRADE_TIERS,
  FULL_MODE_PHASES,
  AUDIT_ONLY_PHASES,
  AUDIT_ONLY_MAX_RAW,
  FULL_MODE_MAX_RAW,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────────

if (require.main === module) {

  test('Module shape: closeoutSpec + frozen SSOT constants', () => {
    assert.equal(typeof closeoutSpec, 'function');
    assert.ok(Object.isFrozen(PROGRESSIVE_SCORING), 'PROGRESSIVE_SCORING must be frozen');
    assert.ok(Object.isFrozen(GRADE_LABELS), 'GRADE_LABELS must be frozen');
    assert.ok(Object.isFrozen(GRADE_TIERS), 'GRADE_TIERS must be frozen');
    assert.ok(Object.isFrozen(FULL_MODE_PHASES), 'FULL_MODE_PHASES must be frozen');
    assert.ok(Object.isFrozen(AUDIT_ONLY_PHASES), 'AUDIT_ONLY_PHASES must be frozen');
    // Each row inside PROGRESSIVE_SCORING must also be frozen.
    for (const phase of FULL_MODE_PHASES) {
      assert.ok(Object.isFrozen(PROGRESSIVE_SCORING[phase]), `PROGRESSIVE_SCORING.${phase} must be frozen`);
    }
  });

  // Test 1: All-PASS full mode → exactly 100, PRODUCTION READY.
  test('Case 1: all-PASS full mode → score 100, grade PRODUCTION READY', () => {
    const result = closeoutSpec({
      phaseResults: {
        phase_1: 'PASS', phase_2: 'PASS', phase_3: 'PASS',
        phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'full',
    });
    assert.equal(result.decision, 'CLOSED');
    assert.equal(result.score, 100);          // 15+20+25+25+10+5 = 100
    assert.equal(result.raw_score, 100);
    assert.equal(result.grade, 'PRODUCTION READY');
    assert.equal(result.mode, 'full');
    // Per-phase points reflected in output.
    assert.equal(result.phase_results.phase_1.points, 15);
    assert.equal(result.phase_results.phase_4a.points, 25);
    assert.equal(result.phase_results.phase_4c.points, 5);
  });

  // Test 2: All-WARN full mode → exactly 73, REMEDIATION NEEDED (50 <= 73 < 75).
  test('Case 2: all-WARN full mode → score 73, grade REMEDIATION NEEDED', () => {
    const result = closeoutSpec({
      phaseResults: {
        phase_1: 'WARN', phase_2: 'WARN', phase_3: 'WARN',
        phase_4a: 'WARN', phase_4b: 'WARN', phase_4c: 'WARN',
      },
      mode: 'full',
    });
    assert.equal(result.decision, 'CLOSED');
    assert.equal(result.score, 73);           // 10+15+20+18+7+3 = 73
    assert.equal(result.raw_score, 73);
    assert.equal(result.grade, 'REMEDIATION NEEDED');
  });

  // Test 3: Mixed PASS+WARN → 93, PRODUCTION READY.
  test('Case 3: mixed PASS+WARN full mode → score 93, grade PRODUCTION READY', () => {
    // Per task spec: 15(P) + 20(P) + 25(P) + 18(W) + 10(P) + 5(P) = 93.
    const result = closeoutSpec({
      phaseResults: {
        phase_1: 'PASS', phase_2: 'PASS', phase_3: 'PASS',
        phase_4a: 'WARN', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'full',
    });
    assert.equal(result.score, 93);
    assert.equal(result.raw_score, 93);
    assert.equal(result.grade, 'PRODUCTION READY');
  });

  // Test 4: Audit-only normalization, all-PASS → raw=75, normalized=100, PRODUCTION READY.
  test('Case 4: all-PASS audit-only → raw 75, normalized 100, grade PRODUCTION READY', () => {
    const result = closeoutSpec({
      phaseResults: {
        phase_1: 'PASS', phase_2: 'PASS',
        phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'audit-only',
    });
    assert.equal(result.decision, 'CLOSED');
    assert.equal(result.raw_score, 75);       // 15+20+25+10+5 = 75
    assert.equal(result.score, 100);          // (75/75)*100 = 100
    assert.equal(result.grade, 'PRODUCTION READY');
    assert.equal(result.mode, 'audit-only');
    assert.equal(result.max_raw, 75);
    // phase_3 must NOT appear in audit-only output.
    assert.equal(result.phase_results.phase_3, undefined);
  });

  // Test 5: Audit-only with WARN → raw=53, normalized=70.67 (rounded), grade REMEDIATION NEEDED.
  test('Case 5: all-WARN audit-only → raw 53, normalized 70.67, grade REMEDIATION NEEDED', () => {
    const result = closeoutSpec({
      phaseResults: {
        phase_1: 'WARN', phase_2: 'WARN',
        phase_4a: 'WARN', phase_4b: 'WARN', phase_4c: 'WARN',
      },
      mode: 'audit-only',
    });
    assert.equal(result.raw_score, 53);       // 10+15+18+7+3 = 53
    // (53/75)*100 = 70.6666... — rounded to 2 decimals at output boundary → 70.67.
    assert.equal(result.score, 70.67);
    assert.ok(result.score > 70 && result.score < 71, `expected score in (70, 71), got ${result.score}`);
    // 50 <= 70.67 < 75 → REMEDIATION NEEDED.
    assert.equal(result.grade, 'REMEDIATION NEEDED');
  });

  // Test 6: Boundary tests for grade thresholds — off-by-one bug surface.
  test('Case 6: grade boundaries 90/89, 75/74, 50/49', () => {
    // gradeForScore is the helper; test each exact decimal.
    assert.equal(gradeForScore(90),    'PRODUCTION READY',       'score=90 must be PRODUCTION READY');
    assert.equal(gradeForScore(89),    'DEPLOY WITH MONITORING', 'score=89 must be DEPLOY WITH MONITORING');
    assert.equal(gradeForScore(89.99), 'DEPLOY WITH MONITORING', 'score=89.99 must be DEPLOY WITH MONITORING');
    assert.equal(gradeForScore(75),    'DEPLOY WITH MONITORING', 'score=75 must be DEPLOY WITH MONITORING');
    assert.equal(gradeForScore(74),    'REMEDIATION NEEDED',     'score=74 must be REMEDIATION NEEDED');
    assert.equal(gradeForScore(74.99), 'REMEDIATION NEEDED',     'score=74.99 must be REMEDIATION NEEDED');
    assert.equal(gradeForScore(50),    'REMEDIATION NEEDED',     'score=50 must be REMEDIATION NEEDED');
    assert.equal(gradeForScore(49),    'NOT READY',              'score=49 must be NOT READY');
    assert.equal(gradeForScore(49.99), 'NOT READY',              'score=49.99 must be NOT READY');
    assert.equal(gradeForScore(0),     'NOT READY');
    assert.equal(gradeForScore(100),   'PRODUCTION READY');
  });

  // Test 7: STOP-on-FAIL — phase_1=FAIL OR phase_2=FAIL → return STOPPED, no score.
  test('Case 7: phase_1=FAIL or phase_2=FAIL → decision STOPPED, no score computed', () => {
    // phase_1 FAIL.
    const r1 = closeoutSpec({
      phaseResults: {
        phase_1: 'FAIL', phase_2: 'PASS', phase_3: 'PASS',
        phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'full',
    });
    assert.equal(r1.decision, 'STOPPED');
    assert.equal(r1.reason, 'phase_1 FAIL');
    assert.equal(r1.score, undefined, 'STOPPED must not include a score');
    assert.equal(r1.grade, undefined, 'STOPPED must not include a grade');

    // phase_2 FAIL.
    const r2 = closeoutSpec({
      phaseResults: {
        phase_1: 'PASS', phase_2: 'FAIL', phase_3: 'PASS',
        phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'full',
    });
    assert.equal(r2.decision, 'STOPPED');
    assert.equal(r2.reason, 'phase_2 FAIL');

    // Both FAIL → first one (phase_1) wins, deterministic.
    const r3 = closeoutSpec({
      phaseResults: {
        phase_1: 'FAIL', phase_2: 'FAIL', phase_3: 'PASS',
        phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'full',
    });
    assert.equal(r3.decision, 'STOPPED');
    assert.equal(r3.reason, 'phase_1 FAIL');

    // Audit-only mode: phase_1 FAIL still triggers STOP.
    const r4 = closeoutSpec({
      phaseResults: {
        phase_1: 'FAIL', phase_2: 'PASS',
        phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
      },
      mode: 'audit-only',
    });
    assert.equal(r4.decision, 'STOPPED');
  });

  // Test 8: Progressive scoring SSOT — 6 phase points sum to exactly 100 in PASS column.
  test('Case 8: PROGRESSIVE_SCORING SSOT — 6 phase PASS points sum to exactly 100', () => {
    const passSum = FULL_MODE_PHASES.reduce(
      (s, p) => s + PROGRESSIVE_SCORING[p].PASS,
      0
    );
    assert.equal(passSum, 100, 'full-mode PASS column must sum to exactly 100');

    // Audit-only PASS column must sum to exactly 75.
    const auditSum = AUDIT_ONLY_PHASES.reduce(
      (s, p) => s + PROGRESSIVE_SCORING[p].PASS,
      0
    );
    assert.equal(auditSum, 75, 'audit-only PASS column must sum to exactly 75');

    // The deleted phase between the two modes must be exactly phase_3 with PASS=25.
    assert.equal(passSum - auditSum, PROGRESSIVE_SCORING.phase_3.PASS);
    assert.equal(PROGRESSIVE_SCORING.phase_3.PASS, 25);

    // Phase 1/2 FAIL must be the literal "STOP" sentinel, not a number.
    assert.equal(PROGRESSIVE_SCORING.phase_1.FAIL, 'STOP');
    assert.equal(PROGRESSIVE_SCORING.phase_2.FAIL, 'STOP');
    // Phase 3..4c FAIL must be numeric.
    assert.equal(typeof PROGRESSIVE_SCORING.phase_3.FAIL,  'number');
    assert.equal(typeof PROGRESSIVE_SCORING.phase_4a.FAIL, 'number');
    assert.equal(typeof PROGRESSIVE_SCORING.phase_4b.FAIL, 'number');
    assert.equal(typeof PROGRESSIVE_SCORING.phase_4c.FAIL, 'number');
  });

  // Test 9 (regression): mixed FAIL on phase 3..4c is allowed and contributes partial points.
  test('Case 9: phase_3..4c FAIL contributes partial points (does NOT trigger STOP)', () => {
    // phase_3 FAIL = 5, phase_4a FAIL = 5, phase_4b FAIL = 2, phase_4c FAIL = 0.
    // 15(P) + 20(P) + 5(F) + 5(F) + 2(F) + 0(F) = 47 → NOT READY.
    const result = closeoutSpec({
      phaseResults: {
        phase_1: 'PASS', phase_2: 'PASS', phase_3: 'FAIL',
        phase_4a: 'FAIL', phase_4b: 'FAIL', phase_4c: 'FAIL',
      },
      mode: 'full',
    });
    assert.equal(result.decision, 'CLOSED');
    assert.equal(result.score, 47);
    assert.equal(result.grade, 'NOT READY');
  });

  // Test 10 (defensive): unknown mode and missing status throw rather than silently default.
  test('Case 10: defensive errors — unknown mode and missing phase status', () => {
    assert.throws(
      () => closeoutSpec({ phaseResults: { phase_1: 'PASS' }, mode: 'lite' }),
      /Unknown mode/
    );
    assert.throws(
      () => closeoutSpec({
        phaseResults: { phase_1: 'PASS', phase_2: 'PASS' /* missing rest */ },
        mode: 'full',
      }),
      /Missing status/
    );
    assert.throws(
      () => closeoutSpec({
        phaseResults: {
          phase_1: 'PASS', phase_2: 'PASS', phase_3: 'BOGUS',
          phase_4a: 'PASS', phase_4b: 'PASS', phase_4c: 'PASS',
        },
        mode: 'full',
      }),
      /Unknown status/
    );
  });

} // end if (require.main === module)
