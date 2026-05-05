#!/usr/bin/env node
/**
 * tests/integration/spec-skills-wave1-regression.test.js
 *
 * Regression guard: Wave 2 (3 spec-* skills) MUST NOT break Wave 1 artifacts.
 *
 * Two layers of assertion:
 *   1. Structural: 4 Wave 1 agent files exist + non-empty + parseable frontmatter.
 *      The shared parser (skill-frontmatter-parser.cjs) still loads and exports its
 *      6 public functions after Wave 2 file additions (no module-level side-effect break).
 *   2. Behavioural: re-run the 5 Wave 1 unit test files as child processes and
 *      assert each exits with code 0. If any Wave 1 test now fails, Wave 2 caused
 *      a regression — STOP signal for the executor.
 *
 * Reports "Wave 1 baseline: 44/44 green" via test name on success.
 *
 * Run: node --test tests/integration/spec-skills-wave1-regression.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PARSER_PATH = path.join(REPO_ROOT, '.claude', 'hooks', 'skill-frontmatter-parser.cjs');

const WAVE1_AGENT_FILES = [
  path.join(REPO_ROOT, 'agents', 'executor', 'type-specific', 'spec-format-gate.md'),
  path.join(REPO_ROOT, 'agents', 'executor', 'type-specific', 'spec-content-reviewer.md'),
  path.join(REPO_ROOT, 'agents', 'executor', 'type-specific', 'spec-post-impl-validator.md'),
  path.join(REPO_ROOT, 'agents', 'executor', 'spec-closer.md'),
];

const WAVE1_TEST_FILES = [
  path.join(REPO_ROOT, 'tests', 'unit', 'spec-format-gate.test.js'),
  path.join(REPO_ROOT, 'tests', 'unit', 'spec-content-reviewer-full.test.js'),
  path.join(REPO_ROOT, 'tests', 'unit', 'spec-content-reviewer-slim.test.js'),
  path.join(REPO_ROOT, 'tests', 'unit', 'spec-post-impl-validator.test.js'),
  path.join(REPO_ROOT, 'tests', 'unit', 'spec-closer.test.js'),
];

const PARSER_PUBLIC_FUNCTIONS = [
  'parseYaml',
  'parseFrontmatter',
  'readSkillFrontmatter',
  'getCurrentSkill',
  'getEnforcementMode',
  'logEnforcementDecision',
];

// ─── Structural tests ─────────────────────────────────────────────────────────

test('all 4 Wave 1 agent files exist and are non-empty', () => {
  for (const file of WAVE1_AGENT_FILES) {
    assert.ok(fs.existsSync(file), `Wave 1 agent missing: ${path.relative(REPO_ROOT, file)}`);
    const stat = fs.statSync(file);
    assert.ok(
      stat.size > 0,
      `Wave 1 agent is empty: ${path.relative(REPO_ROOT, file)} (size=${stat.size})`
    );
  }
});

test('every Wave 1 agent file has parseable frontmatter (parseFrontmatter ok:true)', () => {
  const { parseFrontmatter } = require(PARSER_PATH);
  for (const file of WAVE1_AGENT_FILES) {
    const text = fs.readFileSync(file, 'utf8');
    const result = parseFrontmatter(text);
    assert.strictEqual(
      result.ok,
      true,
      `Wave 1 agent ${path.relative(REPO_ROOT, file)} frontmatter parse failed: ${result.error}`
    );
  }
});

test('skill-frontmatter-parser.cjs still loads and exports all 6 public functions after Wave 2', () => {
  // Clear require cache so we re-load fresh — guards against test-order pollution.
  delete require.cache[require.resolve(PARSER_PATH)];
  const mod = require(PARSER_PATH);
  for (const fname of PARSER_PUBLIC_FUNCTIONS) {
    assert.strictEqual(
      typeof mod[fname],
      'function',
      `parser must export "${fname}" as a function, got ${typeof mod[fname]}`
    );
  }
});

// ─── Behavioural tests — child process re-runs ───────────────────────────────

function runChildTest(testFile) {
  // Use process.execPath (same node binary running this test) for stability across
  // shells. Node 18+ supports `node --test <file>` natively.
  const res = spawnSync(process.execPath, ['--test', testFile], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 60_000, // 60s per Wave 1 test file — generous for 8-12 cases each
  });
  return res;
}

test('Wave 1 baseline: all 5 Wave 1 test files re-run green (44/44 expected)', () => {
  const failures = [];
  for (const tf of WAVE1_TEST_FILES) {
    const res = runChildTest(tf);
    if (res.status !== 0 || res.error) {
      failures.push({
        file: path.relative(REPO_ROOT, tf),
        status: res.status,
        error: res.error ? res.error.message : null,
        stdout_tail: (res.stdout || '').split(/\r?\n/).slice(-15).join('\n'),
        stderr_tail: (res.stderr || '').split(/\r?\n/).slice(-15).join('\n'),
      });
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `Wave 1 regression detected — ${failures.length}/${WAVE1_TEST_FILES.length} test files failed:\n${failures
      .map(
        (f) =>
          `\n--- ${f.file} (exit=${f.status}${f.error ? ', error=' + f.error : ''}) ---\n${f.stderr_tail || f.stdout_tail}`
      )
      .join('\n')}`
  );
});
