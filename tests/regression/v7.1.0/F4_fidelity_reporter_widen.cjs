#!/usr/bin/env node
'use strict';

/**
 * F4 — lib/fidelity-reporter.cjs VALID_HARDNESS includes AUDIT,
 * VALID_DECISION includes all 8 canonical values, and validateDecision
 * pushes a warning to a caller-supplied warnings array when value is unknown.
 *
 * EXPECTED RED STATE: VALID_HARDNESS missing AUDIT; VALID_DECISION has only 6;
 *                     validateDecision returns '(invalid)' silently.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F4 (Finding #2).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'lib/fidelity-reporter.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read() { return fs.readFileSync(TARGET, 'utf8'); }

console.log('=== F4 fidelity-reporter VALID_HARDNESS+VALID_DECISION widening ===');

test('fidelity-reporter VALID_HARDNESS effective Set includes "AUDIT"', () => {
  // v7.1.0 hardening: VALID_HARDNESS now references CANONICAL_HARDNESS from
  // gate-decision-writer.cjs (structural SSOT). We check the behavioural
  // contract — that the Set used at runtime contains AUDIT — rather than the
  // literal source layout.
  const src = read();
  // Either the literal definition OR the import-from-canonical pattern is acceptable.
  const hasLiteral = /VALID_HARDNESS\s*=\s*new\s+Set\(\s*\[[^\]]*['"]AUDIT['"]/.test(src);
  const hasCanonicalImport = /VALID_HARDNESS\s*=\s*CANONICAL_HARDNESS/.test(src)
                          && /require\(['"]\.\/gate-decision-writer/.test(src);
  assert.ok(hasLiteral || hasCanonicalImport,
    'expected VALID_HARDNESS to contain AUDIT either literally or via CANONICAL_HARDNESS import');
  // Behavioural verification via runtime require of the writer
  const { CANONICAL_HARDNESS } = require(path.join(ROOT, 'lib/gate-decision-writer.cjs'));
  assert.ok(CANONICAL_HARDNESS.has('AUDIT'), 'CANONICAL_HARDNESS must contain AUDIT');
});

test('fidelity-reporter VALID_DECISION effective Set includes all 8 canonical values', () => {
  const src = read();
  // Either literal or import-from-canonical pattern is acceptable.
  const hasLiteralAll = ['BLOCKED', 'DISPATCHED', 'SKIPPED', 'APPROVED', 'CONFIRMED', 'REJECTED', 'TRIGGERED', 'NOT_TRIGGERED']
    .every(v => new RegExp(`VALID_DECISION\\s*=\\s*new\\s+Set\\(\\s*\\[[\\s\\S]*?['"]${v}['"]`).test(src));
  const hasCanonicalImport = /VALID_DECISION\s*=\s*CANONICAL_DECISIONS/.test(src)
                          && /require\(['"]\.\/gate-decision-writer/.test(src);
  assert.ok(hasLiteralAll || hasCanonicalImport,
    'expected VALID_DECISION to contain all 8 canonical values either literally or via CANONICAL_DECISIONS import');
  const { CANONICAL_DECISIONS } = require(path.join(ROOT, 'lib/gate-decision-writer.cjs'));
  for (const v of ['BLOCKED', 'DISPATCHED', 'SKIPPED', 'APPROVED', 'CONFIRMED', 'REJECTED', 'TRIGGERED', 'NOT_TRIGGERED']) {
    assert.ok(CANONICAL_DECISIONS.has(v), `CANONICAL_DECISIONS missing "${v}"`);
  }
});

test('validateDecision pushes to warnings[] on unknown value', () => {
  const src = read();
  // Check that validateDecision or its callers push a warning when value is not in the set.
  // Lenient pattern: function validateDecision contains warnings.push OR pushes via a
  // closure that includes the value being validated.
  const re = /function\s+validateDecision[\s\S]*?warnings\.push[\s\S]*?\}/;
  assert.ok(
    re.test(src),
    'expected validateDecision to push a warning on unknown value (warnings.push inside the function)'
  );
});

test('validateHardness pushes to warnings[] on unknown value', () => {
  const src = read();
  const re = /function\s+validateHardness[\s\S]*?warnings\.push[\s\S]*?\}/;
  assert.ok(
    re.test(src),
    'expected validateHardness to push a warning on unknown value (warnings.push inside the function)'
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
