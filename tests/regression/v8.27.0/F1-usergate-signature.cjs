#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.27.0) — UserGateSignature: C3 corroboration requires a SIGNED + VALID
// user-gate protocol-event (spec workflow-audit-remediation, Requirement 9 /
// Fatia S8, tasks 10.1–10.3).
// =============================================================================
// THREAT (docs/audits/2026-07-12-controller-forgery-guard-audit/AUDIT.md §5, the
// "C3 ceiling"): the write-time guard already blocks a bare fake `decided_by:user`
// with no corroborating protocol-event. But C3 corroborates that claim merely by
// the PRESENCE of a matchable id inside a protocol-event whose event/type matches
// GATE|USER|HUMAN|ASK|DECISION|RESPONSE. A forger who writes BOTH the fake
// `decided_by:user` line AND a fake user-gate protocol-event with a matching id
// fools C3.
//
// FIX (scope LOCKED): the user-gate protocol-event must be HMAC-signed with the
// same signer as sentinel-state (lib/sentinel-state-signer.cjs). C3 counts a
// user-gate event as corroborating ONLY if it is signed AND the signature
// verifies. Two-tier: an unsigned legacy event OUTSIDE the corroboration path is
// tolerated (non-strict); under PIPELINE_HMAC_STRICT unsigned stops being
// tolerated even outside the path.
//
// Given/When/Then (ATDD, derived from AC 9.1–9.5):
//   (a) GIVEN a decided_by:user entry referencing id X AND an UNSIGNED user-gate
//       event with id X, WHEN C3 runs with verification active + strict,
//       THEN the entry is NOT corroborated → fake_user_decision (blocked).
//   (b) GIVEN the SAME entry but a SIGNED + VALID user-gate event with id X,
//       WHEN C3 runs, THEN it IS corroborated → no finding.
//   (c) GIVEN the SAME entry but a user-gate event with an INVALID signature,
//       WHEN C3 runs, THEN it is NOT corroborated → fake_user_decision (blocked).
//   (d) GIVEN a healthy (non-user) gate-decisions write AND an unsigned user-gate
//       event OUTSIDE the corroboration path, WHEN C3 runs NON-strict,
//       THEN the unsigned event is tolerated → no finding.
//   (e) GIVEN the same as (d) but under PIPELINE_HMAC_STRICT, WHEN C3 runs,
//       THEN unsigned is no longer tolerated → a finding is raised.
//
// RED until lib/audit-forgery-guard.cjs threads a user-gate signature verifier
// through collectProtocolIds / detectFakeUserDecision (C3).
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const G = require(path.join(ROOT, 'lib/audit-forgery-guard.cjs'));
const signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));

const KEY = 'usergate-signature-fixed-test-secret-key-0123456789'; // >=32 chars
const NOW = Date.parse('2026-07-12T12:00:00.000Z');
const THR = 300000; // 5 min
function isoAgo(ms) { return new Date(NOW - ms).toISOString(); }
function line(obj) { return JSON.stringify(obj); }
function findingCases(res) { return (res.findings || []).map((f) => f.case).sort(); }

// The verifier the hook builds: true iff a PRESENT signature verifies with the
// key. verifyState bakes in the two-tier (unsigned tolerated unless strict).
function makeVerify(strict) {
  return (evObj) => {
    try { return signer.verifyState(evObj, { key: KEY, strict }).valid === true; }
    catch { return false; }
  };
}

// The user decision under test + its two protocol-event forms.
const userEntry = { gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'user', timestamp: isoAgo(1000), detail: 'tool_use_id=toolu_gate99 answer=Yes' };
const unsignedEvent = { event: 'GATE_RESPONSES', id: 'toolu_gate99', ts: isoAgo(1500) };
const signedEvent = signer.signState({ event: 'GATE_RESPONSES', id: 'toolu_gate99', ts: isoAgo(1500) }, KEY);
const invalidEvent = (() => {
  const s = signer.signState({ event: 'GATE_RESPONSES', id: 'toolu_gate99', ts: isoAgo(1500) }, KEY);
  const v = s.__signature.value;
  s.__signature.value = v.slice(0, -1) + (v.slice(-1) === '0' ? '1' : '0'); // flip last hex digit
  return s;
})();

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F1 v8.27.0 — UserGateSignature C3 corroboration ===');

// ---------------------------------------------------------------------------
// (a) UNSIGNED user-gate event does NOT corroborate (verification active, strict)
// ---------------------------------------------------------------------------
test('(a) unsigned user-gate event does NOT corroborate → fake_user_decision', () => {
  const incoming = line(userEntry) + '\n';
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: incoming,
    existingContent: '',
    protocolPresent: true,
    protocolText: line(unsignedEvent) + '\n',
    verifyUserGateEvent: makeVerify(true),
    hmacStrict: true,
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.ok(findingCases(res).includes('fake_user_decision'),
    'an unsigned user-gate event must not corroborate a decided_by:user (strict)');
});

