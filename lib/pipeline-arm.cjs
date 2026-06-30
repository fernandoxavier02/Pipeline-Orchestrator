#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-arm.cjs — v8.7.0
// =============================================================================
// The deterministic BRIDGE between "/pipeline was invoked" and "the arm gate has
// something to enforce". Called by the UserPromptSubmit wiring: when the prompt
// is a pipeline entry-point, it classifies the workflow (in code) and writes a
// signed-by-shape marker. pipeline-arm-gate.cjs reads this marker to deny
// substantive work until a run is armed (pipeline_active:true). When the run
// arms, the marker is cleared (or it auto-expires — the gate enforces the TTL).
//
// Pure-ish: a `nowIso` parameter makes timestamping injectable for deterministic
// tests. Atomic write (temp + rename). NEVER throws on a non-pipeline prompt.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let classifier = null;
try { classifier = require('./pipeline-workflow-classifier.cjs'); } catch { classifier = null; }

// AUDIT-007 (B5): the arm-pending marker is the unsigned input the arm-gate trusts
// to decide PIPELINE_NOT_ARMED. Sign it with the SAME HMAC envelope as sentinel-state
// (SSOT — no second signature scheme) so a hand-forged marker can be rejected. If the
// signer is unavailable, fall back to the unsigned marker (migration-tolerant).
let signer = null;
try { signer = require('./sentinel-state-signer.cjs'); } catch { signer = null; }

// v8.19.1 — the SSOT marker reader (verify-on-read + TTL + session). The consume path
// delegates its TAMPER verdict here so it can never drift weaker than the arm-gate's
// read path (no fourth divergent copy of the verify-on-read rule). Optional require.
let armSsot = null;
try { armSsot = require('./arm-pending.cjs'); } catch { armSsot = null; }

function markerPath(cwd) {
  return path.join(cwd, '.pipeline', 'pipeline-arm-pending.json');
}

// Writes the arm-pending marker IFF rawPrompt is a pipeline entry-point.
// Returns the marker object, or null when the prompt is not a /pipeline command
// (or the classifier is unavailable / cwd is invalid).
// v8.18.1 — harness-injected envelopes (task-notifications, system-reminders,
// tool/function results, bash echoes, attachments) arrive as prompt turns but are
// DATA, not a user command. An agent report that merely MENTIONS `--on=paperclip`
// or "review-only" must NEVER arm a phantom run (live deadlock: a background
// reviewer finishing re-armed PAPERCLIP from its own result text).
//
// The model is POSITIONAL, not subtractive: a genuine /pipeline invocation is text
// the USER typed, and the harness only ever APPENDS these envelopes after it. So the
// user segment is everything BEFORE the first injected-envelope OPENING tag. Cutting
// at the first open tag — ignoring closing tags and nesting entirely — is what makes
// it robust: an agent result whose body echoes "</task-notification>" or a flag can
// never leak a phantom arm, because the cut lands at the first "<task-notification>"
// regardless of the body. (A subtractive close-tag strip is evadable: a lazy match
// stops at an inner closing tag the agent text printed, leaking the tail.)
//
// Trade-off (deliberate, safe direction): the rare inverse — a user pasting a literal
// envelope tag BEFORE their real command — drops the arm. A missed arm is recoverable
// (re-invoke); a phantom arm DEADLOCKS the session. Cap the scan: a real invocation
// is at the very start, so only the first 8 KB is inspected (DoS guard).
const HARNESS_OPEN_TAG =
  /<(?:task-notification|system-reminder|function_results|function_calls|antml:function_calls|result|system|attachment|bash-(?:input|stdout|stderr)|tool_use_error)\b/i;

function userPromptSegment(s) {
  const str = String(s == null ? '' : s).slice(0, 8192);
  const i = str.search(HARNESS_OPEN_TAG);
  return i === -1 ? str : str.slice(0, i);
}

