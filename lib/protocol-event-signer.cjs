#!/usr/bin/env node
'use strict';

// =============================================================================
// protocol-event-signer.cjs — v8.27.0 (Fatia S8 / Requirement 9 — UserGateSignature)
// =============================================================================
// SSOT for signing + verifying the USER-GATE protocol-events (the Achado #7
// GATE_REQUEST / GATE_RESPONSES handshake) written to protocol-events.jsonl.
//
// WHY: the write-time forgery guard (lib/audit-forgery-guard.cjs, detector C3)
// corroborates a `decided_by:user` gate-decision by finding a matching id inside a
// user-gate protocol-event. Before this slice, a forger who wrote BOTH the fake
// decision AND a fake user-gate event with a matching id defeated C3. Signing the
// user-gate event with the SAME HMAC signer as sentinel-state closes that ceiling:
// to corroborate a user decision the attacker would now also need the HMAC key.
//
// SCOPE (Requirement 9.6): ONLY user-gate events are signed — this is NOT a
// plugin-wide PIPELINE_HMAC_STRICT-default-on change. A user-gate event is one
// whose `event`/`type` matches the same USER_GATE_EVENT_RE that C3 uses; every
// other protocol-event (DISPATCH_*, PLAN_MODE_*) is left untouched.
//
// Two-tier posture is inherited verbatim from the signer: when no durable HMAC key
// is available, signState() returns the event UNSIGNED (migration-tolerated), never
// a fabricated ephemeral signature that would brick verification.
// =============================================================================

const signer = require('./sentinel-state-signer.cjs');

// Kept in sync with lib/audit-forgery-guard.cjs::USER_GATE_EVENT_RE.
const USER_GATE_EVENT_RE = /GATE|USER|HUMAN|ASK|DECISION|RESPONSE/i;

function eventKind(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.event === 'string') return obj.event;
  if (typeof obj.type === 'string') return obj.type;
  return '';
}

function isUserGateEvent(obj) {
  return USER_GATE_EVENT_RE.test(eventKind(obj));
}

/**
 * Sign a user-gate protocol-event object. The HMAC covers the whole event body
 * (the `__signature` field is excluded by the signer's canonicalization). A
 * non-user-gate event is returned UNCHANGED (scope restricted to user-gate).
 *
 * @param {object} event
 * @param {object} [opts] - { key } explicit HMAC key; omitted → signer resolves it.
 * @returns {object} the event with `__signature`, or unchanged/unsigned.
 */
function signUserGateEvent(event, opts = {}) {
  if (!event || typeof event !== 'object') return event;
  if (!isUserGateEvent(event)) return event;
  return signer.signState(event, opts.key);
}

/**
 * Verify a user-gate protocol-event's signature. Returns the verifyState result
 * shape { valid, reason, ... }. Two-tier: an unsigned event is valid unless
 * strict; an invalid signature is never valid.
 */
function verifyUserGateEvent(event, opts = {}) {
  return signer.verifyState(event, opts);
}

/**
 * Build the boolean verifier the audit-forgery-guard (C3) consumes: true iff the
 * user-gate event corroborates under the two-tier posture. Reads the HMAC key
 * READ-ONLY (safe for hooks). Returns null when no key is available so the caller
 * falls through to the legacy migration posture.
 *
 * @param {object} [opts] - { key, strict }
 * @returns {(event: object) => boolean | null}
 */
function buildUserGateVerifier(opts = {}) {
  const key = ('key' in opts) ? opts.key : signer.readHmacKey();
  if (!key) return null; // no key → guard stays legacy-tolerant (migration)
  const strict = !!opts.strict;
  return (event) => {
    try { return signer.verifyState(event, { key, strict }).valid === true; }
    catch { return false; }
  };
}

module.exports = {
  USER_GATE_EVENT_RE,
  eventKind,
  isUserGateEvent,
  signUserGateEvent,
  verifyUserGateEvent,
  buildUserGateVerifier,
  SIGNATURE_FIELD: signer.SIGNATURE_FIELD,
};
