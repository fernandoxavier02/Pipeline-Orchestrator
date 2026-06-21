#!/usr/bin/env node
'use strict';

// =============================================================================
// F6 (v8.9.0) — lib/sentinel-state-signer.cjs no-durable-key contract (H1 / SEC-1)
// =============================================================================
// Pins the root fix for UNIQUE-SEC-1 ("ephemeral HMAC-key fallback bricks every
// governed run"). The signer, when it cannot PERSIST a durable key, must:
//   1. getOrCreateHmacKey() → return null (NOT a fabricated pid+Date.now() key).
//   2. signState(state, null-resolved) → return the state UNSIGNED (no
//      __signature field), mirroring the established `if (key) signState`
//      convention live at lib/pipeline-arm.cjs.
//   3. writeSignedState(...) with no durable key → the on-disk body is UNSIGNED.
//   4. verifyState(unsigned) → { valid:true, unsigned:true } in migration mode
//      (tolerated), and { valid:false } only under PIPELINE_HMAC_STRICT.
//   5. A genuinely TAMPERED signed state (mismatch against a REAL key) still
//      verifies false — the net deny invariant is preserved.
//
// Mutation-resistance:
//   (a) Reverting getOrCreateHmacKey to the ephemeral fallback ⇒ test 1 (null)
//       AND test 3 (unsigned on disk) FAIL — a non-null ephemeral key would be
//       returned and the state would be SIGNED with it.
//   (b) Weakening verifyState so a real tampered signature passes ⇒ test 5 FAILS.
//
// We force the no-durable-key condition WITHOUT touching the real plugin cache:
// point os.homedir() at a temp dir AND null out PIPELINE_HMAC_SECRET, then make
// the key-file write fail by pre-creating the key PATH as a directory (so
// fs.writeFileSync(keyPath, ...) throws EISDIR). That exercises the catch branch
// deterministically on every OS without needing real read-only permissions.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F6 v8.9.0 — signer no-durable-key contract (H1 / SEC-1) ===');

// Fresh module instance with a controlled environment. We override os.homedir via
// the env vars the signer's pluginCacheDir ultimately derives from on each OS, and
// block the key file write by occupying the key path with a directory.
function withKeylessSigner(fn) {
  const realSecret = process.env.PIPELINE_HMAC_SECRET;
  const realHome = process.env.HOME;
  const realUserProfile = process.env.USERPROFILE;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'f6-nokey-home-'));
  // Reproduce the signer's key path under the fake home and occupy it with a DIR
  // so writeFileSync throws (EISDIR) → the catch branch (return null) fires.
  const keyDir = path.join(tmpHome, '.claude', 'plugins', 'cache', 'FX-studio-AI', 'pipeline-orchestrator');
  fs.mkdirSync(path.join(keyDir, '.hmac-key'), { recursive: true }); // key PATH is a directory
  delete process.env.PIPELINE_HMAC_SECRET;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  // Force os.homedir() to honor the env (Node caches nothing here, but be explicit).
  const realHomedir = os.homedir;
  os.homedir = () => tmpHome;
  // Fresh require so any internal state is clean.
  const modPath = require.resolve('../../../lib/sentinel-state-signer.cjs');
  delete require.cache[modPath];
  const signer = require(modPath);
  try {
    fn(signer);
  } finally {
    os.homedir = realHomedir;
    if (realSecret === undefined) delete process.env.PIPELINE_HMAC_SECRET; else process.env.PIPELINE_HMAC_SECRET = realSecret;
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realUserProfile;
    delete require.cache[modPath];
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
  }
}

// 1) getOrCreateHmacKey returns null when no durable key can be persisted.
test('getOrCreateHmacKey returns null when the key cannot be persisted (no ephemeral fabrication)', () => {
  withKeylessSigner((signer) => {
    const key = signer.getOrCreateHmacKey();
    assert.equal(key, null,
      'no durable key → getOrCreateHmacKey must return null, NOT a fabricated pid+Date.now() ephemeral key (SEC-1)');
  });
});

