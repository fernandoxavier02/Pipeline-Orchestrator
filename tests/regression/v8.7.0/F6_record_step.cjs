#!/usr/bin/env node
'use strict';

// =============================================================================
// F6 (v8.7.0) — record-step stamping (TDD RED→GREEN).
//
// Proves the deterministic stamp primitive: appends a completed step into the
// signed sentinel-state.step_ledger, idempotently, preserving the rest of the
// state, validating the step vocabulary, and refusing path traversal. Mirrors
// the v8.5.0 record-spec-step contract.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { recordStep } = require('../../../scripts/record-step.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recstep-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function seed(dir, obj) {
  fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(obj, null, 2));
}
function readLedger(dir) {
  const s = JSON.parse(fs.readFileSync(path.join(dir, 'sentinel-state.json'), 'utf8'));
  return s;
}

console.log('=== F6 v8.7.0 — record-step stamping ===');

test('F6-1 — stamps a step and PRESERVES the rest of the state', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true });
  const r = recordStep(dir, 'classify');
  assert.equal(r.ok, true, r.error);
  const s = readLedger(dir);
  assert.deepEqual(s.step_ledger, ['classify']);
  assert.equal(s.run_id, 'r1');          // preserved
  assert.equal(s.pipeline_active, true); // preserved
});

test('F6-2 — re-stamping the same step is idempotent', (dir) => {
  seed(dir, { run_id: 'r1' });
  recordStep(dir, 'classify');
  recordStep(dir, 'classify');
  assert.deepEqual(readLedger(dir).step_ledger, ['classify']);
});

test('F6-3 — second step appends in order', (dir) => {
  seed(dir, { run_id: 'r1' });
  recordStep(dir, 'classify');
  recordStep(dir, 'info-gate');
  assert.deepEqual(readLedger(dir).step_ledger, ['classify', 'info-gate']);
});

test('F6-4 — unknown step is rejected (anti-invention)', (dir) => {
  seed(dir, { run_id: 'r1' });
  const r = recordStep(dir, 'totally-made-up');
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown step/);
});

test('F6-5 — path traversal is rejected', () => {
  const r = recordStep('../../../etc', 'classify');
  assert.equal(r.ok, false);
  assert.match(r.error, /outside allowed run root/);
});

test('F6-6 — the stamped state is HMAC-signed (has a signature field)', (dir) => {
  seed(dir, { run_id: 'r1' });
  recordStep(dir, 'classify');
  const s = readLedger(dir);
  // sentinel-state-signer attaches a signature container; assert one exists.
  const hasSig = Object.keys(s).some((k) => /sig|hmac|signature/i.test(k));
  assert.ok(hasSig, 'expected a signature field on the written state');
});

console.log(`\n=== F6 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
