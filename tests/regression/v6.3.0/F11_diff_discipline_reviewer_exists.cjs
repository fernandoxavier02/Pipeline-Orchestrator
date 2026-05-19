#!/usr/bin/env node
'use strict';

/**
 * F11 — agents/quality/diff-discipline-reviewer.md exists with read-only
 * tools, DIFF_DISCIPLINE_REVIEW yaml schema, three verdict levels, and
 * max_fix_attempts=5.
 *
 * EXPECTED RED STATE on first run: file does not exist yet.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F11.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'agents/quality/diff-discipline-reviewer.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readTarget() {
  return fs.readFileSync(TARGET, 'utf8');
}

function extractFrontmatter(md) {
  const m = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  return m ? m[1] : '';
}

console.log('=== F11 diff-discipline-reviewer.md exists with correct contract ===');

test('agents/quality/diff-discipline-reviewer.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('frontmatter tools: declares exactly Read, Grep, Glob (no Bash/Edit/Write)', () => {
  const content = readTarget();
  const fm = extractFrontmatter(content);
  assert.ok(fm, 'no YAML frontmatter found');
  const toolsMatch = fm.match(/^tools:\s*(.+)$/m);
  assert.ok(toolsMatch, 'no "tools:" line in frontmatter');
  const toolsLine = toolsMatch[1].trim();
  const tools = toolsLine.split(/[,\s]+/).filter(Boolean).sort();
  const expected = ['Glob', 'Grep', 'Read'].sort();
  assert.deepEqual(tools, expected,
    `tools must be exactly [Read, Grep, Glob], got: ${toolsLine}`);
  // Defensive: ensure absent tools really are absent
  for (const banned of ['Bash', 'Edit', 'Write']) {
    assert.ok(!tools.includes(banned),
      `tools must NOT contain ${banned}`);
  }
});

test('contains literal "DIFF_DISCIPLINE_REVIEW:" yaml output schema', () => {
  const content = readTarget();
  assert.ok(/DIFF_DISCIPLINE_REVIEW:/.test(content),
    'expected "DIFF_DISCIPLINE_REVIEW:" yaml key');
});

test('declares three verdict levels: PASS, NEEDS_REDUCTION, REJECTED', () => {
  const content = readTarget();
  assert.ok(/\bPASS\b/.test(content), 'missing PASS verdict');
  assert.ok(/\bNEEDS_REDUCTION\b/.test(content), 'missing NEEDS_REDUCTION verdict');
  assert.ok(/\bREJECTED\b/.test(content), 'missing REJECTED verdict');
});

test('declares max_fix_attempts = 5', () => {
  const content = readTarget();
  assert.ok(/max_fix_attempts/.test(content), 'missing max_fix_attempts key');
  assert.ok(/max_fix_attempts[\s\S]{0,40}\b5\b/.test(content),
    'expected max_fix_attempts to equal 5');
});

test('references implementation-discipline.md', () => {
  const content = readTarget();
  assert.ok(/implementation-discipline\.md/.test(content),
    'expected cross-reference to implementation-discipline.md');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
