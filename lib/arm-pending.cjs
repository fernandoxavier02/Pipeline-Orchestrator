#!/usr/bin/env node
'use strict';

// =============================================================================
// arm-pending.cjs — v8.14.0 (Batch 5 / ARCH-1 + ARCH-2) — SSOT for marker reading
// =============================================================================
// SINGLE source of truth for reading the arm-pending marker
// (.pipeline/pipeline-arm-pending.json): the HMAC tamper-check (verify-on-read),
// the TTL resolution, the JSON parse, and the well-formed/expired/tampered
// discrimination. Before this module the SAME logic was written THREE times
// (pipeline-arm-gate.readArmPending, audit-read-budget-gate.readMarker,
// audit-dispatch-marker.readMarker) and two hooks require()'d a sibling HOOK to
// borrow the predicates — a DRY/DIP violation flagged CRITICAL by the architecture
// review. The logic here is LIFTED VERBATIM from the security-reviewed arm-gate
// (SEC-1 verify-on-read + SEC-3 TTL floor), so the extraction is behavior-identical;
// the gate now delegates to (and re-exports) these functions.
//
// PURE-ish + guarded: a missing signer falls back to tolerate (never bricks the
// front door); FS/parse errors map to absent/tampered exactly as before.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let signer = null;
try { signer = require('./sentinel-state-signer.cjs'); } catch { signer = null; }

const ARM_TTL_DEFAULT_MS = 30 * 60 * 1000; // 30 min
const ARM_TTL_FLOOR_MS = 1000;             // sane floor

function armMarkerPath(dir) {
  return path.join(dir, '.pipeline', 'pipeline-arm-pending.json');
}

// SEC-3: a negative/zero/NaN PIPELINE_ARM_TTL_MS would make EVERY marker instantly
// "expired", silently disabling the gate. Only honour a finite value at or above a
// 1s floor; otherwise fall back to the 30-min default.
function resolveArmTtlMs() {
  const raw = Number(process.env.PIPELINE_ARM_TTL_MS);
  if (Number.isFinite(raw) && raw >= ARM_TTL_FLOOR_MS) return raw;
  return ARM_TTL_DEFAULT_MS;
}

// SEC-1 (AUDIT-007/B5): verify the marker's HMAC signature on READ. Posture (mirrors
// the sentinel-hook / step-ledger-stamp SEC-1 stance):
//   - signed + INVALID (tampered, key present) → reject (treat as absent → fail-OPEN);
//   - UNSIGNED legacy marker → tolerate by default; reject only under PIPELINE_HMAC_STRICT;
//   - key unavailable / signer missing → tolerate (no key to verify → fallback).
// Returns true when the marker must be REJECTED, false when acceptable.
function markerIsTampered(marker) {
  if (!signer || typeof signer.verifyState !== 'function') return false; // no verifier → tolerate
  let v;
  try { v = signer.verifyState(marker, { key: signer.readHmacKey() }); }
  catch { return false; } // verifier error → fail-OPEN (do not brick the front door)
  if (!v || typeof v !== 'object') return false;
  if (v.unsigned) return process.env.PIPELINE_HMAC_STRICT === 'true';
  if (v.key_unavailable) return false; // no key on this host → cannot verify → tolerate
  return v.valid !== true; // signed marker: reject IFF the signature does not verify
}

// Rich shape (the arm-gate's contract). Distinguishes a genuinely ABSENT marker
// (fail-OPEN) from a TAMPERED one (present but unparseable / structurally invalid /
// signed-but-invalid → keep the window GOVERNED, closing the self-disarm vector). A
// well-formed EXPIRED marker is NOT tampering — it is the legitimate TTL recovery path.
// Returns { armed:bool, tampered:bool, workflow? }.
function readArmPending(dir) {
  let raw;
  try { raw = fs.readFileSync(armMarkerPath(dir), 'utf8'); }
  catch { return { armed: false, tampered: false }; } // ENOENT/read-error → absent, fail-open
  let m;
  try { m = JSON.parse(raw); }
  catch { return { armed: false, tampered: true }; } // garbage written over the marker → TAMPERING
  if (markerIsTampered(m)) return { armed: false, tampered: true }; // signed-but-invalid → forgery
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { armed: false, tampered: true };
  const ts = Date.parse(m.requested_at);
  if (!Number.isFinite(ts)) return { armed: false, tampered: true }; // `{}`/no timestamp → TAMPERING
  const ttl = resolveArmTtlMs();
  if (Date.now() - ts > ttl) return { armed: false, tampered: false }; // EXPIRED = legit recovery → fail-OPEN
  return { armed: true, tampered: false, workflow: typeof m.workflow === 'string' ? m.workflow : undefined };
}

// Narrowed shape for the budget/marker consumers: the fields they need
// (requested_at, workflow, type) of a NON-expired, NON-tampered marker, else null.
// Same tamper-verify + TTL as readArmPending — and it NARROWS the return so no
// attacker-controlled raw field (beyond the sanitized three) ever flows downstream.
function readArmPendingMarker(dir) {
  let m;
  try { m = JSON.parse(fs.readFileSync(armMarkerPath(dir), 'utf8')); }
  catch { return null; }
  if (markerIsTampered(m)) return null;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const ts = Date.parse(m.requested_at);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > resolveArmTtlMs()) return null;
  return {
    requested_at: m.requested_at,
    workflow: typeof m.workflow === 'string' ? m.workflow : undefined,
    type: typeof m.type === 'string' ? m.type : undefined,
  };
}

module.exports = {
  armMarkerPath,
  resolveArmTtlMs,
  markerIsTampered,
  readArmPending,
  readArmPendingMarker,
  ARM_TTL_DEFAULT_MS,
  ARM_TTL_FLOOR_MS,
};
