#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.23.0) — audit-trail anti-fabrication guard: PURE BRAIN contract
// =============================================================================
// THREAT (user report 2026-07-10): an authorized agent can Write forged entries
// into gate-decisions.jsonl / sentinel-state.json inside a run dir — backdated
// lines, fake `decided_by:user`, a `final_decision:GO`/`completed:true` with no
// basis — and the PostToolUse autosign then RE-SIGNS the forgery as valid. The
// HMAC proves integrity-against-itself, NOT veracity. Nothing blocks the forgery
// AT WRITE TIME; today it is only caught reactively, after acceptance.
//
// FIX UNDER TEST: lib/audit-forgery-guard.cjs — a PURE decision core that, given
// the incoming write content + the run's existing trail + protocol events, flags
// three forgery signatures. The hook (.claude/hooks/audit-fabrication-gate.cjs,
// tested by F2) is the thin PreToolUse I/O wrapper.
//
// Three cases (all severity:high):
//   C1 backdated       — a NEW gate-decisions entry whose timestamp is older than
//                        (now - threshold) WITHOUT the literal "BACKFILLED" marker
//                        in its detail field.
//   C2 unfounded GO    — sentinel-state promoted to final_decision:GO without
//                        FINAL_ADVERSARIAL_GATE logged; or completed/terminal
//                        without the full chain (FINAL_ADVERSARIAL_GATE +
//                        CLOSEOUT_CONFIRM). GO comes at Pa-de-Cal (final-adversarial
//                        already logged) but BEFORE closeout, so GO must NOT
//                        require CLOSEOUT_CONFIRM — that would false-positive a
//                        healthy run.
//   C3 fake user       — a NEW gate-decisions entry with decided_by:user that has
//                        no corroborating protocol-event id (absent protocol file
//                        or no matching id → block that entry).
//
// Healthy-run passthrough MUST hold: fresh-timestamp appends, GO after
// FINAL_ADVERSARIAL_GATE logged, decided_by:user referencing a real protocol id.
//
// RED until lib/audit-forgery-guard.cjs exists.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const G = require(path.join(ROOT, 'lib/audit-forgery-guard.cjs'));

const NOW = Date.parse('2026-07-10T12:00:00.000Z');
const THR = 300000; // 5 min
function isoAgo(ms) { return new Date(NOW - ms).toISOString(); }
function line(obj) { return JSON.stringify(obj); }

function findingCases(res) { return (res.findings || []).map((f) => f.case).sort(); }

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F1 v8.23.0 — audit-forgery-guard pure brain ===');

// ---------------------------------------------------------------------------
// C1 — backdated gate-decisions entries
// ---------------------------------------------------------------------------
// Neutral baseline entry (decided_by:system) so C1 fixtures don't accidentally
// trip the C3 decided_by:user corroboration check.
const freshEntry = { gate: 'ADVERSARIAL_GATE', hardness: 'SOFT', decision: 'TRIGGERED', decided_by: 'system', timestamp: isoAgo(1000), detail: 'ok' };
const backdatedEntry = { gate: 'CLOSEOUT_CONFIRM', hardness: 'SOFT', decision: 'CONFIRMED', decided_by: 'system', timestamp: isoAgo(3600000), detail: 'retro-inserted' };
const backfilledEntry = { gate: 'CLOSEOUT_CONFIRM', hardness: 'SOFT', decision: 'CONFIRMED', decided_by: 'system', timestamp: isoAgo(3600000), detail: 'BACKFILLED after outage' };

test('C1.1 backdated NEW entry without BACKFILLED → flagged', () => {
  const existing = line(freshEntry) + '\n';
  const incoming = existing + line(backdatedEntry) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: existing, nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('backdated'), 'expected a backdated finding');
});

test('C1.2 backdated NEW entry WITH BACKFILLED marker → allowed', () => {
  const existing = line(freshEntry) + '\n';
  const incoming = existing + line(backfilledEntry) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: existing, nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0, 'BACKFILLED marker must exempt the entry');
});

test('C1.3 fresh-timestamp append → allowed (healthy)', () => {
  const existing = line(freshEntry) + '\n';
  const fresh2 = { gate: 'FINAL_ADVERSARIAL_GATE', hardness: 'SOFT', decision: 'SKIPPED', decided_by: 'system', timestamp: isoAgo(500), detail: 'declined' };
  const incoming = existing + line(fresh2) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: existing, nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0);
});

