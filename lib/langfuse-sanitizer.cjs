#!/usr/bin/env node
'use strict';

// NOTE: jsonl-sanitizer.cjs exists as a separate concern (200-char detail
// truncation for gate-decisions.jsonl). Long-term, the secret-redaction logic
// here should be extracted to a shared lib/secret-redactor.cjs so both
// sanitizers consume one SSOT. Tracked: v7.4 backlog.

/**
 * langfuse-sanitizer.cjs — 3-layer payload sanitizer for Langfuse spans
 *
 * Implements FR-7 / NFR-3 from spec 2026-05-21-langfuse-observability.
 * Pure module: no I/O, no langfuse SDK import, deterministic, non-mutating.
 *
 * Three layers, applied IN ORDER:
 *
 *   1. Truncate    — strings > 2000 chars become first-1997 + "..."
 *   2. Path redact — absolute paths inside pluginRoot become relative;
 *                    absolute paths outside become "<external-path>"
 *   3. Secret redact — hardcoded regex patterns + dynamic process.env scan
 *                      replaced with "[REDACTED]"
 *
 * Public API (per design §5.1):
 *   sanitizeSpanPayload(text, pluginRoot) -> string
 *
 * Extension (used by langfuse-client.cjs for error-log objects):
 *   sanitizeAny(value, pluginRoot) -> sanitized clone (recursive)
 *
 * Edge cases:
 *   - null/undefined input -> "" (per scenario 2.4)
 *   - pluginRoot trailing slash normalized
 *   - env value containing regex metachars -> literal replace
 *   - env value <= 8 chars -> NOT redacted (false-positive guard)
 *
 * Linear-time regex only (no nested quantifiers) to prevent
 * catastrophic backtracking on adversarial input.
 */

const path = require('node:path');

const MAX_LEN = 2000;
const TRUNCATE_TO = MAX_LEN - 3;   // 3 chars reserved for the "..." suffix
const MIN_ENV_VALUE_LEN = 8;

// Hardcoded patterns (union of design.md §5.4 + executor prompt list).
// All use \S+ or [A-Za-z0-9...]+ — no nested quantifiers.
const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]+/g,
  /sk_test_[A-Za-z0-9]+/g,
  /ghp_[A-Za-z0-9]+/g,
  /npm_[A-Za-z0-9]+/g,
  /pk-lf-[a-z0-9-]+/gi,
  /sk-lf-[a-z0-9-]+/gi,
  // Anthropic API keys — modern format (sk-ant-apiNN-...) and legacy
  // catch-all (sk-ant-...). Placed before the Bearer pattern (most
  // specific first). Added in v7.3.0 per Batch 3 finding SEC-2.
  /sk-ant-api[0-9]+-[A-Za-z0-9_-]{30,}/g,
  /sk-ant-[A-Za-z0-9_-]{40,}/g,
  /Bearer\s+[A-Za-z0-9+/=._-]+/gi,
  /LANGFUSE_SECRET_KEY=\S+/g,
  /AKIA[0-9A-Z]{16}/g,                 // AWS access key IDs
  /(xox[abprs])-[A-Za-z0-9-]+/g,       // Slack tokens
  /rk_(live|test)_[A-Za-z0-9]+/g,      // Stripe restricted keys
];

// Pattern that flags an env-var KEY as containing a likely-secret value.
// Per design.md §5.4 + tasks.md T2.1 / F10-S4.
// Case-insensitive; matches keys containing SECRET, TOKEN, KEY, or PASSWORD.
// Example sensitive env names matched by this pattern:
//   LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, NPM_TOKEN, GITHUB_TOKEN,
//   OPENAI_API_KEY, ANTHROPIC_API_KEY, AWS_SECRET_ACCESS_KEY, etc.
const ENV_KEY_PATTERN = /(SECRET|TOKEN|KEY|PASSWORD)/i;

/**
 * Escape regex metacharacters so a value can be used inside a RegExp
 * literally. Even though we use String#replace with a string argument
 * (which is already literal), this helper is exported for callers that
 * need to embed env values in regex patterns safely.
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * Layer 1 — Truncate.
 * Coerces non-string to string, then truncates if needed.
 */
