#!/usr/bin/env node
'use strict';

// =============================================================================
// stop-gate-hook.cjs — v8.9.0 (Stop / SessionEnd / StopFailure) — T5
// (REQ-STOP-GATE / REQ-STOP-RECOVERY / REQ-STOP-SINGLE-WRITER)
// =============================================================================
// The SINGLE authoritative owner of the Stop decision. It is a different concern
// from stop-hook.cjs (the telemetry run-log writer) and session-cleanup-hook.cjs
// (the lock-cleanup) — this hook, and only this hook, decides whether an
// incomplete governed run may stop, and it owns the terminal-state write.
//
// LOGIC (locate the run by signed pointer; no governed run ⇒ allow):
//   - completed / terminal run        ⇒ allow.
//   - incomplete + ARMED (DEFAULT)    ⇒ decision:block + exact next action,
//                                        capped at 3 continuities → hard_failed terminal.
//   - incomplete + escape (warn/off)  ⇒ allow (block logic inert when opted out).
//   - outstanding STALE/committed pending_dispatches + ARMED ⇒ block; a LIVE
//     recent dispatch is a legitimate background wait ⇒ allow (T2.2 — does NOT
//     advance the continuity counter).
//   - SessionEnd / StopFailure / interrupt ⇒ NEVER declare success, NEVER delete
//                                        evidence, keep the run recoverable. Only a
//                                        PRE-PERSISTED terminal flag may complete.
//
// ARMING (v8.11.0 B5 — DEFAULT-ON; see isArmed()):
//   armed by default; opt OUT with PIPELINE_STOP_BLOCK_ENFORCEMENT=warn|off|0|false|no|allow|disabled|observe.
//
// Honest terminal vocabulary: completed | aborted_by_user | cancelled | hard_failed.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let lock = null;
try { lock = require('../../lib/exclusive-lock.cjs'); } catch { lock = null; }
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }
let manifest = null;
try { manifest = require('../../lib/contracts/workflow-manifest.cjs'); } catch { manifest = null; }
// Lote 4 (chain-tied enforcement): the step ledger so the close can require a
// COMPLETE chain (every phase stamped) before honoring a GO signal.
let stepLedger = null;
try { stepLedger = require('../../lib/step-ledger.cjs'); } catch { stepLedger = null; }
// v8.19.1 — consume the arm-pending marker on a deliberate run close. Optional
// require: a missing module degrades to a no-op (marker cleanup must NEVER be a hard
// dependency of the Stop decision).
let arm = null;
try { arm = require('../../lib/pipeline-arm.cjs'); } catch { arm = null; }

const CONTINUITY_CAP = 3; // after 3 continuities, convert to hard_failed terminal.
// T2.2 (loop/next-action-contract): a pending dispatch within this TTL is a LIVE
// background wait (a dispatched subagent still running) and must NOT count as a
// continuity failure. Beyond it, the dispatch is stale (the subagent is presumed
// lost) and falls through to the continuity block. Coincidentally aligned with
// the 30min PROTOCOL_HANDSHAKE_TIMEOUT default (NOT coupled — each is an
// independent constant); generous margin so a legitimately long subagent turn is
// not miscounted as a failed continuity.
const PENDING_DISPATCH_TTL_MS = 30 * 60 * 1000;
// T2.2: a created_at more than this many ms in the FUTURE is a forged timestamp
// (a dispatch cannot legitimately have been created in the future) —
// hasLivePendingDispatch treats it as NOT live so a tampered state cannot mint a
// perpetual Stop exemption. A few seconds is tolerated (normal cross-process
// clock skew between the recorder's now() and this hook's now()).
const CLOCK_SKEW_MS = 5000;

// B1 (REQ-HAPPY-PATH-COMPLETER): a run that really finished must reach a terminal
// 'completed' so arming the Stop block (B5) cannot deadlock it. The success signal
// is the SAME one stop-hook.cjs reads for the run-log final_decision cascade.
const GO_DECISIONS = new Set(['GO', 'CONFIRMED', 'APPROVED']);
function isGoValue(v) {
  return typeof v === 'string' && GO_DECISIONS.has(v.trim().toUpperCase());
}

