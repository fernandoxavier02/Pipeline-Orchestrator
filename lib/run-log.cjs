#!/usr/bin/env node
'use strict';

/**
 * run-log.cjs — Cross-run accumulated pipeline log helper.
 *
 * Distinct from per-run `gate-decisions.jsonl`:
 *   - gate-decisions.jsonl lives in {PIPELINE_DOC_PATH}/ and captures every
 *     gate trigger for ONE run.
 *   - run-log.jsonl (this module) lives at <repoRoot>/.pipeline/run-log.jsonl
 *     and captures ONE summary line per completed run, accumulating across
 *     pipeline invocations so trend queries are cheap.
 *
 * Write policy: ONLY this module appends. The pipeline-controller and
 * final-validator are the authorized call sites — subagents never write here
 * directly (same single-writer invariant as gate-decisions.jsonl).
 *
 * Reuses sanitizeDetail from lib/jsonl-sanitizer.cjs to keep the final_decision
 * (and any other free-text field) safe for JSONL round-trip.
 *
 * 12 required fields per spec in references/audit-trail.md:
 *   run_id, timestamp_start, timestamp_end, type, complexity, variant,
 *   total_gates_triggered, total_gates_expected, fidelity_score,
 *   duration_seconds, final_decision, pipeline_doc_path.
 */

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeDetail } = require('./jsonl-sanitizer.cjs');

const RUN_LOG_REL_DIR = '.pipeline';
const RUN_LOG_FILENAME = 'run-log.jsonl';

const REQUIRED_FIELDS = Object.freeze([
  'run_id',
  'timestamp_start',
  'timestamp_end',
  'type',
  'complexity',
  'variant',
  'total_gates_triggered',
  'total_gates_expected',
  'fidelity_score',
  'duration_seconds',
  'final_decision',
  'pipeline_doc_path',
]);

// Free-text-ish fields that benefit from sanitizeDetail (strip newlines, cap
// length, no control chars). Numeric / enum fields are left alone.
const TEXT_FIELDS = new Set(['final_decision', 'pipeline_doc_path', 'run_id']);

// SEC-6: validate enum-like fields. Unknown values are sanitized rather than
// dropped, so callers still see them in the output but free-text attacks are
// neutralized.
const TYPE_ENUM = new Set([
  'Feature', 'Bug Fix', 'Audit', 'User Story', 'UX Simulation', 'Spec',
]);
const COMPLEXITY_ENUM = new Set(['SIMPLES', 'MEDIA', 'COMPLEXA']);

function runLogPath(repoRoot) {
  return path.join(repoRoot, RUN_LOG_REL_DIR, RUN_LOG_FILENAME);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('appendRunLog: entry must be a plain object');
  }
  const out = {};
  for (const field of REQUIRED_FIELDS) {
    let value = entry[field];
    if (TEXT_FIELDS.has(field)) {
      value = sanitizeDetail(value);
    }
    // SEC-6: enum validation. Unknown enum values fall through to
    // sanitizeDetail so they can never carry raw newlines / control chars.
    if (field === 'type') {
      if (typeof value !== 'string' || !TYPE_ENUM.has(value)) {
        value = sanitizeDetail(value);
      }
    }
    if (field === 'complexity') {
      if (typeof value !== 'string' || !COMPLEXITY_ENUM.has(value)) {
        value = sanitizeDetail(value);
      }
    }
    if (field === 'variant') {
      // No enum — but always sanitize so a malicious caller can't inject
      // newlines / control chars through the variant field.
      value = sanitizeDetail(value);
    }
    // Numeric coercion for the numeric fields (so callers can pass "12"
    // safely, but we still write a number).
    if (field === 'total_gates_triggered' || field === 'total_gates_expected'
        || field === 'duration_seconds') {
      if (value == null) value = 0;
      const n = Number(value);
      value = Number.isFinite(n) ? n : 0;
    }
    if (field === 'fidelity_score') {
      if (value === null || value === undefined) {
        value = null;
      } else {
        const n = Number(value);
        value = Number.isFinite(n) ? n : null;
      }
    }
    out[field] = value === undefined ? null : value;
  }
  return out;
}

/**
 * Append one summary line to <repoRoot>/.pipeline/run-log.jsonl.
 * Auto-creates the .pipeline/ directory and the file on first call.
 *
 * @param {string} repoRoot - absolute path to the repository root
 * @param {object} entry - the 12-field summary object
 * @returns {{ ok: boolean, error?: string }}
 */
function appendRunLog(repoRoot, entry) {
  if (typeof repoRoot !== 'string' || !repoRoot) {
    return { ok: false, error: 'appendRunLog: repoRoot must be a non-empty string' };
  }
  // SEC-1: refuse relative paths. Mirrors lib/pipeline-local-parser.cjs:38-51
  // path-traversal guard pattern.
  if (!path.isAbsolute(repoRoot)) {
    return { ok: false, error: 'path-traversal: repoRoot must be absolute' };
  }
  let normalized;
  try {
    normalized = normalizeEntry(entry);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  let line;
  try {
    line = JSON.stringify(normalized);
  } catch (err) {
    return { ok: false, error: `JSON.stringify failed: ${err.message}` };
  }
  // Round-trip parse guard — if the sanitizer left us with anything that does
  // not parse back cleanly, surface the failure rather than write garbage.
  try {
    JSON.parse(line);
  } catch (err) {
    return { ok: false, error: `round-trip parse failed: ${err.message}` };
  }
  const file = runLogPath(repoRoot);
  try {
    ensureDir(file);
  } catch (err) {
    return { ok: false, error: `append failed: ${err.message}` };
  }
  // SEC-5: exclusive file-lock around encode+write so two concurrent
  // appenders cannot interleave bytes on a single line.
  const lockPath = file + '.lock';
  let lockFd = null;
  const MAX_ATTEMPTS = 6; // initial + 5 retries
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      lockFd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (err && err.code === 'EEXIST' && attempt < MAX_ATTEMPTS - 1) {
        // Busy-wait 50ms (no async to keep callers simple).
        const target = Date.now() + 50;
        // eslint-disable-next-line no-empty
        while (Date.now() < target) {}
        continue;
      }
      return { ok: false, error: `append failed: lock acquire: ${err.message}` };
    }
  }
  try {
    fs.appendFileSync(file, line + '\n', { encoding: 'utf8' });
  } catch (err) {
    return { ok: false, error: `append failed: ${err.message}` };
  } finally {
    try { if (lockFd !== null) fs.closeSync(lockFd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
  return { ok: true };
}

/**
 * Read all entries from <repoRoot>/.pipeline/run-log.jsonl.
 * Returns [] when the file does not exist. Malformed lines are skipped
 * silently — the helper never throws on bad input.
 *
 * @param {string} repoRoot - absolute path to the repository root
 * @returns {Array<object>} parsed entries in file order
 */
function readRunLog(repoRoot) {
  if (typeof repoRoot !== 'string' || !repoRoot) return [];
  // SEC-1: reject relative paths. readRunLog is best-effort (returns [] on
  // failure) so we silently bail rather than throwing.
  if (!path.isAbsolute(repoRoot)) return [];
  const file = runLogPath(repoRoot);
  if (!fs.existsSync(file)) return [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        out.push(parsed);
      }
    } catch {
      // Skip malformed line silently.
    }
  }
  return out;
}

module.exports = {
  appendRunLog,
  readRunLog,
  runLogPath,
  REQUIRED_FIELDS,
};
