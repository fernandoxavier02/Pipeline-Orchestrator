#!/usr/bin/env node
'use strict';

/**
 * v6.2.0 — architecture-reviewer.md gains overengineering / discipline checks.
 *
 * Asserts the 7 new checks are documented (Step 5 or equivalent), the
 * category vocabulary is extended (OVERENGINEERING / SCOPE / CONTRACT),
 * and existing checks (Step 2-4) are preserved.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AR = path.join(ROOT, 'agents/quality/architecture-reviewer.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== v6.2.0 architecture-reviewer overengineering checks ===');

const md = fs.readFileSync(AR, 'utf8');

test('S1: new "Step 5: Overengineering / Discipline Check" exists', () => {
  assert.ok(/^###\s+Step\s+5:\s+Overengineering\s*\/\s*Discipline Check\b/m.test(md),
    'missing "### Step 5: Overengineering / Discipline Check"');
});

test('S2: Step 5 enumerates all 7 required checks', () => {
  const m = md.match(/^###\s+Step\s+5:[\s\S]*?(?=\n###\s|\n##\s|\n---)/m);
  assert.ok(m, 'Step 5 section body not captured');
  const sec = m[0];
  const checks = [
    /abstraction without (a )?second( real)? use case/i,
    /new file where (a )?local change was enough/i,
    /duplicated helper.*type.*constant|helper.*type.*constant.*duplicat/i,
    /unnecessary architecture layer/i,
    /unrelated refactor/i,
    /semantic duplication/i,
    /public contract drift/i,
  ];
  for (const c of checks) {
    assert.ok(c.test(sec), `Step 5 missing required check: ${c}`);
  }
});

test('S3: FINDING FORMAT category vocabulary extended with OVERENGINEERING / SCOPE / CONTRACT', () => {
  const m = md.match(/^##\s+FINDING FORMAT\b[\s\S]*?(?=\n##\s|\n---)/m);
  assert.ok(m, 'FINDING FORMAT section not found');
  const sec = m[0];
  for (const cat of ['OVERENGINEERING', 'SCOPE', 'CONTRACT']) {
    assert.ok(new RegExp(`\\b${cat}\\b`).test(sec),
      `FINDING FORMAT category list missing "${cat}"`);
  }
});

test('S4: Step 2 (Pattern Conformance Check) preserved', () => {
  assert.ok(/^###\s+Step\s+2:\s+Pattern Conformance Check\b/m.test(md),
    'Step 2 (Pattern Conformance Check) must remain');
});

test('S5: Step 3 (Abstraction Reuse Check) preserved', () => {
  assert.ok(/^###\s+Step\s+3:\s+Abstraction Reuse Check\b/m.test(md),
    'Step 3 (Abstraction Reuse Check) must remain');
});

test('S6: Step 4 (Structural Integrity Check) preserved', () => {
  assert.ok(/^###\s+Step\s+4:\s+Structural Integrity Check\b/m.test(md),
    'Step 4 (Structural Integrity Check) must remain');
});

test('S7: SSOT reference to implementation-discipline.md present in Step 5', () => {
  const m = md.match(/^###\s+Step\s+5:[\s\S]*?(?=\n###\s|\n##\s|\n---)/m);
  const sec = m[0];
  assert.ok(/references\/implementation-discipline\.md/.test(sec),
    'Step 5 must cite references/implementation-discipline.md');
});

test('S8: final-adversarial-orchestrator.md was NOT modified (zero-context preserved)', () => {
  // This is the negative invariant required by task §6.
  const FAO = path.join(ROOT, 'agents/quality/final-adversarial-orchestrator.md');
  assert.ok(fs.existsSync(FAO), 'final-adversarial-orchestrator.md must exist');
  const fao = fs.readFileSync(FAO, 'utf8');
  // Sanity: file must NOT mention the new artifacts that v6.2.0 introduces.
  // If anyone wires the discipline layer into the zero-context reviewer, this
  // test trips on purpose.
  assert.ok(!/implementation-discipline\.md/.test(fao),
    'final-adversarial-orchestrator.md must NOT reference implementation-discipline.md (zero-context invariant)');
  assert.ok(!/CHANGE_CONTRACT/.test(fao),
    'final-adversarial-orchestrator.md must NOT reference CHANGE_CONTRACT (zero-context invariant)');
  assert.ok(!/SCOPE LOCK CHECK/.test(fao),
    'final-adversarial-orchestrator.md must NOT reference SCOPE LOCK CHECK (zero-context invariant)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
