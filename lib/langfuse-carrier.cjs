#!/usr/bin/env node
'use strict';

/**
 * langfuse-carrier.cjs — shared SSOT for the /tmp/langfuse-{trace,span}-<key>.json
 * carrier protocol used by .claude/hooks/langfuse-hook.cjs,
 * .claude/hooks/stop-hook.cjs, and lib/gate-decision-writer.cjs.
 *
 * v7.5.0 (spec: .kiro/specs/tracing-concurrent-execution-id/):
 * The carrier key is now `${PIPELINE_RUN_ID}` (preferred) with PPID as a
 * graceful fallback. This isolates concurrent pipeline runs that share a
 * parent process from cross-writing each other's trace / span files
 * (Finding B-trace + B-span). When the fallback path is taken (legacy
 * caller, cross-session cleanup, missing env-var) we emit an AUDIT event
 * CARRIER_PPID_FALLBACK on stderr so operators can spot caller drift.
 *
 * v7.9.0 (Langfuse telemetry fidelity — Findings 2 + 3): a session-id MIDDLE
 * tier is inserted between runId and ppid. Key precedence is now
 * runId > sessionId > ppid. The sessionId comes from the Claude Code runtime
 * (process.env.CLAUDE_SESSION_ID, which langfuse-hook.cjs sets from the hook
 * stdin payload's `session_id` field — the same field stop-hook.cjs reads).
 * It is STABLE across every separately-spawned hook process in one session,
 * unlike process.ppid (which can vary per spawn) and unlike PIPELINE_RUN_ID
 * (set on the controller process but not propagated into hook processes).
 * Without it, PreToolUse (open) and PostToolUse (close) — distinct processes —
 * land on different carrier keys, producing one standalone trace per agent
 * (flat hierarchy) and a span that can never be closed against its opener
 * (null duration). The tier is additive: when CLAUDE_SESSION_ID is absent the
 * resolution is byte-for-byte the v7.5.0 ppid path.
 *
 * Contract:
 *   - SPAN_PREFIX  : 'langfuse-span-'   (string constant)
 *   - TRACE_PREFIX : 'langfuse-trace-'  (string constant)
 *   - getSpanPath(runId, ppidFallback) / getTracePath(runId, ppidFallback)
 *     : os.tmpdir()-anchored paths. runId wins; sessionId next; ppidFallback
 *     drives the AUDIT.
 *   - readTraceCarrier(runId, ppidFallback)  : returns parsed carrier or null
 *   - writeTraceCarrier(runId, ppidFallback, data) : atomic write via .tmp + rename
 *   - cleanupTracePath(runId, ppidFallback)  : unlink (best-effort)
 *   - cleanupSpanPath(runId, ppidFallback)   : unlink (best-effort)
 *   - readTraceCarrierForCurrentProcess() : reads PIPELINE_RUN_ID first, then
 *     the session-id tier, then falls back to process.pid / process.ppid for
 *     legacy/cross-session callers.
 *   - resolvePpid() : process.ppid by default; LANGFUSE_FORCE_PPID env override
 *     honored ONLY when PIPELINE_TEST=true or NODE_ENV=test.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SPAN_PREFIX = 'langfuse-span-';
const TRACE_PREFIX = 'langfuse-trace-';

// Dedupe AUDIT emissions per process: a hook lifecycle calls getSpanPath /
// getTracePath multiple times (Pre opens, Post closes). Operators only need
// ONE breadcrumb per (kind, key) — beyond that the stderr stream just noises
// up legacy test harnesses without adding signal.
const _emittedAudits = new Set();

function emitAudit(name, fields) {
  try {
    const line = JSON.stringify({
      audit_event: name,
      ts: new Date().toISOString(),
      ...fields,
    });
    process.stderr.write(line + '\n');
  } catch (_e) { /* never throw from audit */ }
}

function emitAuditOnce(name, fields, dedupeKey) {
  if (dedupeKey) {
    if (_emittedAudits.has(dedupeKey)) return;
    _emittedAudits.add(dedupeKey);
  }
  emitAudit(name, fields);
}

// v7.9.0 (Finding 2 / 3): session-id middle tier resolver. Only the safe
// filename charset [A-Za-z0-9._-] up to 64 chars is honored (mirrors the
// SESSION_ID_RE guard in stop-hook.cjs) so a hostile/bogus session_id can
// never escape os.tmpdir() via the carrier filename. Returns the trimmed id
// or null when absent / malformed (in which case resolution falls through to
// the legacy ppid path, preserving the v7.5.0 contract exactly).
const SESSION_ID_KEY_RE = /^[A-Za-z0-9._-]{1,64}$/;

function _resolveSessionKey() {
  const raw = (process.env.CLAUDE_SESSION_ID || '').trim();
  if (raw && SESSION_ID_KEY_RE.test(raw)) return raw;
  return null;
}