function isArmed() {
  // DEFAULT-ON (B5 — v8.11.0): the incomplete-run Stop block is ARMED by default so a
  // shipped install actually enforces it. Escape: PIPELINE_STOP_BLOCK_ENFORCEMENT =
  // warn|off|0|false|no|allow|disabled|observe reverts to observe-only. Safe to
  // default-on: B1 marks a GO/closeout run terminal 'completed' (a finished run is
  // never blocked), the 3-continuity cap → hard_failed prevents an infinite block, and
  // SessionEnd/StopFailure NEVER block (recovery stays intact). Re-confirmed live in B6.
  return !/^(warn|off|0|false|no|allow|disabled|observe)$/i.test(String(process.env.PIPELINE_STOP_BLOCK_ENFORCEMENT || '').trim());
}

function resolveStatePath(pipelineDir) {
  try {
    if (eg && typeof eg.discoverStatePath === 'function') {
      const { statePath, authoritative } = eg.discoverStatePath(pipelineDir);
      return { statePath, authoritative };
    }
  } catch { /* */ }
  return { statePath: null, authoritative: false };
}

function isTerminalState(value) {
  if (manifest && typeof manifest.isTerminal === 'function') return manifest.isTerminal(value);
  return ['completed', 'hard_failed', 'aborted_by_user', 'cancelled'].includes(value);
}

// T2.2 (loop/next-action-contract): the STRICTER live-pending test. A pending
// dispatch is LIVE only when it is (a) not committed, (b) has a WELL-FORMED
// created_at (an ISO string per dispatch-record-hook.cjs:206 — bad/absent →
// fail-safe, do NOT exempt), AND (c) within PENDING_DISPATCH_TTL_MS of now.
// Stale, committed, or malformed dispatches return false (they do NOT exempt the
// Stop and fall through to the continuity block). The TTL check is what stops a
// legitimate background wait from being miscounted as a continuity failure.
function hasLivePendingDispatch(state, ttlMs) {
  const pd = state && state.pending_dispatches;
  if (!pd || typeof pd !== 'object') return false;
  const now = Date.now();
  for (const rec of Object.values(pd)) {
    if (!rec || typeof rec !== 'object') continue;
    if (rec.status === 'committed' || rec.committed === true) continue; // S4
    const createdMs = new Date(rec.created_at).getTime();              // S7: bad -> NaN
    if (!Number.isFinite(createdMs) || createdMs <= 0) continue;        // S7 fail-safe
    if (createdMs > now + CLOCK_SKEW_MS) continue;                      // forged future ts
    if (now - createdMs > ttlMs) continue;                             // S3 stale
    return true;                                                       // S1/S6 live
  }
  return false;
}

// Is the run complete (a terminal state already persisted)?
function isComplete(state) {
  if (!state || typeof state !== 'object') return false;
  if (isTerminalState(state.terminal_state)) return true;
  if (isTerminalState(state.status)) return true;
  return false;
}

// v8.19.0 (REQ-C). resolveWorkflowKey: same runtime-state resolution as
// subagent-stop-commit-hook.cjs (D-2 — keep in lockstep). A spec authoring run is
// resolved off the during-authoring `spec_authoring_progress` signal, NOT the
// seal-time `type:'Spec'` flag.
function resolveWorkflowKey(state) {
  if (state && typeof state.workflow === 'string' && state.workflow) return state.workflow;
  const prog = state && state.spec_authoring_progress;
  if (prog && typeof prog === 'object' && Object.keys(prog).length > 0) return 'Spec';
  return 'FULL';
}
function isSpecRun(state) { return resolveWorkflowKey(state) === 'Spec'; }

// hasSealEvidence(state) → true IFF the run is authentically SEALED (the signed
// sentinel's final_decision is SEALED). v8.19.0 FORGERY GUARD: the UNSIGNED
// manifest.yaml `status: sealed` is NO LONGER an independent seal-authority source — it
// is not signature-verified, so a forged line alone must not grant a clean spec close.
// Delegates to the workflow-manifest SSOT sealEvidence(state), shared verbatim with
// subagent-stop-commit-hook.cjs (D-2 — no more duplicated IO copy to drift). Legit
// seals are unaffected (sealSpecRun writes BOTH sentinel final_decision AND manifest).
function hasSealEvidence(state) {
  return !!(manifest && typeof manifest.sealEvidence === 'function' && manifest.sealEvidence(state));
}

