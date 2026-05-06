#!/usr/bin/env node
'use strict';

/**
 * scripts/validate-trace.cjs
 *
 * Standalone validator for TRACE.md (schema_version=1).
 *
 * Usage:
 *   node scripts/validate-trace.cjs <path-to-TRACE.md>
 *
 * Exit codes:
 *   0 — TRACE.md conforms to schema_version=1
 *   1 — TRACE.md fails schema check; stderr lists missing/malformed fields
 *   2 — invalid invocation (no path, file not found)
 *
 * Pure Node, no external dependencies. Used in CI to gate PRs that include
 * a TRACE.md, and locally by reviewers checking a TRACE without running
 * the pipeline.
 *
 * SSOT for the schema: references/trace-schema/v1.md.
 *
 * Wave 8-spec deliverable for v4.17.0; closes DoD criterion #3.
 */

const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_SCHEMA_VERSION = 1;

// Required header fields (in canonical order, per references/trace-schema/v1.md §4.1).
const REQUIRED_HEADER_FIELDS = [
  'trace_schema_version',
  'timestamp_utc',
  'started_at',
  'ended_at',
  'duration_seconds',
  'plugin_version',
  'user_identity',
  'branch',
  'repo',
  'task',
];

// Required H2 sections (in canonical order).
const REQUIRED_SECTIONS = [
  'Classification',
  'Pipeline Definition',
  'Execution Log',
  'Final Verdict',
];

// Required H3 entries inside Execution Log: at least one phase block.
const PHASE_REGEX = /^### Phase:/m;

function usage(stream = process.stderr, code = 2) {
  stream.write('Usage: validate-trace.cjs <path-to-TRACE.md>\n');
  stream.write('Exit codes: 0=valid, 1=invalid (diff on stderr), 2=bad invocation.\n');
  return code;
}

function parseHeaderFields(content) {
  // Lines like "- field_name: value" before the first H2 heading.
  const fields = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('## ')) break; // header block ends at first H2
    const m = line.match(/^-\s+([a-z_]+)\s*:\s*(.*)$/);
    if (m) {
      fields[m[1]] = m[2].trim();
    }
  }
  return fields;
}

function findSectionPositions(content) {
  // Return {section_name: line_index} for each H2 heading.
  const positions = {};
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m && !line.startsWith('### ')) {
      positions[m[1]] = i;
    }
  });
  return positions;
}

function validate(content) {
  const errors = [];

  // 1. trace_schema_version field present and == 1.
  const fields = parseHeaderFields(content);
  if (!fields.trace_schema_version) {
    errors.push('header: missing field "trace_schema_version" (required)');
  } else {
    const v = parseInt(fields.trace_schema_version, 10);
    if (Number.isNaN(v)) {
      errors.push(`header: trace_schema_version is not numeric (got "${fields.trace_schema_version}")`);
    } else if (v !== SUPPORTED_SCHEMA_VERSION) {
      errors.push(
        `header: unsupported schema_version (got ${v}, this validator supports schema_version=${SUPPORTED_SCHEMA_VERSION})`
      );
    }
  }

  // 2. All required header fields present and non-empty.
  for (const f of REQUIRED_HEADER_FIELDS) {
    if (!fields[f] || fields[f] === '') {
      errors.push(`header: missing or empty field "${f}"`);
    }
  }

  // 3. Required sections appear in canonical order. Section names may have
  // a parenthetical suffix (e.g., "Pipeline Definition (snapshot)") — match
  // by prefix rather than exact equality.
  const positions = findSectionPositions(content);
  const positionByPrefix = (prefix) => {
    for (const [name, idx] of Object.entries(positions)) {
      if (name === prefix || name.startsWith(prefix + ' ') || name.startsWith(prefix + '(')) {
        return idx;
      }
    }
    return undefined;
  };
  let lastIdx = -1;
  for (const section of REQUIRED_SECTIONS) {
    const idx = positionByPrefix(section);
    if (idx === undefined) {
      errors.push(`structure: missing required section "## ${section}"`);
    } else if (idx <= lastIdx) {
      errors.push(`structure: section "## ${section}" appears out of canonical order`);
    } else {
      lastIdx = idx;
    }
  }

  // 4. At least one "### Phase:" entry exists in the Execution Log.
  if (positions['Execution Log'] !== undefined && !PHASE_REGEX.test(content)) {
    errors.push('Execution Log: must contain at least one "### Phase:" entry');
  }

  // 5. If "## Plan Mode" section is present, it must declare its three required fields.
  if (positions['Plan Mode'] !== undefined) {
    const planMode = content.slice(content.indexOf('## Plan Mode'));
    const required = ['plan_mode_skipped', 'plan_override_attempted', 'justification'];
    for (const f of required) {
      if (!new RegExp(`-\\s*${f}\\s*:`).test(planMode)) {
        errors.push(`Plan Mode: missing field "${f}"`);
      }
    }
  }

  return errors;
}

function main(argv) {
  if (argv.length < 1) {
    return usage();
  }
  const target = argv[0];
  let content;
  try {
    content = fs.readFileSync(target, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${target}\n`);
      return 2;
    }
    process.stderr.write(`Error: cannot read ${target}: ${err.message}\n`);
    return 2;
  }

  const errors = validate(content);
  if (errors.length === 0) {
    return 0;
  }

  process.stderr.write(`TRACE.md validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`);
  for (const e of errors) {
    process.stderr.write(`  - ${e}\n`);
  }
  process.stderr.write(`\nSchema reference: references/trace-schema/v1.md (schema_version=${SUPPORTED_SCHEMA_VERSION})\n`);
  return 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { validate, parseHeaderFields, findSectionPositions };
