#!/usr/bin/env node
'use strict';

// =============================================================================
// B0 (v8.13.0) — AUDIT READ-BUDGET — export-shape contract pin.
// =============================================================================
// Pins the public surface of lib/audit-read-budget.cjs so a future refactor
// can't silently drop a function the two hooks (blocker + counter) depend on.
// Mirrors tests/regression/v8.12.0/B0_contracts.cjs. RED until Batch 1.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
let mod = null;
try { mod = require(path.join(ROOT, 'lib/audit-read-budget.cjs')); } catch { mod = null; }

const REQUIRED_FNS = [
  'decideAuditReadBudget',   // pure brain (blocker)
  'isCountableRead',         // shared window predicate (counter)
  'resolveReadBudget',       // env resolver, floor 1, default 12
  'resolveAuditEnforce',     // env resolver, default 'deny'
  'sanitizeWorkflow',        // anti-injection for the reason
  'buildAuditInlineReason',  // deny reason
  'buildAuditCorrectiveDescriptor', // CorrectivePayload-shaped (blocking:true)
  'armIdFor',                // sha256(requested_at) → ledger key
  'ledgerPath',              // .pipeline/state/governed-read-ledger.json
  'readLedger',              // (cwd, armId) → { count } (0 on absent/mismatch/tampered)
  'bumpLedger',              // (cwd, marker) → increments under lock, signed
];
const REQUIRED_VALS = ['READ_ONLY_ESCAPABLE_TYPES', 'DEFAULT_READ_BUDGET'];

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== B0 v8.13.0 — audit read-budget export contract (RED until lib exists) ===');

check('module loads', () => assert.ok(mod, 'lib/audit-read-budget.cjs must load — RED until Batch 1'));
for (const fn of REQUIRED_FNS) {
  check(`exports function ${fn}`, () => assert.equal(typeof (mod && mod[fn]), 'function', `${fn} must be a function`));
}
for (const v of REQUIRED_VALS) {
  check(`exports value ${v}`, () => assert.ok(mod && mod[v] !== undefined, `${v} must be exported`));
}

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
