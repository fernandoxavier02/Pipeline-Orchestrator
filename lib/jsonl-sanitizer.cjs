#!/usr/bin/env node
'use strict';

/**
 * jsonl-sanitizer.cjs — Safe JSONL append utility
 *
 * Implements I5 (Fase I audit): sanitize gate-decisions.jsonl and
 * protocol-events.jsonl entries against B1-005 / H6-001 attacks.
 *
 * Audit B1-005 / H6-001 (2026-05-15) demonstrated that the inline
 * pattern of `echo "{\"detail\":\"$PAYLOAD\"}"` allowed unescaped
 * quotes/newlines in detail to break JSONL parsing. This module
 * provides a safe append API that:
 *
 *   1. Uses strict JSON.stringify (not string interpolation)
 *   2. Truncates `detail` to 200 chars per Inline Invariant 2
 *   3. Strips \n, \r, and \t from detail
 *   4. Validates round-trip parse before writing
 *   5. Appends under an exclusive cross-process file lock (lib/exclusive-lock.cjs,
 *      with stale-orphan recovery) so concurrent writers cannot interleave a line
 *
 * Usage:
 *   const { safeAppendJsonl } = require('./jsonl-sanitizer.cjs');
 *   safeAppendJsonl('/path/to/gate-decisions.jsonl', {
 *     gate: 'SSOT_CONFLICT',
 *     hardness: 'MANDATORY',
 *     phase: '0a',
 *     decision: 'PASS',
 *     decided_by: 'task-orchestrator',
 *     timestamp: new Date().toISOString(),
 *     detail: 'untrusted user-supplied content with "quotes" and \nnewlines',
 *     confidence_impact: 0
 *   });
 *   // → writes exactly one well-formed JSON line with detail sanitized.
 */

const fs = require('node:fs');
const path = require('node:path');
const { withLock } = require('./exclusive-lock.cjs');

const DETAIL_MAX_LEN = 200;
// SSOT (Phase 1, 2026-06-14): the allowed key set (8 base + 5 correlation) now
// lives in lib/contracts/gate-decision.cjs. Re-exported below for backward
// compatibility with any caller that imported it from this module.
const {
  ALLOWED_GATE_DECISION_KEYS,
} = require('./contracts/gate-decision.cjs');
const ALLOWED_PROTOCOL_EVENT_KEYS = Object.freeze([
  'event_id', 'protocol_event_id', 'event', 'phase', 'dispatch_id', 'gate_id', 'plan_id',
  'target_kind', 'target_name', 'timestamp', 'decided_by', 'detail',
  'result', 'findings_count', 'severity_summary', 'violation_type',
  'response', 'would_approve',
]);

/**
 * Sanitize a detail string per Inline Invariant 2.
 * Removes control chars, strips newlines/tabs, truncates to 200.
 */
function sanitizeDetail(value) {
  if (value == null) return null;
  let s = String(value);
  // Strip control chars except space; replace tabs/newlines with single space
  s = s.replace(/[\t\n\r]/g, ' ');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1F\x7F]/g, '');
  // Collapse multiple spaces
  s = s.replace(/  +/g, ' ').trim();
  if (s.length > DETAIL_MAX_LEN) {
    s = s.slice(0, DETAIL_MAX_LEN - 3) + '...';
  }
  return s;
}

/**
 * Validate that the entry only contains allowed keys.
 * Returns { ok, unknownKeys }.
 */
function validateKeys(entry, allowedKeys) {
  const unknownKeys = [];
  for (const key of Object.keys(entry)) {
    if (!allowedKeys.includes(key)) unknownKeys.push(key);
  }
  return { ok: unknownKeys.length === 0, unknownKeys };
}

/**
 * Sanitize an entry: deep-clone, sanitize detail, drop unknown keys.
 */
function sanitizeEntry(entry, kind = 'gate') {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('sanitizeEntry: entry must be a plain object');
  }
  const allowed = kind === 'protocol'
    ? ALLOWED_PROTOCOL_EVENT_KEYS
    : ALLOWED_GATE_DECISION_KEYS;

  const sanitized = {};
  for (const key of Object.keys(entry)) {
    if (!allowed.includes(key)) continue; // silently drop unknown keys
    if (key === 'detail') {
      sanitized[key] = sanitizeDetail(entry[key]);
    } else {
      sanitized[key] = entry[key];
    }
  }
  return sanitized;
}

/**
 * Safe append: strict JSON serialization + round-trip validation + atomic append.
 *
 * @param {string} filePath - absolute path to .jsonl file
 * @param {object} entry - the log entry to append
 * @param {object} opts - { kind: 'gate' | 'protocol' (default 'gate') }
 * @returns {{ ok: boolean, line: string, parsed: object, unknownKeysDropped: string[] }}
 * @throws TypeError on invalid input, Error on filesystem or round-trip failure
 */
function safeAppendJsonl(filePath, entry, opts = {}) {
  const kind = opts.kind || 'gate';
  if (typeof filePath !== 'string' || !filePath) {
    throw new TypeError('safeAppendJsonl: filePath must be a non-empty string');
  }
  const { unknownKeys } = validateKeys(entry, kind === 'protocol'
    ? ALLOWED_PROTOCOL_EVENT_KEYS
    : ALLOWED_GATE_DECISION_KEYS);

  const sanitized = sanitizeEntry(entry, kind);

  let line;
  try {
    line = JSON.stringify(sanitized);
  } catch (err) {
    throw new Error(`safeAppendJsonl: JSON.stringify failed: ${err.message}`);
  }

  // Round-trip validation: must parse back to an equivalent object
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    throw new Error(`safeAppendJsonl: round-trip parse failed: ${err.message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('safeAppendJsonl: round-trip parse did not yield an object');
  }

  // Append under an exclusive cross-process lock so two concurrent writers cannot
  // interleave bytes on a single line. The lock (lib/exclusive-lock.cjs) recovers
  // stale orphans by age, so a crashed writer cannot block future appends. This
  // is what makes the "exclusive lock" promise in the docstring (and in
  // gate-decision-writer.cjs) actually true rather than aspirational.
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    withLock(filePath, () => {
      fs.appendFileSync(filePath, line + '\n', { encoding: 'utf8' });
    });
  } catch (err) {
    throw new Error(`safeAppendJsonl: append failed: ${err.message}`);
  }

  return {
    ok: true,
    line,
    parsed,
    unknownKeysDropped: unknownKeys,
  };
}

module.exports = {
  safeAppendJsonl,
  sanitizeDetail,
  sanitizeEntry,
  validateKeys,
  DETAIL_MAX_LEN,
  ALLOWED_GATE_DECISION_KEYS,
  ALLOWED_PROTOCOL_EVENT_KEYS,
};
