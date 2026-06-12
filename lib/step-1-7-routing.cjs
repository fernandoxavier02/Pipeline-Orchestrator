#!/usr/bin/env node
'use strict';

/**
 * step-1-7-routing.cjs — v7.14.0 closed-vocabulary helper for STEP 1.7 routing.
 *
 * The 2026-06-12 audit caught a STEP_1_7_ROUTING entry whose branch was written
 * with an out-of-vocabulary value ("SKIPPED" — a canonical gate-decision value,
 * NOT a branch identity). This module pins the branch identity to a CLOSED set
 * of 4 values and maps each to the existing 8-value canonical gate-decision
 * vocabulary (D1) WITHOUT inventing a 9th value.
 *
 * Design decisions honored:
 *   - D1: the canonical 8-value vocabulary in lib/gate-decision-writer.cjs is
 *     INTOUCHED. The branch identity lives in the `detail` field; the canonical
 *     `decision` is derived via branchToCanonical().
 *   - Reuse the SSOT writer (appendGateDecision) for all file I/O — no ad-hoc
 *     appendFile. The 200-char detail truncation + atomic append guarantees come
 *     for free.
 *
 * Branch -> canonical mapping (D1):
 *   dispatch-brainstorm -> DISPATCHED
 *   load-existing       -> CONFIRMED
 *   no-prep-override    -> SKIPPED
 *   simples-bypass      -> NOT_TRIGGERED
 */

const fs = require('node:fs');
const path = require('node:path');
const { appendGateDecision } = require('./gate-decision-writer.cjs');
const { sanitizeDetail } = require('./jsonl-sanitizer.cjs');
const { withLock } = require('./exclusive-lock.cjs');

// SEC-1/SEC-2: allowlist for free-form identifier fields (prep_run_id,
// dispatch_id) that get interpolated into the audit `detail`. Without this an
// attacker-controlled value like "x; decision=APPROVED" could forge the
// structured "key=value; key=value" detail record. Charset is restricted to
// the safe subset used by run/dispatch ids; any other char (incl. ';' '=' and
// control chars) rejects the value and coerces it to the sentinel null.
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// The closed set of 4 valid STEP 1.7 branches. Frozen so callers cannot mutate.
const BRANCH_VALUES = Object.freeze(new Set([
  'load-existing',
  'dispatch-brainstorm',
  'no-prep-override',
  'simples-bypass',
]));

// D1 mapping: branch identity -> canonical gate-decision value.
const BRANCH_TO_CANONICAL = Object.freeze({
  'dispatch-brainstorm': 'DISPATCHED',
  'load-existing': 'CONFIRMED',
  'no-prep-override': 'SKIPPED',
  'simples-bypass': 'NOT_TRIGGERED',
});

// --------------------------------------------------------------------
// branchToCanonical — map a validated branch to its canonical decision.
// Throws TypeError on any value outside the closed set (defense in depth).
// --------------------------------------------------------------------
function branchToCanonical(branch) {
  if (typeof branch !== 'string' || !BRANCH_VALUES.has(branch)) {
    throw new TypeError(
      `branchToCanonical: branch "${branch}" not in BRANCH_VALUES. ` +
      `Allowed: ${Array.from(BRANCH_VALUES).join(', ')}.`
    );
  }
  return BRANCH_TO_CANONICAL[branch];
}

