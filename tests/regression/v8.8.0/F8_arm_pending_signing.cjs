#!/usr/bin/env node
'use strict';

// =============================================================================
// F8 (v8.8.0) — B5: HMAC signature on the arm-pending marker (AUDIT-007).
//
// NOTE ON NUMBERING: this is F8 (not F7) DELIBERATELY. tests/regression/v7.1.0/
// already owns F7_version_sync.cjs; using F8 here avoids any confusion even
// though the directory differs. (Per the run's placement instructions.)
//
// TDD RED phase. The five user-APPROVED B5 scenarios as labeled sub-checks.
//
// ----------------------------------------------------------------------------
// EXPECTED RED SPLIT — read before running.
// ----------------------------------------------------------------------------
// lib/pipeline-arm.cjs::writeArmPending currently writes an UNSIGNED marker
// (no __signature field). B5 makes it sign the marker (HMAC, same shape as
// sentinel-state) when a key is available, and makes the reader/gate verify it:
// tolerate unsigned unless PIPELINE_HMAC_STRICT; reject tampered always.
//
//   NEW-BEHAVIOR (must FAIL now, on an assertion — valid RED):
//     B5-MAIN    written marker carries a valid __signature (verifyState → valid)
//
//   INVARIANT-GUARD (PASS now via the signer's own contract, must STAY passing):
//     B5-REG-1   tampered signed marker → verify invalid
//     B5-REG-2   unsigned legacy marker tolerated by default (not strict)
//     B5-EDGE-1  strict mode + unsigned → rejected
//     B5-EDGE-2  strict mode + tampered → rejected
//
// The verify helper used is lib/sentinel-state-signer.cjs::verifyState — the
// marker is signed with the SAME __signature envelope as sentinel-state, so the
// same verifier applies (B5 reuses the existing signer rather than inventing a
// second signature scheme — SSOT). If signing is inactive in this env (no HMAC
// key), B5-MAIN is skipped rather than false-passing (a marker cannot be signed
// without a key); the strict-mode guards still hold because they key off the
// presence/absence of the __signature field, not the key.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const arm = require('../../../lib/pipeline-arm.cjs');
const { verifyState, readHmacKey, signState } = require('../../../lib/sentinel-state-signer.cjs');
// SEC-1: the arm-GATE must VERIFY the marker on read. Pull its readArmPending so the
// gate path (not just the signer helper) is exercised against a tampered marker.
const armGate = require('../../../.claude/hooks/pipeline-arm-gate.cjs');

const SIGNING_ACTIVE = !!readHmacKey();
const PIPELINE_PROMPT = '/pipeline-orchestrator:pipeline fix the audit findings';

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'armpending-f8-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

function readMarker(dir) {
  return JSON.parse(fs.readFileSync(arm.markerPath(dir), 'utf8'));
}

console.log('=== F8 v8.8.0 — B5 HMAC-signed arm-pending marker (RED: NEW fail, GUARD pass) ===');

// ---- B5-MAIN [NEW] writeArmPending signs the marker ------------------------
liveTest('B5-MAIN [NEW] writeArmPending writes a marker carrying a valid __signature (verifyState → valid:true)', (dir) => {
  if (!SIGNING_ACTIVE) { console.log('         (signing inactive in env — skipped; a marker cannot be signed without a key)'); return; }
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  const marker = arm.writeArmPending(dir, PIPELINE_PROMPT);
  assert.ok(marker, 'writeArmPending must return a marker for a /pipeline prompt');
  const onDisk = readMarker(dir);
  assert.ok(
    Object.prototype.hasOwnProperty.call(onDisk, '__signature'),
    'the written marker must carry a __signature field (currently UNSIGNED → RED)'
  );
  const v = verifyState(onDisk, { key: readHmacKey() });
  assert.equal(v.valid, true, `verifyState must report valid:true on the signed marker (got: ${v.reason})`);
  assert.notEqual(v.unsigned, true, 'a signed marker must not be reported as unsigned');
});

