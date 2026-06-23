#!/usr/bin/env node
'use strict';

// =============================================================================
// B4 (v8.12.0) — SPEC 006 Batch 4 — CORRECTIVE-DISPATCH GATE (RED, TDD).
// Spec 006-enforcement-fail-closed-arming. Run: 2026-06-23-spec006-batch4-7.
// Evidence: .pipeline/docs/Pre-Complexa-action/2026-06-23-spec006-batch4-7/
//           04-batch4-tdd-scenarios.md (6 USER-APPROVED scenarios).
// =============================================================================
// WHAT THIS LOCKS. A new deterministic orchestrator hook
//   .claude/hooks/corrective-dispatch-gate.cjs
// a PostToolUse OBSERVER that watches for arm-gate DENY decisions and, when it
// sees one, calls the COMPLETE engine dispatchCorrective() from
// lib/corrective-dispatch.cjs (already shipped — REUSED, never re-implemented).
// It is a pure observer: NEVER blocks the harness, NEVER throws, ALWAYS exits 0.
// On a deny the engine ALWAYS writes the on-disk re-dispatch record to
//   <cwd>/.pipeline/state/corrective-redispatch.jsonl
// with kind:"corrective_redispatch" — the NFR5 recovery artifact that covers
// recovery even when the agent-teams (SendMessage) channel is off.
//
// ----------------------------------------------------------------------------
// CONTRACT THE GREEN IMPLEMENTER MUST SATISFY (pinned here, RED until built).
//
//   EXPORT — the pure handler the unit tests S1..S5 call directly:
//     handlePostToolUse(payload) -> {
//         acted: boolean,        // true IFF the payload was a deny we processed
//         dispatched: boolean,   // mirror of the dispatchCorrective result.dispatched
//         reason: string,        // 'deny' | 'allow' | 'malformed' | 'no-cwd' | ...
//         result?: object,       // the raw dispatchCorrective(...) return (when acted)
//       }
//     The handler MUST be pure-ish: it performs the on-disk write via
//     dispatchCorrective (a file write — no tool needed) and returns a plain
//     descriptor. It MUST NOT throw on ANY input (malformed → acted:false).
//
//   CLI ENTRY (require.main === module): read the PostToolUse JSON payload from
//     stdin, call handlePostToolUse, ALWAYS process.exit(0). Never emit a block
//     decision (it is an observer, not a gate).
//
//   INPUT-PAYLOAD CONTRACT (the PostToolUse stdin object the hook consumes).
//     Canonical PostToolUse stdin+cwd shape (mirrors machine-evidence-hook.cjs):
//       {
//         tool_name: <string>,            // the tool the arm-gate ran over
//         cwd: <string>,                  // project root — where .pipeline/ lives
//         tool_response: {                // the PostToolUse output channel
//           decision: 'block' | 'allow',  // the arm-gate decision marker
//           invariant_id: 'NOT_ARMED' | 'CORRUPT_STATE',
//           corrective: { ...buildCorrectiveDescriptor(...) },  // incl. blocking:true
//         },
//         run_id?: <string>,              // carried into the signal/record
//         observer?: <string>,            // defaults to 'arm-gate'
//       }
//     The DENY MARKER the hook keys off is tool_response.decision === 'block'
//     WITH a tool_response.invariant_id of NOT_ARMED|CORRUPT_STATE. Anything
//     else (allow / missing decision / missing invariant) is a no-op.
//     NOTE: the hook MUST tolerate the corrective descriptor's `blocking` field
//     (true for an R4 gate trip) and forward it so the engine writes
//     blocking:true into the record's payload.
// ----------------------------------------------------------------------------
//
// EXPECTED RED REASON: .claude/hooks/corrective-dispatch-gate.cjs does NOT exist
// yet. The optional require() yields an empty stub {}, so each unit assertion
// fails on the MISSING handlePostToolUse export — a clean assertion failure, NOT
// a harness/syntax/import crash. S6 (real child process) fails because spawning
// the missing hook file errors (caught → reported as a clean check failure) AND
// because it is not yet registered in hooks/hooks.json. When Batch 4 GREEN ships
// the hook + registers it, every check goes GREEN unchanged.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b4-corrective-dispatch-gate-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(ROOT, '.claude/hooks/corrective-dispatch-gate.cjs');
const HOOKS_JSON = path.join(ROOT, 'hooks/hooks.json');
const REDISPATCH_REL = '.pipeline/state/corrective-redispatch.jsonl';