// --------------------------------------------------------------------
// appendStep17Routing — validated write of a STEP_1_7_ROUTING gate entry.
//
// Validates `branch` against the closed vocabulary FIRST (throws TypeError
// outside it), builds the audit `detail` carrying the branch identity +
// prep_run_id, then delegates to the SSOT appendGateDecision writer.
// --------------------------------------------------------------------
function appendStep17Routing(filePath, opts, ctx) {
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError('appendStep17Routing: opts must be a plain object');
  }

  const { branch, prep_run_id, phase, decided_by, timestamp } = opts;

  // Validate the branch BEFORE touching the SSOT writer so an out-of-vocabulary
  // branch fails fast with a clear TypeError (audit caught "SKIPPED" raw).
  const decision = branchToCanonical(branch);

  // SEC-1: coerce prep_run_id to the sentinel null unless it is a non-null
  // string matching the safe id charset. A non-string, empty, or charset-
  // violating value (e.g. "x; decision=APPROVED" or the literal "null") becomes
  // the real sentinel null — distinct from any string the caller could send,
  // because JSON.stringify(null) === "null" while JSON.stringify("null") ===
  // '"null"' (quoted), so the two are never confused in the detail.
  let prepId = null;
  if (typeof prep_run_id === 'string') {
    if (SAFE_ID_RE.test(prep_run_id)) {
      prepId = prep_run_id;
    } else if (prep_run_id.length > 0) {
      try { process.stderr.write(`appendStep17Routing: prep_run_id "${prep_run_id}" failed charset allowlist → coerced to null\n`); } catch (_e) {}
    }
  }
  // SEC-1: JSON.stringify the interpolated value so injected separators (';'
  // '=') or control chars are escaped and cannot forge the key=value structure.
  // The sentinel null serializes to bare `null`; any string serializes quoted.
  const detail = `branch=${JSON.stringify(branch)}; prep_run_id=${JSON.stringify(prepId)}`;

  // SEC-3 (defense in depth): light validation of the remaining free-form
  // fields. phase/decided_by must be non-empty strings; timestamp must look
  // ISO-ish (starts YYYY-MM-DD). Anything else falls back to a safe default.
  // B3-IMP-01 parity: phase/decided_by are sanitized + capped via the same
  // sanitizeDetail helper recordNoPrepOverride uses, so a 10KB value can never
  // reach appendGateDecision unbounded (strips ctrl chars, caps at 200).
  const safePhase = (typeof phase === 'string' && phase.trim().length > 0)
    ? sanitizeDetail(phase)
    : '1.7';
  const safeDecidedBy = (typeof decided_by === 'string' && decided_by.trim().length > 0)
    ? sanitizeDetail(decided_by)
    : 'pipeline-controller';
  const safeTimestamp = (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(timestamp))
    ? timestamp
    : new Date().toISOString();

  return appendGateDecision(filePath, {
    gate: 'STEP_1_7_ROUTING',
    hardness: 'HARD',
    phase: safePhase,
    decision,
    decided_by: safeDecidedBy,
    timestamp: safeTimestamp,
    detail,
    confidence_impact: 0,
  }, ctx);
}

// --------------------------------------------------------------------
// buildStep17StateBlock — the sentinel-state.step_1_7 block (D3).
//
// Written immediately after the STEP 1.7 decision, BEFORE any Phase 1.5 /
// Phase 2 spawn, so a determinist hook can verify the branch was decided.
// --------------------------------------------------------------------
function buildStep17StateBlock(branch, prepRunId) {
  // Validate the branch so a malformed state block can never be produced.
  branchToCanonical(branch);
  // SEC-1 parity: coerce prep_run_id to the sentinel null unless it matches the
  // safe id charset, so the state block can never carry an injected value.
  const prepId = (typeof prepRunId === 'string' && SAFE_ID_RE.test(prepRunId))
    ? prepRunId
    : null;
  return {
    // CROSS-BATCH CONTRACT: step_1_7.decision stores the RAW BRANCH value (one of
    // BRANCH_VALUES — e.g. 'dispatch-brainstorm'), NOT a canonical gate-decision
    // value. Consumers like the B2 dispatch-guard MUST validate this field
    // against BRANCH_VALUES, never against CANONICAL_DECISIONS — the two
    // vocabularies are distinct (branchToCanonical() maps one to the other).
    decision: branch,
    prep_run_id: prepId,
    timestamp: new Date().toISOString(),
  };
}

