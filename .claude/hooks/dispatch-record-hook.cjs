#!/usr/bin/env node
'use strict';

// =============================================================================
// dispatch-record-hook.cjs — v8.9.0 (PreToolUse:Agent) — T4 (REQ-DISPATCH-RECORD)
// =============================================================================
// Additive PreToolUse:Agent writer. On every Agent spawn under a GOVERNED run it
// persists a signed `pending_dispatches[dispatch_id]` record into the signed
// sentinel-state, under the shared exclusive lock, with the
//   re-read → verify → bump state_version → temp → atomic-rename → release-in-finally
// sequence. The record half of the Phase 5 dispatch contract; the envelope-injection
// half (updatedInput) is DEFER'd, so this hook NEVER emits updatedInput.
//
// dispatch_id = payload.tool_use_id. Absent OR empty-string → key 'unknown' + a
// DISPATCH_ID_FALLBACK AUDIT breadcrumb in the run's gate-decisions.jsonl (M1).
//
// ANTI-DEADLOCK (manifest denyException / H2): the gate posture comes from the
// workflow-manifest SSOT, NOT scattered local ifs.
//   - ungoverned / absent / unsigned-migration / non-governed-corrupt ⇒ allow.
//   - governed action on CORRUPT signed state ⇒ DENY.
// STRICT-DENY by default for the governed-corrupt case, with a single env escape
// hatch mirroring PIPELINE_STAMP_REQUIRE_RESULT: PIPELINE_DISPATCH_RECORD_ENFORCEMENT=warn.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

// Reuse the canonical run discovery + corruption detection (authoritative pointer
// precedence, HMAC verify, CORRUPT_SENTINEL semantics). Fail-open if unavailable.
let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let lock = null;
try { lock = require('../../lib/exclusive-lock.cjs'); } catch { lock = null; }
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }
let manifest = null;
try { manifest = require('../../lib/contracts/workflow-manifest.cjs'); } catch { manifest = null; }
// Canonical gate-decisions.jsonl writer (SSOT). The DISPATCH_ID_FALLBACK AUDIT
// breadcrumb MUST go through this so the 5 correlation fields (run_id,
// plugin_version, schema_version, type, complexity) are auto-stamped and the
// line passes jsonl-sanitizer's allowlist — same path human-gate-record uses.
let writer = null;
try { writer = require('../../lib/gate-decision-writer.cjs'); } catch { writer = null; }

// Resolve the docDir of the active run (where sentinel-state.json + gate-decisions.jsonl live).
function resolveDocDir(pipelineDir) {
  try {
    if (eg && typeof eg.discoverStatePath === 'function') {
      const { statePath } = eg.discoverStatePath(pipelineDir);
      if (statePath) return path.dirname(statePath);
    }
  } catch { /* fall through */ }
  return null;
}

// Append a DISPATCH_ID_FALLBACK AUDIT breadcrumb to the run's gate-decisions.jsonl
// THROUGH the canonical SSOT writer (lib/gate-decision-writer.cjs) — the same path
// human-gate-record.cjs uses — so the 5 correlation fields (run_id, plugin_version,
// schema_version, type, complexity) are auto-stamped and the line passes the
// jsonl-sanitizer allowlist. The decision/hardness stay canonical (TRIGGERED/AUDIT).
// Best-effort: never throws into the decision path (the writer handles its own
// locking + atomic append; we just swallow any failure).
function appendFallbackBreadcrumb(docDir, detail, state) {
  if (!docDir) return;
  if (!writer || typeof writer.appendGateDecision !== 'function' || typeof writer.buildCtx !== 'function') return;
  try {
    const s = state && typeof state === 'object' ? state : {};
    const complexity = typeof s.complexity === 'string' ? s.complexity
      : (s.orchestrator_decision && typeof s.orchestrator_decision.complexity === 'string'
          ? s.orchestrator_decision.complexity : null);
    const phase = (typeof s.current_phase === 'string' && s.current_phase) ? s.current_phase
      : (typeof s.phase === 'string' && s.phase ? s.phase : 'unknown');
    let ctx;
    try { ctx = writer.buildCtx(docDir, { type: typeof s.task_type === 'string' ? s.task_type : null, complexity }); }
    catch { return; }
    const jsonlPath = path.join(docDir, 'gate-decisions.jsonl');
    writer.appendGateDecision(jsonlPath, {
      gate: 'DISPATCH_ID_FALLBACK',
      hardness: 'AUDIT',
      phase,
      decision: 'TRIGGERED',
      decided_by: 'dispatch-record-hook',
      timestamp: new Date().toISOString(),
      detail: String(detail || ''),
      confidence_impact: 0,
    }, ctx);
  } catch { /* breadcrumb is best-effort */ }
}

