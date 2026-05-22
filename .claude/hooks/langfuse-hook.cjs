#!/usr/bin/env node
'use strict';

/**
 * langfuse-hook.cjs — Langfuse Cloud observability hook for PreToolUse:Agent
 * and PostToolUse:Agent events.
 *
 * Implements FR-1..FR-11 and NFR-1..NFR-7 from spec
 * 2026-05-21-langfuse-observability. Mirrored byte-identically into
 * .codex/hooks/langfuse-hook.cjs per CLAUDE.md Iron Law "Espelhamento Codex".
 *
 * CRITICAL invariants (asserted by F8/F9 tests):
 *   - Top-level requires limited to: node:path, node:fs, node:os, and the
 *     local lib/langfuse-client.cjs / lib/langfuse-sanitizer.cjs /
 *     lib/langfuse-carrier.cjs modules. require('langfuse') NEVER appears
 *     at module top level — only inside getClient() in lib/langfuse-client.cjs.
 *   - main() wraps every action in try/catch with finally { process.exit(0); }.
 *   - When isEnabled() is false, the hook exits 0 in well under 100ms.
 *   - The literal comment "do NOT await" appears in BOTH handlePre and
 *     handlePost (F8-S4).
 *   - File body contains no hardcoded ".claude/" or ".codex/" literal path
 *     strings (Codex mirror parity — F8-S5 / F9-S12).
 *   - PreToolUse opens a span and writes /tmp/langfuse-span-<PPID>.json
 *     atomically; PostToolUse reads + deletes that file and closes the span.
 *   - Sampling roll happens ONLY at Pre. If the roll fails, no tmp file is
 *     written; Post becomes a silent no-op (single-span invariant per
 *     design §3.2).
 *
 * Event detection:
 *   The Claude Code runtime supplies the event name via CLAUDE_HOOK_EVENT
 *   (preferred), with fallback to the JSON stdin payload's
 *   hook_event_name / event_name fields. tool_name === 'Agent' is required;
 *   any other tool yields immediate exit 0.
 */

const path = require('node:path');
const fs = require('node:fs');

// Lazy modules — required only inside main() / handlers so the disabled
// fast-path stays under 100ms (NFR-4). The langfuse npm SDK is NEVER
// required from this file; it is required only inside getClient() in
// lib/langfuse-client.cjs.

// Resolve plugin root once (the hook lives at <plugin_root>/<channel>/hooks/<file>).
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

// Shared trace-carrier SSOT (v7.3.0 fix-loop 1: ARCH-3 / RISK-1).
const carrier = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-carrier.cjs'));
const {
  getSpanPath,
  writeAtomic,
  readTraceCarrier,
  writeTraceCarrier,
  resolvePpid,
} = carrier;

function readStdinSync() {
  // Read stdin synchronously and return parsed JSON or null. Best-effort.
  try {
    const data = fs.readFileSync(0, 'utf8');
    if (!data || !data.trim()) return null;
    return JSON.parse(data);
  } catch (_e) {
    return null;
  }
}

function detectEvent(payload) {
  // Priority 1: explicit env var from Claude Code runtime.
  const fromEnv = process.env.CLAUDE_HOOK_EVENT || process.env.CC_HOOK_EVENT;
  if (fromEnv) return String(fromEnv);
  // Priority 2: stdin payload (consistent with dispatch-guard pattern).
  if (payload && typeof payload === 'object') {
    if (typeof payload.hook_event_name === 'string') return payload.hook_event_name;
    if (typeof payload.event_name === 'string') return payload.event_name;
    if (typeof payload.event === 'string') return payload.event;
  }
  return null;
}

function detectToolName(payload) {
  if (payload && typeof payload === 'object' && typeof payload.tool_name === 'string') {
    return payload.tool_name;
  }
  return null;
}

function uuidish(prefix) {
  // Lightweight UUID-like id; no crypto dependency to keep the disabled
  // fast-path tiny. The collision space (timestamp + random) is sufficient
  // for span/trace correlation within a single run.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${t}-${r}`;
}

// ----------------------------------------------------------------------------
// v7.5.0 — Tracing scope policy (REQ-E-1 .. REQ-E-5).
// PIPELINE_TRACING_SCOPE governs which tool events the hook publishes.
// Default behavior (env-var absent or 'agent-only') preserves the v7.4.0
// contract bit-by-bit. Unknown values fall through to the safe default and
// emit a one-shot AUDIT breadcrumb so operators can catch typos.
// ----------------------------------------------------------------------------
const TRACING_SCOPE_DEFAULT = 'agent-only';
const _tracingScopeAudited = new Set();