// --------------------------------------------------------------------
// recordNoPrepOverride — append a standalone audit line to
// .pipeline/state/no-prep-overrides.jsonl whenever a user explicitly
// opts out of the brainstorm via --no-prep.
//
// WHY a separate file (not gate-decisions.jsonl): a --no-prep opt-out is a
// human governance decision, not a gate outcome. Keeping it in its own audit
// log means an opt-out is NEVER silent and is trivially countable for the
// 2026-06-12 audit follow-up, without polluting the 8-value gate vocabulary.
//
// The gate-decisions side of the same event is written separately by
// appendStep17Routing(branch='no-prep-override') -> SKIPPED. This writer is
// the audit-trail half: it preserves the run/branch/reason CONTEXT that the
// gate-decision `detail` field cannot (it's capped + sanitized to 200 chars).
//
// Reuses the same exclusive-lock atomic-append discipline as the SSOT JSONL
// writers and the same SEC-1 sanitization posture as appendStep17Routing.
// --------------------------------------------------------------------
function recordNoPrepOverride(filePath, opts, ctx) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new TypeError('recordNoPrepOverride: filePath must be a non-empty string');
  }
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError('recordNoPrepOverride: opts must be a plain object');
  }
  // B3-IMP-02 / SEC-RR-1: every other JSONL writer (fidelity-reporter.cjs:371-385,
  // run-log.cjs:143) guards its target path; this one did not. Without it, a caller
  // deriving filePath from env/input has a write-to-arbitrary-path primitive.
  // Mirror the proven pattern: (1) reject RELATIVE paths (same guard as run-log /
  // fidelity-reporter), and (2) reject any path that still contains a `..` traversal
  // segment after resolution — the resolved form must equal its own normalization,
  // so an attacker cannot smuggle `/legit/.pipeline/../../etc/x` past the writer.
  // The caller supplies no root here, so we anchor on the absolute+no-escape
  // invariant rather than a fixed containment root.
  if (!path.isAbsolute(filePath)) {
    throw new Error('recordNoPrepOverride: path-traversal: filePath must be absolute');
  }
  // A legitimate audit-log path never needs a `..` segment. Reject any input that
  // carries one (a traversal primitive like `/legit/.pipeline/../../etc/x`) BEFORE
  // resolution collapses it, so the escape can never be silently honored.
  if (filePath.split(/[\\/]+/).includes('..')) {
    throw new Error('recordNoPrepOverride: path-traversal: filePath must not contain ".." traversal segments');
  }
  const resolvedPath = path.resolve(filePath);
  const c = (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) ? ctx : {};

  // SEC-1 parity: run_id from ctx is coerced to a safe id; reason is free-form
  // but sanitized (ctrl chars stripped, 200-char cap) so an injected payload
  // can never break the JSONL line or smuggle separators.
  const runId = (typeof c.run_id === 'string' && SAFE_ID_RE.test(c.run_id)) ? c.run_id : null;
  const reason = (typeof opts.reason === 'string' && opts.reason.length > 0)
    ? sanitizeDetail(opts.reason)
    : null;
  const decidedBy = (typeof opts.decided_by === 'string' && opts.decided_by.trim().length > 0)
    ? sanitizeDetail(opts.decided_by)
    : 'pipeline-controller';
  // ARCH-B3-001: the no-prep audit file's forensic purpose is to record WHY prep
  // was skipped, so the original task prompt belongs here (distinct from the deny
  // `reason`). Sanitized + capped via the same helper so it can never break the
  // JSONL line or smuggle separators. Absent prompt -> sentinel null.
  const prompt = (typeof opts.prompt === 'string' && opts.prompt.length > 0)
    ? sanitizeDetail(opts.prompt)
    : null;
  const timestamp = (typeof opts.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(opts.timestamp))
    ? opts.timestamp
    : new Date().toISOString();

  const entry = {
    event: 'NO_PREP_OVERRIDE',
    branch: 'no-prep-override',
    run_id: runId,
    type: typeof c.type === 'string' ? c.type : null,
    complexity: typeof c.complexity === 'string' ? c.complexity : null,
    plugin_version: typeof c.plugin_version === 'string' ? c.plugin_version : null,
    schema_version: typeof c.schema_version === 'string' ? c.schema_version : null,
    prompt,
    reason,
    decided_by: decidedBy,
    timestamp,
  };

  // Strict JSON.stringify (never string interpolation) + round-trip guard,
  // appended under an exclusive cross-process lock so concurrent --no-prep
  // writers cannot interleave a half-line.
  let line;
  try {
    line = JSON.stringify(entry);
    JSON.parse(line); // round-trip guard
  } catch (err) {
    throw new Error(`recordNoPrepOverride: serialization failed: ${err.message}`);
  }

  // QUAL-1: on a fresh repo the parent dir (.pipeline/state/) may not exist yet.
  // Create it BEFORE acquiring the lock so the append never throws ENOENT and the
  // --no-prep audit record is never silently lost. Same pattern fidelity-reporter
  // and run-log use. recursive:true is idempotent when the dir already exists.
  try { fs.mkdirSync(path.dirname(resolvedPath), { recursive: true }); } catch { /* best-effort; append will surface a real error */ }

  withLock(resolvedPath, () => {
    fs.appendFileSync(resolvedPath, line + '\n', { encoding: 'utf8' });
  });

  return { ok: true, entry };
}

module.exports = {
  appendStep17Routing,
  recordNoPrepOverride,
  branchToCanonical,
  buildStep17StateBlock,
  BRANCH_VALUES,
  BRANCH_TO_CANONICAL,
};
