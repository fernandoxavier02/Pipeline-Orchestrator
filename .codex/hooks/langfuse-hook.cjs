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
 * v7.9.0 (Langfuse telemetry fidelity — 3 cloud-audit findings):
 *   - Finding 1 (null duration): handlePre sets the SDK-recognized span
 *     startTime; handlePost sets a top-level endTime (paired with the persisted
 *     startTime) so the Langfuse cloud computes a real positive duration. The
 *     previous code only emitted metadata.duration_ms, a custom label the
 *     cloud does NOT use for duration.
 *   - Finding 2 (flat hierarchy): the trace carries a RUN-level name set once
 *     at creation (never renamed to the latest agent on subsequent dispatches);
 *     the per-agent name lives on the child span. Combined with the carrier's
 *     session-id key tier (lib/langfuse-carrier.cjs), every agent in a run
 *     shares one trace, yielding the run -> N-span tree instead of one
 *     standalone trace per agent.
 *   - Finding 2 / 3 (carrier key): main() exports CLAUDE_SESSION_ID from the
 *     stdin payload's session_id BEFORE any carrier call, so open + close
 *     (separate processes) land on the same carrier and the controller process
 *     resolves the same trace for score / gate events.
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

// v7.9.0 (Finding 2): the trace represents ONE pipeline run, not one agent.
// Its name is therefore set ONCE at creation to a run-level label and is NEVER
// re-set to the latest agent on subsequent dispatches. The per-agent name lives
// on the child SPAN, not the trace. A stable carrier (keyed by runId or the
// session-id tier in lib/langfuse-carrier.cjs) guarantees every dispatch in a
// run reuses this same trace + traceName, producing the run -> N-span tree the
// cloud expects instead of one standalone trace per agent.
function runLevelTraceName(runId) {
  const docPath = process.env.PIPELINE_DOC_PATH || '';
  // Prefer the run folder name (human-meaningful, session-stable) when present.
  const leaf = docPath
    ? String(docPath).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop()
    : '';
  if (leaf) return `pipeline-run:${leaf}`;
  if (runId) return `pipeline-run:${runId}`;
  return 'pipeline-run';
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
    // traceName is fixed at creation (run-level) — never overwritten per agent.
    traceName: runLevelTraceName(runId),
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

/**
 * findStateFileByRunId — locate the sentinel-state.json whose parsed run_id
 * equals `runId` under <docsRoot>/<bucket>/<run>/. Returns absolute path or
 * null. Reuses the same path.resolve() containment guard (SEC-2) as
 * findMostRecentStateFile so a hostile bucket/run name cannot escape docsRoot.
 *
 * Added for BUG 3 (v7.9.3): when PIPELINE_DOC_PATH is absent but the controller
 * exported PIPELINE_RUN_ID, the hook still needs the run's sentinel to enrich
 * trace/span metadata. PIPELINE_RUN_ID is not always propagated into hook
 * processes, so this scan is a best-effort match, not a guarantee.
 */
function findStateFileByRunId(docsRoot, runId) {
  if (!runId) return null;
  const docsRootResolved = path.resolve(docsRoot);
  if (!fs.existsSync(docsRootResolved)) return null;
  const docsRootGuard = docsRootResolved + path.sep;
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
        const j = JSON.parse(fs.readFileSync(sf, 'utf8'));
        if (j && j.run_id === runId) return sf;
      } catch (_e) { /* skip unreadable / non-matching */ }
    }
  }
  return null;
}

/**
 * findPointerRunOutsideDocs — v8.4.0 (W2). Pointer-first discovery tier, GATED
 * to pipeline-runs/ paths only. Mirrors the stop-hook pointer fast-path so a
 * sealed spec-authoring run (which lives under pipeline-runs/, NOT .pipeline/docs,
 * and finishes pipeline_active:false) is still discoverable by the Langfuse hook.
 *
 * Returns the absolute sentinel-state.json path or null. Honors the same SEC
 * guards as stop-hook: size cap, freshness window (uncomputable age = stale),
 * containment inside the project tree, and PIPELINE_RUN_ID agreement. Crucially
 * it ONLY returns paths OUTSIDE <cwd>/.pipeline/docs/ — the docs scan tiers below
 * keep their byte-identical legacy semantics.
 */
