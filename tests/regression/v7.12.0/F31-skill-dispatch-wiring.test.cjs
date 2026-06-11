#!/usr/bin/env node
// =============================================================================
// F31 — skill-dispatch wiring for the 4 inline-routed variants (v7.12.0)
// =============================================================================
// Wires audit-*, feature-*, user-story-*, ux-sim-* into the controller's Phase 2
// Skill-dispatch rule (previously only bugfix-* and spec-* were dispatched; the
// other four ran inline). Also adds the type-level thin shortcuts user-story +
// ux-sim, and reconciles the audit pipeline docs to the new reality.
//   S1  controller dispatch rule maps all 8 light/heavy variants to a Skill call
//   S2  the "delegation is additive / runs inline" note no longer lists the 4
//       families as inline (only DIRETO stays inline)
//   S3  thin type-level shortcuts exist for all 5 code/report types
//       (audit, bugfix, feature, user-story, ux-sim)
//   S4  user-story + ux-sim shortcuts route --light/--heavy to the prescriptive skills
//   S5  audit-heavy/light.md reconciled — no longer claim "Phase 2 runs INLINE"
//   S6  ux-sim shortcut is report-only-aware; user-story shortcut is code-changing
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0; let fail = 0; const out = [];
function test(name, fn) {
  try { fn(); pass++; out.push(`  [PASS] ${name}`); }
  catch (e) { fail++; out.push(`  [FAIL] ${name}: ${e.message}`); }
}

console.log('=== F31 skill-dispatch wiring (v7.12.0) ===');

const controller = read('agents/core/pipeline-controller.md');
const NEW_VARIANTS = [
  'audit-light', 'audit-heavy', 'feature-light', 'feature-heavy',
  'user-story-light', 'user-story-heavy', 'ux-sim-light', 'ux-sim-heavy',
];

test('F31-S1: controller dispatch rule maps all 8 variants to a Skill call', () => {
  for (const v of NEW_VARIANTS) {
    const re = new RegExp(`pipeline_variant == ${v.replace(/-/g, '\\-')}.{0,80}Skill\\(skill: "pipeline-orchestrator:${v}"`, 's');
    assert.ok(re.test(controller), `controller missing Skill-dispatch line for ${v}`);
  }
});

test('F31-S2: the delegation note no longer lists the 4 families as inline', () => {
  // The Phase 2 delegation note (rewritten v7.12.0) must state that only DIRETO
  // runs inline and must NOT enumerate the now-dispatched families as inline.
  const noteMatch = controller.match(/This delegation covers[^\n]*\n?/);
  assert.ok(noteMatch, 'v7.12.0 delegation note not found');
  const note = noteMatch[0];
  assert.ok(/Only `DIRETO`[^\n]*runs inline/i.test(note), 'note must state only DIRETO runs inline');
  assert.ok(!/no behavior change for[^.]*(feature-light|user-story-light|audit-\*|ux-sim-\*)/.test(note),
    'note still lists a now-dispatched family as inline');
});

test('F31-S3: type-level thin shortcuts exist for all 5 types', () => {
  for (const t of ['audit', 'bugfix', 'feature', 'user-story', 'ux-sim']) {
    assert.ok(exists(`skills/${t}/SKILL.md`), `skills/${t}/SKILL.md (thin shortcut) missing`);
  }
});

test('F31-S4: user-story + ux-sim shortcuts route --light/--heavy to the prescriptive skills', () => {
  for (const t of ['user-story', 'ux-sim']) {
    const md = read(`skills/${t}/SKILL.md`);
    assert.ok(new RegExp(`Skill\\(skill: "pipeline-orchestrator:${t}-light"`).test(md), `${t} shortcut missing --light route`);
    assert.ok(new RegExp(`Skill\\(skill: "pipeline-orchestrator:${t}-heavy"`).test(md), `${t} shortcut missing --heavy route`);
    assert.ok(/PRE_CLASSIFIED_TYPE=/.test(md), `${t} shortcut missing PRE_CLASSIFIED_TYPE delegation`);
  }
});

test('F31-S5: audit pipeline docs reconciled — no longer claim Phase 2 runs INLINE', () => {
  for (const lvl of ['heavy', 'light']) {
    const md = read(`references/pipelines/audit-${lvl}.md`);
    assert.ok(!/Phase 2 runs INLINE/i.test(md), `audit-${lvl}.md still claims Phase 2 runs INLINE`);
    assert.ok(/Skill\(pipeline-orchestrator:audit-/.test(md), `audit-${lvl}.md must document skill dispatch`);
  }
});

test('F31-S6: ux-sim shortcut report-only-aware; user-story shortcut code-changing', () => {
  const us = read('skills/user-story/SKILL.md');
  const ux = read('skills/ux-sim/SKILL.md');
  assert.ok(/PRE_CLASSIFIED_TYPE=User Story/.test(us), 'user-story shortcut must pre-fix type User Story');
  assert.ok(/PRE_CLASSIFIED_TYPE=UX Simulation/.test(ux), 'ux-sim shortcut must pre-fix type UX Simulation');
  assert.ok(/REPORT-ONLY|report-only|read-only/i.test(ux), 'ux-sim shortcut must note report-only');
});

test('F31-S7: prescriptive B5 skills no longer claim inline routing (ARCH-1)', () => {
  // The adversarial review caught that F31 did not read the prescriptive skill
  // bodies — they still claimed "routing stays inline". Pin that they reflect
  // the v7.12.0 skill-dispatch reality and do not contradict the controller.
  for (const v of ['user-story-light', 'user-story-heavy', 'ux-sim-light', 'ux-sim-heavy']) {
    const md = read(`skills/${v}/SKILL.md`);
    assert.ok(!/does NOT change routing|routing stays inline|does not auto-dispatch/i.test(md),
      `${v}/SKILL.md still claims inline routing`);
    assert.ok(new RegExp(`Skill\\(pipeline-orchestrator:${v}\\)`).test(md),
      `${v}/SKILL.md must document its controller Skill dispatch`);
  }
});

test('F31-S8: state-update contract is generalized (not a drift-prone enumeration)', () => {
  assert.ok(/Before spawning ANY skill via the Phase 2 dispatch rule/.test(controller),
    'controller state-update contract must be generic, not an enumerated family list');
});

test('F31-S9: audit team tables do not assign executor-controller at Phase 2 (ARCH-5)', () => {
  // The team-composition table must not contradict the skill-dispatch blurb: no table ROW
  // may name executor-controller as the Phase 2 agent (column 2).
  for (const lvl of ['light', 'heavy']) {
    const md = read(`references/pipelines/audit-${lvl}.md`);
    const badRow = /\|\s*\d+\s*\|\s*executor-controller\s*\|\s*2\s*\|/;
    assert.ok(!badRow.test(md), `audit-${lvl}.md still assigns executor-controller at Phase 2 (contradicts skill dispatch)`);
  }
});

for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