test('C1.4 OLD line already on disk (unchanged) → NOT re-flagged', () => {
  // A full rewrite that PRESERVES a legitimately-old historical line must pass:
  // that line is present in existing, so it is not a NEW candidate.
  const existing = line(backdatedEntry) + '\n' + line(freshEntry) + '\n';
  const incoming = existing; // identical rewrite
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: existing, nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0, 'preexisting old line is not a new forgery');
});

test('C1.5 mutating an existing line to backdate it → flagged (line becomes new)', () => {
  const existing = line(freshEntry) + '\n';
  const mutated = { ...freshEntry, timestamp: isoAgo(7200000), detail: 'silently moved back' };
  const incoming = line(mutated) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: existing, nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('backdated'));
});

// ---------------------------------------------------------------------------
// C2 — unfounded GO / completed on sentinel-state
// ---------------------------------------------------------------------------
const chainBoth = [line({ gate: 'FINAL_ADVERSARIAL_GATE', decision: 'APPROVED' }), line({ gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED' })].join('\n') + '\n';
const chainFinalOnly = line({ gate: 'FINAL_ADVERSARIAL_GATE', decision: 'SKIPPED' }) + '\n';
const chainNone = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED' }) + '\n';

test('C2.1 final_decision:GO with FINAL_ADVERSARIAL_GATE logged, no CLOSEOUT yet → allowed (healthy Pa-de-Cal order)', () => {
  const state = JSON.stringify({ pipeline_active: true, final_decision: 'GO' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainFinalOnly, nowMs: NOW });
  assert.equal(res.findings.length, 0, 'GO must not require CLOSEOUT_CONFIRM (it comes after)');
});

test('C2.2 final_decision:GO with NO closure gate at all → flagged', () => {
  const state = JSON.stringify({ pipeline_active: true, final_decision: 'GO' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainNone, nowMs: NOW });
  assert.ok(findingCases(res).includes('unfounded_promotion'));
});

test('C2.3 completed:true with full chain → allowed', () => {
  const state = JSON.stringify({ pipeline_active: false, completed: true, final_decision: 'GO' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainBoth, nowMs: NOW });
  assert.equal(res.findings.length, 0);
});

test('C2.4 completed:true with FINAL only (no CLOSEOUT_CONFIRM) → flagged', () => {
  const state = JSON.stringify({ pipeline_active: false, completed: true });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainFinalOnly, nowMs: NOW });
  assert.ok(findingCases(res).includes('unfounded_promotion'), 'completed needs the full chain');
});

test('C2.5 terminal_state:completed with no chain → flagged', () => {
  const state = JSON.stringify({ pipeline_active: false, terminal_state: 'completed' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainNone, nowMs: NOW });
  assert.ok(findingCases(res).includes('unfounded_promotion'));
});

test('C2.6 non-terminal sentinel write (phase update, no GO) → allowed', () => {
  const state = JSON.stringify({ pipeline_active: true, current_phase: '2', expected_next: 'sanity-checker' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainNone, nowMs: NOW });
  assert.equal(res.findings.length, 0);
});

test('C2.7 final_decision:NO-GO → allowed (not a promotion)', () => {
  const state = JSON.stringify({ pipeline_active: true, final_decision: 'NO-GO' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainNone, nowMs: NOW });
  assert.equal(res.findings.length, 0);
});

test('C2.8 GO via Edit fragment (not full JSON) → still detected', () => {
  const fragment = '  "final_decision": "GO",\n  "pipeline_active": false';
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: fragment, gateDecisionsText: chainNone, nowMs: NOW });
  assert.ok(findingCases(res).includes('unfounded_promotion'));
});

// ---------------------------------------------------------------------------
// C3 — fake decided_by:user
// ---------------------------------------------------------------------------
const userEntryWithId = { gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'user', timestamp: isoAgo(1000), detail: 'tool_use_id=toolu_abc123 answer=Yes' };
const userEntryNoId = { gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'user', timestamp: isoAgo(1000), detail: 'user said yes' };
const userEntryBadId = { gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'user', timestamp: isoAgo(1000), detail: 'tool_use_id=toolu_ZZZ999 answer=Yes' };
const protocolWithId = line({ event: 'GATE_RESPONSES', id: 'toolu_abc123', ts: isoAgo(1500) }) + '\n';

