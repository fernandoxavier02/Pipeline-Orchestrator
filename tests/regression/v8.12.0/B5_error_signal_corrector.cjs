#!/usr/bin/env node
'use strict';

// =============================================================================
// B5 (v8.12.0) — SPEC 006 Batch 5 — LAYER B: in-execution non-blocking corrector
// (RED, TDD). Spec 006-enforcement-fail-closed-arming. Run: 2026-06-23-spec006-batch4-7.
// Evidence: .pipeline/docs/Pre-Complexa-action/2026-06-23-spec006-batch4-7/
//           05-batch5-tdd-scenarios.md (6 USER-APPROVED scenarios).
// =============================================================================
// WHAT THIS LOCKS. A NEW deterministic orchestrator hook
//   .claude/hooks/corrective-error-signal-gate.cjs
// a SubagentStop OBSERVER that, on an IN-EXECUTION FAILURE VERDICT (a governed
// subagent finishing WITHOUT a valid PIPELINE_AGENT_RESULT_V1 block, or a
// self-reported error):
//   (1) EMITS exactly one ErrorSignal onto the on-disk channel via the SHIPPED
//       engine appendErrorSignal(cwd, signal) — .pipeline/state/error-signals.jsonl;
//   (2) then routes THAT SAME just-emitted signal (the only genuinely-fresh signal
//       THIS call produced) through the SHIPPED engine dispatchCorrective(signal,{cwd})
//       in FIRE-AND-CONTINUE mode (returns immediately, halted:false, blocking:false,
//       writes the on-disk corrective_redispatch record). It does NOT drain-and-re-route
//       the channel's accumulated history (that would re-fire spurious correctives for
//       already-handled agents — see S4b). Dedup (N observers of one defect → 1
//       corrective) and reset-on-observed-fix (recurrence after a real fix → fresh
//       corrective) come from the engine's on-disk ledger, keyed by an occurrence_window
//       the engine derives from AUTHORITATIVE on-disk run state (NOT the payload — H2).
// It is a PURE OBSERVER: NEVER blocks the harness, NEVER throws, ALWAYS exits 0.
// Malformed/empty/missing channel = silent no-op. The locus follows the RATIFIED
// CONSUME-LOCUS DECISION (option A): the consume-loop runs in the SAME SubagentStop
// observer hook that emits the ErrorSignal (one thin adapter, mirrors Batch 4).
//
// ENGINE REUSE (no fork): all the heavy lifting lives in lib/corrective-dispatch.cjs
// (appendErrorSignal / readErrorSignals / dispatchCorrective / dedupKey / on-disk
// ledger / breaker). This hook is a THIN ADAPTER that maps a SubagentStop failure
// verdict to the engine's raw signal shape and delegates. It adds NO new policy.
//
// ----------------------------------------------------------------------------
// CONTRACT THE GREEN IMPLEMENTER MUST SATISFY (pinned here, RED until built).
//
//   FILE — .claude/hooks/corrective-error-signal-gate.cjs (MUST be created).
//
//   EXPORT — the pure handler the unit tests S1/S2/S4/S5 call directly:
//     handleSubagentStop(payload) -> {
//         emitted:    boolean,   // true IFF the verdict was a failure we emitted a signal for
//         dispatched: boolean,   // true IFF at least one FRESH corrective was dispatched this call
//         reason:     string,    // 'failure' | 'ok' | 'not-governed' | 'malformed' | 'no-engine' | 'error'
//         result?:    object,    // the LAST dispatchCorrective(...) return (when emitted), incl.
//                                //   { halted:false, blocking:false, dispatched, deduped?, dedup_key, ... }
//         dispatched_count?: number,  // how many FRESH correctives this call routed (dedup-aware)
//       }
//     The handler MUST emit at most ONE ErrorSignal per failure verdict, then drain
//     the channel and route FRESH signals through dispatchCorrective. It MUST be
//     fire-and-continue (no synchronous wait) and MUST NOT throw on ANY input
//     (malformed / missing channel → emitted:false, dispatched:false, no throw).
//
//   CLI ENTRY (require.main === module): read the SubagentStop JSON payload from
//     stdin, call handleSubagentStop, ALWAYS process.exit(0). NEVER emit a block
//     decision (it is an OBSERVER, not the commit gate). Emitting a plain
//     { hookSpecificOutput: { hookEventName: 'SubagentStop' } } (no decision) is fine.
//
//   INPUT-PAYLOAD CONTRACT (the SubagentStop stdin object the hook consumes;
//   mirrors subagent-stop-commit-hook.cjs::decide + machine-evidence-hook.cjs):
//       {
//         hook_event_name: 'SubagentStop',
//         agent_type: <string>,            // the finishing subagent (governed leaf name)
//         agent_id?:  <string>,            // the finishing subagent's own id
//         last_assistant_message: <string>,// the agent's final text (parsed for the result block)
//         cwd: <string>,                   // project root — where .pipeline/ lives
//         run_id?: <string>,               // carried into the signal/record
//         self_reported_error?: boolean,   // an explicit self-reported in-execution error
//         occurrence_window?: <string>,    // the run's current fix-cycle/phase marker (reset-on-fix)
//       }
//     FAILURE VERDICT = last_assistant_message has NO valid PIPELINE_AGENT_RESULT_V1
//     block (parseResultBlock(...).ok === false) OR self_reported_error === true.
//     A valid result block AND no self-reported error = a clean finish = NO emission.
//     The signal the hook builds rides invariant_id:'SUBAGENTSTOP_RESULT_MISSING'
//     (the same in-execution failure verdict subagent-stop-commit-hook keys off),
//     blocking:false (LAYER B fire-and-continue), and occurrence_window derived from
//     the run's state so a post-fix recurrence lands in a NEW window (fresh corrective).
//
//   RESET-ON-FIX MECHANISM (CONFIRMED against the SHIPPED engine — anti-invention):
//     The engine has NO ledger-reset API. The dedup ledger entry is keyed by
//     dedupKey(run_id, agent_ref, invariant_id, occurrence_window). The ONLY way to
//     get a FRESH corrective for a recurrence is a DIFFERENT occurrence_window (a new
//     dedup key). So reset-on-observed-fix is expressed by the observer deriving
//     occurrence_window from the run's fix-cycle/phase marker: the post-fix recurrence
//     carries a new window → new dedup key → fresh corrective. Scenario 4 drives this
//     via the engine's real mechanism (distinct occurrence_window), NOT an invented
//     ledger-reset call.
// ----------------------------------------------------------------------------
//
// EXPECTED RED REASON: .claude/hooks/corrective-error-signal-gate.cjs does NOT
// exist yet. The optional require() yields an empty stub {}, so each unit assertion
// fails on the MISSING handleSubagentStop export — a clean assertion failure, NOT a
// harness/syntax/import crash. S3's LAYER-A half (the real pipeline-arm-gate via
// spawnSync) is GREEN TODAY (the arm-gate already ships) and stays GREEN; S3's
// LAYER-B half + S6's real-process spawn + registration fail RED until Batch 5 GREEN
// creates the hook, wires its consume step, and registers it under SubagentStop.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b5-error-signal-corrector-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(ROOT, '.claude/hooks/corrective-error-signal-gate.cjs');
const HOOKS_JSON = path.join(ROOT, 'hooks/hooks.json');
const ARM_GATE = path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs');

