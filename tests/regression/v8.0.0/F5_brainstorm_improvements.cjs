#!/usr/bin/env node
'use strict';
// F5 (v8.0.0) — the two global brainstorm improvements: (a) ideation step 1c wired
// into the brainstorm-controller with the fractional 1b->1c numbering + resume
// back-compat; (b) explore step hardened so decision-class gaps always escalate.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../..');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('=== F5 v8.0.0 brainstorm improvements ===');

test('brainstorm-controller wires step 1c with fractional 1b->1c numbering + back-compat', () => {
  const s = read('agents/core/brainstorm-controller.md');
  assert.match(s, /step-01c-ideation/, 'step 1c in the table');
  assert.match(s, /11 sequential steps/, 'step count advertised as 11');
  assert.match(s, /ideation_done/, 'notes.options.ideation_done flag');
  assert.match(s, /1b and 1c|fractional/i, 'numbering note covers the 1b/1c fractional pair');
});

test('brainstorm-controller terminal guard is controller_type-aware (a spec run is not false-completed)', () => {
  assert.match(read('agents/core/brainstorm-controller.md'), /controller_type/, 'controller_type guard in terminal check');
});

test('explore step hardened: decision-class gaps escalate, only factual lookups self-resolve', () => {
  const s = read('agents/brainstorm/step-01-explore.md');
  assert.match(s, /Decision-class/i, 'decision-class vs factual rule present');
  assert.match(s, /MUST NOT self-resolve|escalate every one/i, 'never self-decide product-shaping gaps');
  // telemetry uses only canonical decision values (no COMPLETED/ANSWERED)
  assert.ok(!/"decision":"COMPLETED"/.test(s), 'no non-canonical COMPLETED');
  assert.ok(!/"decision":"ANSWERED"/.test(s), 'no non-canonical ANSWERED');
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