// Persist the pending_dispatches[dispatchId] record under the exclusive lock with
// the re-read → verify → bump → temp → atomic-rename sequence. Best-effort: a write
// failure must never crash the hook (allow path).
function writeRecord(statePath, dispatchId, record) {
  if (!signer || typeof signer.writeSignedState !== 'function') return;
  const doWrite = () => {
    // Re-read the freshest state under the lock (lost-update safety).
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); }
    catch { return; } // unreadable now → do not fabricate state
    if (!state || typeof state !== 'object') return;
    // Verify integrity of what we re-read; if a present signature is invalid we do
    // not write over corrupt state (the decision path already denied governed-corrupt).
    // FAIL CLOSED on a verification THROW (SEC-01): a state crafted to make
    // verifyState throw (e.g. shaped to break canonicalization) must NOT fall
    // through to the signed-state write — that would be a silent HMAC bypass.
    // The governed-corrupt decision was already DENIED upstream; here, for a
    // governed re-read whose integrity we cannot confirm, we abort the write.
    try {
      if (typeof signer.verifyState === 'function') {
        const v = signer.verifyState(state, { key: signer.readHmacKey() });
        if (!v.valid && !v.unsigned && !v.key_unavailable) return;
      }
    } catch { return; } // verify threw → cannot confirm integrity → do NOT write
    if (!state.pending_dispatches || typeof state.pending_dispatches !== 'object') {
      state.pending_dispatches = {};
    }
    state.pending_dispatches[dispatchId] = record;
    const cur = Number.isFinite(state.state_version) ? state.state_version : 0;
    state.state_version = cur + 1;
    // writeSignedState signs + writes to a temp file then atomic-renames.
    signer.writeSignedState(statePath, state, { key: signer.readHmacKey() });
  };
  try {
    if (lock && typeof lock.withLock === 'function') {
      lock.withLock(statePath, doWrite); // acquire → run → release-in-finally
    } else {
      doWrite();
    }
  } catch { /* persistence is best-effort; never block on a write hiccup */ }
}

// Pure decision + side-effect. Returns { decision: 'allow' | 'deny', reason? }.
function decide(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name !== 'Agent') return { decision: 'allow' };
  const pipelineDir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  // Discover the active run state (authoritative pointer precedence).
  let state = null;
  try { state = eg && eg.findActiveSentinelState(pipelineDir); } catch { state = null; }

  const enforce = (process.env.PIPELINE_DISPATCH_RECORD_ENFORCEMENT || 'deny').toLowerCase();

  // Corrupt authoritative state. This is a GOVERNED action (an Agent spawn under a
  // pointed run) on corrupt signed state → manifest denyException('state_corrupt_governed').
  if (eg && state === eg.CORRUPT_SENTINEL) {
    const posture = manifest && typeof manifest.denyException === 'function'
      ? manifest.denyException('state_corrupt_governed') : 'deny';
    if (posture === 'deny' && enforce !== 'warn') {
      return {
        decision: 'deny',
        reason:
          'DISPATCH_RECORD_STATE_CORRUPT: o sentinel-state assinado do run ativo não passa na ' +
          'verificação de integridade, então registrar um despacho sobre estado corrompido é ' +
          'BLOQUEADO (paridade H2 com v8.8.0). Recrie/re-assine o estado pelo controller antes de despachar.',
      };
    }
    return { decision: 'allow' };
  }

  // No state (absent) or non-authoritative-unreadable → ungoverned/absent → allow.
  if (!state || typeof state !== 'object') return { decision: 'allow' };
  // Present-but-not-active (no governed run) → allow.
  if (state.pipeline_active !== true) return { decision: 'allow' };

  // Governed + usable state → persist the dispatch record. Resolve dispatch_id.
  const rawId = payload.tool_use_id;
  const hasId = typeof rawId === 'string' && rawId.length > 0;
  const dispatchId = hasId ? rawId : 'unknown';

  const docDir = resolveDocDir(pipelineDir);
  if (!hasId) {
    appendFallbackBreadcrumb(docDir, `tool_use_id ${rawId === undefined ? 'absent' : 'empty'} — keyed under "unknown"`, state);
  }

  const ti = payload.tool_input || {};
  const record = {
    dispatch_id: dispatchId,
    run_id: typeof state.run_id === 'string' ? state.run_id : null,
    subagent_type: typeof ti.subagent_type === 'string' ? ti.subagent_type : null,
    target_agent_type: typeof ti.subagent_type === 'string' ? ti.subagent_type : null,
    status: 'pending',
    correction_attempts: 0,
    created_at: new Date().toISOString(),
  };

  if (docDir) {
    const statePath = path.join(docDir, 'sentinel-state.json');
    writeRecord(statePath, dispatchId, record);
  }

  // Always allow — the record writer never blocks a valid governed dispatch, and
  // it MUST NOT emit updatedInput (envelope injection is DEFER'd).
  return { decision: 'allow' };
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      // CRLF-safe: JSON.parse tolerates surrounding whitespace/CRLF; trim defensively.
      const payload = JSON.parse(String(s).trim() || '{}');
      const out = decide(payload);
      if (out && out.decision === 'deny') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: out.reason,
          },
        }));
      } else {
        // Explicit allow — a parseable decision with NO updatedInput, ever (the
        // envelope-injection half of Phase 5 is DEFER'd).
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
          },
        }));
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('dispatch-record-hook error: ' + (e && e.message ? e.message : e) + '\n');
      process.exit(0); // fail-open on any error (anti-deadlock)
    }
  });
}

module.exports = { decide };
