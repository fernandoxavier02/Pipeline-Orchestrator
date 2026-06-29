#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.19.0) — REQ-B5: the stale "DEFAULT-OFF" header comment in
// subagent-stop-commit-hook.cjs misrepresents the SHIPPED posture (the gate is
// DEFAULT-ON since v8.11.0 B4). The header block must NOT contain "DEFAULT-OFF".
//
// EXPECTED RED (before T3.2): the header still says "DEFAULT-OFF: the gate is inert
//   unless …" → this assertion fails.
// EXPECTED GREEN (after T3.2): header rewritten to "DEFAULT-ON (since v8.11.0 B4;
//   escape PIPELINE_SUBAGENTSTOP_ENFORCEMENT=warn)".
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/subagent-stop-commit-hook.cjs');

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F3 v8.19.0 — subagent-stop header is not stale ("DEFAULT-OFF") ===');

check('the header block does NOT contain the literal "DEFAULT-OFF"', () => {
  const header = fs.readFileSync(HOOK, 'utf8').split(/\r?\n/).slice(0, 30).join('\n');
  assert.ok(!header.includes('DEFAULT-OFF'),
    'the subagent-stop-commit-hook header still claims "DEFAULT-OFF" — the shipped gate is DEFAULT-ON (REQ-B5)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
