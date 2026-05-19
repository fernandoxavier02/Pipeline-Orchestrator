#!/usr/bin/env node
'use strict';

/**
 * F13 — agents/quality/architecture-reviewer.md grows 7 new discipline
 * checks aligned with implementation-discipline.md.
 *
 * EXPECTED RED STATE on first run: file does not yet contain these checks.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F13.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'agents/quality/architecture-reviewer.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readTarget() {
  return fs.readFileSync(TARGET, 'utf8');
}

/**
 * Read only the body of the markdown file (everything AFTER the closing `---`
 * of the YAML frontmatter). This prevents F13 check 6 (and any other check)
 * from passing tautologically by matching the frontmatter description field.
 * Hardening added 2026-05-19 per SEC-4/QUAL-1 consensus finding.
 */
function readBody() {
  const full = readTarget();
  // Frontmatter pattern: `---\n...\n---\n` at the top of file
  const m = full.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return m ? m[1] : full; // fall back to full content if no frontmatter
}

console.log('=== F13 architecture-reviewer.md new discipline checks ===');

test('agents/quality/architecture-reviewer.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('check 1: "abstraction without second use case" detection', () => {
  const content = readTarget();
  assert.ok(
    /abstraction\s+without\s+second.{0,40}use\s+case/i.test(content) ||
    /second\s+real\s+use\s+case/i.test(content),
    'expected mention of "abstraction without second use case" or "second real use case"'
  );
});

test('check 2: "new file where local change suffices" detection', () => {
  const content = readTarget();
  assert.ok(
    /new\s+file\s+where.{0,40}local\s+change/i.test(content) ||
    /local\s+change.{0,40}new\s+file/i.test(content) ||
    /new\s+file.{0,40}(local|in-place)/i.test(content),
    'expected mention of new file where local change suffices'
  );
});

test('check 3: duplicated helper/type/constant detection', () => {
  const content = readTarget();
  assert.ok(
    /duplicat(ed|ion).{0,40}(helper|type|constant)/i.test(content),
    'expected mention of duplicated helper/type/constant'
  );
});

test('check 4: unnecessary architecture layer detection', () => {
  const content = readTarget();
  assert.ok(
    /unnecessary.{0,40}(architecture\s+)?layer/i.test(content) ||
    /unneeded.{0,40}layer/i.test(content) ||
    /superfluous.{0,40}layer/i.test(content),
    'expected mention of unnecessary architecture layer'
  );
});

test('check 5: unrelated refactor detection', () => {
  const content = readTarget();
  assert.ok(
    /unrelated\s+refactor/i.test(content),
    'expected mention of "unrelated refactor"'
  );
});

test('check 6: semantic duplication detection (body only, NOT frontmatter)', () => {
  const body = readBody();
  // Tautological-pass guard: frontmatter description must not be a back-channel.
  // The phrase must appear inside the operational sections (Step 3 or Step 4 tables, RULES, etc.)
  assert.ok(
    /semantic\s+duplication/i.test(body),
    'expected mention of "semantic duplication" in the agent body (post-frontmatter), not in the description field'
  );
});

test('check 7: public contract drift detection', () => {
  const content = readTarget();
  assert.ok(
    /public\s+contract\s+drift/i.test(content),
    'expected mention of "public contract drift"'
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