function findPointerRunOutsideDocs(cwd) {
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;
    const ptrPath = path.join(cwd, '.pipeline', 'active-run.json');
    if (!fs.existsSync(ptrPath)) return null;
    if (fs.statSync(ptrPath).size > 4096) return null; // SEC: size cap
    const ptr = JSON.parse(fs.readFileSync(ptrPath, 'utf8'));
    const docPath = ptr && typeof ptr.pipeline_doc_path === 'string' ? ptr.pipeline_doc_path : '';
    if (!docPath) return null;
    const age = ptr && typeof ptr.updated_at === 'string' ? (Date.now() - Date.parse(ptr.updated_at)) : NaN;
    if (!(Number.isFinite(age) && age >= 0 && age < 24 * 3600 * 1000)) return null; // freshness
    const cwdGuard = path.resolve(cwd) + path.sep;
    const resolvedDoc = path.resolve(docPath);
    if (!resolvedDoc.startsWith(cwdGuard)) return null; // containment
    const envRunId = (process.env.PIPELINE_RUN_ID || '').trim();
    if (envRunId && ptr.run_id !== envRunId) return null; // run_id agreement
    // GATE: only pipeline-runs/ paths (OUTSIDE .pipeline/docs/) use this tier.
    const docsRootResolved = path.resolve(path.join(cwd, '.pipeline', 'docs')) + path.sep;
    if (resolvedDoc.startsWith(docsRootResolved)) return null;
    const sf = path.join(resolvedDoc, 'sentinel-state.json');
    return fs.existsSync(sf) ? sf : null;
  } catch (_e) {
    return null; // pointer unreadable — fall through to the docs scans
  }
}

/**
 * readSentinelData — discover the active run's sentinel-state.json and surface
 * the fields the trace/span metadata needs (BUG 3, v7.9.3). Discovery follows
 * a fixed precedence so every separately-spawned hook process of one run lands
 * on the SAME sentinel:
 *   (1) PIPELINE_DOC_PATH — the env var points DIRECTLY at the run folder; its
 *       sentinel-state.json wins over everything (highest precedence).
 *   (1b) pointer (v8.4.0, W2) — <cwd>/.pipeline/active-run.json, GATED to
 *       pipeline-runs/ paths only (sealed spec-authoring runs). Honors freshness
 *       + containment + run_id agreement; never touches .pipeline/docs paths.
 *   (2) PIPELINE_RUN_ID — scan <cwd>/.pipeline/docs for the run folder whose
 *       sentinel run_id matches the env var.
 *   (3) mtime fallback — the most-recently-touched sentinel under
 *       <cwd>/.pipeline/docs (legacy behavior, preserves the old phase read).
 * Best-effort + non-blocking: every parse is soft-failed; on total miss the
 * returned shape is all-empty/null so callers degrade gracefully.
 */
