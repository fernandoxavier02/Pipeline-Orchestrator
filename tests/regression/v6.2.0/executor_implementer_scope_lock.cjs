#!/usr/bin/env node
'use strict';

/**
 * v6.2.0 — executor-implementer-task.md gains SCOPE LOCK CHECK
 *
 * Asserts the SCOPE LOCK CHECK section is present, sits between MICRO-GATE
 * and code writes, and enumerates the 10 stop-checks + scope-creep traps
 * + SCOPE_LOCK_BLOCK return schema.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const IMPL = path.join(ROOT, 'agents/executor/executor-implementer-task.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== v6.2.0 executor-implementer-task SCOPE LOCK CHECK ===');

const md = fs.readFileSync(IMPL, 'utf8');

test('S1: "SCOPE LOCK CHECK" heading exists', () => {
  assert.ok(/^##\s+SCOPE LOCK CHECK\b/m.test(md),
    'missing "## SCOPE LOCK CHECK" heading');
});

test('S2: SCOPE LOCK CHECK heading appears AFTER MICRO-GATE heading', () => {
  const idxMG = md.search(/^##\s+MICRO-GATE\b/m);
  const idxSL = md.search(/^##\s+SCOPE LOCK CHECK\b/m);
  assert.ok(idxMG > 0, 'MICRO-GATE heading not found');
  assert.ok(idxSL > 0, 'SCOPE LOCK CHECK heading not found');
  assert.ok(idxSL > idxMG,
    `SCOPE LOCK CHECK (pos ${idxSL}) must appear AFTER MICRO-GATE (pos ${idxMG})`);
});

test('S3: SCOPE LOCK CHECK section enumerates the 10 mandatory stop-checks', () => {
  // Capture the SCOPE LOCK CHECK section
  const m = md.match(/^##\s+SCOPE LOCK CHECK\b[\s\S]*?(?=\n##\s)/m);
  assert.ok(m, 'SCOPE LOCK CHECK section body not captured');
  const sec = m[0];
  // Find the numbered rows in the check table — count of "| N |" entries
  const nums = sec.match(/^\|\s*(\d+)\s*\|/gm) || [];
  const uniqueNums = new Set(nums.map((s) => s.replace(/\D/g, '')));
  assert.ok(uniqueNums.size >= 10,
    `expected at least 10 numbered stop-checks; found ${uniqueNums.size} (${Array.from(uniqueNums).join(',')})`);
});

test('S4: section references CHANGE_CONTRACT fields', () => {
  const m = md.match(/^##\s+SCOPE LOCK CHECK\b[\s\S]*?(?=\n##\s)/m);
  const sec = m[0];
  for (const f of ['allowed_files', 'allowed_new_files', 'diff_budget']) {
    assert.ok(new RegExp(`\\b${f}\\b`).test(sec),
      `SCOPE LOCK CHECK must reference CHANGE_CONTRACT field "${f}"`);
  }
});

test('S5: scope-creep traps enumerated (refactor, cleanup, modernization, feature, speculation)', () => {
  const m = md.match(/^##\s+SCOPE LOCK CHECK\b[\s\S]*?(?=\n##\s)/m);
  const sec = m[0];
  const traps = [
    /unrequested refactor/i,
    /drive-by cleanup/i,
    /standardization|modernization/i,
    /feature addition/i,
    /speculative/i,
  ];
  for (const t of traps) {
    assert.ok(t.test(sec), `scope-creep trap missing: ${t}`);
  }
});

test('S6: defines SCOPE_LOCK_BLOCK YAML return schema with required fields', () => {
  const m = md.match(/^##\s+SCOPE LOCK CHECK\b[\s\S]*?(?=\n##\s)/m);
  const sec = m[0];
  assert.ok(/SCOPE_LOCK_BLOCK\s*:/.test(sec),
    'missing SCOPE_LOCK_BLOCK YAML schema');
  for (const f of ['task_id', 'check_failed', 'description', 'contract_field', 'question']) {
    assert.ok(new RegExp(`\\b${f}\\s*:`).test(sec),
      `SCOPE_LOCK_BLOCK missing field "${f}"`);
  }
});

test('S7: IRON LAWS section adds "Scope Lock Second"', () => {
  const m = md.match(/^##\s+IRON LAWS\b[\s\S]*?(?=\n##\s|\n---)/m);
  assert.ok(m, 'IRON LAWS section not found');
  assert.ok(/Scope[- ]?Lock Second/i.test(m[0]),
    'IRON LAWS must include "Scope Lock Second"');
});

test('S8: PROCESS section adds Step 0.5 Scope Lock Check', () => {
  assert.ok(/^###\s+Step\s+0\.5:\s+Scope Lock Check\b/m.test(md),
    'PROCESS missing "### Step 0.5: Scope Lock Check"');
});

test('S9: EVERY IMPLEMENTER_RESULT YAML block declares scope_lock', () => {
  // Find every ```yaml fenced block that starts with IMPLEMENTER_RESULT:
  // and assert each declares scope_lock. This is stricter than "at least one"
  // — it prevents any documented return-path from omitting gate state.
  const blocks = md.match(/```yaml\s*\n\s*IMPLEMENTER_RESULT:[\s\S]*?```/g) || [];
  assert.ok(blocks.length >= 2,
    `expected at least 2 IMPLEMENTER_RESULT YAML blocks (RETURN LOOP + Step 6), found ${blocks.length}`);
  blocks.forEach((b, i) => {
    assert.ok(/\bscope_lock\s*:/.test(b),
      `IMPLEMENTER_RESULT block #${i + 1} missing scope_lock field:\n${b.slice(0, 200)}...`);
  });
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
