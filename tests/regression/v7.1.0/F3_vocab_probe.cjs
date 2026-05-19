#!/usr/bin/env node
'use strict';

/**
 * F3 — Four agent prose files reference the canonical vocabulary (not the
 * 40-value chaos). Permissive check: each file must mention "canonical" decision
 * vocabulary OR explicitly list at least 3 canonical values OR reference
 * gate-decision-writer / CANONICAL_DECISIONS.
 *
 * EXPECTED RED STATE: files don't mention canonical vocab yet.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F3 (Finding #1 prose cleanup).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const FILES = [
  'agents/core/finishing-branch.md',
  'agents/core/pipeline-controller.md',
  'agents/executor/spec-closer.md',
  'agents/brainstorm/step-01b-alternatives.md',
];

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F3 canonical vocabulary referenced in 4 agent prose files ===');

for (const rel of FILES) {
  test(`${rel} references canonical vocabulary`, () => {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `file missing: ${rel}`);
    const md = fs.readFileSync(abs, 'utf8');
    const mentionsCanonical = /canonical decision|CANONICAL_DECISIONS|gate-decision-writer/i.test(md);
    assert.ok(
      mentionsCanonical,
      `expected ${rel} to reference canonical vocabulary (canonical decision / CANONICAL_DECISIONS / gate-decision-writer)`
    );
  });
}

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
