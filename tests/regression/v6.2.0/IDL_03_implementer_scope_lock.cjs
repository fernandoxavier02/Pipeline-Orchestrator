#!/usr/bin/env node
'use strict';

/**
 * IDL-03 - executor-implementer-task.md enforces SCOPE LOCK CHECK.
 *
 * Asserts:
 *   - SCOPE LOCK CHECK section exists in agents/executor/executor-implementer-task.md
 *   - It is placed AFTER MICRO-GATE and BEFORE any code-writing step
 *   - It lists the disallowed expansion vectors and instructs the
 *     implementer to STOP and return QUESTIONS when violated.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AGENT = path.join(ROOT, 'agents/executor/executor-implementer-task.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== IDL-03 executor-implementer SCOPE LOCK CHECK ===');

const md = fs.readFileSync(AGENT, 'utf8');

test('executor-implementer-task.md declares a SCOPE LOCK CHECK section', () => {
  assert.ok(/SCOPE LOCK CHECK/.test(md), 'missing SCOPE LOCK CHECK section');
});

test('SCOPE LOCK CHECK appears AFTER MICRO-GATE marker', () => {
  const microIdx = md.indexOf('MICRO-GATE');
  const scopeIdx = md.indexOf('SCOPE LOCK CHECK');
  assert.ok(microIdx >= 0, 'MICRO-GATE marker missing');
  assert.ok(scopeIdx > microIdx,
    `SCOPE LOCK CHECK (idx=${scopeIdx}) must come AFTER MICRO-GATE (idx=${microIdx})`);
});

test('SCOPE LOCK CHECK appears BEFORE TDD GREEN/Step 3 code-writing phase', () => {
  // The implementer's code-writing phase is "Step 3: TDD - GREEN".
  const scopeIdx = md.indexOf('SCOPE LOCK CHECK');
  const greenIdx = md.search(/Step\s*3:\s*TDD\s*[-—]?\s*GREEN/);
  assert.ok(scopeIdx >= 0, 'SCOPE LOCK CHECK missing');
  assert.ok(greenIdx >= 0, 'Step 3 GREEN marker missing');
  assert.ok(scopeIdx < greenIdx,
    'SCOPE LOCK CHECK must come BEFORE TDD GREEN code writing');
});

test('SCOPE LOCK CHECK references CHANGE_CONTRACT allowed_files / allowed_new_files', () => {
  assert.ok(/CHANGE_CONTRACT/.test(md), 'missing CHANGE_CONTRACT reference');
  assert.ok(/allowed_files/.test(md), 'missing allowed_files reference');
  assert.ok(/allowed_new_files/.test(md), 'missing allowed_new_files reference');
});

const triggers = [
  'dependenc',
  'package',
  'lockfile',
  'CI',
  'config',
  'migration',
  'schema',
  'public API',
  'abstraction',
  'diff_budget',
];

for (const trigger of triggers) {
  test(`SCOPE LOCK CHECK calls out trigger: ${trigger}`, () => {
    assert.ok(new RegExp(trigger, 'i').test(md),
      `SCOPE LOCK CHECK must enumerate trigger: ${trigger}`);
  });
}

test('SCOPE LOCK CHECK tells the implementer to STOP and return QUESTIONS on violation', () => {
  assert.ok(/QUESTIONS/.test(md), 'must reference QUESTIONS status');
  assert.ok(/STOP/.test(md), 'must require STOP on violation');
});

test('Implementer prohibits unrequested refactors / cleanup / standardization / modernization', () => {
  assert.ok(/unrequested refactor/i.test(md), 'must forbid unrequested refactors');
  assert.ok(/cleanup/i.test(md), 'must forbid unrequested cleanup');
  assert.ok(/standardization/i.test(md), 'must forbid unrequested standardization');
  assert.ok(/modernization/i.test(md), 'must forbid unrequested modernization');
});

test('Implementer references the Implementation Discipline SSOT', () => {
  assert.ok(/implementation-discipline\.md/i.test(md),
    'implementer must reference references/implementation-discipline.md');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
