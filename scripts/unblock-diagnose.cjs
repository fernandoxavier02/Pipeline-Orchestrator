#!/usr/bin/env node
'use strict';

// =============================================================================
// scripts/unblock-diagnose.cjs — T1.3 (loop/next-action-contract)
// =============================================================================
// Read-only diagnostic backing the `/pipeline-orchestrator:unblock` skill. When a
// run is stuck, this script reads the REAL on-disk state and prints, to stdout:
//   (1) a 1-2 line diagnosis of what is blocking,
//   (2) the SINGLE next action (via lib/next-action.cjs::resolveNextAction), and
//   (3) if the arm-pending marker is genuinely orphaned AND past its TTL, the
//       exact safe-cleanup command (it NEVER runs it — only prints it).
//
// It is PURELY diagnostic: no state mutation, no hook side-effects. It requires
// the existing libs defensively (each is optional — a missing one degrades the
// diagnosis gracefully instead of crashing). Output is meant for an operator or
// a blocked agent to act on literally, never to bypass enforcement.
//
// Discovery precedence: PIPELINE_DOC_PATH env > <cwd>/.pipeline/active-run.json's
// pipeline_doc_path > <cwd>/.pipeline/docs/<newest>/sentinel-state.json.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

// Defensive, optional requires — a missing lib degrades the diagnosis, never crashes it.
let signer = null, nextAction = null, editGuard = null, arm = null, armPending = null;
try { signer = require('../lib/sentinel-state-signer.cjs'); } catch { signer = null; }
try { nextAction = require('../lib/next-action.cjs'); } catch { nextAction = null; }
try { editGuard = require('../.claude/hooks/edit-guard-hook.cjs'); } catch { editGuard = null; }
try { arm = require('../lib/pipeline-arm.cjs'); } catch { arm = null; }
try { armPending = require('../lib/arm-pending.cjs'); } catch { armPending = null; }

function resolveDocPath(cwd) {
  const env = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (env) return { docPath: env, source: 'PIPELINE_DOC_PATH' };
  try {
    const ar = JSON.parse(fs.readFileSync(path.join(cwd, '.pipeline', 'active-run.json'), 'utf8'));
    if (ar && typeof ar.pipeline_doc_path === 'string' && ar.pipeline_doc_path) {
      return { docPath: ar.pipeline_doc_path, source: 'active-run.json' };
    }
  } catch { /* no active-run pointer */ }
  // mtime fallback: newest run dir under .pipeline/docs/
  try {
    const docs = path.join(cwd, '.pipeline', 'docs');
    const entries = fs.readdirSync(docs).filter((d) => {
      try { return fs.statSync(path.join(docs, d, 'sentinel-state.json')).isFile(); } catch { return false; }
    });
    if (!entries.length) return { docPath: null, source: null };
    let best = entries[0], bestMtime = -Infinity;
    for (const d of entries) {
      const m = fs.statSync(path.join(docs, d, 'sentinel-state.json')).mtimeMs;
      if (m > bestMtime) { bestMtime = m; best = d; }
    }
    return { docPath: path.join(docs, best), source: 'mtime-fallback' };
  } catch { return { docPath: null, source: null }; }
}

function readSentinel(docPath) {
  if (!docPath) return { state: null, kind: 'no-docpath' };
  const sp = path.join(docPath, 'sentinel-state.json');
  if (!fs.existsSync(sp)) return { state: null, kind: 'no-sentinel' };
  if (!signer || typeof signer.readVerifiedState !== 'function') {
    // No signer available: best-effort plain read (diagnosis-only; tamper is NOT
    // detected here — the hooks are the authority, this script only advises).
    try { return { state: JSON.parse(fs.readFileSync(sp, 'utf8')), kind: 'unsigned-read' }; }
    catch { return { state: null, kind: 'unreadable' }; }
  }
  try {
    const { state, verification } = signer.readVerifiedState(sp, { key: signer.readHmacKey() });
    if (!state) return { state: null, kind: 'unreadable' };
    if (verification && verification.valid === false && verification.unsigned !== true) {
      return { state, kind: 'tampered' }; // signature present but mismatched → DO NOT trust
    }
    return { state, kind: verification && verification.unsigned ? 'unsigned-tolerated' : 'verified' };
  } catch {
    return { state: null, kind: 'unreadable' };
  }
}

// A pending dispatch still legitimately running in the background (the exact
// "live wait" condition stop-gate-hook now exempts). Reuses edit-guard's TTL +
// live-pending predicate so this script and the hook agree on what "live" means.
function hasLivePending(state) {
  if (!editGuard || typeof editGuard.findLivePendingBlock !== 'function' || typeof editGuard.resolveHandshakeTimeoutMs !== 'function') {
    return false; // cannot confirm → do not claim a live wait
  }
  try { return !!editGuard.findLivePendingBlock(state, editGuard.resolveHandshakeTimeoutMs()); }
  catch { return false; }
}