const CHANNEL_REL = '.pipeline/state/error-signals.jsonl';
const REDISPATCH_REL = '.pipeline/state/corrective-redispatch.jsonl';

// The SHIPPED engine (reuse-only) — used to verify the on-disk artifacts the hook
// must produce, and (S3 LAYER-B half) to drive a corrective directly.
const engine = require(path.join(ROOT, 'lib/corrective-dispatch.cjs'));

// LAYER-A reuse for the distinctness scenario (the real hook + the arm marker
// writer), exactly as B0_two_layer_contract.cjs does.
const { writeArmPending } = require(path.join(ROOT, 'lib/pipeline-arm.cjs'));

// The hook under construction (Batch 5 GREEN will create it). Optional require so a
// missing file degrades to an empty stub — assertions then fail on the missing
// handleSubagentStop export (a clean RED), never an uncaught require() crash.
let hook = null;
try { hook = require(HOOK_PATH); } catch { hook = {}; }

// ---- canonical SubagentStop payload builders --------------------------------
// A FAILURE VERDICT: the agent finished WITHOUT a valid PIPELINE_AGENT_RESULT_V1
// block (its last message is plain prose). This is the in-execution failure the
// observer emits an ErrorSignal for.
function failurePayload(cwd, over = {}) {
  return {
    hook_event_name: 'SubagentStop',
    agent_type: 'executor-controller',
    agent_id: 'a-exec-1',
    last_assistant_message: 'I finished the batch but I am not emitting a result block.',
    cwd,
    run_id: 'rB5',
    occurrence_window: 'w1',
    ...over,
  };
}

