#!/usr/bin/env node
'use strict';

// =============================================================================
// human-gate-record.test.cjs — enforcement-audit Batch HUMAN-GATE
// (DoD #12 "human gates recorded from the real tool result").
//
// ROOT CAUSE (audit 2026-06-21, finding, HIGH, verified): no PreToolUse or
// PostToolUse handler on AskUserQuestion ever recorded the real user choice.
// tool_response was read by exactly one hook (langfuse, telemetry only), so the
// audit trail's record of a human decision was authored by controller PROSE —
// a controller could ask, ignore the answer, and stamp anything.
//
// FIX: an additive PostToolUse:AskUserQuestion observer appends a HUMAN_GATE
// entry to the run's gate-decisions.jsonl, derived from payload.tool_response +
// tool_use_id (the REAL tool result), via the canonical gate-decision-writer.
// A PostToolUse observer cannot block -> zero deadlock risk.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../human-gate-record.cjs');
let mod = null;
try { mod = require('../human-gate-record.cjs'); } catch { mod = null; }

// v8.27.0+ (Fatia S8b / Requirement 9 rota-b — STRICT_INTERACTIVE_PATH): the
// interactive producer must ALSO emit a SIGNED user-gate protocol-event so a
// decided_by:user decision is corroborated under PIPELINE_HMAC_STRICT. These
// helpers exercise that end-to-end against the real signer + forgery guard.
let peSigner = null;
try { peSigner = require('../../../lib/protocol-event-signer.cjs'); } catch { peSigner = null; }
let guard = null;
try { guard = require('../../../lib/audit-forgery-guard.cjs'); } catch { guard = null; }

// A durable, >=32-char test key. Passed to the hook subprocess via env AND used by
// the verifier on the test side so both sign/verify against the SAME key.
const TEST_HMAC_KEY = 'test-hmac-key-for-human-gate-record-slice-s8b-0123456789';

function protocolLines(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'protocol-events.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}
function protocolText(dir) {
  try { return fs.readFileSync(path.join(dir, 'protocol-events.jsonl'), 'utf8'); } catch { return ''; }
}
function gateText(dir) {
  try { return fs.readFileSync(path.join(dir, 'gate-decisions.jsonl'), 'utf8'); } catch { return ''; }
}
// Run the hook WITH a durable HMAC key in scope so signUserGateEvent actually signs.
function runWithKey(dir, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir, PIPELINE_HMAC_SECRET: TEST_HMAC_KEY },
  });
}
// Run the hook WITHOUT any durable key (env secret cleared, cache dir redirected to
// an empty HOME) so signUserGateEvent falls through to UNSIGNED (two-tier).
function runNoKey(dir, payload) {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'human-gate-nokey-home-'));
  try {
    return spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(payload), encoding: 'utf8',
      env: { ...process.env, PIPELINE_DOC_PATH: dir, PIPELINE_HMAC_SECRET: '', HOME: emptyHome, USERPROFILE: emptyHome },
    });
  } finally { try { fs.rmSync(emptyHome, { recursive: true, force: true }); } catch {} }
}
// Reproduce exactly what audit-fabrication-gate (C3) computes: does the decided_by:
// user line corroborate, given the run's protocol-events and a strict verifier?
function c3Corroborates(dir, { strict }) {
  const verify = peSigner.buildUserGateVerifier({ key: TEST_HMAC_KEY, strict: !!strict });
  const protocolIds = guard.collectProtocolIds(protocolText(dir), { verify });
  const candidates = guard.parseEntries(gateText(dir));
  const findings = guard.detectFakeUserDecision(candidates, { protocolPresent: !!protocolText(dir), protocolIds });
  return findings.length === 0; // 0 findings => the user decision IS corroborated
}

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'human-gate-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function seed(dir, obj) { fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(obj, null, 2)); }
function gateLines(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'gate-decisions.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}
function run(dir, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir },
  });
}

console.log('=== human-gate-record (PostToolUse:AskUserQuestion) — DoD #12 ===');

