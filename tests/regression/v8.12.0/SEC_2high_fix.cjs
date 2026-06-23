#!/usr/bin/env node
'use strict';

// =============================================================================
// SEC_2high_fix (v8.12.0) — SPEC 006 follow-up — the 2 KNOWN-ISSUE HIGH defects.
// Pipeline doc: .pipeline/docs/Pre-Complexa-action/2026-06-23-spec006-2high-fix/
// =============================================================================
// TDD RED phase. These regression tests PROVE the two open HIGH security defects
// against the CURRENT shipped code; they are EXPECTED to be RED now and must turn
// GREEN once the fix lands. NO production file is touched by this test.
//
//   R1-SEC-1 — verify-on-read (lib/corrective-dispatch.cjs). The corrective
//     channels SIGN on write (signed-append SSOT) but do NOT VERIFY on read:
//       • readActiveSentinelState(cwd) raw-JSON.parses the on-disk state and
//         returns it AS-IS — a forged state with a present-but-INVALID
//         __signature is accepted (it should be rejected → return null). RED.
//       • readCorrectiveTriggers(cwd) raw-JSON.parses each line — a tampered
//         (re-written, signature-no-longer-matching) trigger line is KEPT in the
//         returned list (it should be DROPPED). RED.
//     A VALID-signature state must still be ACCEPTED (no over-rejection), and an
//     UNSIGNED state must be TOLERATED (migration-compat). Those two PASS today
//     AND after the fix (guard against over-correction).
//
//   R1-SEC-2 — consumer matcher (hooks/hooks.json). The corrective-dispatch-gate
//     drains pending triggers on a PostToolUse event, but it is registered ONLY on
//     Edit|Write|NotebookEdit|MultiEdit|Bash|PowerShell — every one of which is
//     DENIED at PreToolUse during a governed-unarmed window. So in production the
//     drain never fires for a read-only follow-up tool (Read/Glob/Grep). The matcher
//     MUST also include Read (and Glob/Grep) so an allowed read-only tool drains the
//     pending corrective. Absent today → RED. A behavioral drain-on-Read check pins
//     the runtime side once the wiring is correct.
// =============================================================================

// A stable HMAC secret (>=32 chars) so signState/verifyState use a deterministic
// key in this process (mirrors T5_1_error_signal_channel.cjs). Must be set BEFORE
// the signer/engine are required so readHmacKey() picks the env secret.
process.env.PIPELINE_HMAC_SECRET = 'sec-2high-fix-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const engine = require(path.join(ROOT, 'lib/corrective-dispatch.cjs'));
const signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));

// Optional require so a missing export degrades to a clean RED (not a crash).
let dispatchGate = {};
try { dispatchGate = require(path.join(ROOT, '.claude/hooks/corrective-dispatch-gate.cjs')); } catch { dispatchGate = {}; }

const HOOKS_JSON = path.join(ROOT, 'hooks/hooks.json');
const STATE_REL = '.pipeline/state';
const TRIGGER_REL = `${STATE_REL}/corrective-triggers.jsonl`;
const REDISPATCH_REL = `${STATE_REL}/corrective-redispatch.jsonl`;

// ---- helpers ----------------------------------------------------------------

// Place a sentinel-state on disk reachable by readActiveSentinelState: write the
// active-run pointer (<cwd>/.pipeline/active-run.json) + the state file at
// <docPath>/sentinel-state.json. Returns the absolute state path so a test can
// then TAMPER it. `sign` controls whether the written state carries a signature.
function placeSentinelState(root, docName, fields, sign) {
  const docPath = path.join(root, '.pipeline', 'docs', docName);
  fs.mkdirSync(docPath, { recursive: true });
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true });
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docPath }, null, 2));
  let state = Object.assign({ pipeline_active: true }, fields);
  if (sign) {
    const key = signer.getOrCreateHmacKey();
    state = signer.signState(state, key);
  }
  const statePath = path.join(docPath, 'sentinel-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return statePath;
}

// Append a SIGNED corrective-trigger line via the real engine producer.
function appendSignedTrigger(root, trigger) {
  return engine.appendCorrectiveTrigger(root, trigger);
}