// Lote 4 — require a COMPLETE chain before a GO signal closes the run. OPT-IN
// (parity with v8.9.0 PIPELINE_REQUIRE_GREEN_CLOSE): strict is OFF by default so a
// genuinely finished run of any workflow whose ledger this hook cannot fully verify
// is NEVER deadlocked. Turn on with PIPELINE_CHAIN_CLOSE_ENFORCEMENT to enforce
// "no GO without every phase stamped in order" — a GO whose chain is incomplete then
// falls through to the incomplete-run block (capped at 3 continuities → hard_failed,
// so it can never deadlock forever).
function chainCloseStrict() {
  return /^(1|true|yes|on|deny|strict)$/i.test(String(process.env.PIPELINE_CHAIN_CLOSE_ENFORCEMENT || '').trim());
}
function chainIsComplete(state) {
  if (!stepLedger || typeof stepLedger.isChainComplete !== 'function') return true; // cannot verify → don't block
  // Batch 1 CORRECTION (adversarial REC-2 / MEDIUM-2): an EMPTY agent-step ledger at
  // a GO close means the run was NEVER agent-ledger-tracked — it is skill-governed
  // (Spec/brainstorm) OR a mis-identified workflow whose controller did not write
  // workflow_key. Requiring ledger-completeness would DEADLOCK it even if it mis-mapped
  // to FULL. Defer to the GO/seal signal — closing the hole REGARDLESS of whether the
  // upstream controller tagged the workflow. (A genuine FULL run that reached GO has a
  // non-empty ledger, so this never weakens FULL's real enforcement.)
  if (!state || !Array.isArray(state.step_ledger) || state.step_ledger.length === 0) return true;
  // Batch 1 (audit ARCH-3/ARCH-7): SSOT key resolution (no silent brainstorm→FULL).
  const wf = typeof stepLedger.resolveWorkflowKey === 'function'
    ? stepLedger.resolveWorkflowKey(state)
    : ((state && state.workflow_key) || (state && state.task_type === 'Spec' ? 'Spec' : 'FULL'));
  // Batch 1 (audit ARCH-2): the chain-complete close ONLY governs workflows whose
  // completeness the AGENT ledger tracks (FULL). Spec/brainstorm interleave
  // skill-dispatched, seal-governed steps — requiring an agent-ledger-complete chain
  // for them would DEADLOCK their close (exactly the audit's prediction). Defer to the
  // existing GO/seal completion signal: treat as "complete" so the close is not blocked.
  if (typeof stepLedger.ledgerGovernsClosure === 'function' && !stepLedger.ledgerGovernsClosure(wf)) return true;
  try { return stepLedger.isChainComplete(state, wf); } catch { return true; }
}

// Persist a state mutation under the lock with re-read → verify → mutate → re-sign
// → atomic-rename. `mutate(state)` edits in place. Best-effort, never throws out.
// v8.20.0 (F1 fail-open): returns TRUE only when the signed write really committed.
// Callers that gate a BLOCK on a persisted counter MUST check this — a silent
// decline (signer unavailable, verify failing/throwing, tmp-write/rename failing)
// means the continuity cap can never fire, so blocking would loop FOREVER.
function persist(statePath, mutate) {
  if (!signer || typeof signer.writeSignedState !== 'function') return false;
  let wrote = false;
  const doWrite = () => {
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); }
    catch { return; }
    if (!state || typeof state !== 'object') return;
    // FAIL CLOSED on a verification THROW (SEC-01 parity with dispatch-record-hook):
    // a state shaped to make verifyState throw must NOT fall through to mutate +
    // re-sign — that would persist over state whose integrity we could not confirm.
    // Declining to write is safe: persist() then returns false, and the block call
    // site (v8.20.0 F1) converts an unpersistable counter bump into an ALLOW — the
    // run stays recoverable and the teardown is never walled behind a counter that
    // cannot advance.
    try {
      if (typeof signer.verifyState === 'function') {
        const v = signer.verifyState(state, { key: signer.readHmacKey() });
        if (!v.valid && !v.unsigned && !v.key_unavailable) return; // do not write over corrupt
      }
    } catch { return; } // verify threw → cannot confirm integrity → do NOT write
    // COMMIT-FLAG: a mutate that returns !== true aborts the write (no version bump,
    // no re-sign). Lets writeCompleted decline UNDER THE LOCK when the freshest state
    // is already terminal — lost-update + idempotency safety (a concurrent
    // aborted_by_user/hard_failed must NOT be overwritten with completed).
    let commit = false;
    try { commit = mutate(state) === true; } catch { return; }
    if (!commit) return;
    const cur = Number.isFinite(state.state_version) ? state.state_version : 0;
    state.state_version = cur + 1;
    signer.writeSignedState(statePath, state, { key: signer.readHmacKey() });
    wrote = true;
  };
  try {
    if (lock && typeof lock.withLock === 'function') lock.withLock(statePath, doWrite);
    else doWrite();
  } catch { /* best-effort */ }
  return wrote;
}

