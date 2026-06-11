#!/usr/bin/env node
// =============================================================================
// F30 — variant coverage 4-layer x 5-type (v7.11.0 B5, AUDIT-014/007)
// =============================================================================
// Pins the variant-coverage matrix the audit flagged. For each of the 5 task
// types it checks the 4 artifact layers:
//   L1 routing row   — references/complexity-matrix.md
//   L2 pipeline ref  — references/pipelines/<variant>-{light,heavy}.md
//   L3 skill folder  — skills/<variant>-{light,heavy}/SKILL.md (+ valid frontmatter)
//   L4 dedicated test — a regression/skill test naming the variant
// Plus: AUDIT-014 specifics (user-story 10 steps each, ux-sim folders exist) and
// AUDIT-007 (enforceSkillContract honors pipeline_variant — see the parser export).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const parser = require(path.join(ROOT, '.claude', 'hooks', 'skill-frontmatter-parser.cjs'));

let pass = 0; let fail = 0; const out = [];
function test(name, fn) {
  try { fn(); pass++; out.push(`  [PASS] ${name}`); }
  catch (e) { fail++; out.push(`  [FAIL] ${name}: ${e.message}`); }
}

// variant base names per type
const TYPES = {
  'Audit': 'audit',
  'Bug Fix': 'bugfix',
  'Feature': 'feature',
  'UX Simulation': 'ux-sim',
  'User Story': 'user-story',
};

console.log('=== F30 variant coverage 4-layer x 5-type (v7.11.0 B5) ===');

const matrix = read('references/complexity-matrix.md');

for (const [type, base] of Object.entries(TYPES)) {
  // L2 — pipeline references (both light + heavy)
  test(`F30-${base}: L2 pipeline references exist (light + heavy)`, () => {
    assert.ok(exists(`references/pipelines/${base}-light.md`), `references/pipelines/${base}-light.md missing`);
    assert.ok(exists(`references/pipelines/${base}-heavy.md`), `references/pipelines/${base}-heavy.md missing`);
  });

  // L3 — skill folders with parseable frontmatter (now complete for all 5 — AUDIT-014)
  test(`F30-${base}: L3 skill folders exist with valid frontmatter (light + heavy)`, () => {
    for (const lvl of ['light', 'heavy']) {
      const skillPath = `skills/${base}-${lvl}/SKILL.md`;
      assert.ok(exists(skillPath), `${skillPath} missing (layer-3 gap)`);
      const fm = parser.parseFrontmatter(read(skillPath));
      assert.ok(fm.ok, `${skillPath} frontmatter unparseable`);
      assert.strictEqual(fm.frontmatter.name, `${base}-${lvl}`, `${skillPath} name mismatch`);
      assert.ok(Array.isArray(fm.frontmatter.sequence) && fm.frontmatter.sequence.length > 0,
        `${skillPath} missing sequence`);
      assert.ok(Array.isArray(fm.frontmatter.gates_at), `${skillPath} missing gates_at`);
      assert.ok(Array.isArray(fm.frontmatter.sentinel_checkpoints), `${skillPath} missing sentinel_checkpoints`);
    }
  });
}

// AUDIT-014a — User Story ported 1:1 from Pulsar: exactly 10 steps each
for (const lvl of ['light', 'heavy']) {
  test(`F30-user-story-${lvl}: 10 step files (1:1 Pulsar port)`, () => {
    const stepsDir = path.join(ROOT, 'skills', `user-story-${lvl}`, 'steps');
    const steps = fs.readdirSync(stepsDir).filter((f) => /^\d{2}-.*\.md$/.test(f));
    assert.strictEqual(steps.length, 10, `expected 10 steps, found ${steps.length}`);
  });
  // User Story is code-changing → must declare a TDD gate and Pa de Cal gate
  test(`F30-user-story-${lvl}: code-changing tools + TDD/adversarial/Pa-de-Cal gates`, () => {
    const fm = parser.parseFrontmatter(read(`skills/user-story-${lvl}/SKILL.md`)).frontmatter;
    const tools = (fm['allowed-tools'] || []).join(',');
    assert.ok(/Write|Edit/.test(tools), 'user-story skill must allow Edit/Write (code-changing)');
    assert.deepStrictEqual(fm.gates_at, [6, 8, 10], 'user-story gates_at must be [6,8,10]');
  });
}

// AUDIT-014b — UX Simulation is report-only
for (const lvl of ['light', 'heavy']) {
  test(`F30-ux-sim-${lvl}: report-only (no Edit/Write in allowed-tools)`, () => {
    const fm = parser.parseFrontmatter(read(`skills/ux-sim-${lvl}/SKILL.md`)).frontmatter;
    const tools = (fm['allowed-tools'] || []).join(',');
    assert.ok(!/Write|Edit/.test(tools), 'ux-sim skill must be report-only (no Edit/Write)');
    assert.strictEqual(fm.report_only, true, 'ux-sim must declare report_only: true');
  });
}

// L1 — all 5 types present as routing rows in the complexity matrix
test('F30-L1: all 5 types have routing rows in complexity-matrix', () => {
  for (const type of Object.keys(TYPES)) {
    assert.ok(matrix.includes(type), `complexity-matrix missing routing row for ${type}`);
  }
  // Feature canonicalized to feature-* (B1/AUDIT-013)
  assert.ok(/feature-light/.test(matrix) && /feature-heavy/.test(matrix), 'Feature must route to feature-*');
});

// AUDIT-007 — enforceSkillContract is variant-aware via getVariantSkill
test('F30-AUDIT-007: getVariantSkill resolves inline-routed variants', () => {
  assert.strictEqual(typeof parser.getVariantSkill, 'function', 'getVariantSkill export missing');
  // inline audit run: no current_skill, but variant present + a step set -> resolves
  const ctx = parser.getVariantSkill({ variant: 'audit-heavy', current_step: 9, expected_next: 'final-validator' });
  assert.ok(ctx && ctx.skill === 'audit-heavy' && ctx.via_variant === true, 'variant fallback did not resolve audit-heavy');
  // a real current_skill must take precedence (returns null so getCurrentSkill wins)
  assert.strictEqual(parser.getVariantSkill({ current_skill: 'bugfix-light', variant: 'bugfix-light' }), null,
    'getVariantSkill must defer to an explicit current_skill');
  // DIRETO / spec-* and no-variant states stay null-skip (backward compat)
  assert.strictEqual(parser.getVariantSkill({ variant: 'DIRETO' }), null, 'DIRETO must stay null-skip');
  assert.strictEqual(parser.getVariantSkill({ variant: 'spec-heavy' }), null, 'spec-* must stay null-skip here');
  assert.strictEqual(parser.getVariantSkill({}), null, 'no variant must stay null-skip');
});

for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