function emitTracingAudit(name, fields) {
  const dedupeKey = `${name}:${JSON.stringify(fields || {})}`;
  if (_tracingScopeAudited.has(dedupeKey)) return;
  _tracingScopeAudited.add(dedupeKey);
  try {
    process.stderr.write(JSON.stringify({
      audit_event: name,
      ts: new Date().toISOString(),
      ...fields,
    }) + '\n');
  } catch (_e) { /* never throw from audit */ }
}

function shouldTrace(toolName, scope) {
  const effective = scope || TRACING_SCOPE_DEFAULT;
  switch (effective) {
    case 'agent-only':
      return toolName === 'Agent';
    case 'agent-plus-skill':
      return toolName === 'Agent' || toolName === 'Skill';
    case 'full':
      return true;
    default:
      emitTracingAudit('TRACING_SCOPE_UNKNOWN', { scope: effective });
      return toolName === 'Agent'; // safe-default = v7.4.0 parity
  }
}

function loadOrCreateTrace(runId, ppidFallback, agentName) {
  const existing = readTraceCarrier(runId, ppidFallback);
  if (existing) return existing;
  const c = {
    traceId: uuidish('lf-trace'),
    createdAt: new Date().toISOString(),
    runId: runId || null,
    ppid: ppidFallback,
    pluginVersion: readPluginVersion(),
    pipelineDocPath: process.env.PIPELINE_DOC_PATH || null,
    initialAgent: agentName || null,
  };
  // Soft-fail: writeTraceCarrier swallows errors itself.
  writeTraceCarrier(runId, ppidFallback, c);
  return c;
}

function readPluginVersion() {
  try {
    const pj = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pj)) {
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (j && typeof j.version === 'string') return j.version;
    }
  } catch (_e) { /* swallow */ }
  return 'unknown';
}

/**
 * findMostRecentStateFile — locate the sentinel-state.json with the highest
 * mtimeMs under <cwd>/.pipeline/docs/<bucket>/<run>/. Returns absolute path
 * or null. Applies path.resolve() containment (SEC-2) to reject symlink or
 * `..` escapes outside docsRoot.
 *
 * Extracted from readSentinelPhase to satisfy the QUAL-1 "single-purpose
 * inner loop" recommendation from Batch 3 adversarial review.
 */
function findMostRecentStateFile(docsRoot) {
  const docsRootResolved = path.resolve(docsRoot);
  if (!fs.existsSync(docsRootResolved)) return null;
  const docsRootGuard = docsRootResolved + path.sep;
  let best = null;
  let bestMtime = 0;
  let buckets;
  try { buckets = fs.readdirSync(docsRootResolved, { withFileTypes: true }); }
  catch (_e) { return null; }
  for (const b of buckets) {
    if (!b.isDirectory()) continue;
    const bucketPath = path.resolve(path.join(docsRootResolved, b.name));
    if (!bucketPath.startsWith(docsRootGuard)) continue;
    let runs;
    try { runs = fs.readdirSync(bucketPath, { withFileTypes: true }); }
    catch (_e) { continue; }
    for (const r of runs) {
      if (!r.isDirectory()) continue;
      const runPath = path.resolve(path.join(bucketPath, r.name));
      if (!runPath.startsWith(docsRootGuard)) continue;
      const sf = path.join(runPath, 'sentinel-state.json');
      try {
        const st = fs.statSync(sf);
        if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; best = sf; }
      } catch (_e) { /* skip */ }
    }
  }
  return best;
}

function readSentinelPhase() {
  // Best-effort: locate the most recent sentinel-state.json under .pipeline/docs
  // to enrich span metadata. Non-blocking — empty string on any failure.
  try {
    const docsRoot = path.join(process.cwd(), '.pipeline', 'docs');
    const best = findMostRecentStateFile(docsRoot);
    if (best) {
      const j = JSON.parse(fs.readFileSync(best, 'utf8'));
      return (j && (j.current_phase || j.phase)) || '';
    }
  } catch (_e) { /* swallow */ }
  return '';
}

function sampleRoll(rate) {
  if (rate >= 1.0) return true;
  if (rate <= 0.0) return false;
  return Math.random() < rate;
}

