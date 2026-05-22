#!/usr/bin/env node
'use strict';

/**
 * langfuse-carrier.cjs — shared SSOT for the /tmp/langfuse-{trace,span}-<PPID>.json
 * carrier protocol used by .claude/hooks/langfuse-hook.cjs,
 * .claude/hooks/stop-hook.cjs, and lib/gate-decision-writer.cjs.
 *
 * Extracted in v7.3.0 fix-loop 1 (ARCH-3 / RISK-1 of Batch 3 adversarial)
 * to remove the inline duplication of SPAN_PREFIX/TRACE_PREFIX, write/read
 * helpers, and PPID resolution that had drifted across three modules. A
 * single change to the protocol (filename, JSON shape, atomic-write recipe)
 * is now applied here ONCE and propagated everywhere by require().
 *
 * Contract:
 *   - SPAN_PREFIX  : 'langfuse-span-'   (string constant)
 *   - TRACE_PREFIX : 'langfuse-trace-'  (string constant)
 *   - getSpanPath(ppid) / getTracePath(ppid) : os.tmpdir()-anchored paths
 *   - readTraceCarrier(ppid)  : returns parsed carrier or null (soft-fail)
 *   - writeTraceCarrier(ppid, data) : atomic write via .tmp + rename
 *   - cleanupTracePath(ppid)  : unlink (best-effort, swallows errors)
 *   - resolvePpid() : process.ppid by default; LANGFUSE_FORCE_PPID env
 *     override is honored ONLY when PIPELINE_TEST=true or
 *     NODE_ENV=test (production hardening for SEC-1/CLAR-4).
 *
 * No top-level require('langfuse') here — this module is part of the
 * disabled-fast-path budget and must stay tiny.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SPAN_PREFIX = 'langfuse-span-';
const TRACE_PREFIX = 'langfuse-trace-';

function getSpanPath(ppid) {
  return path.join(os.tmpdir(), `${SPAN_PREFIX}${ppid}.json`);
}

function getTracePath(ppid) {
  return path.join(os.tmpdir(), `${TRACE_PREFIX}${ppid}.json`);
}

function writeAtomic(targetPath, data) {
  const tmp = targetPath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, targetPath);
}

function readTraceCarrier(ppid) {
  const p = getTracePath(ppid);
  try {
    if (!fs.existsSync(p)) return null;
    const body = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (body && typeof body.traceId === 'string') return body;
    return null;
  } catch (_e) {
    return null;
  }
}

function writeTraceCarrier(ppid, data) {
  try {
    writeAtomic(getTracePath(ppid), JSON.stringify(data));
    return true;
  } catch (_e) {
    return false;
  }
}

function cleanupTracePath(ppid) {
  try {
    const p = getTracePath(ppid);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_e) { /* swallow */ }
}

function cleanupSpanPath(ppid) {
  try {
    const p = getSpanPath(ppid);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_e) { /* swallow */ }
}

/**
 * resolvePpid — return the PID to key carrier files on.
 *
 * Production behavior: always process.ppid (falling back to process.pid).
 *
 * Test-only override: LANGFUSE_FORCE_PPID is honored ONLY when the process
 * declares itself as a test runner via PIPELINE_TEST=true OR
 * NODE_ENV=test. This closes SEC-1 — a malicious env injection in
 * production no longer redirects span carriers to an attacker-chosen PID.
 *
 * (Renamed from the previous F9_FORCE_PPID for namespace consistency,
 * resolving CLAR-4 simultaneously.)
 */
function resolvePpid() {
  const isTestEnv = process.env.PIPELINE_TEST === 'true' || process.env.NODE_ENV === 'test';
  if (isTestEnv) {
    const forced = parseInt(process.env.LANGFUSE_FORCE_PPID || '', 10);
    if (Number.isFinite(forced) && forced > 0) return forced;
  }
  return process.ppid || process.pid;
}

/**
 * readTraceCarrierForCurrentProcess — locate the carrier file for the current
 * process tree. Tries pid first, then ppid (writer may be in-process with the
 * hook, or a grandchild). Used by lib/gate-decision-writer.cjs for the
 * Langfuse-event mirror.
 */
function readTraceCarrierForCurrentProcess() {
  const candidates = [process.pid, process.ppid].filter((p) => Number.isFinite(p) && p > 0);
  for (const pid of candidates) {
    const body = readTraceCarrier(pid);
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
