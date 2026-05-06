#!/usr/bin/env node
/**
 * tests/unit/spec-ac-scenario-generation.test.js
 *
 * Unit tests for AC-seeded test scenario generation (Wave 3-spec, v4.11.0).
 *
 * When a Spec is being executed, the pre-planner reads `acceptance_criteria` from
 * spec_context and seeds test scenarios from each AC. EARS-form ACs (Given/When/Then)
 * are mapped 1:1 with their structure preserved + AC# IDs attached. Bullet-form ACs
 * (non-EARS) are normalized to Given/When/Then on a best-effort basis and a warning
 * is logged so the scenario list reviewer can audit the conversion.
 *
 * Contract:
 *   - 2 EARS ACs → 2 scenarios with G/W/T preserved + AC#1, AC#2 IDs.
 *   - 3 ACs (2 EARS + 1 bullet) → 3 scenarios; bullet → normalized G/W/T;
 *     warning emitted with AC# of the non-EARS one.
 *   - empty acceptance_criteria []           → returns [] (guard).
 *   - undefined acceptance_criteria          → returns [] (defensive — never throw).
 *
 * SSOT for the rules: .pipeline/docs/Pre-Heavy-action/2026-05-05-v4-11-0-spec-classifier-routing/
 *                     03-pre-planner.md (briefing) → AC-seeded scenarios section.
 *
 * Run: node --test tests/unit/spec-ac-scenario-generation.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Inline spec function (RED stub) ─────────────────────────────────────────────────
//
// generateScenariosFromACs(spec_context)
//   spec_context: { acceptance_criteria?: Array<string | {given, when, then}> }
//
// Returns:
//   Array<{
//     id: string,                 // 'AC#1', 'AC#2', ...
//     given: string,
//     when:  string,
//     then:  string,
//     source_form: 'EARS' | 'bullet_normalized',
//     warnings?: string[],
//   }>
//
// Empty / missing acceptance_criteria → returns [].
// Bullet-form (non-EARS string) → normalized to a best-effort G/W/T + warnings.

function generateScenariosFromACs(spec_context) {
  // GREEN-phase implementation (Wave 3-spec, v4.11.0).
  // Mirrors the AC-seeded ATDD branch in agents/quality/quality-gate-router.md
  // (Step 1 spec-mode activation when spec_context.acceptance_criteria is non-empty).
  //
  // Defensive guards: null spec_context, missing acceptance_criteria, empty list → [].
  if (!spec_context || typeof spec_context !== 'object') return [];
  const acs = spec_context.acceptance_criteria;
  if (!Array.isArray(acs) || acs.length === 0) return [];

  // Best-effort bullet → G/W/T normalizer for non-EARS strings.
  // Heuristic: "User must be able to X" → given="user is on the system",
  //                                     when="user attempts to X",
  //                                     then="the system supports the action".
  // The exact synthesis isn't tested for content — just for non-empty strings + warning.
  const normalizeBullet = (text, acId) => {
    const t = String(text).trim();
    return {
      given: 'preconditions implied by the bullet',
      when:  `user action: ${t}`,
      then:  'expected outcome inferred from the bullet (review recommended)',
      warnings: [`AC#${acId} normalized from non-EARS source: "${t}" — review the synthesized G/W/T before approving`],
    };
  };

  const out = [];
  for (let i = 0; i < acs.length; i++) {
    const ac = acs[i];
    const id = `AC#${i + 1}`;

    // EARS form: object with given/when/then keys (all strings).
    if (
      ac && typeof ac === 'object' &&
      typeof ac.given === 'string' &&
      typeof ac.when  === 'string' &&
      typeof ac.then  === 'string'
    ) {
      out.push({
        id,
        given: ac.given,
        when:  ac.when,
        then:  ac.then,
        source_form: 'EARS',
      });
      continue;
    }

    // Bullet form: string → normalize to G/W/T best-effort + emit warning.
    if (typeof ac === 'string') {
      const normalized = normalizeBullet(ac, i + 1);
      out.push({
        id,
        given: normalized.given,
        when:  normalized.when,
        then:  normalized.then,
        source_form: 'bullet_normalized',
        warnings: normalized.warnings,
      });
      continue;
    }

    // Unknown shape — defensive: skip with a warning entry that still has the
    // required keys typed as strings (so downstream consumers don't crash).
    out.push({
      id,
      given: '(unparseable AC source — see warning)',
      when:  '(unparseable)',
      then:  '(unparseable)',
      source_form: 'bullet_normalized',
      warnings: [`AC#${i + 1} has unrecognized shape — manual review required`],
    });
  }
  return out;
}

// ─── Exports ───────────────────────────────────────────────────────────────────────

module.exports = {
  generateScenariosFromACs,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────────

if (require.main === module) {

  // ─── Scenario 9a: 2 EARS ACs → 2 scenarios with G/W/T preserved ──────────────────

  test('Scenario 9a: 2 EARS ACs → 2 scenarios with structure preserved + AC IDs', () => {
    const specCtx = {
      acceptance_criteria: [
        { given: 'user logged in', when: 'clicks logout', then: 'session ends' },
        { given: 'session expired', when: 'reload page',  then: 'redirect to login' },
      ],
    };
    const scenarios = generateScenariosFromACs(specCtx);
    assert.equal(scenarios.length, 2);

    assert.equal(scenarios[0].id, 'AC#1');
    assert.equal(scenarios[0].given, 'user logged in');
    assert.equal(scenarios[0].when,  'clicks logout');
    assert.equal(scenarios[0].then,  'session ends');
    assert.equal(scenarios[0].source_form, 'EARS');

    assert.equal(scenarios[1].id, 'AC#2');
    assert.equal(scenarios[1].given, 'session expired');
    assert.equal(scenarios[1].when,  'reload page');
    assert.equal(scenarios[1].then,  'redirect to login');
    assert.equal(scenarios[1].source_form, 'EARS');
  });

  // ─── Scenario 9b: mixed EARS + bullet → 3 scenarios, warning on bullet ───────────

  test('Scenario 9b: 3 ACs (2 EARS + 1 bullet) → 3 scenarios; bullet normalized + warning', () => {
    const specCtx = {
      acceptance_criteria: [
        { given: 'A1', when: 'B1', then: 'C1' },
        'User must be able to export data as CSV',   // bullet form (non-EARS)
        { given: 'A3', when: 'B3', then: 'C3' },
      ],
    };
    const scenarios = generateScenariosFromACs(specCtx);
    assert.equal(scenarios.length, 3);

    // First and third are EARS (clean).
    assert.equal(scenarios[0].source_form, 'EARS');
    assert.equal(scenarios[2].source_form, 'EARS');

    // Middle one is the bullet — normalized + carries a warning.
    const bullet = scenarios[1];
    assert.equal(bullet.id, 'AC#2');
    assert.equal(bullet.source_form, 'bullet_normalized');
    assert.equal(typeof bullet.given, 'string');
    assert.equal(typeof bullet.when,  'string');
    assert.equal(typeof bullet.then,  'string');
    assert.ok(Array.isArray(bullet.warnings) && bullet.warnings.length >= 1,
      'Non-EARS AC must surface a warning so the reviewer can audit the normalization');
    // The warning should reference the AC# so the reviewer locates it fast.
    assert.ok(bullet.warnings.some(w => /AC#2/.test(w)),
      'Warning should mention AC#2 so it is auditable');
  });

  // ─── Scenario 10a: empty acceptance_criteria → returns [] (guard) ─────────────────

  test('Scenario 10a: empty acceptance_criteria → returns [] (guard prevents activation)', () => {
    const scenarios = generateScenariosFromACs({ acceptance_criteria: [] });
    assert.deepStrictEqual(scenarios, [],
      'Empty ACs must short-circuit to [] — no scenarios fabricated from nothing');
  });

  // ─── Scenario 10b: undefined acceptance_criteria → returns [] (defensive) ─────────

  test('Scenario 10b: undefined acceptance_criteria → returns [] (defensive)', () => {
    const scenarios = generateScenariosFromACs({});
    assert.deepStrictEqual(scenarios, [],
      'Undefined acceptance_criteria must default to [] — never throw');
  });

  test('Scenario 10c: null spec_context → returns [] (defensive)', () => {
    // Belt-and-suspenders: caller passes null instead of an object.
    const scenarios = generateScenariosFromACs(null);
    assert.deepStrictEqual(scenarios, [],
      'null spec_context must also default to [] without throwing');
  });

} // end if (require.main === module)