test('module exists and exports record + summarizeAnswer', () => {
  assert.ok(mod, 'human-gate-record.cjs must exist and load');
  assert.equal(typeof mod.record, 'function');
  assert.equal(typeof mod.summarizeAnswer, 'function');
});

test('pure — summarizeAnswer captures the real answer text', () => {
  assert.ok(mod, 'module must load');
  assert.match(mod.summarizeAnswer({ choice: 'Option A' }), /Option A/);
  assert.equal(mod.summarizeAnswer(null), 'no_answer');
  assert.match(mod.summarizeAnswer('Yes, proceed'), /Yes, proceed/);
});

test('records ONE HUMAN_GATE entry from the real tool_response, correlated by tool_use_id', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  const r = run(dir, {
    tool_name: 'AskUserQuestion',
    tool_use_id: 'tu_abc123',
    tool_response: { choice: 'Option A — proceed' },
    cwd: dir,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = gateLines(dir);
  assert.equal(lines.length, 1, `expected exactly one gate-decision line, got ${lines.length}`);
  const e = lines[0];
  assert.equal(e.gate, 'HUMAN_GATE');
  assert.equal(e.decision, 'CONFIRMED');
  assert.equal(e.decided_by, 'user');
  assert.match(String(e.detail), /tu_abc123/, 'detail must carry the real tool_use_id');
  // DoD#12 headline: the REAL answer text (not just the id) must reach the record.
  // (Mutation guard — dropping the answer from the hook must fail this.)
  assert.match(String(e.detail), /Option A/, 'detail must carry the real answer text from tool_response');
});

test('answer text is DERIVED from tool_response, not constant (second answer)', (dir) => {
  seed(dir, { run_id: 'r2', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'closeout' });
  run(dir, {
    tool_name: 'AskUserQuestion',
    tool_use_id: 'tu_def456',
    tool_response: { choice: 'No, cancel the run' },
    cwd: dir,
  });
  const e = gateLines(dir)[0];
  assert.ok(e, 'expected a recorded line');
  assert.match(String(e.detail), /No, cancel the run/, 'a different answer must produce a different recorded detail');
  // Even a rejection is recorded as CONFIRMED ("an answer was captured") — this is
  // the documented answer-independent contract; HUMAN_GATE must never be an
  // enforcement gate that branches on this value (see hook CONTRACT comment).
  assert.equal(e.decision, 'CONFIRMED');
});

test('non-AskUserQuestion tool records nothing', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  run(dir, { tool_name: 'Bash', tool_use_id: 'tu_x', tool_response: { ok: true }, cwd: dir });
  assert.equal(gateLines(dir).length, 0);
});

test('inactive run records nothing (no governed gate)', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: false, task_type: 'Bug Fix' });
  run(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_y', tool_response: { choice: 'X' }, cwd: dir });
  assert.equal(gateLines(dir).length, 0);
});

// ---------------------------------------------------------------------------
// Fatia S8b — the interactive producer signs the user-gate event at the source.
// ---------------------------------------------------------------------------

test('S8b: emits a user-gate protocol-event correlated by tool_use_id', (dir) => {
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  const r = runWithKey(dir, {
    tool_name: 'AskUserQuestion', tool_use_id: 'tu_sign01',
    tool_response: { choice: 'Approve and proceed' }, cwd: dir,
  });
  assert.equal(r.status, 0, r.stderr);
  const evs = protocolLines(dir);
  assert.equal(evs.length, 1, `expected exactly one protocol-event, got ${evs.length}`);
  const ev = evs[0];
  const kind = ev.event || ev.type;
  assert.ok(peSigner.USER_GATE_EVENT_RE.test(kind), `event kind '${kind}' must match USER_GATE_EVENT_RE`);
  assert.equal(ev.tool_use_id, 'tu_sign01', 'event must carry the SAME tool_use_id as the decision detail');
  // the decision line still exists and references the same id
  const dec = gateLines(dir).find((l) => l.gate === 'HUMAN_GATE');
  assert.ok(dec && /tu_sign01/.test(String(dec.detail)), 'decision detail must carry the same id');
});

