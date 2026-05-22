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
 * Contract:
 *   - SPAN_PREFIX  : 'langfuse-span-'   (string constant)
 *   - TRACE_PREFIX : 'langfuse-trace-'  (string constant)
 *   - getSpanPath(runId, ppidFallback) / getTracePath(runId, ppidFallback)
 *     : os.tmpdir()-anchored paths. runId wins; ppidFallback drives the AUDIT.
 *   - readTraceCarrier(runId, ppidFallback)  : returns parsed carrier or null
 *   - writeTraceCarrier(runId, ppidFallback, data) : atomic write via .tmp + rename
 *   - cleanupTracePath(runId, ppidFallback)  : unlink (best-effort)
 *   - cleanupSpanPath(runId, ppidFallback)   : unlink (best-effort)
 *   - readTraceCarrierForCurrentProcess() : reads PIPELINE_RUN_ID first, then
 *     falls back to process.pid / process.ppid for legacy/cross-session callers.
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

function _resolveKey(runId, ppidFallback, kind) {
  if (runId) return String(runId);
  if (ppidFallback) {
    emitAuditOnce(
      'CARRIER_PPID_FALLBACK',
      { kind, ppid: ppidFallback },
      `CARRIER_PPID_FALLBACK:${kind}:${ppidFallback}`
    );
    return String(ppidFallback);
  }
  // Last-resort fallback (no runId, no ppidFallback) — use the live process
  // tree so we still produce a deterministic path rather than NaN/undefined.
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
};