// Optional require so the hook's absence is a clean RED (missing export), never an
// uncaught crash that masquerades as a harness error.
let hook = null;
try { hook = require(HOOK_PATH); } catch { hook = {}; }

// ---- canonical PostToolUse payload builders --------------------------------
// A NOT_ARMED deny as the arm-gate would surface it on the PostToolUse channel.
function denyPayload(cwd, over = {}) {
  return {
    tool_name: 'Edit',
    cwd,
    tool_response: {
      decision: 'block',
      invariant_id: 'NOT_ARMED',
      corrective: {
        invariant_id: 'NOT_ARMED',
        what_failed: 'pipeline invoked but no run armed',
        what_is_missing: 'a signed run-active state (or a dispatched pipeline-orchestrator: agent)',
        fix_instruction: 'arm the run: write the signed sentinel-state + active-run pointer, or dispatch a pipeline-orchestrator: agent',
        resume_instruction: 'resume the blocked Edit after the run is armed',
        blocking: true,
      },
    },
    run_id: 'rB4',
    observer: 'arm-gate',
    ...over,
  };
}

// A CORRUPT_STATE deny (blocking:true — "keep blocking while recovering").
function corruptDenyPayload(cwd, over = {}) {
  return {
    tool_name: 'Bash',
    cwd,
    tool_response: {
      decision: 'block',
      invariant_id: 'CORRUPT_STATE',
      corrective: {
        invariant_id: 'CORRUPT_STATE',
        what_failed: 'sentinel-state corrupt/unreadable inside the governed window',
        what_is_missing: 're-created signed sentinel-state.json',
        fix_instruction: 'recreate the signed run state via the signer (or re-dispatch a pipeline-orchestrator: agent)',
        resume_instruction: 'resume the blocked Bash after the state is readable again',
        blocking: true,
      },
    },
    run_id: 'rB4-corrupt',
    observer: 'arm-gate',
    ...over,
  };
}

// An ALLOW (happy-path) decision — must be a complete no-op.
function allowPayload(cwd, over = {}) {
  return {
    tool_name: 'Edit',
    cwd,
    tool_response: { decision: 'allow' },
    run_id: 'rB4-allow',
    observer: 'arm-gate',
    ...over,
  };
}

