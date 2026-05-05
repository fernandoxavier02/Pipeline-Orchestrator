#!/usr/bin/env node
/**
 * tests/unit/spec-skills-no-pulsar-refs.test.js
 *
 * Regex grep test verifying zero Pulsar attribution markers remain in any spec skill .md file.
 * Reads every `.md` file under skills/spec-{light,heavy,audit-only}/ (SKILL.md + steps/*.md)
 * and asserts none of the forbidden patterns match.
 *
 * Forbidden patterns (case-insensitive):
 *   /HEAVY_\d/i        — Pulsar HEAVY_NN filename references (e.g. HEAVY_03)
 *   /LIGHT_\d/i        — Pulsar LIGHT_NN filename references (e.g. LIGHT_01)
 *                        NOTE: directory name "spec-light" and prose "LIGHT mode" are FINE —
 *                        this regex requires literal underscore + digit.
 *   /Projeto Pulsar/i  — Pulsar project name in any context
 *   /D:\\Projeto/i     — absolute Windows Pulsar path (escaped: D:\\Projeto)
 *   /source:\s+"Pulsar\//i — frontmatter `source:` attribution field with Pulsar path
 *   /Equivalente a:/i  — Pulsar's "Equivalente a: /command" attribution line
 *
 * Behavior: walks all .md files; on any match, fails the test with the file path,
 * 1-based line number, the matched substring, and the full line for context. A clean
 * pass means all 23 spec skill files (3 SKILL.md + 20 steps) are Pulsar-free.
 *
 * Run: node --test tests/unit/spec-skills-no-pulsar-refs.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');

const SKILL_DIRS = [
  path.join(REPO_ROOT, 'skills', 'spec-light'),
  path.join(REPO_ROOT, 'skills', 'spec-heavy'),
  path.join(REPO_ROOT, 'skills', 'spec-audit-only'),
];

const FORBIDDEN_PATTERNS = [
  { name: 'HEAVY_NN filename ref', regex: /HEAVY_\d/i },
  { name: 'LIGHT_NN filename ref', regex: /LIGHT_\d/i },
  { name: 'Projeto Pulsar', regex: /Projeto Pulsar/i },
  { name: 'D:\\Projeto path', regex: /D:\\Projeto/i },
  { name: 'source: "Pulsar/ frontmatter', regex: /source:\s+"Pulsar\//i },
  { name: 'Equivalente a: attribution', regex: /Equivalente a:/i },
];

// ─── Recursive .md walker ─────────────────────────────────────────────────────

function walkMarkdown(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkMarkdown(full, acc);
    } else if (e.isFile() && full.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

const ALL_MD_FILES = [];
for (const d of SKILL_DIRS) {
  walkMarkdown(d, ALL_MD_FILES);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('discovered at least 23 .md files across 3 spec skills (3 SKILL.md + 20 steps)', () => {
  // Sanity: if we discovered nothing, the assertions below would silently pass.
  assert.ok(
    ALL_MD_FILES.length >= 23,
    `expected at least 23 .md files, found ${ALL_MD_FILES.length}: ${ALL_MD_FILES.map((f) => path.relative(REPO_ROOT, f)).join(', ')}`
  );
});

test('zero Pulsar attribution markers in any spec skill .md file', () => {
  const violations = [];
  for (const file of ALL_MD_FILES) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of FORBIDDEN_PATTERNS) {
        const m = line.match(p.regex);
        if (m) {
          violations.push({
            file: path.relative(REPO_ROOT, file),
            line_number: i + 1,
            pattern: p.name,
            matched: m[0],
            full_line: line.trim().slice(0, 160),
          });
        }
      }
    }
  }
  assert.strictEqual(
    violations.length,
    0,
    `Pulsar attribution markers found:\n${violations
      .map(
        (v) =>
          `  - [${v.pattern}] ${v.file}:${v.line_number} matched "${v.matched}" in: ${v.full_line}`
      )
      .join('\n')}`
  );
});

test('false-positive guard: skill DIRECTORY name "spec-light" must NOT be matched by /LIGHT_\\d/i', () => {
  // The forbidden regex /LIGHT_\d/i requires LIGHT followed by underscore + digit.
  // The directory name "spec-light" and prose "LIGHT mode" / "Light mode" must NOT match.
  // This guard test exists so that future maintainers cannot tighten the regex into one
  // that accidentally rejects legitimate prose without breaking THIS test.
  assert.strictEqual(
    /LIGHT_\d/i.test('spec-light'),
    false,
    'guard: directory name "spec-light" must not match /LIGHT_\\d/i'
  );
  assert.strictEqual(
    /LIGHT_\d/i.test('LIGHT mode'),
    false,
    'guard: prose "LIGHT mode" must not match /LIGHT_\\d/i'
  );
  assert.strictEqual(
    /LIGHT_\d/i.test('Light mode'),
    false,
    'guard: prose "Light mode" must not match /LIGHT_\\d/i'
  );
  // Sanity: confirm the regex DOES catch the real Pulsar form.
  assert.strictEqual(
    /LIGHT_\d/i.test('LIGHT_01_FORMAT_GATE'),
    true,
    'sanity: /LIGHT_\\d/i must match Pulsar filename "LIGHT_01_FORMAT_GATE"'
  );
});