// ---------------------------------------------------------------------------
// handlePre — open span on PreToolUse:Agent
// ---------------------------------------------------------------------------
function handlePre(payload, client, sanitize) {
  // do NOT await — Langfuse SDK calls are fire-and-forget; we never block
  // the Claude Code hook chain on network I/O.
  const ppid = resolvePpid();
  const runId = process.env.PIPELINE_RUN_ID || null;
  const agentName = (payload && payload.tool_input && payload.tool_input.subagent_type) || 'unknown';
  const promptText = (payload && payload.tool_input && payload.tool_input.prompt) || '';

  // Sampling roll: if it fails, write NO tmp file and emit NO SDK call.
  // Sample rate is read from langfuse-client (which logs invalid_sample_rate
  // via initializeForSession when needed).
  const { getSampleRate } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs'));
  const rate = getSampleRate();
  if (!sampleRoll(rate)) {
    return; // Silent skip — Post will also be a no-op (no tmp file).
  }

  const trace = loadOrCreateTrace(runId, ppid, agentName);
  const spanId = uuidish('lf-span');
  const startedAt = new Date().toISOString();

  // Persist span carrier BEFORE attempting SDK call (so Post can still
  // close the span even if the SDK is slow/unreachable).
  const spanCarrier = {
    traceId: trace.traceId,
    spanId,
    startedAt,
    agentName,
    sampled: true,
  };
  try {
    writeAtomic(getSpanPath(runId, ppid), JSON.stringify(spanCarrier));
  } catch (_e) {
    // Soft-fail: continue with SDK call anyway.
  }

  // QUAL-2 (Batch 3): call readSentinelPhase() ONCE — was triple-called
  // across the three metadata objects below, slowing the hot path and
  // risking phase-skew if the file changes mid-handler.
  const currentPhase = readSentinelPhase();
  const sanitizedDocPath = sanitize(process.env.PIPELINE_DOC_PATH || '', PLUGIN_ROOT);

  // Fire SDK span.open. Wrapped in its own try/catch so an SDK throw
  // does not abort the rest of the hook.
  try {
    // do NOT await — span open is fire-and-forget per design §4.1 G1.
    const spanInput = sanitize(promptText, PLUGIN_ROOT);
    if (client && typeof client.trace === 'function') {
      const traceObj = client.trace({
        id: trace.traceId,
        name: agentName,
        metadata: {
          phase: currentPhase,
          agent_name: agentName,
          pipeline_doc_path: sanitizedDocPath,
          plugin_version: trace.pluginVersion,
        },
      });
      if (traceObj && typeof traceObj.span === 'function') {
        traceObj.span({
          id: spanId,
          name: agentName,
          input: spanInput,
          metadata: {
            phase: currentPhase,
            agent_name: agentName,
            pipeline_doc_path: sanitizedDocPath,
          },
        });
      }
    } else if (client && typeof client.span === 'function') {
      client.span({
        traceId: trace.traceId,
        id: spanId,
        name: agentName,
        input: spanInput,
        metadata: {
          phase: currentPhase,
          agent_name: agentName,
          pipeline_doc_path: sanitizedDocPath,
        },
      });
    }
  } catch (err) {
    const { logError } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs'));
    logError('sdk_throw', `span open failed: ${err && err.message}`, { hook_name: 'langfuse-hook' });
  }
}

// ---------------------------------------------------------------------------
// handlePost — close span on PostToolUse:Agent
// ---------------------------------------------------------------------------
function handlePost(payload, client, sanitize) {
  // do NOT await — span close is fire-and-forget. Post never blocks the
  // tool-call return path on Langfuse SDK network I/O.
  const ppid = resolvePpid();
  const runId = process.env.PIPELINE_RUN_ID || null;
  const spanPath = getSpanPath(runId, ppid);

  if (!fs.existsSync(spanPath)) {
    return; // Sampling skipped at Pre OR Pre crashed → silent no-op.
  }

  let spanCarrier;
  try {
    spanCarrier = JSON.parse(fs.readFileSync(spanPath, 'utf8'));
  } catch (err) {
    const { logError } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs'));
    logError('tmp_file_corrupt', `corrupt span carrier: ${err && err.message}`, { hook_name: 'langfuse-hook' });
    try { fs.unlinkSync(spanPath); } catch (_e) { /* ignore */ }
    return;
  }

  // Delete carrier BEFORE the SDK call so a slow SDK doesn't leave stale
  // state if the process is killed.
  try { fs.unlinkSync(spanPath); } catch (_e) { /* ignore */ }

  const endedAt = new Date().toISOString();
  let durationMs = 0;
  try {
    const t0 = Date.parse(spanCarrier.startedAt);
    const t1 = Date.parse(endedAt);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
      durationMs = t1 - t0;
    }
  } catch (_e) { /* keep 0 */ }
  // Langfuse spans require positive duration; clamp same-ms (instant) operations
  // to 1ms to avoid the SDK's start>=end validation kicking in on fast paths.
  if (durationMs === 0) durationMs = 1;

  const toolResponse = (payload && payload.tool_response) || null;
  const outputText = toolResponse ? sanitize(JSON.stringify(toolResponse), PLUGIN_ROOT) : '';

  try {
    if (client && typeof client.span === 'function') {
      const span = client.span({
        traceId: spanCarrier.traceId,
        id: spanCarrier.spanId,
      });
      if (span && typeof span.end === 'function') {
        span.end({
          output: outputText,
          metadata: { duration_ms: durationMs, agent_name: spanCarrier.agentName },
        });
      }
    } else if (client && typeof client.trace === 'function') {
      const t = client.trace({ id: spanCarrier.traceId });
      if (t && typeof t.update === 'function') {
        t.update({
          metadata: {
            duration_ms: durationMs,
            output: outputText,
            agent_name: spanCarrier.agentName,
            span_id: spanCarrier.spanId,
          },
        });
      }
    }
  } catch (err) {
    const { logError } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs'));
    logError('sdk_throw', `span close failed: ${err && err.message}`, { hook_name: 'langfuse-hook' });
  }
}