function readLines(cwd, rel) {
  const p = path.join(cwd, rel);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sec2h-')); fn(tmp); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}
function unit(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== SEC_2high_fix v8.12.0 — R1-SEC-1 verify-on-read / R1-SEC-2 consumer matcher ===');

// ===========================================================================
// R1-SEC-1 — verify-on-read for the corrective channels.
// ===========================================================================

// SEC1-S2 (RED now): a forged sentinel-state with a present-but-INVALID signature
//   MUST be rejected by readActiveSentinelState (return null). Today it raw-parses
//   and returns the forged object → the attacker's state is trusted.
check('SEC1-S2 readActiveSentinelState REJECTS a tampered-signature state (returns null)', (tmp) => {
  // 1) Write a properly SIGNED, benign state.
  const statePath = placeSentinelState(tmp, 'run-forge',
    { pipeline_active: true, current_phase: '2-execute', current_batch: 1, responsible_agent: 'feature-implementer' },
    true);

  // 2) TAMPER a field WITHOUT re-signing: the __signature stays present but no
  //    longer matches the body. This is the forged-state attack.
  const onDisk = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.ok(onDisk[signer.SIGNATURE_FIELD], 'precondition: the written state is signed');
  onDisk.responsible_agent = 'attacker-injected-agent'; // mutate body, keep stale signature
  onDisk.pipeline_active = false;                        // the classic neutralization tamper
  fs.writeFileSync(statePath, JSON.stringify(onDisk, null, 2));

  // 3) The signature no longer verifies — prove it independently of the reader.
  const v = signer.verifyState(onDisk, { key: signer.getOrCreateHmacKey() });
  assert.equal(v.valid, false, 'precondition: the tampered state must fail signature verification');

  // 4) THE CONTRACT: a verify-on-read reader returns null for a forged state.
  const got = engine.readActiveSentinelState(tmp);
  assert.equal(got, null,
    'readActiveSentinelState must REJECT a present-but-invalid signature and return null (RED today: it raw-parses and returns the forged object)');
});

// SEC1-S4 (RED now): the corrective-trigger channel must DROP a line whose
//   signature no longer matches (a tampered trigger). Today readCorrectiveTriggers
//   raw-parses every line and keeps the forged one.
check('SEC1-S4 readCorrectiveTriggers DROPS a tampered-signature trigger line', (tmp) => {
  // 1) Two genuine SIGNED triggers via the real producer.
  appendSignedTrigger(tmp, { run_id: 'rA', invariant_id: 'NOT_ARMED', tool_name: 'Edit', corrective: { what_failed: 'x' } });
  appendSignedTrigger(tmp, { run_id: 'rB', invariant_id: 'CORRUPT_STATE', tool_name: 'Edit', corrective: { what_failed: 'y' } });

  const p = path.join(tmp, TRIGGER_REL);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 2, 'precondition: two signed triggers on disk');

  // 2) TAMPER the FIRST trigger line in place: mutate a field but keep the stale
  //    __signature (no re-sign). Append an untouched genuine third for contrast.
  const tampered = JSON.parse(lines[0]);
  assert.ok(tampered[signer.SIGNATURE_FIELD], 'precondition: producer signs the trigger');
  tampered.invariant_id = 'INJECTED_INVARIANT';   // forge the routed invariant
  tampered.run_id = 'attacker-run';
  const rewritten = [JSON.stringify(tampered), lines[1]].join('\n') + '\n';
  fs.writeFileSync(p, rewritten);

  // 3) Independent proof the first line no longer verifies.
  const v = signer.verifyState(tampered, { key: signer.getOrCreateHmacKey() });
  assert.equal(v.valid, false, 'precondition: the tampered trigger fails signature verification');

  // 4) THE CONTRACT: a verify-on-read channel drops the forged line, keeps the genuine.
  const got = engine.readCorrectiveTriggers(tmp);
  assert.ok(Array.isArray(got), 'readCorrectiveTriggers returns an array');
  assert.equal(got.length, 1,
    `readCorrectiveTriggers must DROP the tampered line and keep only the 1 genuine one, got ${got.length} (RED today: the forged line is kept)`);
  assert.notEqual(got[0].invariant_id, 'INJECTED_INVARIANT',
    'the surviving trigger must NOT be the attacker-forged one');
  assert.equal(got[0].invariant_id, 'CORRUPT_STATE', 'the surviving trigger is the untouched genuine one');
});

// SEC1-S5a (PASS now AND after the fix): a VALID-signature state is ACCEPTED — the
//   fix must not over-reject genuine signed state.
check('SEC1-S5a readActiveSentinelState ACCEPTS a validly-signed state (no over-rejection)', (tmp) => {
  placeSentinelState(tmp, 'run-valid',
    { pipeline_active: true, current_phase: '2-execute', current_batch: 2, responsible_agent: 'executor-controller' },
    true);
  const got = engine.readActiveSentinelState(tmp);
  assert.ok(got && typeof got === 'object', 'a validly-signed state must be returned (not null)');
  assert.equal(got.responsible_agent, 'executor-controller', 'the genuine signed body is intact');
  assert.equal(got.current_batch, 2, 'the genuine signed fields survive read');
});

// SEC1-S5b (PASS now AND after the fix): an UNSIGNED state is TOLERATED and
//   returned as-is (migration-compat — the established unsigned-tolerated convention).
check('SEC1-S5b readActiveSentinelState TOLERATES an unsigned state (migration-compat)', (tmp) => {
  placeSentinelState(tmp, 'run-unsigned',
    { pipeline_active: true, current_phase: '1-plan', responsible_agent: 'plan-architect' },
    false); // NO signature
  const got = engine.readActiveSentinelState(tmp);
  assert.ok(got && typeof got === 'object', 'an unsigned state must be TOLERATED (returned, not rejected)');
  assert.equal(got[signer.SIGNATURE_FIELD], undefined, 'precondition: the state is genuinely unsigned');
  assert.equal(got.responsible_agent, 'plan-architect', 'the unsigned body is returned as-is');
});

const ERRORSIGNALS_REL = `${STATE_REL}/error-signals.jsonl`;

// SEC1-S6 (RED now): the error-signal channel is the THIRD corrective channel and
//   completes R1-SEC-1. readErrorSignals raw-JSON.parses each line with a plain
//   .filter(Boolean) and does NOT verify the per-line HMAC signature — so a tampered
//   (re-written, signature-no-longer-matching) error-signal is KEPT in the returned
//   list (it should be DROPPED). Mirrors SEC1-S4 for the corrective-trigger channel.
check('SEC1-S6 readErrorSignals DROPS a tampered-signature error-signal line', (tmp) => {
  // 1) Two genuine SIGNED error-signals via the real producer (it BUILDS + signs).
  engine.appendErrorSignal(tmp, {
    run_id: 'rGenuine', observer: 'sentinel', invariant_id: 'R8_EXEC_ERROR',
    agent_ref: 'feature-implementer', detail: 'genuine in-execution error',
    detected_at: new Date().toISOString(),
  });
  engine.appendErrorSignal(tmp, {
    run_id: 'rTamper', observer: 'sentinel', invariant_id: 'R8_OTHER_ERROR',
    agent_ref: 'executor-controller', detail: 'second signal to tamper',
    detected_at: new Date().toISOString(),
  });

  const p = path.join(tmp, ERRORSIGNALS_REL);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 2, 'precondition: two signed error-signals on disk');

  // 2) TAMPER the SECOND error-signal line in place: mutate fields but keep the stale
  //    __signature (no re-sign). appendErrorSignal signs when a key is available, so
  //    the on-disk object already carries a signature (mirror SEC1-S4's precondition).
  const tampered = JSON.parse(lines[1]);
  assert.ok(tampered[signer.SIGNATURE_FIELD], 'precondition: producer signs the error-signal');
  tampered.invariant_id = 'INJECTED_INVARIANT';  // forge the routed invariant
  tampered.run_id = 'attacker-run';
  const rewritten = [lines[0], JSON.stringify(tampered)].join('\n') + '\n';
  fs.writeFileSync(p, rewritten);

  // 3) Independent proof the tampered line no longer verifies.
  const v = signer.verifyState(tampered, { key: signer.getOrCreateHmacKey() });
  assert.equal(v.valid, false, 'precondition: the tampered error-signal fails signature verification');

  // 4) THE CONTRACT: a verify-on-read channel drops the forged line, keeps the genuine.
  const got = engine.readErrorSignals(tmp);
  assert.ok(Array.isArray(got), 'readErrorSignals returns an array');
  assert.equal(got.length, 1,
    `readErrorSignals must DROP the tampered line and keep only the 1 genuine one, got ${got.length} (RED today: the forged line is kept)`);
  assert.notEqual(got[0].invariant_id, 'INJECTED_INVARIANT',
    'the surviving signal must NOT be the attacker-forged one');
  assert.equal(got[0].invariant_id, 'R8_EXEC_ERROR', 'the surviving signal is the untouched genuine one');
});

