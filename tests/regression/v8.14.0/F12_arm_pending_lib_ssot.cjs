#!/usr/bin/env node
'use strict';

// =============================================================================
// F12 — Batch 5 (architecture ARCH-1/ARCH-2): arm-pending marker reading is SSOT
// =============================================================================
// Before: the HMAC tamper-check + TTL + parse of the arm-pending marker was written
// THREE times (pipeline-arm-gate.readArmPending, audit-read-budget-gate.readMarker,
// audit-dispatch-marker.readMarker), and two hooks require()'d a SIBLING HOOK to
// borrow the predicates. After: ONE lib (lib/arm-pending.cjs) owns the logic; the
// gate delegates and re-exports (back-compat), the two consumers import the lib.
//
// This test pins the lib's contract directly (the security operations that must NOT
// drift): valid → fields; tampered signature → rejected; expired → not-armed (but not
// tampered); absent → not-armed; unsigned → tolerated by default. PLUS parity: the
// gate's readArmPending must return the SAME verdicts as the lib (no behavioral drift
// from the extraction).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f12-arm-pending-ssot-stable-secret-0123456789';
delete process.env.PIPELINE_HMAC_STRICT;
delete process.env.PIPELINE_ARM_TTL_MS;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const armPending = require(path.join(root, 'lib', 'arm-pending.cjs'));
const armGate = require(path.join(root, '.claude', 'hooks', 'pipeline-arm-gate.cjs'));
const signer = require(path.join(root, 'lib', 'sentinel-state-signer.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

function tmpWindow() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-'));
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  return dir;
}
function writeMarker(dir, obj, { sign = true } = {}) {
  let toWrite = obj;
  if (sign && signer && typeof signer.signState === 'function') {
    const key = typeof signer.getOrCreateHmacKey === 'function' ? signer.getOrCreateHmacKey() : undefined;
    toWrite = signer.signState(obj, key);
  }
  fs.writeFileSync(path.join(dir, '.pipeline', 'pipeline-arm-pending.json'), JSON.stringify(toWrite));
}

// ---- lib exports exist ------------------------------------------------------
check('lib exports readArmPendingMarker', typeof armPending.readArmPendingMarker === 'function');
check('lib exports readArmPending', typeof armPending.readArmPending === 'function');
check('lib exports markerIsTampered', typeof armPending.markerIsTampered === 'function');
check('lib exports resolveArmTtlMs', typeof armPending.resolveArmTtlMs === 'function');

// ---- VALID signed marker → narrowed fields + armed --------------------------
{
  const dir = tmpWindow();
  try {
    const reqAt = new Date().toISOString();
    writeMarker(dir, { requested_at: reqAt, workflow: 'FULL/Audit', type: 'Audit' });
    const m = armPending.readArmPendingMarker(dir);
    check('valid: narrowed marker returns requested_at', m && m.requested_at === reqAt);
    check('valid: narrowed marker returns type', m && m.type === 'Audit');
    check('valid: narrowed marker returns workflow', m && m.workflow === 'FULL/Audit');
    const rich = armPending.readArmPending(dir);
    check('valid: rich readArmPending armed=true', rich.armed === true && rich.tampered === false);
    // PARITY: gate delegates to the same lib → same verdict
    check('PARITY valid: gate.readArmPending armed=true', armGate.readArmPending(dir).armed === true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- TAMPERED (signed then mutated) → rejected ------------------------------
{
  const dir = tmpWindow();
  try {
    const reqAt = new Date().toISOString();
    writeMarker(dir, { requested_at: reqAt, workflow: 'FULL/Audit', type: 'Audit' });
    // mutate the signed file's payload without re-signing → invalid signature
    const p = path.join(dir, '.pipeline', 'pipeline-arm-pending.json');
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    obj.type = 'Bug Fix'; // forged change under a now-stale signature
    fs.writeFileSync(p, JSON.stringify(obj));
    check('tampered: narrowed marker → null', armPending.readArmPendingMarker(dir) === null);
    check('tampered: rich → tampered=true, armed=false', armPending.readArmPending(dir).tampered === true);
    check('PARITY tampered: gate → tampered=true', armGate.readArmPending(dir).tampered === true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- EXPIRED well-formed marker → not armed, NOT tampered (recovery path) ----
{
  const dir = tmpWindow();
  try {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago > 30min TTL
    writeMarker(dir, { requested_at: old, workflow: 'FULL/Audit', type: 'Audit' });
    check('expired: narrowed → null', armPending.readArmPendingMarker(dir) === null);
    const rich = armPending.readArmPending(dir);
    check('expired: rich armed=false, tampered=false (legit recovery)', rich.armed === false && rich.tampered === false);
    check('PARITY expired: gate armed=false tampered=false', armGate.readArmPending(dir).armed === false && armGate.readArmPending(dir).tampered === false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- ABSENT marker → not armed, not tampered --------------------------------
{
  const dir = tmpWindow();
  try {
    check('absent: narrowed → null', armPending.readArmPendingMarker(dir) === null);
    check('absent: rich armed=false tampered=false', armPending.readArmPending(dir).armed === false && armPending.readArmPending(dir).tampered === false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- UNSIGNED legacy marker → tolerated by default --------------------------
{
  const dir = tmpWindow();
  try {
    const reqAt = new Date().toISOString();
    writeMarker(dir, { requested_at: reqAt, workflow: 'FULL/Audit', type: 'Audit' }, { sign: false });
    check('unsigned (default): narrowed marker tolerated (non-null)', armPending.readArmPendingMarker(dir) !== null);
    check('unsigned (default): rich armed=true', armPending.readArmPending(dir).armed === true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(failures === 0 ? '\n>>> F12 PASS' : `\n>>> F12 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