// T1.3(3): detect a genuinely orphaned arm-pending marker PAST its TTL. The gate
// already ignores an expired marker, so this is hygiene cleanup, not an active
// unblock — we only ADVISE the exact safe command, NEVER run it. Uses arm
// (pipeline-arm) for the marker path + cleanup target and arm-pending for the TTL
// + tamper check. Returns { ageMin, ttlMin } or null. A marker within TTL is NOT
// advised for cleanup (a live run may still be arming).
function orphanArmCleanup(cwd) {
  if (!arm || typeof arm.markerPath !== 'function') return null;
  if (!armPending || typeof armPending.resolveArmTtlMs !== 'function') return null;
  let m;
  try { m = JSON.parse(fs.readFileSync(arm.markerPath(cwd), 'utf8')); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  if (typeof armPending.markerIsTampered === 'function' && armPending.markerIsTampered(m)) return null;
  const ts = Date.parse(m.requested_at);
  if (!Number.isFinite(ts)) return null;
  const ttl = armPending.resolveArmTtlMs();
  const ageMs = Date.now() - ts;
  if (ageMs <= ttl) return null; // within TTL — may belong to a live run; do not advise cleanup
  return { ageMin: Math.round(ageMs / 60000), ttlMin: Math.round(ttl / 60000) };
}

function emit(lines) { for (const l of lines) process.stdout.write(l + '\n'); }

function main() {
  const cwd = process.cwd();
  const { docPath, source } = resolveDocPath(cwd);
  const { state, kind } = readSentinel(docPath);

  const out = [];
  out.push('=== unblock-diagnose ===');

  if (kind === 'no-docpath' || kind === 'no-sentinel') {
    out.push('Diagnosis: no active pipeline run found in this directory.');
    const orphan = orphanArmCleanup(cwd);
    if (orphan) {
      out.push('An orphaned arm-pending marker was found PAST its TTL (age ' + orphan.ageMin + 'min > TTL ' + orphan.ttlMin + 'min).');
      out.push('The gate already ignores an expired marker. Safe cleanup (PRINTED ONLY — this script does NOT run it);');
      out.push('an operator may run from the project root:');
      out.push('  node -e "require(\'lib/pipeline-arm.cjs\').clearArmPending(process.cwd())"');
      out.push('(or simply leave it — SessionStart cleanup removes it automatically).');
    } else {
      out.push('If you are blocked by PIPELINE_NOT_ARMED (an orphaned arm-pending marker still within TTL),');
      out.push('it expires by TTL (~30min) or on the next SessionStart cleanup. No code action needed.');
    }
    emit(out);
    return;
  }
  if (kind === 'unreadable') {
    out.push('Diagnosis: the run state file exists but is unreadable. Run from the project root,');
    out.push('or set PIPELINE_DOC_PATH to the run dir. State path: ' + path.join(docPath, 'sentinel-state.json'));
    emit(out);
    return;
  }
  if (kind === 'tampered') {
    out.push('Diagnosis: the run state signature does NOT verify (tampered). The enforcement hooks');
    out.push('will treat this as corrupt and fail CLOSED. Restore a valid signed state via the');
    out.push('pipeline-controller; do NOT hand-edit sentinel-state.json.');
    emit(out);
    return;
  }

  // state is a real (verified or unsigned-tolerated) object from here.
  const od = (state.orchestrator_decision && typeof state.orchestrator_decision === 'object') ? state.orchestrator_decision : {};
  // Defense-in-depth (round-1 security review, LOW): allowlist BOTH terminal
  // fields against the canonical vocabulary BEFORE echoing — an unsigned/forged
  // state (tolerated in the cooperative model) could otherwise carry prompt-
  // injection prose in terminal_state straight into the operator/agent context.
  // Mirrors isTerminalState() in stop-gate-hook / e2e-eval-gate.
  const TERM = new Set(['completed', 'hard_failed', 'aborted_by_user', 'cancelled']);
  const terminal = (typeof state.terminal_state === 'string' && TERM.has(state.terminal_state)) ? state.terminal_state
    : (typeof state.status === 'string' && TERM.has(state.status) ? state.status : null);

  if (terminal) {
    out.push('Diagnosis: this run already reached a terminal state: ' + terminal + '.');
    out.push('No further pipeline work is expected — start a new run, or inspect the run dir for evidence.');
    emit(out);
    return;
  }

  if (state.pipeline_active === true && hasLivePending(state)) {
    out.push('Diagnosis: run is ACTIVE with a dispatched subagent still in flight (a legitimate');
    out.push('background wait — the Stop gate exempts it). Do NOT end your turn just to "wait";');
    out.push('stay in the turn so the dispatch result is received and processed.');
    out.push('Next action: continue the turn; the dispatched agent returns into this context.');
    emit(out);
    return;
  }

  // The default Next-Action Contract resolution: INLINE_WORK_BLOCKED (the run is
  // active/incomplete with no live background wait) → the parent must dispatch
  // the expected step's agent (or the subagent must emit a DISPATCH_REQUEST).
  if (nextAction && typeof nextAction.resolveNextAction === 'function') {
    const ctx = {
      workflowKey: typeof state.workflow === 'string' ? state.workflow : (od.type ? String(od.type) : null),
      expectedStep: typeof state.current_phase === 'string' ? state.current_phase : null,
      taskHint: typeof state.task_type === 'string' ? state.task_type : null,
    };
    const r = nextAction.resolveNextAction({ invariantId: 'INLINE_WORK_BLOCKED', ctx });
    out.push('Diagnosis: run is active/incomplete with no live background dispatch — inline work is blocked.');
    out.push('Message: ' + r.message);
    out.push('Next action (parent / has Agent tool): ' + r.parent_action);
    out.push('Next action (subagent / no Agent tool): ' + r.subagent_fallback_action);
    emit(out);
    return;
  }

  // next-action lib unavailable: still give a useful, honest diagnosis.
  out.push('Diagnosis: run is active/incomplete (state source: ' + kind + ', discovered via ' + (source || 'n/a') + ').');
  out.push('Could not resolve the next action (lib/next-action.cjs unavailable). Dispatch the pipeline-controller');
  out.push('(pipeline-orchestrator:core:pipeline-controller) to rehydrate the run, or follow the literal next_action');
  out.push('in the hook block message that blocked you.');
  emit(out);
}

main();
