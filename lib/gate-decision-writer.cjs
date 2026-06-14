#!/usr/bin/env node
'use strict';

/**
 * gate-decision-writer.cjs — v7.1.0 SSOT writer for gate-decisions.jsonl.
 *
 * Replaces ad-hoc fs.appendFile / appendJsonl calls scattered across
 * agents/skills/lib that were emitting 40+ different "success" decision
 * values (PASS, COMPLETE, GO, FIXED, etc.) and missing correlation
 * fields (run_id, plugin_version, schema_version, type, complexity).
 *
 * Contract:
 *   - The canonical decision vocabulary is the 8-value union below.
 *     Anything outside throws TypeError at write time (defense in depth
 *     pairs with diff-discipline-reviewer's static SSOT-bypass check).
 *   - Every event auto-carries the 5 correlation fields, derived from
 *     a `ctx` built once per run via buildCtx(pipelineDocPath, opts).
 *   - plugin_version is read ONCE at module load from
 *     .claude-plugin/plugin.json (consistent with other module-level
 *     caches in this codebase).
 *   - All writes go through lib/jsonl-sanitizer.cjs's safeAppendJsonl
 *     so the 200-char detail truncation + newline strip + atomic append
 *     guarantees from v6.0.0 are preserved.
 *
 * Hardness vocabulary (5 classes, matches references/gates.md):
 *   MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT
 *
 * Decision vocabulary (8 values, 3 buckets):
 *   runtime_emitted:     BLOCKED, DISPATCHED, SKIPPED
 *   user_gate_resolved:  APPROVED, CONFIRMED, REJECTED
 *   pipeline_outcome:    TRIGGERED, NOT_TRIGGERED
 *
 * This is the *write-side* union. Reader-side per-gate filtering lives
 * in lib/fidelity-reporter.cjs (e.g. PLAN_REJECTED never has
 * decision=BLOCKED — the reader checks that, not the writer).
 *
 * Schema version: '1'. Bump on any payload-field change.
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeAppendJsonl } = require('./jsonl-sanitizer.cjs');
const { readTraceCarrierForCurrentProcess } = require('./langfuse-carrier.cjs');

// SSOT (Phase 1, 2026-06-14): the canonical decision/hardness vocabularies and
// the schema version now live in lib/contracts/gate-decision.cjs. They were
// declared inline here through v7.x; centralising them kills the drift where
// prose parse-rules and the writer disagreed on the allowed key/value sets.
const {
  SCHEMA_VERSION,
  CANONICAL_DECISIONS,
  CANONICAL_HARDNESS,
} = require('./contracts/gate-decision.cjs');

// --------------------------------------------------------------------
// Module-load-once: plugin_version from .claude-plugin/plugin.json.
//
// Search upward from this module's directory because the writer may be
// vendored into a project's local node_modules cache (then plugin.json
// is at <cache>/.claude-plugin/plugin.json), or live in the canonical
// repo (then plugin.json is at <repo>/.claude-plugin/plugin.json).
//
// Falls back to 'unknown' on any failure so a corrupted plugin.json
// never blocks event writes.
// --------------------------------------------------------------------
function readPluginVersion() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.claude-plugin', 'plugin.json');
    try {
      if (fs.existsSync(candidate)) {
        const j = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (j && typeof j.version === 'string' && j.version.length > 0) {
          return j.version;
        }
      }
    } catch (_e) { /* keep searching */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'unknown';
}

const PLUGIN_VERSION = readPluginVersion();

// --------------------------------------------------------------------
// buildCtx — derive correlation envelope once per run.
// --------------------------------------------------------------------

function buildCtx(pipelineDocPath, opts) {
  if (typeof pipelineDocPath !== 'string' || pipelineDocPath.length === 0) {
    throw new TypeError('buildCtx: pipelineDocPath must be a non-empty string');
  }
  // path.basename of '.../<slug>/' returns '<slug>' (trailing slash stripped).
  const slug = path.basename(pipelineDocPath.replace(/[\\/]+$/, ''));
  const o = opts || {};
  return {
    run_id: slug,
    plugin_version: PLUGIN_VERSION,
    schema_version: SCHEMA_VERSION,
    type: typeof o.type === 'string' ? o.type : null,
    complexity: typeof o.complexity === 'string' ? o.complexity : null,
  };
}

// --------------------------------------------------------------------
// appendGateDecision — the canonical write.
//
// Validates decision and hardness against CANONICAL_* sets; throws
// TypeError on unknown values so the bug surfaces in CI rather than
// silently producing a malformed audit trail.
//
// Then merges the ctx correlation envelope and delegates to
// safeAppendJsonl (jsonl-sanitizer) for the actual file I/O.
// --------------------------------------------------------------------