// 2) signState with no resolvable key → returns UNSIGNED object (no __signature).
test('signState returns the state UNSIGNED when no durable key is available', () => {
  withKeylessSigner((signer) => {
    const out = signer.signState({ pipeline_active: true, run_id: 'r' });
    assert.ok(out && typeof out === 'object', 'signState must still return the state object');
    assert.ok(!(signer.SIGNATURE_FIELD in out),
      'with no durable key, signState must omit the __signature field (UNSIGNED, migration-tolerated)');
    assert.equal(out.pipeline_active, true, 'the state body must be preserved');
    assert.equal(out.run_id, 'r', 'the state body must be preserved');
  });
});

// 2b) signState strips a stale carried-in signature when it has no key to back it.
test('signState strips a stale __signature when no durable key backs it', () => {
  withKeylessSigner((signer) => {
    const out = signer.signState({ pipeline_active: true, __signature: { algorithm: 'sha256', value: 'deadbeef', schema_version: 1 } });
    assert.ok(!(signer.SIGNATURE_FIELD in out),
      'a stale signature must never survive an unsigned write — no signature must be shipped that no key backs');
  });
});

// 3) writeSignedState → the on-disk body is UNSIGNED when no durable key exists.
test('writeSignedState writes an UNSIGNED body when no durable key is available', () => {
  withKeylessSigner((signer) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f6-write-'));
    try {
      const p = path.join(dir, 'sentinel-state.json');
      signer.writeSignedState(p, { pipeline_active: true, run_id: 'r', state_version: 1 });
      const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.ok(!('__signature' in onDisk),
        'no durable key → writeSignedState must persist UNSIGNED state (no __signature) so the next process tolerates it, not an ephemeral signature that bricks verification');
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });
});

// 4) verifyState tolerates the unsigned body in migration, rejects under strict.
test('verifyState tolerates the unsigned body in migration mode and rejects it under strict', () => {
  withKeylessSigner((signer) => {
    const unsigned = signer.signState({ pipeline_active: true, run_id: 'r' });
    const migration = signer.verifyState(unsigned, { key: null, strict: false });
    assert.equal(migration.valid, true, 'unsigned state must be tolerated in migration mode');
    assert.equal(migration.unsigned, true, 'verifyState must flag the state as unsigned');
    const strict = signer.verifyState(unsigned, { key: null, strict: true });
    assert.equal(strict.valid, false, 'PIPELINE_HMAC_STRICT must still escalate unsigned → deny for opt-in operators');
  });
});

// 5) NET INVARIANT: a genuinely TAMPERED signed state (real key) still denies.
//    (Run with a DURABLE key via the env secret so signing is real, then tamper.)
test('a genuinely tampered signed state (real key) still verifies FALSE — net deny preserved', () => {
  const realSecret = process.env.PIPELINE_HMAC_SECRET;
  process.env.PIPELINE_HMAC_SECRET = 'f6-real-durable-secret-0123456789abcdef';
  const modPath = require.resolve('../../../lib/sentinel-state-signer.cjs');
  delete require.cache[modPath];
  const signer = require(modPath);
  try {
    const KEY = process.env.PIPELINE_HMAC_SECRET;
    const signed = signer.signState({ pipeline_active: true, run_id: 'r' }, KEY);
    assert.ok(signer.SIGNATURE_FIELD in signed, 'with a real key the state must be SIGNED');
    // Tamper the body without re-signing.
    signed.run_id = 'TAMPERED';
    const v = signer.verifyState(signed, { key: KEY });
    assert.equal(v.valid, false, 'a tampered signed body must verify FALSE (the deny invariant holds)');
  } finally {
    if (realSecret === undefined) delete process.env.PIPELINE_HMAC_SECRET; else process.env.PIPELINE_HMAC_SECRET = realSecret;
    delete require.cache[modPath];
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks:');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
