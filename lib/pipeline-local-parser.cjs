#!/usr/bin/env node
'use strict';

/**
 * pipeline-local-parser.cjs — Strict parser for .claude/pipeline.local.md
 *
 * Implements I6 (Fase I audit): mitigate H6-002 (pipeline.local.md prompt injection).
 *
 * Audit H6-002 (2026-05-15) demonstrated that .claude/pipeline.local.md was
 * loaded by the LLM controller as configuration data with no parser
 * enforcement. A malicious file could inject:
 *   - Shell commands via build_command/test_command (RCE)
 *   - Extra YAML keys that the LLM might honor as instructions
 *   - Prose body that the LLM might interpret as directives
 *
 * Inline Invariant 1 in commands/pipeline.md promises that only 5 keys are
 * parsed and prose is ignored. This module ENFORCES that contract mechanically:
 *
 *   1. Parses ONLY the YAML frontmatter (between leading `---` lines)
 *   2. Whitelists 5 allowed keys: doc_path, build_command, test_command,
 *      spec_path, patterns_file
 *   3. Type-checks each value (must be string)
 *   4. Rejects shell metacharacters in command fields (sandbox)
 *   5. Normalizes path values (no traversal, no absolute outside cwd)
 *   6. Returns structured result with violations enumerated
 *
 * The LLM controller should consume the RESULT of this parser, not the raw
 * file content. Body content is discarded entirely.
 */

const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_KEYS = Object.freeze([
  'doc_path',
  'build_command',
  'test_command',
  'spec_path',
  'patterns_file',
]);

// Shell metacharacters that suggest command injection / chaining.
// `build_command` and `test_command` may legitimately contain spaces,
// but NOT `;`, `&`, `|`, `` ` ``, `$`, `>`, `<`, newline, or quotes.
const SHELL_INJECTION_PATTERN = /[;&|`$><\n\r"'\\]/;

// Allowed path: no `..`, no absolute paths starting with / or drive letter,
// only alphanumeric + `_`, `-`, `/`, `.`.
const SAFE_PATH_PATTERN = /^[A-Za-z0-9_./-]+$/;
const PATH_TRAVERSAL_PATTERN = /\.\.(?:[/\\]|$)/;

/**
 * Extract YAML frontmatter block from a .md file.
 * Returns the raw frontmatter string (without delimiters) or null if absent.
 */
function extractFrontmatter(rawContent) {
  if (typeof rawContent !== 'string') return null;
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match ? match[1] : null;
}

/**
 * Naïve YAML key-value parser for flat scalar maps.
 * Handles only `key: value` and `key: "quoted value"` lines.
 * Anything more complex (lists, nested maps, anchors) is REJECTED on purpose
 * — config files should be flat.
 */
function parseFlatYaml(frontmatterText) {
  const out = {};
  const violations = [];
  const lines = frontmatterText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) {
      violations.push({ kind: 'unparseable_line', line_no: i + 1, content: line });
      continue;
    }
    let [_, key, rawValue] = m;
    rawValue = rawValue.trim();
    // Strip surrounding quotes if present
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      rawValue = rawValue.slice(1, -1);
    }
    if (key in out) {
      violations.push({ kind: 'duplicate_key', key, line_no: i + 1 });
      continue;
    }
    out[key] = rawValue;
  }
  return { parsed: out, violations };
}

/**
 * Validate a command field — must not contain shell metacharacters.
 */
function validateCommandValue(key, value) {
  if (typeof value !== 'string') {
    return { ok: false, reason: 'value must be a string' };
  }
  if (SHELL_INJECTION_PATTERN.test(value)) {
    return { ok: false, reason: `shell metacharacter detected in ${key}` };
  }
  if (value.length > 500) {
    return { ok: false, reason: `${key} exceeds 500 char limit` };
  }
  return { ok: true };
}

/**
 * Validate a path field — no traversal, no absolute, safe chars only.
 */
function validatePathValue(key, value) {
  if (typeof value !== 'string') {
    return { ok: false, reason: 'value must be a string' };
  }
  if (PATH_TRAVERSAL_PATTERN.test(value)) {
    return { ok: false, reason: `path traversal detected in ${key}` };
  }
  if (path.isAbsolute(value)) {
    return { ok: false, reason: `${key} must be relative` };
  }
  if (!SAFE_PATH_PATTERN.test(value)) {
    return { ok: false, reason: `${key} contains unsafe characters` };
  }
  return { ok: true };
}

/**
 * Parse and sandbox a pipeline.local.md file.
 *
 * Returns:
 *   {
 *     ok: boolean,
 *     config: { doc_path?, build_command?, test_command?, spec_path?, patterns_file? },
 *     violations: [{ kind, key?, reason?, line_no?, content? }],
 *     dropped_keys: string[],
 *     dropped_body_chars: number,
 *   }
 *
 * Even if violations exist, partial `config` may still be returned with
 * safe fields. Controller should refuse to use ANY field if violations
 * include `shell_injection` or `path_traversal`.
 */
function parsePipelineLocal(rawContent) {
  const result = {
    ok: true,
    config: {},
    violations: [],
    dropped_keys: [],
    dropped_body_chars: 0,
  };

  if (typeof rawContent !== 'string') {
    result.ok = false;
    result.violations.push({ kind: 'invalid_input', reason: 'rawContent must be string' });
    return result;
  }

  const frontmatter = extractFrontmatter(rawContent);
  if (!frontmatter) {
    result.ok = false;
    result.violations.push({ kind: 'no_frontmatter' });
    return result;
  }

  // Discard body (everything after second `---`)
  const bodyStart = rawContent.indexOf('---', 3);
  if (bodyStart !== -1) {
    const body = rawContent.slice(rawContent.indexOf('---', bodyStart + 3) + 3 || rawContent.length);
    result.dropped_body_chars = Math.max(0, body.length);
  }

  const { parsed, violations: yamlViolations } = parseFlatYaml(frontmatter);
  result.violations.push(...yamlViolations);

  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_KEYS.includes(key)) {
      result.dropped_keys.push(key);
      continue;
    }
    const value = parsed[key];
    const isCommand = key.endsWith('_command');
    const validator = isCommand ? validateCommandValue : validatePathValue;
    const check = validator(key, value);
    if (!check.ok) {
      result.violations.push({ kind: isCommand ? 'shell_injection' : 'path_traversal', key, reason: check.reason });
      result.ok = false;
      continue;
    }
    result.config[key] = value;
  }

  return result;
}

/**
 * Convenience: read file from disk and parse.
 */
function parsePipelineLocalFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, config: {}, violations: [{ kind: 'file_not_found', path: filePath }], dropped_keys: [], dropped_body_chars: 0 };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return parsePipelineLocal(raw);
}

module.exports = {
  parsePipelineLocal,
  parsePipelineLocalFile,
  extractFrontmatter,
  validateCommandValue,
  validatePathValue,
  ALLOWED_KEYS,
};