function _resolveKey(runId, ppidFallback, kind) {
  if (runId) return String(runId);

  // Middle tier: stable per-session id supplied by the Claude Code runtime.
  const sessionKey = _resolveSessionKey();
  if (sessionKey) {
    emitAuditOnce(
      'CARRIER_SESSION_FALLBACK',
      { kind, session: sessionKey },
      `CARRIER_SESSION_FALLBACK:${kind}:${sessionKey}`
    );
    return `sess-${sessionKey}`;
  }

  // BUG 3 tier (v7.9.3): when neither runId nor sessionId is available but the
  // run's PIPELINE_DOC_PATH is set, derive a STABLE key from the doc path so the
  // separately-spawned Pre/Post (and Pre-tester/executor) processes of ONE run
  // land on a single trace instead of each falling to its own volatile ppid.
  // The key is a short sha256 of the normalized doc path (trailing slashes /
  // backslashes trimmed) — deterministic across processes, never the ppid.
  const docPathRaw = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (docPathRaw) {
    const crypto = require('node:crypto');
    const normalized = docPathRaw.replace(/[\\/]+$/, '');
    const h = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
    emitAuditOnce(
      'CARRIER_DOCPATH_FALLBACK',
      { kind, doc_hash: h },
      `CARRIER_DOCPATH_FALLBACK:${kind}:${h}`
    );
    return `doc-${h}`;
  }

  if (ppidFallback) {
    emitAuditOnce(
      'CARRIER_PPID_FALLBACK',
      { kind, ppid: ppidFallback },
      `CARRIER_PPID_FALLBACK:${kind}:${ppidFallback}`
    );
    return String(ppidFallback);
  }
  // Last-resort fallback (no runId, no sessionId, no ppidFallback) — use the
  // live process tree so we still produce a deterministic path rather than
  // NaN/undefined.
  const last = process.ppid || process.pid;
  emitAuditOnce(
    'CARRIER_PPID_FALLBACK',
    { kind, ppid: last, reason: 'no_args' },
    `CARRIER_PPID_FALLBACK:${kind}:no_args:${last}`
  );
  return String(last);
}

function getSpanPath(runId, ppidFallback) {
  const key = _resolveKey(runId, ppidFallback, 'span');
  return path.join(os.tmpdir(), `${SPAN_PREFIX}${key}.json`);
}

function getTracePath(runId, ppidFallback) {
  const key = _resolveKey(runId, ppidFallback, 'trace');
  return path.join(os.tmpdir(), `${TRACE_PREFIX}${key}.json`);
}

function writeAtomic(targetPath, data) {
  const tmp = targetPath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, targetPath);
}

function readTraceCarrier(runId, ppidFallback) {
  const p = getTracePath(runId, ppidFallback);
  try {
    if (!fs.existsSync(p)) return null;
    const body = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (body && typeof body.traceId === 'string') return body;
    return null;
  } catch (_e) {
    return null;
  }
}

function writeTraceCarrier(runId, ppidFallback, data) {
  try {
    writeAtomic(getTracePath(runId, ppidFallback), JSON.stringify(data));
    return true;
  } catch (_e) {
    return false;
  }
}

function cleanupTracePath(runId, ppidFallback) {
  try {
    const p = getTracePath(runId, ppidFallback);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_e) { /* swallow */ }
}

function cleanupSpanPath(runId, ppidFallback) {
  try {
    const p = getSpanPath(runId, ppidFallback);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_e) { /* swallow */ }
}

function resolvePpid() {
  const isTestEnv = process.env.PIPELINE_TEST === 'true' || process.env.NODE_ENV === 'test';
  if (isTestEnv) {
    const forced = parseInt(process.env.LANGFUSE_FORCE_PPID || '', 10);
    if (Number.isFinite(forced) && forced > 0) return forced;
  }
  return process.ppid || process.pid;
}

function readTraceCarrierForCurrentProcess() {
  const runId = process.env.PIPELINE_RUN_ID || null;
  if (runId) {
    const body = readTraceCarrier(runId, null);
    if (body) return body;
  }
  // v7.9.0 (Finding 3): session-id middle tier. When PIPELINE_RUN_ID is absent
  // (the common case for hook + controller processes), resolve the trace by the
  // stable runtime session id so a score / gate event in the controller process
  // attaches to the SAME trace the hook opened. _resolveKey reads
  // CLAUDE_SESSION_ID itself, so readTraceCarrier(null, null) keys by sessionId
  // when present (and falls through to ppid when not).
  if (_resolveSessionKey()) {
    const body = readTraceCarrier(null, null);
    if (body) return body;
  }
  // Legacy / cross-session fallback: PID then PPID.
  const candidates = [process.pid, process.ppid].filter((p) => Number.isFinite(p) && p > 0);
  for (const pid of candidates) {
    const body = readTraceCarrier(null, pid);
    if (body) return body;
  }
  return null;
}

module.exports = {
  SPAN_PREFIX,
  TRACE_PREFIX,
  getSpanPath,
  getTracePath,
  writeAtomic,
  readTraceCarrier,
  writeTraceCarrier,
  cleanupTracePath,
  cleanupSpanPath,
  resolvePpid,
  readTraceCarrierForCurrentProcess,
  _resolveKey,
};