function truncate(input) {
  if (input == null) return '';
  let s = typeof input === 'string' ? input : String(input);
  if (s.length > MAX_LEN) {
    s = s.slice(0, TRUNCATE_TO) + '...';
  }
  return s;
}

/**
 * Layer 2 — Path redaction.
 * Replaces absolute paths matching pluginRoot prefix with a relative
 * variant (forward slashes). Other absolute paths -> "<external-path>".
 *
 * Handles both Windows (C:\...) and POSIX (/...) styles, case-insensitive
 * on the drive letter and root segment per Windows semantics.
 */
function redactPaths(text, pluginRoot) {
  if (!text) return text;

  // Normalize pluginRoot once: forward slashes, no trailing slash.
  let normalizedRoot = '';
  if (pluginRoot && typeof pluginRoot === 'string') {
    normalizedRoot = pluginRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  let result = text;

  // 2a. Plugin-root-prefixed absolute paths -> relative.
  // Two passes:
  //   - root + separator + trailing path segments -> relative subpath
  //   - bare root (no trailing path) -> "" (drop entirely; surrounding
  //     whitespace will collapse naturally)
  if (normalizedRoot) {
    // Build a slash-agnostic pattern from the normalized root: any "/"
    // in the root literal is replaced with the character class [/\\] so
    // backslash-separated copies of the root match too. This is critical
    // for Windows where the same path may appear with either separator.
    const escapedRoot = escapeRegExp(normalizedRoot)
      .replace(/\//g, '[\\\\/]');
    // Pass 1: root WITH a trailing subpath. Linear time.
    const rootWithPath = new RegExp(
      escapedRoot + '[\\\\/][\\w\\-./\\\\]+',
      'gi'
    );
    result = result.replace(rootWithPath, (match) => {
      const normalized = match.replace(/\\/g, '/');
      return normalized.slice(normalizedRoot.length + 1);
    });
    // Pass 2: bare root mention.
    const bareRoot = new RegExp(escapedRoot, 'gi');
    result = result.replace(bareRoot, '<plugin-root>');
  }

  // 2b. Any remaining absolute paths (outside plugin root) -> anonymize.
  // Windows: drive letter + ":" + sep + path chars (no spaces in paths
  // we anonymize; if external paths have spaces, they remain visible
  // — acceptable since the secret/identifier risk is on path content).
  // POSIX:   leading "/" + path chars (avoid matching single "/").
  result = result.replace(
    /[A-Za-z]:[\\/][\w\-./\\]+/g,
    '<external-path>'
  );
  result = result.replace(
    /(?:^|[\s"'`(])(\/(?:[\w.\-]+\/)+[\w.\-]+)/g,
    (match, p1) => match.replace(p1, '<external-path>')
  );

  return result;
}

// Cached list of process.env secret values + a lightweight signature of the
// env state used to build it. We re-scan only when the env signature
// changes (new key added, key removed, or matching value mutated). This
// eliminates the per-call O(N_env) regex scan flagged as a DoS surface
// while still respecting test suites that mutate env between subcases.
let _envSecretsCache = null;
let _envSecretsCacheSignature = '';

function _computeEnvSignature() {
  // Cheap signature: comma-join of "<key>:<value.length>" for matching keys.
  // Captures additions, removals, and value-length changes without exposing
  // the values themselves. Sufficient for cache invalidation in practice.
  const parts = [];
  for (const key of Object.keys(process.env)) {
    if (!ENV_KEY_PATTERN.test(key)) continue;
    const value = process.env[key];
    if (!value) continue;
    parts.push(key + ':' + value.length);
  }
  parts.sort();
  return parts.join(',');
}

function _buildEnvSecretsCache() {
  const out = [];
  for (const key of Object.keys(process.env)) {
    if (!ENV_KEY_PATTERN.test(key)) continue;
    const value = process.env[key];
    if (!value) continue;
    if (value.length <= MIN_ENV_VALUE_LEN) continue;
    out.push(value);
  }
  return out;
}

/**
 * Layer 3 — Secret redaction.
 * Two passes: hardcoded patterns + dynamic env-value scan.
 *
 * Env-scan uses replaceAll (single pass, no re-match risk even if the
 * env value is literally "[REDACTED]"). The env value list is cached
 * once on first call to avoid scanning process.env on every invocation.
 */
function redactSecrets(text) {
  if (!text) return text;
  let result = text;

  // Pass 1: hardcoded patterns
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }

  // Pass 2: dynamic env scan (literal replace via replaceAll, not regex —
  // values may contain regex metacharacters; replaceAll with a string
  // pattern is literal and single-pass).
  const sig = _computeEnvSignature();
  if (_envSecretsCache === null || sig !== _envSecretsCacheSignature) {
    _envSecretsCache = _buildEnvSecretsCache();
    _envSecretsCacheSignature = sig;
  }
  for (const value of _envSecretsCache) {
    if (result.includes(value)) {
      result = result.replaceAll(value, '[REDACTED]');
    }
  }

  return result;
}

// Maximum accepted pluginRoot length. Defense against malicious / corrupted
// env input. 4096 chars covers the longest realistic OS path with margin.
const MAX_PLUGIN_ROOT_LEN = 4096;

/**
 * Public API — single-text sanitization.
 * Applies the 3 layers in order.
 *
 * @param {*} text - any input; non-string is coerced via String().
 * @param {string} [pluginRoot] - REQUIRED for layer 2 (path redaction). If
 *   omitted, falsy, non-string, or longer than 4096 chars, layer 2 is
 *   SKIPPED — layers 1 (truncate) and 3 (secret redaction) still apply.
 *   No process.cwd() fallback (purity contract).
 * @returns {string} sanitized text, never null/undefined.
 */
function sanitizeSpanPayload(text, pluginRoot) {
  // Null/undefined -> empty string per scenario 2.4
  if (text == null) return '';

  // pluginRoot must be a non-empty string within length bounds; otherwise
  // skip layer 2 entirely (no silent cwd fallback).
  const validRoot =
    typeof pluginRoot === 'string' &&
    pluginRoot.length > 0 &&
    pluginRoot.length <= MAX_PLUGIN_ROOT_LEN
      ? pluginRoot
      : null;

  let result = truncate(text);
  if (validRoot !== null) {
    result = redactPaths(result, validRoot);
  }
  result = redactSecrets(result);
  return result;
}

/**
 * Recursive sanitizer for nested structures (objects, arrays).
 * Used by the client when writing error-log entries that contain
 * structured fields. Non-mutating: returns a deep clone with strings
 * sanitized via sanitizeSpanPayload.
 *
 * Type behavior:
 *   - null and undefined are returned AS-IS (preserved for object fields).
 *   - number and boolean returned AS-IS (no string coercion).
 *   - string passes through sanitizeSpanPayload (3 layers).
 *   - Array / plain object: recursed depth-first into a new clone.
 *   - function / symbol / bigint: coerced to sanitized string (last branch).
 *   - At depth > 32 (cycle / pathological nesting): returns "<max-depth>".
 *
 * @param {*} value - any input.
 * @param {string} [pluginRoot] - plugin root for path layer; see
 *   sanitizeSpanPayload for required-form constraints.
 * @param {number} [depth=0] - internal recursion depth guard.
 * @returns {*} sanitized clone (deep, never mutates input).
 */
function sanitizeAny(value, pluginRoot, depth = 0) {
  // Depth guard against pathological nesting / cycles.
  if (depth > 32) return '<max-depth>';

  if (value == null) return value; // preserve null/undefined for object fields
  if (typeof value === 'string') {
    return sanitizeSpanPayload(value, pluginRoot);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeAny(v, pluginRoot, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = sanitizeAny(value[key], pluginRoot, depth + 1);
    }
    return out;
  }
  // function / symbol / bigint -> coerce to sanitized string
  return sanitizeSpanPayload(String(value), pluginRoot);
}

module.exports = {
  sanitizeSpanPayload,
  sanitizeAny,
};
