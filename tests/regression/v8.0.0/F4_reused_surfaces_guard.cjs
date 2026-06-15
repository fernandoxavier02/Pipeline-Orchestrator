#!/usr/bin/env node
'use strict';
// F4 (v8.0.0) — Iron Law: the reused-without-modifying surfaces still carry their
// sentinel strings (proxy for "byte-unchanged" without a baseline hash), and no
// shared findings-schema abstraction was introduced (NEW-2 correction).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../..');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('=== F4 v8.0.0 reused-surface Iron-Law guard ===');

test('spec-light/heavy/audit-only keep their locked sequences (not modified by R10 critic reuse)', () => {
  assert.match(read('skills/spec-light/SKILL.md'), /sequence_lock:\s*true/, 'spec-light sequence_lock');
  assert.match(read('skills/spec-light/SKILL.md'), /sequence:\s*\[1, 2, 3, 4, 5, 6\]/, 'spec-light 6-step sequence');
  assert.match(read('skills/spec-heavy/SKILL.md'), /sequence:\s*\[1, 2, 3, 4, 5, 6, 7, 8, 9\]/, 'spec-heavy 9-step sequence');
});

test('the existing adversarial-architecture-critic keeps its OWN code-shaped schema (not unified)', () => {
  const s = read('agents/executor/type-specific/adversarial-architecture-critic.md');
  assert.match(s, /ARCHITECTURE_FINDINGS/, 'its own output schema name');
  assert.match(s, /design_risks/, 'its own 3-array schema (violations/design_risks/recommendations)');
});

test('the design-interrogator BODY is reused verbatim (sentinel marker present)', () => {
  assert.match(read('agents/quality/design-interrogator.md'), /DESIGN INTERROGATOR/, 'design-interrogator body');
});

test('NO shared findings-schema abstraction was introduced (NEW-2: the two critics keep separate schemas)', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'references/spec-review-findings-schema.md')),
    'references/spec-review-findings-schema.md must NOT exist');
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
