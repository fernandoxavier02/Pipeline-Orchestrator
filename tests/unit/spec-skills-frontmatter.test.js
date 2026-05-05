#!/usr/bin/env node
/**
 * tests/unit/spec-skills-frontmatter.test.js
 *
 * Validates the SKILL.md frontmatter for the 3 Wave 2 spec skills (spec-light, spec-heavy,
 * spec-audit-only) against their declarative contract:
 *
 *   - spec-light:        6 steps, gates_at [1,2,3,4],   sentinel [pre_1,pre_3,pre_6],   stop 2
 *   - spec-heavy:        9 steps, gates_at [1,2,3,4,5], sentinel [pre_1,pre_3,pre_5,pre_9], stop 3
 *   - spec-audit-only:   5 steps, gates_at [1,2,3],     sentinel [pre_1,pre_3,pre_5],   stop 2
 *
 * Uses the shared parser at .claude/hooks/skill-frontmatter-parser.cjs (the same module the
 * runtime hooks consume). If the parser reshapes its output, this test breaks — that is
 * intentional (executable contract).
 *
 * NOTE on multi-line description: all 3 SKILL.md files use `description: |` (YAML literal
 * block scalar). The shared parser does NOT understand block scalars and so the value of
 * `description` ends up as the string "|" with subsequent indented lines parsed as bogus
 * top-level keys. The parser still returns ok:true and the critical fields (name, gates_at,
 * sentinel_checkpoints, sequence, sequence_lock, stop_rule_max_failures) parse correctly
 * because they come AFTER the description block. This test deliberately does NOT assert
 * on description content — that is out of scope for the parser today.
 *
 * Run: node --test tests/unit/spec-skills-frontmatter.test.js
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
  {
    name: 'spec-light',
    file: path.join(REPO_ROOT, 'skills', 'spec-light', 'SKILL.md'),
    expected: {
      gates_at: [1, 2, 3, 4],
      sentinel_checkpoints: ['pre_1', 'pre_3', 'pre_6'],
      stop_rule_max_failures: 2,
      sequence: [1, 2, 3, 4, 5, 6],
      step_count: 6,
    },
  },
  {
    name: 'spec-heavy',
    file: path.join(REPO_ROOT, 'skills', 'spec-heavy', 'SKILL.md'),
    expected: {
      gates_at: [1, 2, 3, 4, 5],
      sentinel_checkpoints: ['pre_1', 'pre_3', 'pre_5', 'pre_9'],
      stop_rule_max_failures: 3,
      sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      step_count: 9,
    },
  },
  {
    name: 'spec-audit-only',
    file: path.join(REPO_ROOT, 'skills', 'spec-audit-only', 'SKILL.md'),
    expected: {
      gates_at: [1, 2, 3],
      sentinel_checkpoints: ['pre_1', 'pre_3', 'pre_5'],
      stop_rule_max_failures: 2,
      sequence: [1, 2, 3, 4, 5],
      step_count: 5,
    },
  },
];

// ─── Cache parsed frontmatter once per skill ──────────────────────────────────
//
// Each test below reads from the cache. If the file or parser regresses, the
// cache miss surfaces as a synthetic failure under the "frontmatter parses ok"
// suite — easier to localize than every per-field test failing.

const PARSED = {};

for (const s of SKILLS) {
  const text = fs.readFileSync(s.file, 'utf8');
  const result = parseFrontmatter(text);
  PARSED[s.name] = { result, text };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('parseFrontmatter returns ok:true for all 3 SKILL.md files (multi-line description tolerated)', () => {
  for (const s of SKILLS) {
    const { result } = PARSED[s.name];
    assert.equal(
      result.ok,
      true,
      `expected parseFrontmatter ok:true for ${s.name}, got error: ${result.error}`
    );
    assert.ok(
      result.frontmatter && typeof result.frontmatter === 'object',
      `expected frontmatter object for ${s.name}`
    );
  }
});

test('name field matches directory name', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    assert.strictEqual(
      fm.name,
      s.name,
      `expected name="${s.name}", got "${fm.name}"`
    );
  }
});

test('gates_at exact numeric values per skill', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    assert.deepStrictEqual(
      fm.gates_at,
      s.expected.gates_at,
      `gates_at mismatch for ${s.name}: expected ${JSON.stringify(s.expected.gates_at)}, got ${JSON.stringify(fm.gates_at)}`
    );
  }
});

test('sentinel_checkpoints exact string values per skill', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    assert.deepStrictEqual(
      fm.sentinel_checkpoints,
      s.expected.sentinel_checkpoints,
      `sentinel_checkpoints mismatch for ${s.name}: expected ${JSON.stringify(s.expected.sentinel_checkpoints)}, got ${JSON.stringify(fm.sentinel_checkpoints)}`
    );
  }
});

test('sequence_lock is boolean true (not string "true")', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    assert.strictEqual(
      typeof fm.sequence_lock,
      'boolean',
      `sequence_lock must be boolean for ${s.name}, got ${typeof fm.sequence_lock}`
    );
    assert.strictEqual(
      fm.sequence_lock,
      true,
      `sequence_lock must be true for ${s.name}`
    );
  }
});

test('disable-model-invocation is boolean true', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    // Note: YAML key uses hyphen — JS access uses bracket notation.
    assert.strictEqual(
      typeof fm['disable-model-invocation'],
      'boolean',
      `disable-model-invocation must be boolean for ${s.name}, got ${typeof fm['disable-model-invocation']}`
    );
    assert.strictEqual(
      fm['disable-model-invocation'],
      true,
      `disable-model-invocation must be true for ${s.name}`
    );
  }
});

test('stop_rule_max_failures matches per-skill threshold (2 light + audit, 3 heavy)', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    assert.strictEqual(
      fm.stop_rule_max_failures,
      s.expected.stop_rule_max_failures,
      `stop_rule_max_failures mismatch for ${s.name}: expected ${s.expected.stop_rule_max_failures}, got ${fm.stop_rule_max_failures}`
    );
  }
});

test('sequence array length matches declared step_count', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    assert.ok(Array.isArray(fm.sequence), `sequence must be an array for ${s.name}`);
    assert.strictEqual(
      fm.sequence.length,
      s.expected.step_count,
      `sequence length mismatch for ${s.name}: expected ${s.expected.step_count}, got ${fm.sequence.length}`
    );
    assert.deepStrictEqual(
      fm.sequence,
      s.expected.sequence,
      `sequence values mismatch for ${s.name}: expected ${JSON.stringify(s.expected.sequence)}, got ${JSON.stringify(fm.sequence)}`
    );
  }
});

test('gates_at is a strict subset of sequence (every gate corresponds to a real step)', () => {
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    const seqSet = new Set(fm.sequence);
    for (const g of fm.gates_at) {
      assert.ok(
        seqSet.has(g),
        `${s.name}: gate ${g} not present in sequence ${JSON.stringify(fm.sequence)}`
      );
    }
  }
});

test('sentinel checkpoint indices are within sequence range', () => {
  // Every "pre_N" checkpoint must reference a step number that exists in the sequence.
  for (const s of SKILLS) {
    const fm = PARSED[s.name].result.frontmatter;
    const seqSet = new Set(fm.sequence);
    for (const cp of fm.sentinel_checkpoints) {
      const m = String(cp).match(/^pre_(\d+)$/);
      assert.ok(m, `${s.name}: invalid sentinel checkpoint "${cp}", expected pre_<N>`);
      const stepNum = parseInt(m[1], 10);
      assert.ok(
        seqSet.has(stepNum),
        `${s.name}: checkpoint ${cp} references step ${stepNum} which is not in sequence ${JSON.stringify(fm.sequence)}`
      );
    }
  }
});