function readSentinelData() {
  const empty = { phase: '', run_id: null, type: null, complexity: null, pipeline_doc_path: '' };
  let best = null;
  let usedDir = '';
  try {
    // (1) PIPELINE_DOC_PATH points directly at the run folder.
    const docPath = process.env.PIPELINE_DOC_PATH || '';
    if (docPath) {
      const candidate = path.join(docPath, 'sentinel-state.json');
      if (fs.existsSync(candidate)) { best = candidate; usedDir = docPath; }
    }
    // (1b) v8.4.0 (W2): pointer-first tier, gated to pipeline-runs/ paths only.
    if (!best) {
      const byPointer = findPointerRunOutsideDocs(process.cwd());
      if (byPointer) { best = byPointer; usedDir = path.dirname(byPointer); }
    }
    // (2) PIPELINE_RUN_ID folder match under <cwd>/.pipeline/docs.
    if (!best) {
      const docsRoot = path.join(process.cwd(), '.pipeline', 'docs');
      const byId = findStateFileByRunId(docsRoot, process.env.PIPELINE_RUN_ID || null);
      if (byId) { best = byId; usedDir = path.dirname(byId); }
    }
    // (3) mtime fallback under <cwd>/.pipeline/docs.
    if (!best) {
      const docsRoot = path.join(process.cwd(), '.pipeline', 'docs');
      const recent = findMostRecentStateFile(docsRoot);
      if (recent) { best = recent; usedDir = path.dirname(recent); }
    }
    if (!best) return empty;
    const j = JSON.parse(fs.readFileSync(best, 'utf8'));
    const od = (j && j.orchestrator_decision) || {};
    // AUDIT-003 (v7.11.0): run_id falls back to the run-FOLDER basename — the
    // canonical run id used by stop-hook's buildRunLogEntry — so spans stay
    // attributable even for states written before the run_id field existed.
    const folderBase = usedDir ? path.basename(usedDir) : '';
    // AUDIT-003 (v7.11.0): surface the doc path as a RELATIVE fwd-slash path
    // (relative to cwd) — absolute Windows paths were redacted to '' by the
    // sanitizer downstream, which nulled trace correlation for 10 days of spans.
    let relDoc = '';
    if (usedDir) {
      const rel = path.relative(process.cwd(), usedDir);
      relDoc = (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) ? rel.split(path.sep).join('/') : folderBase;
    }
    return {
      phase: (j && (j.current_phase || j.phase)) || '',
      run_id: (j && j.run_id) != null ? j.run_id : (folderBase || null),
      type: od.type != null ? od.type : null,
      complexity: od.complexity != null ? od.complexity : null,
      pipeline_doc_path: relDoc,
    };
  } catch (_e) { /* swallow */ }
  return empty;
}

function readSentinelPhase() {
  // Thin wrapper preserved for the handlePre call site and F12/F5 contracts:
  // the phase-only string is exactly what readSentinelData surfaces.
  return readSentinelData().phase || '';
}

/**
 * buildTraceMetadata — build the enriched, SANITIZED metadata object the cloud
 * attaches to the trace + span (BUG 3, v7.9.3). Accepts EITHER a raw sentinel
 * object (orchestrator_decision nested) OR the flattened object returned by
 * readSentinelData(); both shapes are read defensively. Only explicit fields
 * are copied — free-form fields like `note` (which may carry a leaked secret)
 * are NEVER forwarded. Every string value is routed through the Langfuse
 * sanitizer (lazy-required INSIDE the function to keep the disabled fast-path
 * and the no-new-top-level-require invariant, F8/F9, intact). Benign ids like
 * 'r-f17' survive the sanitizer literally.
 */
function buildTraceMetadata(sentinelData) {
  const sd = sentinelData || {};
  const od = sd.orchestrator_decision || {};
  const runId = sd.run_id != null ? sd.run_id : null;
  const type = od.type != null ? od.type : (sd.type != null ? sd.type : null);
  const complexity = od.complexity != null
    ? od.complexity
    : (sd.complexity != null ? sd.complexity : null);
  const phase = sd.current_phase != null
    ? sd.current_phase
    : (sd.phase != null ? sd.phase : null);
  const docPath = sd.pipeline_doc_path != null ? sd.pipeline_doc_path : null;

  const { sanitizeAny } = require(path.join(PLUGIN_ROOT, 'lib', 'langfuse-sanitizer.cjs'));
  const clean = (v) => (typeof v === 'string' ? sanitizeAny(v, PLUGIN_ROOT) : v);

  const meta = {
    run_id: clean(runId),
    type: clean(type),
    complexity: clean(complexity),
    phase: clean(phase),
    pipeline_doc_path: clean(docPath),
    plugin_version: readPluginVersion(),
  };
  return meta;
}