// Write the hard_failed terminal (the continuity cap). Persists hard_failed FIRST
// so the H3 reorder holds: the terminal exists before any cleanup completion mark.
function writeHardFailed(statePath) {
  persist(statePath, (state) => {
    state.terminal_state = 'hard_failed';
    state.status = 'hard_failed';
    state.hard_failed_at = Date.now();
    return true;
  });
}

// Write the happy-path terminal. Mirrors writeHardFailed but for an honest success:
// only ever called on the Stop event when a REAL GO completion signal is present.
function writeCompleted(statePath) {
  persist(statePath, (state) => {
    // UNDER THE LOCK, against the freshest state: never overwrite a terminal a
    // concurrent writer already set (aborted_by_user / cancelled / hard_failed) and
    // never re-write an already-completed run — idempotent + lost-update-safe.
    if (isComplete(state)) return false;
    state.terminal_state = 'completed';
    state.status = 'completed';
    state.completed_at = Date.now();
    return true;
  });
}

// Is there a REAL success completion signal for THIS run? Never fabricated:
//   1. sentinel.final_decision already maps to GO; OR
//   2. the most-recent CLOSEOUT_CONFIRM / PA_DE_CAL line in the run's
//      gate-decisions.jsonl maps to GO (parity with stop-hook.cjs final_decision cascade).
// A NO-GO / CONDITIONAL / absent verdict ⇒ false (run stays recoverable).
const GATE_TAIL_MAX_BYTES = 256 * 1024; // bound the read — never buffer an unbounded file
const GATE_TAIL_MAX_LINES = 50;         // parity with stop-hook.cjs readTailLines(…, 50)

function hasSuccessCompletionSignal(state, docDir) {
  // PRIMARY: the signed sentinel-state final_decision (forge-proof without the HMAC key).
  if (state && isGoValue(state.final_decision)) return true;
  // FALLBACK: the most-recent CLOSEOUT_CONFIRM / PA_DE_CAL line in the run's own
  // gate-decisions.jsonl — same source + same source-of-truth the shipped
  // stop-hook.cjs final_decision cascade already trusts (no new risk surface).
  // Bounded tail read so a pathologically large ledger cannot OOM the teardown.
  if (!docDir) return false;
  const gdPath = path.join(docDir, 'gate-decisions.jsonl');
  let raw;
  try {
    const st = fs.statSync(gdPath);
    const start = st.size > GATE_TAIL_MAX_BYTES ? st.size - GATE_TAIL_MAX_BYTES : 0;
    const fd = fs.openSync(gdPath, 'r');
    try {
      const len = st.size - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      raw = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return false; }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim()).slice(-GATE_TAIL_MAX_LINES);
  for (let i = lines.length - 1; i >= 0; i--) {
    let ev; try { ev = JSON.parse(lines[i]); } catch { continue; }
    if (ev && (ev.gate === 'CLOSEOUT_CONFIRM' || ev.gate === 'PA_DE_CAL')) {
      return isGoValue(ev.decision);
    }
  }
  return false;
}

// v8.19.1 — consume the arm-pending marker when a governed run reaches a DELIBERATE
// close (completed / hard_failed / sealed / inactive). The marker is enforcement
// CONTROL state written at /pipeline invocation; nothing consumed it on run-end, so a
// finished code-mutating run's still-live marker (≤TTL, same session) kept blocking the
// NEXT non-pipeline task with PIPELINE_NOT_ARMED until TTL expiry or a restart. Called
// ONLY on the closed-run ALLOW paths below — NEVER on a block (would un-govern a live
// run), NEVER on SessionEnd/StopFailure recovery, NEVER on corrupt state. Session-aware
// (a marker owned by another session is preserved). PURE best-effort side effect: fully
// guarded, never throws, never changes the Stop decision. Preserves the TTL, session
// isolation and tamper invariants (a tampered marker is left in place → stays governed).
// CWD ASSUMPTION (accepted): the marker is keyed off `pipelineDir` (payload.cwd), the SAME
// cwd the UserPromptSubmit writer armed it under; if a teardown reports a different cwd the
// consume simply misses and the marker reverts to its TTL / SessionStart-cleanup backstop —
// a missed consume is recoverable and never un-governs the wrong run.
function closeArmMarker(pipelineDir, sessionId) {
  try {
    if (arm && typeof arm.clearArmPendingForSession === 'function'
        && typeof pipelineDir === 'string' && pipelineDir) {
      arm.clearArmPendingForSession(pipelineDir, sessionId);
    }
  } catch { /* best-effort: marker cleanup must never affect the Stop decision */ }
}