// ---------------------------------------------------------------------------
// main — entry point. Wraps everything in try/catch + finally exit 0.
//
// CRITICAL (v7.4.1 fix): main() is now async because the Langfuse SDK
// buffers events in memory and only ships them to the server on
// flushAsync()/shutdownAsync(). Without an explicit flush, the hook
// would queue the event and then process.exit(0) before the SDK's
// background worker fired — every event lost. The finally block now
// awaits a bounded shutdownAsync() (timeout 2s) before exiting.
// ---------------------------------------------------------------------------
async function main() {
  let clientRef = null;
  try {
    // Fast-path: check enable gate BEFORE any heavy work. The disabled
    // path must exit 0 in <100ms (NFR-4) — defers reading stdin until
    // we know we're going to use it.
    const { isEnabled, getClient, initializeForSession } = require(
      path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs')
    );
    if (!isEnabled()) {
      return; // Default OFF path — finally still exits 0.
    }

    // Eager init: surface invalid_sample_rate diagnostic at session boundary.
    initializeForSession();

    const payload = readStdinSync();
    const toolName = detectToolName(payload);
    const scope = process.env.PIPELINE_TRACING_SCOPE || TRACING_SCOPE_DEFAULT;
    if (!shouldTrace(toolName, scope)) {
      return; // Tool not in scope per PIPELINE_TRACING_SCOPE — silent no-op.
    }
    if (scope !== TRACING_SCOPE_DEFAULT && scope !== '') {
      // One-shot breadcrumb so operators see the opt-in was honored.
      emitTracingAudit('TRACING_SCOPE_EXPANDED', { scope });
    }

    const event = detectEvent(payload);
    if (!event) return;

    const client = getClient();
    if (!client) return;
    clientRef = client;

    const { sanitizeSpanPayload } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-sanitizer.cjs'));

    if (event === 'PreToolUse') {
      handlePre(payload, client, sanitizeSpanPayload);
    } else if (event === 'PostToolUse') {
      handlePost(payload, client, sanitizeSpanPayload);
    }
  } catch (err) {
    // Last-resort error log. We can't trust any of the imports succeeded.
    try {
      const { logError } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs'));
      logError('unknown', `langfuse-hook top-level error: ${err && err.message}`, { hook_name: 'langfuse-hook' });
    } catch (_e) {
      // Truly soft-fail: write to stderr only, never throw.
      try { process.stderr.write(`langfuse-hook: ${err && err.message}\n`); } catch (_e2) { /* ignore */ }
    }
  } finally {
    // Bounded flush before exit: the Langfuse SDK buffers events; without
    // this, every queued span/trace.update would be lost when process.exit
    // fires. Timeout 2s — fires the flush_timeout diagnostic if exceeded
    // but never blocks the hook chain indefinitely.
    if (clientRef) {
      const FLUSH_TIMEOUT_MS = 2000;
      const flushFn = (typeof clientRef.shutdownAsync === 'function')
        ? () => clientRef.shutdownAsync()
        : (typeof clientRef.flushAsync === 'function')
          ? () => clientRef.flushAsync()
          : null;
      if (flushFn) {
        try {
          await Promise.race([
            flushFn(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('flush_timeout')), FLUSH_TIMEOUT_MS)
            ),
          ]);
        } catch (err) {
          try {
            const { logError } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-client.cjs'));
            logError(
              'flush_timeout',
              `flush failed: ${err && err.message}`,
              { hook_name: 'langfuse-hook' }
            );
          } catch (_e) { /* swallow */ }
        }
      }
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { handlePre, handlePost, main, shouldTrace };
