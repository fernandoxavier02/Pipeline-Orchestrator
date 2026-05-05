#!/usr/bin/env node
/**
 * tests/unit/spec-skills-step-frontmatter.test.js
 *
 * Walks every step file under skills/spec-{light,heavy,audit-only}/steps/,
 * parses each frontmatter, and asserts contract compliance.
 *
 * Required fields per step:
 *   step_number, step_name, description, execution_mode, agent_type,
 *   expected_inputs, expected_outputs, expected_next, gate_required, allowed_tools
 *
 * Constraints:
 *   - execution_mode ∈ {"inline","subagent"}
 *   - subagent steps have non-empty agent_type matching /^pipeline-orchestrator:/
 *   - inline steps have agent_type === "" (parser preserves quoted empty string)
 *   - step_number sequential starting at 1 within each skill
 *   - expected_next === step_number + 1 for non-last steps; null for the last step
 *   - gate_required is boolean
 *   - allowed_tools is non-empty array
 *
 * Step counts: spec-light=6, spec-heavy=9, spec-audit-only=5 (total 20).
 *
 * Run: node --test tests/unit/spec-skills-step-frontmatter.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseFrontmatter } = require(
  path.join(__dirname, '..', '..', '.claude', 'hooks', 'skill-frontmatter-parser.cjs')
);

const REPO_ROOT = path.join(__dirname, '..', '..');

const SKILLS = [
  { name: 'spec-light', expected_step_count: 6 },
  { name: 'spec-heavy', expected_step_count: 9 },
  { name: 'spec-audit-only', expected_step_count: 5 },
];

const REQUIRED_FIELDS = [
  'step_number',
  'step_name',
  'description',
  'execution_mode',
  'agent_type',
  'expected_inputs',
  'expected_outputs',
  'expected_next',
  'gate_required',
  'allowed_tools',
];

const VALID_EXECUTION_MODES = new Set(['inline', 'subagent']);
const AGENT_TYPE_PREFIX_RE = /^pipeline-orchestrator:/;

// ─── Discovery ────────────────────────────────────────────────────────────────

function listStepFiles(skillName) {
  const dir = path.join(REPO_ROOT, 'skills', skillName, 'steps');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ file: path.join(dir, f), basename: f }));
}

// Cache parsed frontmatter for every step file in every skill.
const STEPS = {};
for (const s of SKILLS) {
  STEPS[s.name] = listStepFiles(s.name).map(({ file, basename }) => {
    const text = fs.readFileSync(file, 'utf8');
    const result = parseFrontmatter(text);
    return { file, basename, result };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('step file count per skill: light=6, heavy=9, audit-only=5', () => {
  for (const s of SKILLS) {
    const found = STEPS[s.name].length;
    assert.strictEqual(
      found,
      s.expected_step_count,
      `${s.name}: expected ${s.expected_step_count} step files, found ${found} (${STEPS[s.name].map((x) => x.basename).join(', ')})`
    );
  }
});

test('every step file has parseable frontmatter (ok:true)', () => {
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      assert.strictEqual(
        step.result.ok,
        true,
        `${s.name}/${step.basename}: parseFrontmatter failed: ${step.result.error}`
      );
    }
  }
});

test('every step has all required fields', () => {
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      const fm = step.result.frontmatter;
      for (const field of REQUIRED_FIELDS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(fm, field),
          `${s.name}/${step.basename}: missing required field "${field}"`
        );
      }
    }
  }
});

test('execution_mode is "inline" or "subagent" (no other values accepted)', () => {
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      const fm = step.result.frontmatter;
      assert.ok(
        VALID_EXECUTION_MODES.has(fm.execution_mode),
        `${s.name}/${step.basename}: execution_mode must be "inline" or "subagent", got "${fm.execution_mode}"`
      );
    }
  }
});

test('subagent steps have non-empty agent_type matching pipeline-orchestrator:* prefix', () => {
  let subagentCount = 0;
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      const fm = step.result.frontmatter;
      if (fm.execution_mode !== 'subagent') continue;
      subagentCount++;
      assert.strictEqual(
        typeof fm.agent_type,
        'string',
        `${s.name}/${step.basename}: subagent agent_type must be string, got ${typeof fm.agent_type}`
      );
      assert.ok(
        fm.agent_type.length > 0,
        `${s.name}/${step.basename}: subagent agent_type must be non-empty`
      );
      assert.ok(
        AGENT_TYPE_PREFIX_RE.test(fm.agent_type),
        `${s.name}/${step.basename}: subagent agent_type "${fm.agent_type}" must match /^pipeline-orchestrator:/`
      );
    }
  }
  assert.ok(subagentCount > 0, 'sanity: expected at least one subagent step across the 3 skills');
});

test('inline steps have agent_type === "" (empty string preserved by parser)', () => {
  let inlineCount = 0;
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      const fm = step.result.frontmatter;
      if (fm.execution_mode !== 'inline') continue;
      inlineCount++;
      assert.strictEqual(
        fm.agent_type,
        '',
        `${s.name}/${step.basename}: inline step agent_type must be empty string, got ${JSON.stringify(fm.agent_type)}`
      );
    }
  }
  assert.ok(inlineCount > 0, 'sanity: expected at least one inline step across the 3 skills');
});

test('step_number values are sequential within each skill starting at 1', () => {
  for (const s of SKILLS) {
    const numbers = STEPS[s.name].map((step) => step.result.frontmatter.step_number);
    const expected = Array.from({ length: s.expected_step_count }, (_, i) => i + 1);
    assert.deepStrictEqual(
      numbers,
      expected,
      `${s.name}: step_numbers must be sequential 1..${s.expected_step_count}, got ${JSON.stringify(numbers)}`
    );
  }
});

test('expected_next is step_number + 1 for non-last steps, null for the last step', () => {
  for (const s of SKILLS) {
    const steps = STEPS[s.name];
    for (let i = 0; i < steps.length; i++) {
      const fm = steps[i].result.frontmatter;
      if (i === steps.length - 1) {
        assert.strictEqual(
          fm.expected_next,
          null,
          `${s.name}/${steps[i].basename}: last step expected_next must be null, got ${JSON.stringify(fm.expected_next)}`
        );
      } else {
        assert.strictEqual(
          fm.expected_next,
          fm.step_number + 1,
          `${s.name}/${steps[i].basename}: expected_next must be ${fm.step_number + 1}, got ${JSON.stringify(fm.expected_next)}`
        );
      }
    }
  }
});

test('gate_required is boolean (not string)', () => {
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      const fm = step.result.frontmatter;
      assert.strictEqual(
        typeof fm.gate_required,
        'boolean',
        `${s.name}/${step.basename}: gate_required must be boolean, got ${typeof fm.gate_required} (${JSON.stringify(fm.gate_required)})`
      );
    }
  }
});

test('allowed_tools is a non-empty array', () => {
  for (const s of SKILLS) {
    for (const step of STEPS[s.name]) {
      const fm = step.result.frontmatter;
      assert.ok(
        Array.isArray(fm.allowed_tools),
        `${s.name}/${step.basename}: allowed_tools must be an array, got ${typeof fm.allowed_tools}`
      );
      assert.ok(
        fm.allowed_tools.length > 0,
        `${s.name}/${step.basename}: allowed_tools must be non-empty`
      );
    }
  }
});

test('total step file count across all 3 skills equals 20', () => {
  const total = SKILLS.reduce((acc, s) => acc + STEPS[s.name].length, 0);
  assert.strictEqual(total, 20, `expected 20 total step files, got ${total}`);
});

// TD-08: spec-audit-only step files declare production_writes_allowed: false
// (audit-only is read-only by design — spec/docs writes during fix-loop are
// scoped to .kiro/specs/<feature>/ via Step 03 body guard, not feature code)
test('spec-audit-only step files declare production_writes_allowed: false', () => {
  const auditOnlySteps = STEPS['spec-audit-only'];
  assert.strictEqual(
    auditOnlySteps.length,
    5,
    `sanity: spec-audit-only must have 5 step files, got ${auditOnlySteps.length}`
  );
  for (const step of auditOnlySteps) {
    const fm = step.result.frontmatter;
    assert.ok(
      Object.prototype.hasOwnProperty.call(fm, 'production_writes_allowed'),
      `spec-audit-only/${step.basename}: missing required field "production_writes_allowed"`
    );
    assert.strictEqual(
      fm.production_writes_allowed,
      false,
      `spec-audit-only/${step.basename}: production_writes_allowed must be boolean false, got ${JSON.stringify(fm.production_writes_allowed)}`
    );
  }
});