function nextActionReason(state) {
  const phase = (state && typeof state.current_phase === 'string') ? state.current_phase : 'a fase atual';
  return (
    'PIPELINE_STOP_BLOCKED: o run governado ainda não terminou (fase: ' + phase + '). ' +
    'Não pare agora — retome o pipeline e conclua a próxima etapa pendente, ou aborte ' +
    'explicitamente o run (o estado fica recuperável). Investigação e perguntas seguem liberadas.'
  );
}

// REQ-STOP-RECOVER (T14): the exact, reachable next action emitted as
// hookSpecificOutput.additionalContext alongside the block reason. Names which
// pending dispatch to resolve (if any) / which phase is incomplete, so the block is
// a signal-and-recover (the user's intent), not a dead wall. Additive — the block
// reason and the default-OFF arming are unchanged.
function nextActionContext(state) {
  const phase = (state && typeof state.current_phase === 'string') ? state.current_phase : 'the current phase';
  let pendingNote = '';
  try {
    const pd = state && state.pending_dispatches && typeof state.pending_dispatches === 'object'
      ? state.pending_dispatches : null;
    if (pd) {
      const open = Object.keys(pd).filter((k) => {
        const rec = pd[k];
        return rec && typeof rec === 'object' && rec.status !== 'committed' && rec.committed !== true;
      });
      if (open.length) {
        pendingNote = ' Resolve the outstanding dispatch(es): ' + open.join(', ') + '.';
      }
    }
  } catch { /* best-effort context */ }
  return (
    'Next action: resume the pipeline and complete the next pending step of ' + phase + '.' +
    pendingNote +
    ' If you truly want to end here, abort the run explicitly — the state stays recoverable. ' +
    'Investigation and questions remain allowed.'
  );
}