function writeArmPending(cwd, rawPrompt, nowIso, sessionId) {
  if (typeof cwd !== 'string' || !cwd) return null;
  if (!classifier || typeof classifier.isPipelineInvocation !== 'function') return null;
  // Classify only the user-authored segment, never harness-injected envelopes.
  const userText = userPromptSegment(rawPrompt);
  if (!classifier.isPipelineInvocation(userText)) return null;

  const wf = classifier.classifyWorkflow(userText);
  // REVIEW-ONLY and DIAGNOSTIC are read-only (no code mutations) — skip arming.
  if (wf.mode === 'REVIEW-ONLY' || wf.mode === 'DIAGNOSTIC') return null;
  const marker = {
    requested_at: nowIso || new Date().toISOString(),
    workflow: wf.mode + (wf.type ? ('/' + wf.type) : ''),
    mode: wf.mode,
    type: wf.type,
    variant: wf.variant,
    complexity: wf.complexity,
    source: wf.source,
    prompt_excerpt: String(rawPrompt == null ? '' : rawPrompt)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 200),
  };
  // v8.18.0: session isolation — gravar session_id para filtro cross-sessão
  if (typeof sessionId === 'string' && sessionId) marker.session_id = sessionId;

  // Sign the marker (AUDIT-007). When no HMAC key is available, signState is skipped
  // and the unsigned marker is written — tolerated by readArmPending unless strict.
  let toWrite = marker;
  if (signer && typeof signer.signState === 'function') {
    try {
      const key = typeof signer.getOrCreateHmacKey === 'function' ? signer.getOrCreateHmacKey() : null;
      if (key) toWrite = signer.signState(marker, key);
    } catch { toWrite = marker; }
  }

  const p = markerPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2));
    fs.renameSync(tmp, p);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
  return marker;
}

// Removes the marker. Idempotent: returns false if there was nothing to clear.
function clearArmPending(cwd) {
  try { fs.unlinkSync(markerPath(cwd)); return true; } catch { return false; }
}

// v8.19.1 — SESSION-AWARE + TAMPER-AWARE consume. Used by the stop-gate to consume the
// marker when a governed run reaches a deliberate close, so a finished run no longer
// keeps blocking the next non-pipeline task in the same session (PIPELINE_NOT_ARMED)
// until TTL/restart. Removes the marker IFF BOTH hold:
//   (a) it is NOT a signed-but-invalid forgery — the tamper verdict is delegated to the
//       lib/arm-pending SSOT (markerIsTampered), so the consume path can never become
//       WEAKER than the arm-gate's verify-on-read (a tampered marker stays fail-closed); AND
//   (b) ownership is POSITIVELY provable for this session, symmetric with the read path's
//       isolation: delete only when marker+caller are BOTH stamped AND equal, OR BOTH
//       sessionless (no session model in use). Any ambiguous case — stamped-vs-absent in
//       either direction, or a mismatch — is PRESERVED and left to the TTL / SessionStart
//       cleanup. We never delete a marker we cannot prove we own (this closes the
//       cross-session un-govern vector the read path already blocks).
// Best-effort: an absent/garbage marker is a no-op (returns false), and a garbage marker
// is LEFT in place so the governed window stays fail-closed.
function clearArmPendingForSession(cwd, sessionId) {
  let raw;
  try { raw = fs.readFileSync(markerPath(cwd), 'utf8'); }
  catch { return false; } // absent → nothing to clear
  let m;
  try { m = JSON.parse(raw); }
  catch { return false; } // garbage → leave it (stays governed)
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  // (a) signed-but-invalid forgery → leave it (parity with arm-gate verify-on-read).
  if (armSsot && typeof armSsot.markerIsTampered === 'function') {
    try { if (armSsot.markerIsTampered(m)) return false; } catch { /* verifier error → tolerate */ }
  }
  // (b) positive-ownership only.
  const markerSid = typeof m.session_id === 'string' && m.session_id ? m.session_id : null;
  const callerSid = typeof sessionId === 'string' && sessionId ? sessionId : null;
  const ownsIt = (markerSid === null && callerSid === null) ||
                 (markerSid !== null && callerSid !== null && markerSid === callerSid);
  return ownsIt ? clearArmPending(cwd) : false;
}

module.exports = { writeArmPending, clearArmPending, clearArmPendingForSession, markerPath, userPromptSegment };