test('C3.1 decided_by:user with matching protocol id → allowed (healthy)', () => {
  const incoming = line(userEntryWithId) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', protocolPresent: true, protocolText: protocolWithId, nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0);
});

test('C3.2 decided_by:user, protocol file ABSENT → flagged (approved posture: block the entry)', () => {
  const incoming = line(userEntryWithId) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', protocolPresent: false, protocolText: '', nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('fake_user_decision'));
});

test('C3.3 decided_by:user with no id in detail → flagged', () => {
  const incoming = line(userEntryNoId) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', protocolPresent: true, protocolText: protocolWithId, nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('fake_user_decision'));
});

test('C3.4 decided_by:user id not present in protocol → flagged', () => {
  const incoming = line(userEntryBadId) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', protocolPresent: true, protocolText: protocolWithId, nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('fake_user_decision'));
});

test('C3.5 decided_by:system entry → C3 does not apply', () => {
  const sys = { gate: 'ADVERSARIAL_GATE', decision: 'TRIGGERED', decided_by: 'system', timestamp: isoAgo(1000), detail: 'auto' };
  const incoming = line(sys) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', protocolPresent: false, protocolText: '', nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0);
});

test('C3.6 preexisting decided_by:user line (already on disk) → not re-flagged', () => {
  const existing = line(userEntryNoId) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: existing, existingContent: existing, protocolPresent: false, protocolText: '', nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0, 'only NEW lines are candidates');
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------
test('R.1 malformed JSONL line in incoming → skipped, no crash', () => {
  const incoming = 'not json at all\n' + line(freshEntry) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', protocolPresent: true, protocolText: protocolWithId, nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0);
});

test('R.2 unparseable timestamp → not treated as backdated', () => {
  const bad = { gate: 'X', decision: 'TRIGGERED', decided_by: 'system', timestamp: 'whenever', detail: 'x' };
  const incoming = line(bad) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', nowMs: NOW, thresholdMs: THR });
  assert.equal(res.findings.length, 0);
});

test('R.3 unrelated filename → analyze returns no findings', () => {
  const res = G.analyze({ filename: 'notes.md', incomingContent: 'final_decision GO completed', existingContent: '', nowMs: NOW });
  assert.equal(res.findings.length, 0);
});

// ---------------------------------------------------------------------------
// Adversarial-review hardening (v8.23.0 review round 1)
// ---------------------------------------------------------------------------
test('H.1 numeric epoch-ms backdated timestamp → flagged (string-only Date.parse would miss)', () => {
  const bad = { gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED', decided_by: 'system', timestamp: NOW - 3600000, detail: 'no marker' };
  const incoming = line(bad) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: incoming, existingContent: '', nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('backdated'));
});

test('H.2 decided_by:"User" (casing) with no protocol → flagged', () => {
  const e = { gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'User', timestamp: isoAgo(1000), detail: 'yes' };
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: line(e) + '\n', existingContent: '', protocolPresent: false, protocolText: '', nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('fake_user_decision'));
});

test('H.3 completed:"true" (string) with FINAL only → flagged (needs full chain)', () => {
  const state = JSON.stringify({ pipeline_active: false, completed: 'true' });
  const res = G.analyze({ filename: 'sentinel-state.json', incomingContent: state, gateDecisionsText: chainFinalOnly, nowMs: NOW });
  assert.ok(findingCases(res).includes('unfounded_promotion'));
});

test('H.4 id present only in a NON-user protocol event (DISPATCH_RESULT) → NOT corroborated → flagged', () => {
  const nonUser = line({ event: 'DISPATCH_RESULT', id: 'toolu_abc123', ts: isoAgo(1500) }) + '\n';
  const res = G.analyze({ filename: 'gate-decisions.jsonl', incomingContent: line(userEntryWithId) + '\n', existingContent: '', protocolPresent: true, protocolText: nonUser, nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('fake_user_decision'), 'a dispatch id must not corroborate a user decision');
});

test('H.5 case-insensitive filename (Gate-Decisions.JSONL) → still analyzed', () => {
  const res = G.analyze({ filename: 'Gate-Decisions.JSONL', incomingContent: line(backdatedEntry) + '\n', existingContent: '', nowMs: NOW, thresholdMs: THR });
  assert.ok(findingCases(res).includes('backdated'));
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