function readRedispatchLines(cwd) {
  const p = path.join(cwd, REDISPATCH_REL);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-'));
    fn(tmp);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== B4 v8.12.0 — corrective-dispatch-gate (PostToolUse observer of arm-gate denies) ===');

// ---- handler presence -------------------------------------------------------
check('hook exports the pure handlePostToolUse handler', () => {
  assert.equal(typeof hook.handlePostToolUse, 'function',
    `MISSING export: .claude/hooks/corrective-dispatch-gate.cjs must export handlePostToolUse(payload) — RED until Batch 4 GREEN creates the hook file (${HOOK_PATH})`);
});

// ---- S1 MAIN ----------------------------------------------------------------
// NOT_ARMED deny, agent-teams flag OFF -> hook calls dispatchCorrective ->
// record written with invariant_id:"NOT_ARMED" -> exit 0 -> no SendMessage.
check('S1 MAIN: NOT_ARMED deny (flag OFF) writes one corrective_redispatch record + no SendMessage', (tmp) => {
  assert.equal(typeof hook.handlePostToolUse, 'function',
    'handlePostToolUse missing — RED (hook file not created yet)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; // flag OFF → on-disk fallback path
  const out = hook.handlePostToolUse(denyPayload(tmp));
  assert.ok(out && typeof out === 'object', 'handler must return a descriptor object');
  assert.equal(out.acted, true, 'a NOT_ARMED deny must be acted on (acted:true)');
  assert.equal(out.dispatched, true, 'dispatchCorrective must report dispatched:true for a fresh defect');

  const lines = readRedispatchLines(tmp);
  assert.equal(lines.length, 1, `exactly ONE re-dispatch record expected, got ${lines.length}`);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.kind, 'corrective_redispatch', 'record kind must be "corrective_redispatch"');
  assert.equal(rec.invariant_id, 'NOT_ARMED', 'record invariant_id must be "NOT_ARMED"');

  // Transport with the flag OFF is the on-disk fallback — no SendMessage primary.
  assert.notEqual(out.result && out.result.transport, 'sendmessage',
    'with the agent-teams flag OFF the transport must be the on-disk redispatch fallback, never sendmessage');
});

// ---- S2 REGRESSION ----------------------------------------------------------
// CORRUPT_STATE deny -> dispatchCorrective with blocking:true -> on-disk record
// carries blocking:true in its payload -> exit 0 -> hard block NOT auto-lifted.
check('S2 REGRESSION: CORRUPT_STATE deny writes a record carrying blocking:true in the payload', (tmp) => {
  assert.equal(typeof hook.handlePostToolUse, 'function',
    'handlePostToolUse missing — RED (hook file not created yet)');
  const out = hook.handlePostToolUse(corruptDenyPayload(tmp));
  assert.equal(out.acted, true, 'a CORRUPT_STATE deny must be acted on');
  // The engine keeps the LAYER-A hard block in force while recovering: halted stays
  // false (the dispatcher never halts) but blocking rides true into the descriptor.
  assert.equal(out.result && out.result.blocking, true,
    'dispatchCorrective result must carry blocking:true for an R4 gate trip');

  const lines = readRedispatchLines(tmp);
  assert.equal(lines.length, 1, 'exactly one CORRUPT_STATE record expected');
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.invariant_id, 'CORRUPT_STATE', 'record invariant_id must be "CORRUPT_STATE"');
  assert.equal(rec.payload && rec.payload.blocking, true,
    'the on-disk record payload must carry blocking:true (keep blocking while recovering)');
});

// ---- S3 REGRESSION ----------------------------------------------------------
// ALLOW decision -> complete no-op: no dispatchCorrective, no file, no audit.
check('S3 REGRESSION: ALLOW decision is a complete no-op (no record, no dispatch)', (tmp) => {
  assert.equal(typeof hook.handlePostToolUse, 'function',
    'handlePostToolUse missing — RED (hook file not created yet)');
  const out = hook.handlePostToolUse(allowPayload(tmp));
  assert.equal(out.acted, false, 'an ALLOW decision must NOT be acted on (acted:false)');
  assert.equal(out.dispatched, false, 'an ALLOW decision must not dispatch a corrective');

  const p = path.join(tmp, REDISPATCH_REL);
  assert.equal(fs.existsSync(p), false, 'no re-dispatch file may be written on an ALLOW (spurious record)');
});