// ===========================================================================
// R1-SEC-2 — the corrective-dispatch-gate consumer must drain on a read-only tool.
// ===========================================================================

// SEC2-S2 (RED now): the PostToolUse matcher that registers corrective-dispatch-gate
//   MUST include Read (and Glob/Grep). Today it lists only write/exec tools, all of
//   which are PreToolUse-denied during a governed-unarmed window → the drain is dead.
check('SEC2-S2 hooks.json registers corrective-dispatch-gate on a matcher that INCLUDES Read/Glob/Grep', () => {
  const cfg = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const post = (cfg.hooks && Array.isArray(cfg.hooks.PostToolUse)) ? cfg.hooks.PostToolUse : [];

  // Find the PostToolUse entry whose hooks invoke corrective-dispatch-gate.cjs.
  const entry = post.find((e) =>
    Array.isArray(e.hooks) && e.hooks.some((h) =>
      typeof h.command === 'string' && /corrective-dispatch-gate\.cjs/.test(h.command)));
  assert.ok(entry, 'corrective-dispatch-gate must be registered on a PostToolUse matcher');

  const matcher = String(entry.matcher || '');
  const tools = new Set(matcher.split('|').map((s) => s.trim()).filter(Boolean));
  // The load-bearing assertion: Read must be in the matcher so an allowed read-only
  // follow-up tool drains the pending corrective. (Glob/Grep are the same class.)
  assert.ok(tools.has('Read'),
    `the corrective-dispatch-gate PostToolUse matcher must include Read so the drain fires on an allowed read-only tool; got "${matcher}" (RED today: only write/exec tools that PreToolUse denies)`);
  assert.ok(tools.has('Glob'),
    `the matcher must also include Glob (a governed-window read-only tool); got "${matcher}"`);
  assert.ok(tools.has('Grep'),
    `the matcher must also include Grep (a governed-window read-only tool); got "${matcher}"`);
});