function appendGateDecision(filePath, entry, ctx) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new TypeError('appendGateDecision: filePath must be a non-empty string');
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('appendGateDecision: entry must be a plain object');
  }
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    throw new TypeError('appendGateDecision: ctx must be a plain object');
  }

  const decision = entry.decision;
  if (typeof decision !== 'string' || !CANONICAL_DECISIONS.has(decision)) {
    throw new TypeError(
      `appendGateDecision: decision "${decision}" not in CANONICAL_DECISIONS. ` +
      `Allowed: ${Array.from(CANONICAL_DECISIONS).join(', ')}.`
    );
  }

  const hardness = entry.hardness;
  if (typeof hardness !== 'string' || !CANONICAL_HARDNESS.has(hardness)) {
    throw new TypeError(
      `appendGateDecision: hardness "${hardness}" not in CANONICAL_HARDNESS. ` +
      `Allowed: ${Array.from(CANONICAL_HARDNESS).join(', ')}.`
    );
  }

  const merged = {
    // Correlation envelope FIRST so it's predictable in JSONL output.
    run_id: ctx.run_id,
    plugin_version: ctx.plugin_version,
    schema_version: ctx.schema_version,
    type: ctx.type,
    complexity: ctx.complexity,
    // Then the original event fields. Explicit listing avoids accidental
    // override of correlation fields by a caller that shoved them into entry.
    gate: entry.gate,
    hardness: entry.hardness,
    phase: entry.phase,
    decision: entry.decision,
    decided_by: entry.decided_by,
    timestamp: entry.timestamp,
    detail: entry.detail,
    confidence_impact: entry.confidence_impact,
  };

  // safeAppendJsonl handles detail sanitization (200-char cap, newline strip),
  // round-trip parse guard, and atomic append with exclusive file lock.
  const result = safeAppendJsonl(filePath, merged);
  if (!result || result.ok !== true) {
    // safeAppendJsonl returns {ok:false, error} on failure. Surface it.
    const errMsg = (result && result.error) ? result.error : 'unknown';
    throw new Error(`appendGateDecision: safeAppendJsonl failed: ${errMsg}`);
  }

  // Langfuse Cloud mirror (FR-4, design §6) — additive, non-breaking.
  //
  // After the JSONL write succeeds, emit a Langfuse event tagged with the
  // current trace if one is open for this process tree. This block is the
  // SSOT-write side-effect for option (b) per design §6: each writer owns
  // its own SDK queue; server-side dedup carries the load.
  //
  // ESCAPE HATCH (per design §6): if v7.3.0 ships and server-side dedup
  // proves unreliable, comment out this entire try/catch block. The JSONL
  // write above remains the authoritative audit trail; this side-emit is
  // pure observability mirroring.
  //
  // TODO(v7.4): invert to observer pattern — accept optional emit callback
  // rather than reaching into langfuse-client. Tracked: ARCH-2 from Batch 3
  // adversarial review.
  try {
    const clientLib = require('./langfuse-client.cjs');
    if (typeof clientLib.isEnabled === 'function' && clientLib.isEnabled()) {
      const carrier = readTraceCarrierForCurrentProcess();
      if (carrier && carrier.traceId) {
        const client = clientLib.getClient && clientLib.getClient();
        if (client && typeof client.event === 'function') {
          // Fire-and-forget — never await an SDK call here.
          client.event({
            traceId: carrier.traceId,
            name: entry.gate || 'gate',
            metadata: {
              decision: entry.decision,
              hardness: entry.hardness,
              run_id: ctx.run_id,
              phase: entry.phase,
            },
          });
        }
      }
    }
  } catch (_e) {
    // Never propagate — JSONL write already succeeded; the Langfuse mirror
    // is best-effort. Errors are swallowed because logError itself depends
    // on langfuse-client.cjs, which may be the throwing dependency.
  }

  return result;
}

// readTraceCarrierForCurrentProcess() is now imported from
// lib/langfuse-carrier.cjs (v7.3.0 fix-loop 1, ARCH-3): a single source of
// truth for the /tmp/langfuse-trace-<PID>.json filename, JSON shape, and
// read-recovery semantics. The previous inline copy drifted from the
// hook's copy and had to be re-synced manually on every protocol change.

module.exports = {
  appendGateDecision,
  buildCtx,
  CANONICAL_DECISIONS,
  CANONICAL_HARDNESS,
  SCHEMA_VERSION,
  PLUGIN_VERSION,
};