// A SELF-REPORTED-ERROR failure verdict (an explicit in-execution error flag).
function selfReportedErrorPayload(cwd, over = {}) {
  return {
    hook_event_name: 'SubagentStop',
    agent_type: 'executor-controller',
    agent_id: 'a-exec-2',
    last_assistant_message: 'Something broke mid-batch.',
    self_reported_error: true,
    cwd,
    run_id: 'rB5',
    occurrence_window: 'w1',
    ...over,
  };
}

// A CLEAN finish: a valid PIPELINE_AGENT_RESULT_V1 block as the last message → NO
// emission. (Mirrors the block the 9 governed agents emit.)
function cleanPayload(cwd, over = {}) {
  const block = [
    '=== PIPELINE_AGENT_RESULT_V1 ===',
    JSON.stringify({ status: 'completed', summary: 'batch done', next_agent: 'review-orchestrator' }),
    '=== END PIPELINE_AGENT_RESULT_V1 ===',
  ].join('\n');
  return {
    hook_event_name: 'SubagentStop',
    agent_type: 'executor-controller',
    agent_id: 'a-exec-3',
    last_assistant_message: `Done.\n\n${block}`,
    cwd,
    run_id: 'rB5-clean',
    occurrence_window: 'w1',
    ...over,
  };
}

function readLines(cwd, rel) {
  const p = path.join(cwd, rel);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
}
function readChannel(cwd) { return readLines(cwd, CHANNEL_REL); }
function readRedispatch(cwd) { return readLines(cwd, REDISPATCH_REL); }

// H2 (final-review SEC-1): reset-on-fix is driven by the run's AUTHORITATIVE on-disk
// fix-cycle marker advancing (the engine derives occurrence_window from disk, NOT from
// the payload). This writes a signed sentinel-state with a given fix_cycle so a test
// can drive a genuine "run advanced to a new fix-cycle" recurrence.
let _signer = null;
try { _signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs')); } catch { _signer = null; }
function setRunFixCycle(root, fixCycle) {
  const docPath = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docPath, { recursive: true });
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docPath }, null, 2));
  let state = { pipeline_active: true, current_phase: '2-execute', fix_cycle: fixCycle };
  if (_signer && typeof _signer.signState === 'function') {
    try {
      const key = _signer.getOrCreateHmacKey ? _signer.getOrCreateHmacKey() : null;
      if (key) state = _signer.signState(state, key);
    } catch { /* unsigned tolerated */ }
  }
  fs.writeFileSync(path.join(docPath, 'sentinel-state.json'), JSON.stringify(state, null, 2));
}

