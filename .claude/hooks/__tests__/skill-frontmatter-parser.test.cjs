#!/usr/bin/env node
'use strict';

const path = require('path');
const m = require(path.join(__dirname, '..', 'skill-frontmatter-parser.cjs'));

let passed = 0;
let failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson === expectedJson) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected: ${expectedJson}\n    actual:   ${actualJson}`);
}

function assertTruthy(actual, label) {
  if (actual) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected truthy, got: ${JSON.stringify(actual)}`);
}

function assertContains(haystack, needle, label) {
  if (typeof haystack === 'string' && haystack.includes(needle)) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected to contain: ${needle}\n    got: ${JSON.stringify(haystack)}`);
}

// Fixtures live under __tests__/fixtures/skills/<name>/SKILL.md.
// readSkillFrontmatter expects <repoRoot>/skills/<name>/SKILL.md, so we
// pass __dirname/fixtures as the fake repoRoot.
const FAKE_REPO_ROOT = path.join(__dirname, 'fixtures');

// ── parseFrontmatter ──

function testParseFrontmatterValid() {
  const r = m.parseFrontmatter('---\nname: x\nsequence: [1, 2]\nsequence_lock: true\n---\n\nbody');
  assertTruthy(r.ok, 'parseFrontmatter valid: ok=true');
  assertEqual(r.frontmatter.name, 'x', 'parseFrontmatter valid: name=x');
  assertEqual(r.frontmatter.sequence, [1, 2], 'parseFrontmatter valid: sequence=[1,2]');
  assertEqual(r.frontmatter.sequence_lock, true, 'parseFrontmatter valid: sequence_lock=true');
}

function testParseFrontmatterMissing() {
  const r = m.parseFrontmatter('# No frontmatter here\n\nbody');
  assertEqual(r.ok, false, 'parseFrontmatter missing: ok=false');
  assertContains(r.error, 'no frontmatter', 'parseFrontmatter missing: error mentions');
}

function testParseFrontmatterMalformed() {
  // Frontmatter delimited but YAML inside is malformed (unclosed list).
  // Parser is lenient — may still produce partial result. We just verify it doesn't throw.
  const r = m.parseFrontmatter('---\nname: x\nsequence: [1, 2\n---\n\nbody');
  assertTruthy(typeof r === 'object', 'parseFrontmatter malformed: returns object');
  assertTruthy('ok' in r, 'parseFrontmatter malformed: has ok field');
}

function testParseFrontmatterNonString() {
  const r = m.parseFrontmatter(null);
  assertEqual(r.ok, false, 'parseFrontmatter non-string: ok=false');
  assertContains(r.error, 'not a string', 'parseFrontmatter non-string: error');
}

// ── readSkillFrontmatter ──

function testReadSkillGood() {
  const r = m.readSkillFrontmatter('feature-light-good', FAKE_REPO_ROOT);
  assertTruthy(r.ok, 'readSkillFrontmatter good: ok=true');
  assertEqual(r.frontmatter.sequence, [1, 2, 3, 4], 'readSkillFrontmatter good: sequence');
  assertEqual(r.frontmatter.sequence_lock, true, 'readSkillFrontmatter good: sequence_lock');
  assertEqual(r.frontmatter.gates_at, [3], 'readSkillFrontmatter good: gates_at');
  assertEqual(r.frontmatter.sentinel_checkpoints, ['pre_3'], 'readSkillFrontmatter good: sentinel_checkpoints');
}

function testReadSkillNotFound() {
  const r = m.readSkillFrontmatter('does-not-exist', '/nonexistent');
  assertEqual(r.ok, false, 'readSkillFrontmatter notfound: ok=false');
  assertContains(r.error, 'cannot read', 'readSkillFrontmatter notfound: error');
}

function testReadSkillNoContract() {
  const r = m.readSkillFrontmatter('feature-light-no-contract', FAKE_REPO_ROOT);
  assertTruthy(r.ok, 'readSkillFrontmatter no-contract: ok=true (frontmatter parses)');
  assertEqual(r.frontmatter.sequence, undefined, 'readSkillFrontmatter no-contract: no sequence');
  assertEqual(r.frontmatter.gates_at, undefined, 'readSkillFrontmatter no-contract: no gates_at');
}

function testReadSkillInvalidName() {
  const r = m.readSkillFrontmatter('', FAKE_REPO_ROOT);
  assertEqual(r.ok, false, 'readSkillFrontmatter empty name: ok=false');
}

// ── getCurrentSkill ──

function testGetCurrentSkillValid() {
  const r = m.getCurrentSkill({ current_skill: 'feature-light', current_step: 3, expected_next: 'feature-vertical-slice-planner' });
  assertEqual(r.skill, 'feature-light', 'getCurrentSkill valid: skill');
  assertEqual(r.step, 3, 'getCurrentSkill valid: step');
  assertEqual(r.expected_next, 'feature-vertical-slice-planner', 'getCurrentSkill valid: expected_next');
}

function testGetCurrentSkillMissing() {
  assertEqual(m.getCurrentSkill(null), null, 'getCurrentSkill null: returns null');
  assertEqual(m.getCurrentSkill({}), null, 'getCurrentSkill empty: returns null');
  assertEqual(m.getCurrentSkill({ current_skill: '' }), null, 'getCurrentSkill empty string: returns null');
}

// ── getEnforcementMode ──

function testEnforcementModeBefore() {
  delete process.env.PIPELINE_ENFORCEMENT;
  assertEqual(m.getEnforcementMode(new Date('2026-05-10T00:00:00Z')), 'warn', 'mode before 2026-05-17: warn');
}

function testEnforcementModeAfter() {
  delete process.env.PIPELINE_ENFORCEMENT;
  assertEqual(m.getEnforcementMode(new Date('2026-05-18T00:00:00Z')), 'deny', 'mode after 2026-05-17: deny');
}

function testEnforcementModeBoundary() {
  delete process.env.PIPELINE_ENFORCEMENT;
  assertEqual(m.getEnforcementMode(new Date('2026-05-17T00:00:00Z')), 'deny', 'mode at 2026-05-17 00:00 UTC: deny');
}

function testEnforcementModeOverride() {
  process.env.PIPELINE_ENFORCEMENT = 'deny';
  assertEqual(m.getEnforcementMode(new Date('2026-05-01T00:00:00Z')), 'deny', 'env override: deny');
  process.env.PIPELINE_ENFORCEMENT = 'warn';
  assertEqual(m.getEnforcementMode(new Date('2026-06-01T00:00:00Z')), 'warn', 'env override: warn');
  delete process.env.PIPELINE_ENFORCEMENT;
}

// ── Run all ──

testParseFrontmatterValid();
testParseFrontmatterMissing();
testParseFrontmatterMalformed();
testParseFrontmatterNonString();
testReadSkillGood();
testReadSkillNotFound();
testReadSkillNoContract();
testReadSkillInvalidName();
testGetCurrentSkillValid();
testGetCurrentSkillMissing();
testEnforcementModeBefore();
testEnforcementModeAfter();
testEnforcementModeBoundary();
testEnforcementModeOverride();

console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