/**
 * resolveSpanName — derive a human-readable span name for a tool event
 * (BUG 3, v7.9.3). Order: an explicit subagent_type wins; otherwise a truncated
 * tool description, then the tool_name, then a generic 'tool'. It NEVER returns
 * 'unknown'. When it has to fall back past subagent_type it emits a one-shot
 * SPAN_NAME_FALLBACK AUDIT breadcrumb on stderr so operators can spot unmapped
 * tools. The breadcrumb is deduped via the existing emitTracingAudit set; the
 * test captures the first call.
 */
function resolveSpanName(payload) {
  const input = (payload && payload.tool_input) || {};
  const subagent = input.subagent_type;
  if (typeof subagent === 'string' && subagent.length > 0) return subagent;

  const toolName = (payload && payload.tool_name) || null;
  const desc = input.description;
  let name;
  if (typeof desc === 'string' && desc.trim().length > 0) {
    name = desc.trim().slice(0, 64);
  } else if (typeof toolName === 'string' && toolName.length > 0) {
    name = toolName;
  } else {
    name = 'tool';
  }
  emitTracingAudit('SPAN_NAME_FALLBACK', { tool_name: toolName, resolved: name });
  return name;
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
  // BUG 3 (v7.9.3): never label the span 'unknown'. resolveSpanName returns the
  // subagent_type when present, else a readable fallback (+ AUDIT breadcrumb).
  const agentName = resolveSpanName(payload);
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

  // QUAL-2 (Batch 3) + BUG 3 (v7.9.3): read the sentinel ONCE per handler and
  // build the enriched, sanitized trace metadata a single time. The previous
  // code only surfaced `phase`; the cloud trace/span arrived with empty
  // metadata. buildTraceMetadata now adds run_id / type / complexity (every
  // string routed through the sanitizer) so the cloud groups + labels the run.
  const sentinelData = readSentinelData();
  const currentPhase = sentinelData.phase || '';
  const enrichedMeta = buildTraceMetadata(sentinelData);

  // v7.9.0 (Finding 2): the trace carries the RUN-level name (set once at
  // creation, persisted in the carrier), NOT the current agent name. The agent
  // name belongs on the child span below. Reusing the same carrier across
  // dispatches keeps traceId + traceName stable for the whole run.
  const traceName = trace.traceName || runLevelTraceName(runId);

  // Fire SDK span.open. Wrapped in its own try/catch so an SDK throw
  // does not abort the rest of the hook.
  try {
    // do NOT await — span open is fire-and-forget per design §4.1 G1.
    const spanInput = sanitize(promptText, PLUGIN_ROOT);
    if (client && typeof client.trace === 'function') {
      const traceObj = client.trace({
        id: trace.traceId,
        name: traceName,
        // BUG 3 (v7.9.3) + AUDIT-003/SEC-1 (v7.11.0): merge the enriched metadata —
        // enrichedMeta already carries the sanitizer-safe RELATIVE pipeline_doc_path
        // from readSentinelData; the old env-based override neutralized the fix on
        // cross-drive installs and was removed.
        metadata: {
          ...enrichedMeta,
          phase: currentPhase,
          plugin_version: trace.pluginVersion,
        },
      });
      if (traceObj && typeof traceObj.span === 'function') {
        traceObj.span({
          id: spanId,
          name: agentName,
          // v7.9.0 (Finding 1): set the SDK-recognized startTime so the cloud
          // can compute a real observation duration when the span is closed.
          startTime: startedAt,
          input: spanInput,
          metadata: {
            ...enrichedMeta,
            phase: currentPhase,
            agent_name: agentName,
          },
        });
      }
    } else if (client && typeof client.span === 'function') {
      client.span({
        traceId: trace.traceId,
        id: spanId,
        name: agentName,
        // v7.9.0 (Finding 1): SDK-recognized startTime (see above).
        startTime: startedAt,
        input: spanInput,
        metadata: {
          ...enrichedMeta,
          phase: currentPhase,
          agent_name: agentName,
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

  // v7.9.0 (Finding 1): compute the real start/end pair the cloud needs.
  // startTime comes from the carrier (written at open in handlePre); endTime is
  // now. The previous code only emitted metadata.duration_ms — a custom label
  // the Langfuse cloud does NOT use to compute observation duration, so every
  // span showed null duration. We now pass the SDK-recognized top-level
  // startTime/endTime so duration is computed server-side.
  const startedAtIso = spanCarrier.startedAt || null;
  let endedAt = new Date().toISOString();
  let durationMs = 0;
  try {
    const t0 = Date.parse(startedAtIso);
    const t1 = Date.parse(endedAt);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
      durationMs = t1 - t0;
    }
  } catch (_e) { /* keep 0 */ }
  // Langfuse spans require positive duration; clamp same-ms (instant) operations
  // to 1ms. The clamp now also applies to the SDK-recognized endTime (not only
  // the metadata label), so endTime is strictly > startTime on instant ops.
  if (durationMs === 0) {
    durationMs = 1;
    const t0 = Date.parse(startedAtIso);
    if (Number.isFinite(t0)) {
      endedAt = new Date(t0 + 1).toISOString();
    }
  }

  const toolResponse = (payload && payload.tool_response) || null;
  const outputText = toolResponse ? sanitize(JSON.stringify(toolResponse), PLUGIN_ROOT) : '';

  try {
    if (client && typeof client.span === 'function') {
      // Re-create the span body carrying the persisted startTime (the open-side
      // span object lives in a different process and is gone), then close it
      // with the real endTime. Passing startTime here is what lets the cloud
      // compute a positive duration despite Pre/Post being separate processes.
      const span = client.span({
        traceId: spanCarrier.traceId,
        id: spanCarrier.spanId,
        startTime: startedAtIso,
      });
      if (span && typeof span.end === 'function') {
        span.end({
          output: outputText,
          // SDK-recognized end timestamp — the field the cloud uses for duration.
          endTime: endedAt,
          metadata: { duration_ms: durationMs, agent_name: spanCarrier.agentName },
        });
      }
    } else if (client && typeof client.trace === 'function') {
      // Trace-only fallback: create the child span with real start/end so the
      // observation still carries a positive duration, then keep the legacy
      // metadata update for human-readable extras.
      const t = client.trace({ id: spanCarrier.traceId });
      if (t && typeof t.span === 'function') {
        const s = t.span({
          id: spanCarrier.spanId,
          name: spanCarrier.agentName,
          startTime: startedAtIso,
          output: outputText,
          metadata: { agent_name: spanCarrier.agentName },
        });
        if (s && typeof s.end === 'function') {
          s.end({ endTime: endedAt, metadata: { duration_ms: durationMs } });
        }
      } else if (t && typeof t.update === 'function') {
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

    // v7.9.0 (Finding 2 / 3): adopt the runtime session id as the stable
    // cross-process carrier key. The Claude Code runtime supplies session_id
    // in the hook stdin payload (the same field stop-hook.cjs reads). Pre and
    // Post run as separate processes, so process.ppid is not a reliable shared
    // key and PIPELINE_RUN_ID is not propagated into hook processes. Exporting
    // it here — BEFORE any carrier call — lets lib/langfuse-carrier.cjs key the
    // span/trace files by `sess-<id>`, so open + close land on the same carrier
    // (real duration) and every agent in a run shares one trace (run -> N-span
    // tree). Only set when absent so an explicit env value still wins; the
    // carrier validates the format defensively.
    if (!process.env.CLAUDE_SESSION_ID && payload && typeof payload === 'object') {
      const sid = payload.session_id || payload.sessionId;
      if (typeof sid === 'string' && sid.length > 0) {
        process.env.CLAUDE_SESSION_ID = sid;
      }
    }

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

module.exports = {
  handlePre,
  handlePost,
  main,
  shouldTrace,
  readSentinelData,
  resolveSpanName,
  buildTraceMetadata,
};