test('S8b: the emitted event is SIGNED and verifies under strict', (dir) => {
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  runWithKey(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_sign02', tool_response: { choice: 'yes' }, cwd: dir });
  const ev = protocolLines(dir)[0];
  assert.ok(ev, 'expected a protocol-event');
  assert.ok(ev[peSigner.SIGNATURE_FIELD], 'event must carry a __signature when a key is available');
  const v = peSigner.verifyUserGateEvent(ev, { key: TEST_HMAC_KEY, strict: true });
  assert.equal(v.valid, true, `strict verify must accept the legitimate signed event: ${v.reason}`);
});

test('S8b: a TAMPERED signed event no longer verifies (9.3 incondicional)', (dir) => {
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  runWithKey(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_sign03', tool_response: { choice: 'yes' }, cwd: dir });
  const ev = protocolLines(dir)[0];
  const tampered = { ...ev, tool_use_id: 'tu_FORGED' }; // body changed, signature stale
  const v = peSigner.verifyUserGateEvent(tampered, { key: TEST_HMAC_KEY, strict: false });
  assert.equal(v.valid, false, 'a tampered body must invalidate the signature in ANY posture');
});

test('S8b: C3 corroborates the legitimate signed decision under strict (no false-positive)', (dir) => {
  assert.ok(guard && peSigner, 'guard + signer must load');
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'closeout' });
  runWithKey(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_c3ok', tool_response: { choice: 'Approve' }, cwd: dir });
  assert.equal(c3Corroborates(dir, { strict: true }), true,
    'legitimate signed producer output must corroborate decided_by:user under strict');
});

test('S8b: C3 does NOT corroborate when the signed event is absent (forgery still caught)', (dir) => {
  assert.ok(guard && peSigner, 'guard + signer must load');
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'closeout' });
  // Forge ONLY the decision line (as an attacker would), with no signed producer event.
  const writer = require('../../../lib/gate-decision-writer.cjs');
  const ctx = writer.buildCtx(dir, { type: 'Bug Fix', complexity: null });
  writer.appendGateDecision(path.join(dir, 'gate-decisions.jsonl'), {
    gate: 'HUMAN_GATE', hardness: 'AUDIT', phase: 'closeout', decision: 'CONFIRMED',
    decided_by: 'user', timestamp: new Date().toISOString(), detail: 'tool_use_id=tu_forged answer=fake', confidence_impact: 0,
  }, ctx);
  assert.equal(c3Corroborates(dir, { strict: true }), false,
    'a decided_by:user with no signed corroborating event must be flagged under strict');
});

test('S8b: two-tier — with no durable key the event is emitted UNSIGNED, no throw', (dir) => {
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  const r = runNoKey(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_nokey', tool_response: { choice: 'yes' }, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const ev = protocolLines(dir)[0];
  assert.ok(ev, 'event must still be emitted (migration-tolerant)');
  assert.ok(!ev[peSigner.SIGNATURE_FIELD], 'without a durable key the event must be UNSIGNED (no fabricated signature)');
  // and the decision was still recorded regardless
  assert.ok(gateLines(dir).some((l) => l.gate === 'HUMAN_GATE'), 'decision recording must be unaffected');
});

test('S8b: unsigned event does NOT corroborate under strict (H2 boundary made real)', (dir) => {
  seed(dir, { run_id: 'r8b', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'closeout' });
  runNoKey(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_unsigned', tool_response: { choice: 'yes' }, cwd: dir });
  // strict verifier rejects unsigned → the id does not corroborate.
  assert.equal(c3Corroborates(dir, { strict: true }), false,
    'an unsigned producer event must not corroborate under strict');
  // but in the DEFAULT posture the same unsigned event is tolerated (two-tier).
  assert.equal(c3Corroborates(dir, { strict: false }), true,
    'the same unsigned event corroborates in the default posture (two-tier preserved)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