// SEC2-S3 (behavioral pin): the consumer's PostToolUse handler, invoked for a Read
//   during a governed window with a pending trigger, drains it (fire-and-continue).
//   The handler is callable directly (handlePostToolUse), so we can pin the runtime
//   side regardless of the hooks.json wiring. This is GREEN today on the engine side
//   (the drain works when CALLED) — SEC2-S2 is the RED pinning test for the missing
//   WIRING that prevents it from being called in production.
check('SEC2-S3 handlePostToolUse on tool_name=Read drains a pending corrective (fire-and-continue, exit-0 semantics)', (tmp) => {
  assert.equal(typeof dispatchGate.handlePostToolUse, 'function',
    'corrective-dispatch-gate must export handlePostToolUse(payload) — RED if the hook cannot load');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; // exercise the on-disk fallback transport

  // A pending signed trigger from a real governed deny (produced via the engine).
  appendSignedTrigger(tmp, {
    run_id: 'rRead', invariant_id: 'NOT_ARMED', tool_name: 'Edit',
    corrective: { what_failed: 'unarmed write attempt', blocking: true },
  });
  assert.equal(readLines(tmp, TRIGGER_REL).length, 1, 'precondition: one pending trigger');
  assert.equal(readLines(tmp, REDISPATCH_REL).length, 0, 'precondition: no corrective record yet');

  // The harness fires PostToolUse for the next ALLOWED tool — a read-only Read.
  const out = dispatchGate.handlePostToolUse({ cwd: tmp, tool_name: 'Read', tool_response: {} });
  assert.ok(out && typeof out === 'object', 'the observer must return a well-formed descriptor (never throw)');
  assert.equal(out.reason, 'drain', 'a pending trigger on a Read event must be processed via the drain path');

  // Fire-and-continue: the corrective lands on disk (NFR5 recovery artifact).
  const records = readLines(tmp, REDISPATCH_REL);
  assert.equal(records.length, 1,
    `draining on a Read event must produce exactly ONE corrective_redispatch record, got ${records.length}`);
  assert.equal(JSON.parse(records[0]).invariant_id, 'NOT_ARMED', 'the drained corrective carries the failed invariant');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
