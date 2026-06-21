'use strict';

// =============================================================================
// lib/contracts/pipeline-agent-result.cjs — T2 (REQ-RESULT-CONTRACT), v8.9.0.
// =============================================================================
// The strict parser for the `=== PIPELINE_AGENT_RESULT_V1 ===` result block an
// agent returns as text. Pure + standalone, wired to NO consumer this iteration
// (REQ-RESULT-ENFORCE is DEFER, Q2). The Agent tool returns free TEXT, not a
// harness-guaranteed object (Part A) — so a parser-side contract is the only
// correct realization of "completion must come from a valid result, never from
// presence/absence heuristics."
//
// HARD RULES (no inference, no YAML, no eval, absence ≠ success):
//   - Parse ONLY the LAST complete, well-formed block (two blocks → last wins).
//   - Size limit: an oversize body is rejected, never truncated-and-accepted.
//   - Exactly one JSON object body, parsed with JSON.parse ONLY (never eval/YAML).
//   - Reject duplicate JSON keys (ambiguous JSON) — JSON.parse silently keeps the
//     last, so duplicates are detected textually and refused.
//   - Reject wrong field types.
//   - Reject unknown governance keys (closed key set).
//   - Closed status vocabulary: completed | awaiting_user_gate | failed.
//   - No block / empty output / malformed → a FAILURE result (absence is never
//     success).
//
// RETURN SHAPE (asserted by the contract test, not inferred):
//   success  → { ok: true,  status: <closed vocab>, ...validated fields }
//   failure  → { ok: false, status: 'failed', error: <reason string> }
// =============================================================================

const BEGIN = '=== PIPELINE_AGENT_RESULT_V1 ===';
const END = '=== END PIPELINE_AGENT_RESULT_V1 ===';

// Reject bodies past this size rather than truncating (S2-4). Generous ceiling
// for a legitimate governance block; a 200 KB blob is well past it.
const MAX_BODY_BYTES = 64 * 1024;

// Closed status vocabulary (S2-13).
const VALID_STATUS = new Set(['completed', 'awaiting_user_gate', 'failed']);

// Closed governance key set. An unknown key is rejected (S2-7). Field types are
// validated for the keys we DO know (S2-6).
//   string   — a plain string
//   array    — an Array
//   object   — a plain object
//   boolean  — a boolean
const KNOWN_KEYS = Object.freeze({
  status: 'string',
  summary: 'string',
  next_agent: 'string',
  findings: 'array',
  evidence: 'array',
  reason: 'string',
  detail: 'string',
  metrics: 'object',
  blocking: 'boolean',
});

function fail(error) {
  return { ok: false, status: 'failed', error: String(error || 'invalid result') };
}

// Extract the body of the LAST complete BEGIN..END block. CRLF-safe: we operate
// on the raw text and locate markers by index, tolerant of \r\n line endings.
function extractLastBlockBody(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let searchFrom = text.length;
  // Find the last END marker, then the nearest BEGIN before it.
  while (true) {
    const endIdx = text.lastIndexOf(END, searchFrom);
    if (endIdx < 0) return null;
    const beginIdx = text.lastIndexOf(BEGIN, endIdx - 1);
    if (beginIdx < 0) return null;
    const body = text.slice(beginIdx + BEGIN.length, endIdx);
    // A complete block found; return its body (trimmed of surrounding EOL/space).
    return body.replace(/^[\s\r\n]+|[\s\r\n]+$/g, '');
  }
}

// Detect duplicate top-level keys textually (S2-5). JSON.parse would silently keep
// the last value, hiding the ambiguity — so we scan the object's top level.
function hasDuplicateTopLevelKey(jsonText) {
  const seen = new Set();
  let i = 0;
  const n = jsonText.length;
  let depth = 0;
  while (i < n) {
    const ch = jsonText[i];
    if (ch === '"') {
      // Read the full string token.
      const start = i + 1;
      let j = start;
      let esc = false;
      while (j < n) {
        const c = jsonText[j];
        if (esc) { esc = false; j += 1; continue; }
        if (c === '\\') { esc = true; j += 1; continue; }
        if (c === '"') break;
        j += 1;
      }
      const token = jsonText.slice(start, j);
      // Is this token a KEY? A key at depth 1 is followed (after optional ws) by ':'.
      if (depth === 1) {
        let k = j + 1;
        while (k < n && /\s/.test(jsonText[k])) k += 1;
        if (jsonText[k] === ':') {
          if (seen.has(token)) return true;
          seen.add(token);
        }
      }
      i = j + 1;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth -= 1;
    i += 1;
  }
  return false;
}

function validateTypes(obj) {
  for (const key of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(KNOWN_KEYS, key)) {
      return `unknown governance key: "${key}"`;
    }
    const expected = KNOWN_KEYS[key];
    const value = obj[key];
    let okType;
    switch (expected) {
      case 'string':  okType = typeof value === 'string'; break;
      case 'boolean': okType = typeof value === 'boolean'; break;
      case 'array':   okType = Array.isArray(value); break;
      case 'object':  okType = value && typeof value === 'object' && !Array.isArray(value); break;
      default:        okType = false;
    }
    if (!okType) return `field "${key}" has wrong type (expected ${expected})`;
  }
  return null;
}

// parseResultBlock(text) → strict result object. NEVER throws.
function parseResultBlock(text) {
  try {
    if (typeof text !== 'string' || text.length === 0) {
      return fail('empty output — absence is never success');
    }
    const body = extractLastBlockBody(text);
    if (body === null) {
      return fail('no PIPELINE_AGENT_RESULT_V1 block found — absence is never success');
    }
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return fail('result block body exceeds size limit — rejected, not truncated');
    }
    // JSON only — never YAML, never eval. A YAML body fails JSON.parse → rejected.
    if (hasDuplicateTopLevelKey(body)) {
      return fail('duplicate JSON key — ambiguous result refused');
    }
    let obj;
    try { obj = JSON.parse(body); }
    catch (e) { return fail(`body is not valid JSON (never YAML/eval): ${e.message}`); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return fail('result body must be a single JSON object');
    }
    const typeErr = validateTypes(obj);
    if (typeErr) return fail(typeErr);
    if (typeof obj.status !== 'string' || !VALID_STATUS.has(obj.status)) {
      return fail(`status "${obj.status}" is outside the closed vocabulary (completed|awaiting_user_gate|failed)`);
    }
    // A well-formed block declaring status:'failed' is a PARSED result whose
    // status is failed — it parsed correctly, so ok:true, status:'failed' (S2-9).
    return Object.assign({ ok: true }, obj);
  } catch (e) {
    // Defense-in-depth: any unexpected error degrades to a failure result, never
    // an uncaught throw, never an inferred success.
    return fail(`parser error: ${e && e.message ? e.message : e}`);
  }
}

module.exports = {
  parseResultBlock,
  VALID_STATUS,
  KNOWN_KEYS,
  MAX_BODY_BYTES,
  BEGIN,
  END,
};
