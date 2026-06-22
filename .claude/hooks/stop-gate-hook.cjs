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
//   - incomplete + ARMED              ⇒ decision:block + exact next action,
//                                        capped at 3 continuities → hard_failed terminal.
//   - incomplete + UNARMED (default)  ⇒ allow (block logic inert without arming).
//   - outstanding pending_dispatches + ARMED ⇒ block.
//   - SessionEnd / StopFailure / interrupt ⇒ NEVER declare success, NEVER delete
//                                        evidence, keep the run recoverable. Only a
//                                        PRE-PERSISTED terminal flag may complete.
//
// ARMING (the one declared exception to strict-DENY this iteration):
//   default OFF — armed only with PIPELINE_STOP_BLOCK_ENFORCEMENT=deny.
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

const CONTINUITY_CAP = 3; // after 3 continuities, convert to hard_failed terminal.

function isArmed() {
  return String(process.env.PIPELINE_STOP_BLOCK_ENFORCEMENT || '').toLowerCase() === 'deny';
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

// Does the run still have outstanding pending dispatches?
function hasPendingDispatches(state) {
  const pd = state && state.pending_dispatches;
  return !!(pd && typeof pd === 'object' && Object.values(pd).some((r) => r && typeof r === 'object' && r.status !== 'committed' && r.committed !== true));
}

// Is the run complete (a terminal state already persisted)?
function isComplete(state) {
  if (!state || typeof state !== 'object') return false;
  if (isTerminalState(state.terminal_state)) return true;
  if (isTerminalState(state.status)) return true;
  return false;
}

// Persist a state mutation under the lock with re-read → verify → mutate → re-sign
// → atomic-rename. `mutate(state)` edits in place. Best-effort, never throws out.
function persist(statePath, mutate) {
  if (!signer || typeof signer.writeSignedState !== 'function') return;
  const doWrite = () => {
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); }
    catch { return; }
    if (!state || typeof state !== 'object') return;
    // FAIL CLOSED on a verification THROW (SEC-01 parity with dispatch-record-hook):
    // a state shaped to make verifyState throw must NOT fall through to mutate +
    // re-sign — that would persist over state whose integrity we could not confirm.
    // Declining to write is safe here: the Stop decision is unaffected (this hook
    // always allows teardown), the run simply stays recoverable.
    try {
      if (typeof signer.verifyState === 'function') {
        const v = signer.verifyState(state, { key: signer.readHmacKey() });
        if (!v.valid && !v.unsigned && !v.key_unavailable) return; // do not write over corrupt
      }
    } catch { return; } // verify threw → cannot confirm integrity → do NOT write
    mutate(state);
    const cur = Number.isFinite(state.state_version) ? state.state_version : 0;
    state.state_version = cur + 1;
    signer.writeSignedState(statePath, state, { key: signer.readHmacKey() });
  };
  try {
    if (lock && typeof lock.withLock === 'function') lock.withLock(statePath, doWrite);
    else doWrite();
  } catch { /* best-effort */ }
}

// Write the hard_failed terminal (the continuity cap). Persists hard_failed FIRST
// so the H3 reorder holds: the terminal exists before any cleanup completion mark.
function writeHardFailed(statePath) {
  persist(statePath, (state) => {
    state.terminal_state = 'hard_failed';
    state.status = 'hard_failed';
    state.hard_failed_at = Date.now();
  });
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

  // --- Stop event ------------------------------------------------------------
  // No governed run (not active, no terminal in progress) → allow.
  if (state.pipeline_active !== true && !isComplete(state)) {
    return { decision: 'allow' };
  }

  // A complete/terminal run is never blocked.
  if (isComplete(state)) return { decision: 'allow' };

  // Incomplete governed run. Block logic is inert unless armed (default OFF).
  if (!isArmed()) return { decision: 'allow' };

  // Armed + incomplete. Continuity cap: this Stop is continuity attempt
  // (continuity_attempts + 1). On the 3rd, convert to a hard_failed terminal and
  // ALLOW (do not block a third time).
  const priorContinuities = Number.isFinite(state.continuity_attempts) ? state.continuity_attempts : 0;
  const thisAttempt = priorContinuities + 1;
  if (thisAttempt >= CONTINUITY_CAP) {
    if (statePath) writeHardFailed(statePath);
    return { decision: 'allow' };
  }

  // Outstanding pending dispatches OR plain incompleteness → block with next action.
  if (hasPendingDispatches(state) || state.pipeline_active === true) {
    if (statePath) {
      persist(statePath, (st) => { st.continuity_attempts = thisAttempt; });
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