// ---- B5-REG-1 [GUARD] tampered signed marker → verify invalid --------------
liveTest('B5-REG-1 [GUARD] a signed marker whose field is changed without re-signing → verifyState invalid (rejected)', (dir) => {
  if (!SIGNING_ACTIVE) { console.log('         (signing inactive — skipped)'); return; }
  // Build a correctly-signed marker via the signer (independent of writeArmPending,
  // so this guard holds whether or not B5-MAIN is implemented yet).
  const base = { requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix', mode: 'FULL', type: 'Bug Fix' };
  const signed = signState(base, readHmacKey());
  // Tamper a signed field WITHOUT re-signing.
  signed.workflow = 'FULL/Feature';
  const v = verifyState(signed, { key: readHmacKey() });
  assert.equal(v.valid, false, 'a tampered signed marker must fail verification');
});

// ---- B5-REG-2 [GUARD] unsigned legacy marker tolerated by default ----------
liveTest('B5-REG-2 [GUARD] an UNSIGNED legacy marker is tolerated when PIPELINE_HMAC_STRICT is OFF', (dir) => {
  const legacy = { requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix' }; // no __signature
  const v = verifyState(legacy, { key: readHmacKey(), strict: false });
  assert.equal(v.valid, true, 'unsigned marker must be accepted in migration (non-strict) mode');
  assert.equal(v.unsigned, true, 'and it must be flagged as unsigned');
});

// ---- B5-EDGE-1 [GUARD] strict mode + unsigned → rejected -------------------
liveTest('B5-EDGE-1 [GUARD] strict mode rejects an UNSIGNED marker', (dir) => {
  const legacy = { requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix' };
  const v = verifyState(legacy, { key: readHmacKey(), strict: true });
  assert.equal(v.valid, false, 'unsigned marker must be rejected under strict mode');
});

// ---- B5-EDGE-2 [GUARD] strict mode + tampered → rejected -------------------
liveTest('B5-EDGE-2 [GUARD] strict mode rejects a signed-then-tampered marker', (dir) => {
  if (!SIGNING_ACTIVE) { console.log('         (signing inactive — skipped)'); return; }
  const base = { requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix' };
  const signed = signState(base, readHmacKey());
  signed.mode = 'DIAGNOSTIC'; // tamper
  const v = verifyState(signed, { key: readHmacKey(), strict: true });
  assert.equal(v.valid, false, 'tampered marker must be rejected under strict mode');
});

// ---- B5-SEC1-1 [NEW] arm-GATE readArmPending VERIFIES the marker on read -----
// SEC-1 closure: a SIGNED-then-TAMPERED marker must be treated as NOT-ARMED by the
// arm-gate's own readArmPending (a tampered marker no longer arms the gate). This
// exercises the GATE path, not only the signer helper (which B5-REG-1 already covers).
liveTest('B5-SEC1-1 [NEW] arm-gate readArmPending() rejects a signed-then-tampered marker → not armed (null)', (dir) => {
  if (!SIGNING_ACTIVE) { console.log('         (signing inactive — skipped, cannot forge a tampered signature)'); return; }
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  // Write a real signed marker via the production path, then tamper a signed field
  // on disk WITHOUT re-signing.
  arm.writeArmPending(dir, PIPELINE_PROMPT);
  const onDisk = readMarker(dir);
  onDisk.workflow = 'FULL/Feature-INJECTED'; // tamper after signing
  fs.writeFileSync(arm.markerPath(dir), JSON.stringify(onDisk, null, 2));
  // The gate must NOT trust the tampered marker.
  const got = armGate.readArmPending(dir);
  // Batch 3 (SEC HIGH) CONTRACT CHANGE: readArmPending now returns a structured
  // {armed,tampered} instead of null. A tampered marker is no longer silently "absent"
  // (which failed OPEN) — it is detected as tampering and the window stays GOVERNED
  // (fail-CLOSED), closing the pending-arm self-disarm bypass.
  assert.equal(got.armed, false, 'a tampered marker must NOT be armed (not honored)');
  assert.equal(got.tampered, true, 'a tampered marker is DETECTED as tampering → fail-closed, not silently absent');
});

// ---- B5-SEC1-2 [GUARD] arm-gate readArmPending HONORS an untampered signed marker ----
liveTest('B5-SEC1-2 [GUARD] arm-gate readArmPending() honors a valid signed marker (workflow returned)', (dir) => {
  if (!SIGNING_ACTIVE) { console.log('         (signing inactive — skipped)'); return; }
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  arm.writeArmPending(dir, PIPELINE_PROMPT);
  const got = armGate.readArmPending(dir);
  assert.ok(got && typeof got === 'object', 'a valid signed marker must read as armed (non-null)');
  assert.equal(typeof got.workflow, 'string', 'the workflow field is returned for a valid marker');
});

// ---- B5-SEC1-3 [GUARD] unsigned marker: tolerated default, rejected under STRICT ----
liveTest('B5-SEC1-3 [GUARD] arm-gate readArmPending() tolerates an UNSIGNED marker by default but rejects it under PIPELINE_HMAC_STRICT', (dir) => {
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  const legacy = { requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix' }; // no __signature
  fs.writeFileSync(arm.markerPath(dir), JSON.stringify(legacy, null, 2));
  const prevStrict = process.env.PIPELINE_HMAC_STRICT;
  try {
    delete process.env.PIPELINE_HMAC_STRICT;
    const lenient = armGate.readArmPending(dir);
    assert.ok(lenient && lenient.armed === true && lenient.workflow === 'FULL/Bug Fix', 'unsigned marker tolerated (armed) when strict OFF');
    process.env.PIPELINE_HMAC_STRICT = 'true';
    const strict = armGate.readArmPending(dir);
    // Batch 3 (SEC HIGH) CONTRACT CHANGE: unsigned-under-STRICT is now treated as
    // tampering (fail-CLOSED) rather than silently absent (fail-OPEN).
    assert.equal(strict.armed, false, 'unsigned marker not armed under PIPELINE_HMAC_STRICT');
    assert.equal(strict.tampered, true, 'unsigned-under-strict is treated as tampering → fail-closed');
  } finally {
    if (prevStrict === undefined) delete process.env.PIPELINE_HMAC_STRICT;
    else process.env.PIPELINE_HMAC_STRICT = prevStrict;
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED for [NEW]; [GUARD] should NOT appear here):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
