#!/usr/bin/env node
'use strict';

/**
 * F10 — agents/executor/executor-implementer-task.md contains a
 * "## SCOPE LOCK CHECK" section, positioned after MICRO-GATE,
 * with the violation-status protocol and Bootstrap exception.
 *
 * EXPECTED RED STATE on first run: section does not exist yet.
 *
 * Covers v6.3.0 batch-adversarial-discipline scenario F10.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'agents/executor/executor-implementer-task.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readTarget() {
  return fs.readFileSync(TARGET, 'utf8');
}

console.log('=== F10 executor-implementer-task.md SCOPE LOCK CHECK section ===');

test('agents/executor/executor-implementer-task.md exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('contains exact heading "## SCOPE LOCK CHECK"', () => {
  const content = readTarget();
  assert.ok(/^##\s+SCOPE\s+LOCK\s+CHECK\s*$/m.test(content),
    'expected exact "## SCOPE LOCK CHECK" heading on its own line');
});

test('## SCOPE LOCK CHECK appears AFTER ## MICRO-GATE', () => {
  const content = readTarget();
  const microGateIdx = content.search(/^##\s+MICRO-GATE/m);
  const scopeLockIdx = content.search(/^##\s+SCOPE\s+LOCK\s+CHECK/m);
  assert.ok(microGateIdx >= 0, 'MICRO-GATE heading not found');
  assert.ok(scopeLockIdx >= 0, 'SCOPE LOCK CHECK heading not found');
  assert.ok(scopeLockIdx > microGateIdx,
    `SCOPE LOCK CHECK (idx=${scopeLockIdx}) must come after MICRO-GATE (idx=${microGateIdx})`);
});

test('## SCOPE LOCK CHECK is not the last heading in the file', () => {
  const content = readTarget();
  const scopeLockIdx = content.search(/^##\s+SCOPE\s+LOCK\s+CHECK/m);
  assert.ok(scopeLockIdx >= 0, 'SCOPE LOCK CHECK heading not found');
  // Find any ## heading after SCOPE LOCK CHECK
  const after = content.slice(scopeLockIdx + 1);
  const nextHeading = after.search(/^##\s+\S/m);
  assert.ok(nextHeading >= 0,
    'SCOPE LOCK CHECK should not be the final heading — expected at least one ## heading after');
});

test('contains violation protocol: status: QUESTIONS + scope_lock_violation', () => {
  const content = readTarget();
  assert.ok(/status:\s*QUESTIONS/.test(content),
    'expected "status: QUESTIONS" violation protocol marker');
  assert.ok(/scope_lock_violation/.test(content),
    'expected "scope_lock_violation" marker');
});

test('mentions Write and Edit tools as firing scope, Read NOT locked', () => {
  const content = readTarget();
  assert.ok(/\bWrite\b/.test(content), 'missing Write tool reference');
  assert.ok(/\bEdit\b/.test(content), 'missing Edit tool reference');
  // Note that Read is not locked / Read is allowed / Read is exempt etc.
  assert.ok(/Read[\s\S]{0,80}(not\s+locked|not\s+restricted|allowed|exempt|free)/i.test(content) ||
            /(not\s+locked|exempt|allowed)[\s\S]{0,80}Read/i.test(content),
    'expected explicit note that Read is NOT locked');
});

test('contains Bootstrap exception cross-reference to implementation-discipline.md', () => {
  const content = readTarget();
  assert.ok(/[Bb]ootstrap/.test(content), 'missing Bootstrap exception reference');
  assert.ok(/implementation-discipline\.md/.test(content),
    'expected cross-reference to implementation-discipline.md');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