// ---------------------------------------------------------------------------
// (b) SIGNED + VALID user-gate event DOES corroborate
// ---------------------------------------------------------------------------
test('(b) signed + valid user-gate event corroborates → no finding', () => {
  const incoming = line(userEntry) + '\n';
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: incoming,
    existingContent: '',
    protocolPresent: true,
    protocolText: line(signedEvent) + '\n',
    verifyUserGateEvent: makeVerify(false),
    hmacStrict: false,
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.equal(res.findings.length, 0, 'a signed+valid user-gate event must corroborate');
});

test('(b-strict) signed + valid user-gate event corroborates even under strict', () => {
  const incoming = line(userEntry) + '\n';
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: incoming,
    existingContent: '',
    protocolPresent: true,
    protocolText: line(signedEvent) + '\n',
    verifyUserGateEvent: makeVerify(true),
    hmacStrict: true,
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.equal(res.findings.length, 0, 'a valid signature corroborates in strict mode too');
});

// ---------------------------------------------------------------------------
// (c) INVALID signature does NOT corroborate (both modes — a bad signature is
//     affirmative tampering evidence, never tolerated)
// ---------------------------------------------------------------------------
test('(c) invalid signature does NOT corroborate → fake_user_decision (non-strict)', () => {
  const incoming = line(userEntry) + '\n';
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: incoming,
    existingContent: '',
    protocolPresent: true,
    protocolText: line(invalidEvent) + '\n',
    verifyUserGateEvent: makeVerify(false),
    hmacStrict: false,
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.ok(findingCases(res).includes('fake_user_decision'),
    'an invalid-signature user-gate event must not corroborate, even in migration mode');
});

// ---------------------------------------------------------------------------
// (d) legacy unsigned event OUTSIDE the corroboration path is tolerated (non-strict)
// ---------------------------------------------------------------------------
test('(d) unsigned event OUTSIDE the corroboration path is tolerated (non-strict) → no finding', () => {
  // The incoming write carries only a decided_by:SYSTEM entry — no user decision
  // to corroborate. An unsigned user-gate event sits in protocol-events but backs
  // nothing. Migration posture: tolerate it.
  const sys = { gate: 'ADVERSARIAL_GATE', decision: 'TRIGGERED', decided_by: 'system', timestamp: isoAgo(1000), detail: 'auto' };
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: line(sys) + '\n',
    existingContent: '',
    protocolPresent: true,
    protocolText: line(unsignedEvent) + '\n',
    verifyUserGateEvent: makeVerify(false),
    hmacStrict: false,
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.equal(res.findings.length, 0, 'an unsigned event backing no user decision must be tolerated in migration mode');
});

// ---------------------------------------------------------------------------
// (e) under PIPELINE_HMAC_STRICT, unsigned stops being tolerated even outside path
// ---------------------------------------------------------------------------
test('(e) under strict, an unsigned user-gate event outside the path is NOT tolerated → finding', () => {
  const sys = { gate: 'ADVERSARIAL_GATE', decision: 'TRIGGERED', decided_by: 'system', timestamp: isoAgo(1000), detail: 'auto' };
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: line(sys) + '\n',
    existingContent: '',
    protocolPresent: true,
    protocolText: line(unsignedEvent) + '\n',
    verifyUserGateEvent: makeVerify(true),
    hmacStrict: true,
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.ok((res.findings || []).length > 0,
    'strict mode must not tolerate an unsigned user-gate event even outside the corroboration path');
});

// ---------------------------------------------------------------------------
// Backward-compat: with NO verifier supplied, C3 keeps its legacy tolerant
// behavior (unsigned corroborates) — this is the v8.23.0 migration posture and
// must NOT regress.
// ---------------------------------------------------------------------------
test('(bc) no verifier → legacy tolerant: unsigned event still corroborates → no finding', () => {
  const incoming = line(userEntry) + '\n';
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: incoming,
    existingContent: '',
    protocolPresent: true,
    protocolText: line(unsignedEvent) + '\n',
    nowMs: NOW,
    thresholdMs: THR,
  });
  assert.equal(res.findings.length, 0, 'without a verifier the guard stays in legacy migration mode');
});

// ---------------------------------------------------------------------------
// Scope guard (9.6): signing is restricted to user-gate events. A NON-user
// protocol event (DISPATCH_RESULT) is never treated as a user-gate corroborator,
// and its unsignedness must not trip the strict user-gate detector.
// ---------------------------------------------------------------------------
test('(scope) a non-user DISPATCH_RESULT event does not corroborate and is out of the strict user-gate check', () => {
  const nonUser = { event: 'DISPATCH_RESULT', id: 'toolu_gate99', ts: isoAgo(1500) };
  const res = G.analyze({
    filename: 'gate-decisions.jsonl',
    incomingContent: line(userEntry) + '\n',
    existingContent: '',
    protocolPresent: true,
    protocolText: line(nonUser) + '\n',
    verifyUserGateEvent: makeVerify(true),
    hmacStrict: true,
    nowMs: NOW,
    thresholdMs: THR,
  });
  // The user decision is uncorroborated (dispatch id never counts) → fake_user_decision,
  // but there must be NO unsigned_user_gate_event finding for the non-user event.
  assert.ok(findingCases(res).includes('fake_user_decision'), 'dispatch id must not corroborate a user decision');
  assert.ok(!findingCases(res).includes('unsigned_user_gate_event'), 'a non-user event is outside the user-gate signature scope');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
