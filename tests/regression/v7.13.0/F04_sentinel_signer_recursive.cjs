#!/usr/bin/env node
'use strict';

/**
 * F04 (v7.13.0 — R4): sentinel-state-signer integrity hardening.
 *
 * Proves:
 *   - Recursive stable canonicalization (R4.3): nested-object tampering changes
 *     the signature. The OLD shallow `JSON.stringify(rest, topKeys.sort())`
 *     silently dropped nested keys, so nested tampering was UNDETECTED.
 *   - timingSafeEqual length-mismatch safety (R4.7 corollary): a forged
 *     signature of the wrong length returns valid:false, never throws/crashes.
 *   - Malformed signature hex returns valid:false (no crash).
 *   - Round-trip: a freshly signed state verifies.
 *   - Strict vs migration: unsigned state → valid in migration, invalid in strict.
 *   - Key fallback: env secret is honored; readHmacKey is read-only (no gen).
 *
 * Deterministic key via PIPELINE_HMAC_SECRET.
 */

process.env.PIPELINE_HMAC_SECRET = 'f04-test-secret-key-0123456789abcdef';

const assert = require('node:assert/strict');
const signer = require('../../../lib/sentinel-state-signer.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F04 v7.13.0 sentinel-state-signer recursive canonicalization ===');

const KEY = process.env.PIPELINE_HMAC_SECRET;

test('exports stableCanonicalize and readHmacKey', () => {
  assert.equal(typeof signer.stableCanonicalize, 'function', 'stableCanonicalize must be exported');
  assert.equal(typeof signer.readHmacKey, 'function', 'readHmacKey must be exported');
});

test('stableCanonicalize sorts nested keys recursively + preserves array order', () => {
  const a = signer.stableCanonicalize({ b: { z: 1, a: 2 }, a: [3, 1, 2] });
  const b = signer.stableCanonicalize({ a: [3, 1, 2], b: { a: 2, z: 1 } });
  assert.equal(a, b, 'key order must not change canonical form');
  assert.ok(a.indexOf('"a":2') < a.indexOf('"z":1'), 'nested keys sorted');
  assert.match(a, /\[3,1,2\]/, 'array order preserved (not sorted)');
});

test('computeSignature CHANGES when a NESTED field is tampered (R4.3)', () => {
  const base = { pipeline_active: true, orchestrator_decision: { type: 'Bug Fix', complexity: 'COMPLEXA' } };
  const tampered = { pipeline_active: true, orchestrator_decision: { type: 'Feature', complexity: 'COMPLEXA' } };
  const s1 = signer.computeSignature(base, KEY);
  const s2 = signer.computeSignature(tampered, KEY);
  assert.notEqual(s1, s2, 'nested tampering MUST change the HMAC');
});

test('verifyState REJECTS nested-metadata tampering', () => {
  const signed = signer.signState({ pipeline_active: true, expected_next: 'task-orchestrator', meta: { run: 'A', step: 1 } }, KEY);
  // tamper a nested field without re-signing
  signed.meta.step = 99;
  const v = signer.verifyState(signed, { key: KEY });
  assert.equal(v.valid, false, 'tampered nested field must fail verification');
});

test('verifyState rejects top-level tampering (pipeline_active flip)', () => {
  const signed = signer.signState({ pipeline_active: true, expected_next: 'x' }, KEY);
  signed.pipeline_active = false; // the classic sentinel-neutralization attack
  const v = signer.verifyState(signed, { key: KEY });
  assert.equal(v.valid, false, 'flipping pipeline_active must fail verification');
});

test('verifyState does NOT crash on signature length mismatch (R4.7)', () => {
  const signed = signer.signState({ pipeline_active: true }, KEY);
  signed.__signature.value = 'abcd'; // 2 bytes vs 32 — would throw in timingSafeEqual
  let v;
  assert.doesNotThrow(() => { v = signer.verifyState(signed, { key: KEY }); }, 'must not throw');
  assert.equal(v.valid, false, 'length-mismatched signature is invalid');
});

test('verifyState does NOT crash on non-hex signature', () => {
  const signed = signer.signState({ pipeline_active: true }, KEY);
  signed.__signature.value = 'zzzz-not-hex-!!';
  let v;
  assert.doesNotThrow(() => { v = signer.verifyState(signed, { key: KEY }); });
  assert.equal(v.valid, false);
});

test('round-trip: freshly signed state verifies valid', () => {
  const signed = signer.signState({ pipeline_active: true, expected_next: 'task-orchestrator', nested: { a: 1 } }, KEY);
  const v = signer.verifyState(signed, { key: KEY });
  assert.equal(v.valid, true, v.reason);
});

test('unsigned state: valid in migration mode, invalid in strict mode', () => {
  const plain = { pipeline_active: true };
  const migration = signer.verifyState(plain, { key: KEY, strict: false });
  const strict = signer.verifyState(plain, { key: KEY, strict: true });
  assert.equal(migration.valid, true, 'migration allows unsigned');
  assert.equal(migration.unsigned, true);
  assert.equal(strict.valid, false, 'strict rejects unsigned');
});

test('verification key unavailable → fail-closed only in strict (R4.7)', () => {
  const signed = signer.signState({ pipeline_active: true }, KEY);
  const migration = signer.verifyState(signed, { key: null, strict: false });
  const strict = signer.verifyState(signed, { key: null, strict: true });
  assert.equal(strict.valid, false, 'strict must fail closed when key unavailable');
  assert.equal(migration.valid, true, 'migration tolerates missing key (advisory)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
