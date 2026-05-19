#!/usr/bin/env node
'use strict';

/**
 * F2 — codex-operational-runtime.cjs delegates ALL gate-decisions.jsonl writes
 * to lib/gate-decision-writer.cjs (no direct appendJsonl(gate-decisions.jsonl) calls).
 *
 * EXPECTED RED STATE: codex-operational-runtime.cjs has 9 direct appendJsonl calls.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F2 (Finding #1 migration).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'lib/codex-operational-runtime.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read() { return fs.readFileSync(TARGET, 'utf8'); }

console.log('=== F2 codex-operational-runtime migrated to gate-decision-writer ===');

test('codex-operational-runtime.cjs requires lib/gate-decision-writer', () => {
  const src = read();
  assert.ok(
    /require\(['"]\.\/gate-decision-writer(\.cjs)?['"]\)/.test(src),
    'expected require("./gate-decision-writer") in codex-operational-runtime.cjs'
  );
});

test('codex-operational-runtime.cjs uses appendGateDecision', () => {
  const src = read();
  assert.ok(
    /appendGateDecision\s*\(/.test(src),
    'expected at least one appendGateDecision(...) call'
  );
});

test('codex-operational-runtime.cjs has ZERO direct appendJsonl(gate-decisions.jsonl) calls', () => {
  const src = read();
  // Match any line that calls appendJsonl with 'gate-decisions.jsonl' in the same line
  const direct = src.match(/appendJsonl\s*\([^)]*gate-decisions\.jsonl/g) || [];
  assert.equal(
    direct.length,
    0,
    `expected 0 direct appendJsonl(gate-decisions.jsonl) calls but found ${direct.length}`
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