// LAYER-A helpers (mirror B0_two_layer_contract.cjs) — arm the governed window with
// a freshly-timestamped signed marker, and run the REAL arm-gate hook via spawnSync.
function armGovernedWindow(root) {
  writeArmPending(root, '/pipeline-orchestrator:feature add a share button', new Date().toISOString());
}
function runArmGate(payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_ARM_ENFORCEMENT; // force the embedded default unless a test sets it
  return spawnSync(process.execPath, [ARM_GATE], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) },
  });
}
function pre(root, toolName, toolInput) {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput || {}, cwd: root };
}
function denyReason(r) {
  try {
    const o = JSON.parse(r.stdout || '{}');
    return o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny'
      ? o.hookSpecificOutput.permissionDecisionReason : null;
  } catch { return null; }
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-')); fn(tmp); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}

console.log('=== B5 v8.12.0 — error-signal corrector (SubagentStop observer: emit + consume, non-blocking) ===');

// ---- handler presence -------------------------------------------------------
check('hook exports the pure handleSubagentStop handler', () => {
  assert.equal(typeof hook.handleSubagentStop, 'function',
    `MISSING export: .claude/hooks/corrective-error-signal-gate.cjs must export handleSubagentStop(payload) — RED until Batch 5 GREEN creates the hook file (${HOOK_PATH})`);
});

// ===========================================================================
// S1 MAIN — a failure verdict emits ONE signal and fires a non-blocking corrective.
//   THEN: exactly one ErrorSignal on the channel; corrector returns immediately,
//   halted:false, blocking:false; a corrective_redispatch record on disk; no
//   synchronous wait (elapsed < a generous ceiling).
// ===========================================================================
check('S1 MAIN: failure verdict emits ONE signal + fires a non-blocking corrective (record written, no wait)', (tmp) => {
  assert.equal(typeof hook.handleSubagentStop, 'function',
    'handleSubagentStop missing — RED (hook file not created yet)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; // on-disk fallback path

  const t0 = Date.now();
  const out = hook.handleSubagentStop(failurePayload(tmp));
  const elapsed = Date.now() - t0;

  // Fire-and-continue: no synchronous wait on the corrective's outcome.
  assert.ok(elapsed < 2000, `handleSubagentStop must NOT synchronously wait (took ${elapsed}ms) — fire-and-continue`);
  assert.ok(out && typeof out === 'object', 'handler must return a descriptor object');
  assert.equal(out.emitted, true, 'an in-execution failure verdict must emit an ErrorSignal (emitted:true)');
  assert.equal(out.dispatched, true, 'the drained fresh signal must be routed → a corrective dispatched (dispatched:true)');
  assert.ok(out.result && typeof out.result === 'object', 'handler must surface the dispatchCorrective result descriptor');
  assert.equal(out.result.halted, false, 'the run must NOT be halted by an in-execution corrective (LAYER B never halts)');
  assert.equal(out.result.blocking, false, 'an in-execution (R8) corrective is blocking:false (fire-and-continue)');

  // Exactly one ErrorSignal line written to the channel.
  const channel = readChannel(tmp);
  assert.equal(channel.length, 1, `exactly ONE ErrorSignal line expected on the channel, got ${channel.length}`);
  const sig = JSON.parse(channel[0]);
  assert.equal(sig.invariant_id, 'SUBAGENTSTOP_RESULT_MISSING',
    'the emitted signal must carry the in-execution failure invariant SUBAGENTSTOP_RESULT_MISSING');

  // A corrective recovery record written to disk for the responsible agent.
  const records = readRedispatch(tmp);
  assert.equal(records.length, 1, `exactly ONE corrective_redispatch record expected, got ${records.length}`);
  const rec = JSON.parse(records[0]);
  assert.equal(rec.kind, 'corrective_redispatch', 'record kind must be "corrective_redispatch"');
  assert.equal(rec.payload && rec.payload.blocking, false,
    'the on-disk record payload must carry blocking:false (LAYER B fire-and-continue)');
});

// ===========================================================================
// S2 REGRESSION — N observers of ONE defect produce exactly ONE corrective (dedup),
//   run not halted, no second record. We model N observers as N failure verdicts for
//   the SAME (run/agent/invariant/occurrence_window) — the engine's on-disk ledger
//   collapses them to one corrective.
// ===========================================================================
check('S2 REGRESSION: N observers of one defect → exactly ONE corrective (dedup), run not halted, no 2nd record', (tmp) => {
  assert.equal(typeof hook.handleSubagentStop, 'function',
    'handleSubagentStop missing — RED (hook file not created yet)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

  // Five observers of the SAME defect: same run, same agent, same occurrence_window.
  // Distinct agent_id (different observers) must NOT change the dedup key.
  const observers = ['a-exec-1', 'a-exec-2', 'a-exec-3', 'a-exec-4', 'a-exec-5'];
  const outs = observers.map((agent_id) =>
    hook.handleSubagentStop(failurePayload(tmp, { agent_id })));

  // Run never halts on any observation.
  for (const o of outs) {
    assert.ok(o && o.result && o.result.halted === false, 'the run must NEVER be halted at any observation');
  }

  // Exactly ONE corrective dispatched across the five observations (engine dedup).
  const dispatchedTrue = outs.filter((o) => o.dispatched === true).length;
  assert.equal(dispatchedTrue, 1,
    `N observers of ONE defect must yield exactly 1 dispatched corrective, got ${dispatchedTrue} (R8.4 anti-spam dedup)`);

  // No second recovery record for that same defect.
  const records = readRedispatch(tmp);
  assert.equal(records.length, 1,
    `exactly ONE corrective_redispatch record for one defect, got ${records.length} (dedup must drop the rest)`);
});

// ===========================================================================
// S3 REGRESSION (DISTINCTNESS, T5.5) — LAYER-A arming still HARD-blocks (real
//   pipeline-arm-gate via spawnSync + writeArmPending, like B0 D3) WHILE a LAYER-B
//   in-execution corrective fires non-blocking for the SAME run — neither converts.
//   The LAYER-A half passes TODAY; the LAYER-B half is RED until Batch 5 GREEN.
// ===========================================================================
check('S3 DISTINCTNESS: LAYER-A arming hard-blocks WHILE LAYER-B fires non-blocking (no conversion)', (tmp) => {
  // --- LAYER A (real hook): substantive work in the governed window is DENIED.
  armGovernedWindow(tmp);
  const blocked = runArmGate(pre(tmp, 'Write', { file_path: path.join(tmp, 'src', 'x.js') }));
  assert.equal(blocked.status, 0, blocked.stderr);
  const reason = denyReason(blocked);
  assert.ok(reason && /PIPELINE_NOT_ARMED/.test(reason),
    'LAYER A must STILL hard-block substantive work in the governed window (the hard block does not soften)');

  // --- LAYER B (the new observer): an in-execution corrective fires for the SAME
  // run WITHOUT halting and WITHOUT relaxing the LAYER-A block.
  assert.equal(typeof hook.handleSubagentStop, 'function',
    'handleSubagentStop missing — RED (LAYER-B half of the distinctness test)');
  const out = hook.handleSubagentStop(failurePayload(tmp, { run_id: 'rB5' }));
  assert.equal(out.emitted, true, 'the in-execution failure must emit a LAYER-B signal');
  assert.equal(out.result && out.result.halted, false, 'LAYER B must not halt the run');
  assert.equal(out.result && out.result.blocking, false,
    'LAYER B corrective stays blocking:false even alongside a live LAYER-A hard block (gate-trip is blocking:true)');

  // The two layers coexist: LAYER A STILL denies AFTER the LAYER-B corrective fired
  // — the in-execution corrective never lifts the arming hard block.
  const stillBlocked = runArmGate(pre(tmp, 'Write', { file_path: path.join(tmp, 'src', 'y.js') }));
  assert.ok(denyReason(stillBlocked),
    'the in-execution corrective must NOT lift the LAYER-A block (the two layers never convert into each other)');
});

// ===========================================================================
// S4 EDGE — a recurrence after an OBSERVED FIX yields a FRESH corrective
//   (reset-on-fix). CONFIRMED ENGINE MECHANISM (post-H2): the dedup key includes
//   occurrence_window and there is NO ledger-reset API, so the post-fix recurrence
//   needs a NEW occurrence_window → new dedup key → fresh corrective. CRITICALLY the
//   engine derives that window from AUTHORITATIVE on-disk run state (the run's
//   fix-cycle marker), NOT from the payload (final-review SEC-1: a payload window is
//   attacker-influenced). So we drive reset-on-fix the REAL way: advance the on-disk
//   fix_cycle between the original (cycle 1) and the recurrence (cycle 2).
// ===========================================================================
check('S4 EDGE: recurrence after observed fix → FRESH corrective (advancing on-disk fix-cycle, run not halted)', (tmp) => {
  assert.equal(typeof hook.handleSubagentStop, 'function',
    'handleSubagentStop missing — RED (hook file not created yet)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

  // 1) Original defect — run is in fix-cycle 1 → corrective #1.
  setRunFixCycle(tmp, 1);
  const first = hook.handleSubagentStop(failurePayload(tmp));
  assert.equal(first.dispatched, true, 'the original defect must dispatch a corrective');
  assert.equal(first.result && first.result.halted, false, 'original corrective must not halt');

  // 2) Same defect re-observed in the SAME fix-cycle → deduped (NOT a fresh corrective).
  const dup = hook.handleSubagentStop(failurePayload(tmp));
  assert.equal(dup.dispatched, false, 'a same-cycle re-observation must be deduped (not a fresh corrective)');

  // 3) Defect was fixed, then RECURS later — the run advanced to a new fix-cycle (2),
  //    so the engine derives a NEW on-disk occurrence_window. Reset-on-fix → FRESH.
  setRunFixCycle(tmp, 2);
  const recur = hook.handleSubagentStop(failurePayload(tmp));
  assert.equal(recur.dispatched, true,
    'a recurrence after an observed fix (advanced on-disk fix-cycle) must dispatch a FRESH corrective — reset-on-fix');
  assert.equal(recur.result && recur.result.halted, false, 'the recurrence corrective must STILL not halt the run');

  // Exactly TWO genuine correctives on disk (w1 original + w2 recurrence); the w1
  // duplicate produced NO extra record.
  const records = readRedispatch(tmp);
  assert.equal(records.length, 2,
    `expected exactly 2 corrective records (w1 original + w2 recurrence), got ${records.length} — the same-window dup must not add one`);
});

// ===========================================================================
// S4b EDGE (CROSS-WINDOW / MULTI-AGENT, additive strengthening of the S4 gap) —
//   the append-only channel must NOT cause a LATER failure for a DIFFERENT agent to
//   re-fire a SPURIOUS corrective for an already-handled agent. This is the case the
//   original S4 missed: S4 reuses ONE agent across windows, so all signals collapse
//   to a single dedup key per window and the bug is invisible. Here agent A fails and
//   is corrected once in window w1; THEN, in a LATER window w2, a DIFFERENT agent B
//   fails. The result must be a corrective for B and NOTHING new for the already-
//   handled A — the corrective_redispatch record count must reflect exactly the
//   genuinely-fresh defects (A@w1 + B@w2 = 2), NOT the re-routed channel history.
//
//   PROOF OF DISCRIMINATION (RED against the OLD drain-all code): the OLD hook
//   drained the WHOLE channel each call and re-stamped every drained line with THIS
//   call's live occurrence_window. On B's call it would have re-stamped A's stored
//   w1 signal to w2 → a NEW dedup key the ledger lacks → a SPURIOUS 3rd corrective for
//   the already-fixed A. So the OLD code produces 3 records here (A@w1 + spurious
//   A@w2 + B@w2) and B's call reports dispatched_count >= 2. The fixed hook routes
//   ONLY the just-emitted signal, so it produces exactly 2 records and B's call
//   reports dispatched_count === 1. This check FAILS on the old code, PASSES on the fix.
// ===========================================================================
check('S4b EDGE: a later failure for a DIFFERENT agent must NOT re-fire a corrective for an already-handled agent (cross-window, no channel-history re-route)', (tmp) => {
  assert.equal(typeof hook.handleSubagentStop, 'function',
    'handleSubagentStop missing — RED (hook file not created yet)');
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

  // v8.18.2: the observer now only acts on manifest-recognized GOVERNED spine leaves
  // (Explore/general-purpose/etc. are no-ops). The cross-window dedup behavior this
  // scenario locks is agent-agnostic, so we use two DISTINCT real governed leaves
  // (executor-controller + review-orchestrator) instead of the old generic agent-A/B.
  // 1) Agent A (executor-controller) fails in window w1 → corrective #1 (genuinely fresh).
  const a = hook.handleSubagentStop(failurePayload(tmp, {
    agent_type: 'executor-controller', agent_id: 'a-A-1', occurrence_window: 'w1',
  }));
  assert.equal(a.emitted, true, 'agent A failure must emit a signal');
  assert.equal(a.dispatched, true, 'agent A defect must dispatch a fresh corrective');
  assert.equal(a.dispatched_count, 1, 'agent A call must route exactly its OWN one fresh signal');

  // After A is corrected the run advances to a LATER window; a DIFFERENT agent B now
  // fails. The channel already holds A's w1 signal (append-only, never cleared).
  // 2) Agent B (review-orchestrator) fails in window w2 → a corrective for B ONLY.
  const b = hook.handleSubagentStop(failurePayload(tmp, {
    agent_type: 'review-orchestrator', agent_id: 'a-B-1', occurrence_window: 'w2',
  }));
  assert.equal(b.emitted, true, 'agent B failure must emit a signal');
  assert.equal(b.dispatched, true, 'agent B (a genuinely-fresh distinct defect) must dispatch a corrective');
  // THE LOAD-BEARING ASSERTION: B's call routes ONLY its own just-emitted signal, so
  // it dispatches exactly ONE corrective — it must NOT re-route A's stored w1 signal
  // (which, re-stamped to w2 under the OLD drain-all code, would mint a new key and
  // fire a SPURIOUS 2nd corrective for the already-handled A). OLD code: >= 2. Fix: 1.
  assert.equal(b.dispatched_count, 1,
    `agent B call must dispatch exactly 1 corrective (its own fresh defect), got ${b.dispatched_count} — a count > 1 means the channel history was spuriously re-routed (the HIGH-1 cross-window amplification)`);

  // 3) The on-disk record count must equal exactly the genuinely-fresh defects:
  //    A@w1 + B@w2 = 2. The OLD drain-all code would have written a 3rd SPURIOUS
  //    record (A re-stamped to w2) — the bug this check exists to catch.
  const records = readRedispatch(tmp).map((l) => JSON.parse(l));
  assert.equal(records.length, 2,
    `expected exactly 2 corrective records (A@w1 + B@w2), got ${records.length} — a 3rd record means a SPURIOUS corrective was re-fired for the already-handled agent A (HIGH-1)`);

  // And concretely: there must be NO SECOND corrective whose responsible agent is A.
  const aRecords = records.filter((r) => r && r.agent_ref === 'executor-controller');
  assert.equal(aRecords.length, 1,
    `agent A must have exactly ONE corrective record (its genuine w1 defect), got ${aRecords.length} — a 2nd A record is the spurious cross-window re-fire`);
  const bRecords = records.filter((r) => r && r.agent_ref === 'review-orchestrator');
  assert.equal(bRecords.length, 1,
    `agent B must have exactly ONE corrective record (its genuine w2 defect), got ${bRecords.length}`);
});

// ===========================================================================
// S5 EDGE — malformed/empty signal or missing channel is a SAFE NO-OP (never
//   throws, never halts). The observer/corrector degrade silently; reading a
//   missing/partly-corrupt channel skips bad lines and returns what is valid.
// ===========================================================================
check('S5 EDGE: malformed/empty verdict or missing channel → safe no-op (no throw, no halt)', (tmp) => {
  assert.equal(typeof hook.handleSubagentStop, 'function',
    'handleSubagentStop missing — RED (hook file not created yet)');

  // (a) A range of malformed verdict payloads must NOT throw and must NOT emit.
  const malformed = [
    {},
    null,
    undefined,
    'not-an-object',
    42,
    { cwd: tmp },                                  // no agent_type / message
    { cwd: tmp, last_assistant_message: 123 },     // wrong-typed message
    { agent_type: 'executor-controller' },          // no cwd → cannot persist
  ];
  for (const m of malformed) {
    let out;
    assert.doesNotThrow(() => { out = hook.handleSubagentStop(m); },
      `handleSubagentStop must never throw on malformed input: ${JSON.stringify(m)}`);
    assert.ok(out && typeof out === 'object', 'handler must always return a descriptor');
    assert.equal(out.emitted, false, `malformed input must not emit a signal: ${JSON.stringify(m)}`);
    assert.ok(out.result == null || out.result.halted === false,
      'a failed detection must never halt the run');
  }

  // (b) A CLEAN finish (valid result block, no self-reported error) is NOT a failure
  //     → no emission, no record (the observer does not act on a healthy verdict).
  const clean = hook.handleSubagentStop(cleanPayload(tmp));
  assert.equal(clean.emitted, false, 'a clean finish (valid result block) must NOT emit a signal');
  assert.equal(fs.existsSync(path.join(tmp, REDISPATCH_REL)), false,
    'a clean finish must write no corrective record');

  // (c) The engine's reader tolerates a missing/partly-corrupt channel: it skips bad
  //     lines and returns only the valid ones (never throws). (Reuse-side proof.)
  assert.deepEqual(engine.readErrorSignals(tmp), [],
    'readErrorSignals on a missing channel must return [] (no throw)');
  const channelPath = path.join(tmp, CHANNEL_REL);
  fs.mkdirSync(path.dirname(channelPath), { recursive: true });
  fs.writeFileSync(channelPath, 'this-is-not-json\n{"run_id":"ok","invariant_id":"X"}\n{bad json\n');
  const valid = engine.readErrorSignals(tmp);
  assert.ok(Array.isArray(valid), 'readErrorSignals must return an array on a partly-corrupt channel');
  assert.equal(valid.length, 1, 'a partly-corrupt channel must skip the bad lines and return only the valid one');
  assert.equal(valid[0].run_id, 'ok', 'the one valid line must survive the corrupt neighbours');
});

// ===========================================================================
// S6 SMOKE (real-process E2E) — the observer hook is registered under SubagentStop
//   in hooks/hooks.json AND a real failure-verdict payload piped on stdin to a
//   freshly spawned `node <hook>.cjs` → exit 0, no block decision, channel file
//   exists with >=1 valid signal line, routing writes a corrective_redispatch record.
// ===========================================================================
check('S6 SMOKE: real spawned hook (stdin failure verdict) exits 0 + writes channel + corrective record', (tmp) => {
  // (a) the hook file must actually exist to spawn.
  assert.equal(fs.existsSync(HOOK_PATH), true,
    `MISSING hook file: ${HOOK_PATH} must exist for the real-process smoke — RED until Batch 5 GREEN`);

  // (b) v8.20.0-glm port: hook migrated from SubagentStop to PostToolUse:Agent
  // (Z-Code has no SubagentStop event). Verify it's registered under PostToolUse.
  const manifest = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const ptu = (manifest && manifest.hooks && manifest.hooks.PostToolUse) || [];
  const registered = ptu.some((group) => Array.isArray(group.hooks)
    && group.hooks.some((h) => typeof h.command === 'string'
      && /corrective-error-signal-gate\.cjs/.test(h.command)));
  assert.equal(registered, true,
    'corrective-error-signal-gate.cjs must be registered under PostToolUse (matcher Agent) in hooks/hooks.json — v8.20.0-glm port migrated from SubagentStop');

  // (c) spawn the real process with a failure verdict on stdin in a fresh tmp cwd.
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  const payload = failurePayload(tmp);
  let stdout = '';
  try {
    stdout = execFileSync('node', [HOOK_PATH], {
      input: JSON.stringify(payload),
      cwd: tmp,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (e) {
    throw new Error(`spawned hook must exit 0 (observer never blocks); got error: ${e && e.message}`);
  }

  // (d) it must NOT emit a block decision (it is an observer, not the commit gate).
  if (stdout && stdout.trim()) {
    let parsed = null;
    try { parsed = JSON.parse(stdout); } catch { parsed = null; }
    if (parsed) {
      assert.notEqual(parsed.decision, 'block',
        'the observer must NEVER emit a block decision (it is fire-and-continue, not the commit gate)');
    }
  }

  // (e) the error-signals channel file exists with >=1 valid signal line.
  const channel = readChannel(tmp);
  assert.ok(channel.length >= 1, 'error-signals.jsonl must exist with >=1 valid signal line after the real run');
  const sig = JSON.parse(channel[0]);
  assert.ok(typeof sig.dedup_key === 'string' && sig.dedup_key, 'the persisted signal must carry a derived dedup_key');

  // (f) routing the fresh signal wrote a corrective_redispatch record to disk.
  const records = readRedispatch(tmp);
  assert.ok(records.length >= 1, 'corrective-redispatch.jsonl must exist with >=1 line after the real run');
  const rec = JSON.parse(records[0]);
  assert.equal(rec.kind, 'corrective_redispatch', 'real-process record kind must be "corrective_redispatch"');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