// Pure-ish decision (mutates state file on the cap path). Returns { decision }.
function decide(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  const event = payload.hook_event_name;
  const pipelineDir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  // v8.19.1: session ownership for the arm-marker consume (a cross-session marker is preserved).
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;

  const { statePath } = resolveStatePath(pipelineDir);

  // Discover + corruption-classify the run state.
  let state = null;
  try { state = eg && eg.findActiveSentinelState(pipelineDir); } catch { state = null; }

  // Absent state entirely → ungoverned/absent → allow (absent ≠ corrupt).
  if (!state) return { decision: 'allow' };

  // Corrupt authoritative state: this is the Stop event, not a governed code action.
  // The Stop gate must NOT block teardown on corrupt state (anti-deadlock — a run
  // whose state we can't read must still be allowed to stop and stay recoverable).
  if (eg && state === eg.CORRUPT_SENTINEL) return { decision: 'allow' };

  // --- SessionEnd / StopFailure / interrupt: recovery path -------------------
  // Never declare success, never delete evidence. Only a PRE-PERSISTED terminal
  // flag may already mark the run complete (we do not write one here).
  if (event === 'SessionEnd' || event === 'StopFailure') {
    // Explicitly DO NOT mutate status to completed and DO NOT touch evidence files.
    return { decision: 'allow' };
  }

  // --- Stop event: happy-path completion (B1) --------------------------------
  // A genuinely finished run must reach a terminal 'completed' BEFORE the block
  // logic, so arming the Stop block (B5) cannot deadlock a run that actually
  // finished. Only on the Stop event (the recovery events returned above), only
  // when not already terminal, and only on a REAL GO signal — never fabricated.
  if (!isComplete(state) && statePath && hasSuccessCompletionSignal(state, path.dirname(statePath))
      && (!chainCloseStrict() || chainIsComplete(state))) {
    writeCompleted(statePath);
    closeArmMarker(pipelineDir, sessionId); // v8.19.1: run finished → consume the marker
    return { decision: 'allow' };
  }

  // --- Stop event: spec seal evidence (REQ-C1) -------------------------------
  // A spec authoring run reaches SEALED with pipeline_active:false + final_decision
  // 'SEALED' (not a GO value), so the B1 GO-signal completer above does NOT fire for
  // it. On-disk seal evidence (signed final_decision SEALED OR manifest status sealed)
  // is the honest clean-close condition for a spec run: mark it terminal completed.
  const specNeedsSeal = isSpecRun(state) && !hasSealEvidence(state);
  if (isSpecRun(state) && !isComplete(state) && statePath && hasSealEvidence(state)) {
    writeCompleted(statePath);
    closeArmMarker(pipelineDir, sessionId); // v8.19.1: spec sealed → consume the marker
    return { decision: 'allow' };
  }

  // --- Stop event ------------------------------------------------------------
  // No governed run (not active, no terminal in progress) → allow. REQ-C2: an
  // inactive-but-UNSEALED spec run must NOT slip through on inactivity alone — it
  // falls to the incomplete-run block below (capped at 3 → hard_failed).
  if (state.pipeline_active !== true && !isComplete(state) && !specNeedsSeal) {
    closeArmMarker(pipelineDir, sessionId); // v8.19.1: inactive close → consume the marker
    return { decision: 'allow' };
  }

  // A complete/terminal run is never blocked.
  if (isComplete(state)) { closeArmMarker(pipelineDir, sessionId); return { decision: 'allow' }; } // v8.19.1: terminal → consume the marker

  // Incomplete governed run. Block logic is inert unless armed (default OFF).
  if (!isArmed()) return { decision: 'allow' };

  // T2.2 (loop/next-action-contract): a LIVE pending dispatch (recent within
  // TTL, well-formed created_at, not committed) is legitimate background work —
  // the Stop is a turn boundary while a dispatched subagent still runs, NOT a
  // continuity failure. Allow WITHOUT advancing the continuity counter, so
  // legitimate background waits cannot accumulate into a false hard_failed
  // (S1/S6). Runs BEFORE the cap so a live wait never contributes to it. Stale
  // (S3), committed (S4), or malformed (S7) dispatches do NOT exempt and fall
  // through to the continuity block below unchanged.
  if (hasLivePendingDispatch(state, PENDING_DISPATCH_TTL_MS)) {
    return { decision: 'allow' };
  }

  // Armed + incomplete. Continuity cap: this Stop is continuity attempt
  // (continuity_attempts + 1). On the 3rd, convert to a hard_failed terminal and
  // ALLOW (do not block a third time).
  const priorContinuities = Number.isFinite(state.continuity_attempts) ? state.continuity_attempts : 0;
  const thisAttempt = priorContinuities + 1;
  if (thisAttempt >= CONTINUITY_CAP) {
    if (statePath) writeHardFailed(statePath);
    closeArmMarker(pipelineDir, sessionId); // v8.19.1: hard_failed terminal → consume the marker
    return { decision: 'allow' };
  }

  // No live pending dispatch (none, or stale/committed/malformed per the
  // hasLivePendingDispatch check above) + an active run OR an unsealed spec run
  // under teardown (REQ-C2) → block with next action + advance the counter.
  if (state.pipeline_active === true || specNeedsSeal) {
    // FAIL-SAFE (B5 adversarial): without a writable statePath we cannot advance the
    // continuity counter, so the 3-cap → hard_failed terminator could NEVER fire and
    // the block would repeat forever (an INFINITE deadlock). If we cannot persist the
    // counter, ALLOW — never trade a missing-result block for a permanent deadlock; the
    // run whose state path is unresolvable is already unrecoverable.
    if (!statePath) return { decision: 'allow' };
    // v8.20.0 (F1): the SAME fail-safe extends to "the counter bump did not
    // persist" (read-only state/dir, signer unavailable, verify failing at write
    // time). If we cannot advance the counter, the 3-cap can never fire and the
    // block would repeat forever — ALLOW instead, leaving an audit trace.
    const persisted = persist(statePath, (st) => { st.continuity_attempts = thisAttempt; return true; });
    if (!persisted) {
      process.stderr.write('[stop-gate-hook] STOP_GATE_COUNTER_UNPERSISTABLE: continuity counter could not be persisted — failing OPEN (never an infinite block)\n');
      return { decision: 'allow' };
    }
    return { decision: 'block', reason: nextActionReason(state), additionalContext: nextActionContext(state) };
  }

  return { decision: 'allow' };
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(String(s).trim() || '{}');
      const out = decide(payload);
      if (out && out.decision === 'block') {
        // A Stop hook signals a block via top-level `decision: "block"` + reason.
        // REQ-STOP-RECOVER (T14): ALSO emit hookSpecificOutput.additionalContext —
        // the exact reachable next action — so the block recovers instead of walling.
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: out.reason,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: out.additionalContext || '',
          },
        }));
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('stop-gate-hook error: ' + (e && e.message ? e.message : e) + '\n');
      process.exit(0); // fail-open: never block teardown on an internal error
    }
  });
}

module.exports = { decide };