// ---- S4 EDGE ----------------------------------------------------------------
// Two identical NOT_ARMED denials -> exactly ONE record (engine ledger dedup).
check('S4 EDGE: two identical NOT_ARMED denials produce exactly ONE record (idempotent)', (tmp) => {
  assert.equal(typeof hook.handlePostToolUse, 'function',
    'handlePostToolUse missing — RED (hook file not created yet)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  const out1 = hook.handlePostToolUse(denyPayload(tmp));
  const out2 = hook.handlePostToolUse(denyPayload(tmp)); // identical run/agent/invariant
  assert.equal(out1.acted, true, 'first identical deny must be acted on');
  assert.equal(out1.dispatched, true, 'first deny dispatches a fresh corrective');
  // Second invocation is silently deduplicated by the engine's on-disk ledger.
  assert.equal(out2.dispatched, false, 'second identical deny must be deduped (dispatched:false)');

  const lines = readRedispatchLines(tmp);
  assert.equal(lines.length, 1, `exactly ONE record after two identical denials, got ${lines.length}`);
});

// ---- S5 EDGE ----------------------------------------------------------------
// Malformed/empty payload -> no throw, no corrupted record, no dispatch.
check('S5 EDGE: malformed/empty payload is a silent no-op (no throw, no record)', (tmp) => {
  assert.equal(typeof hook.handlePostToolUse, 'function',
    'handlePostToolUse missing — RED (hook file not created yet)');
  // Each malformed shape must NOT throw and must NOT write a record.
  const malformed = [
    {},
    null,
    undefined,
    { cwd: tmp },                                   // no tool_response / decision
    { cwd: tmp, tool_response: {} },                // decision field absent
    { cwd: tmp, tool_response: { decision: 'block' } }, // block but no invariant_id
    'not-an-object',
    42,
  ];
  for (const m of malformed) {
    let out;
    assert.doesNotThrow(() => { out = hook.handlePostToolUse(m); },
      `handlePostToolUse must never throw on malformed input: ${JSON.stringify(m)}`);
    assert.equal(out && out.acted, false, `malformed input must not be acted on: ${JSON.stringify(m)}`);
  }
  const p = path.join(tmp, REDISPATCH_REL);
  assert.equal(fs.existsSync(p), false, 'no re-dispatch file may be written for malformed input');
});

// ---- S6 SMOKE (real-process E2E) -------------------------------------------
// Hook registered in hooks/hooks.json under a PostToolUse matcher AND a real
// NOT_ARMED deny payload piped on stdin to a freshly spawned node process ->
// exit 0 -> corrective-redispatch.jsonl exists with a valid kind/invariant line.
check('S6 SMOKE: real spawned hook (stdin payload) exits 0 + writes a valid record to disk', (tmp) => {
  // (a) the hook file must actually exist to spawn.
  assert.equal(fs.existsSync(HOOK_PATH), true,
    `MISSING hook file: ${HOOK_PATH} must exist for the real-process smoke — RED until Batch 4 GREEN`);

  // (b) it must be registered under a PostToolUse matcher in hooks/hooks.json.
  const manifest = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const post = (manifest && manifest.hooks && manifest.hooks.PostToolUse) || [];
  const registered = post.some((group) => Array.isArray(group.hooks)
    && group.hooks.some((h) => typeof h.command === 'string'
      && /corrective-dispatch-gate\.cjs/.test(h.command)));
  assert.equal(registered, true,
    'corrective-dispatch-gate.cjs must be registered under a PostToolUse matcher in hooks/hooks.json — RED until Batch 4 GREEN wires it');

  // (c) spawn the real process with a NOT_ARMED deny on stdin in a fresh tmp cwd.
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  const payload = denyPayload(tmp);
  let exitOk = false;
  try {
    execFileSync('node', [HOOK_PATH], {
      input: JSON.stringify(payload),
      cwd: tmp,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    exitOk = true; // execFileSync throws on a non-zero exit
  } catch (e) {
    throw new Error(`spawned hook must exit 0 (observer never blocks); got error: ${e && e.message}`);
  }
  assert.equal(exitOk, true, 'spawned hook must exit 0');

  const lines = readRedispatchLines(tmp);
  assert.ok(lines.length >= 1, 'corrective-redispatch.jsonl must exist with >=1 line after the real run');
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.kind, 'corrective_redispatch', 'real-process record kind must be "corrective_redispatch"');
  assert.equal(rec.invariant_id, 'NOT_ARMED', 'real-process record invariant_id must be "NOT_ARMED"');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
