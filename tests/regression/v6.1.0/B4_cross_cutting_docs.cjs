#!/usr/bin/env node
'use strict';

/**
 * B4 — Cross-cutting documentation contracts for v6.1.0 release.
 *
 * Covers (10 approved scenarios):
 *   B4-S1  MAIN       CHANGELOG.md has [6.1.0] section BEFORE [6.0.0]
 *   B4-S2  MAIN       CHANGELOG [6.1.0] mentions D5, D6, AND D7 by name
 *   B4-S3  MAIN       CHANGELOG [6.1.0] has "Forward dependencies / known limitations" subsection heading
 *   B4-S4  MAIN       CLAUDE.md lineage table has a "v2.1" row
 *   B4-S5  MAIN       plugin.json "version" field is exactly "6.1.0"
 *   B4-S6  REGRESSION CHANGELOG [6.0.0] preserved (MAJOR / 12 CRITICAL findings / 22 gates runtime tested)
 *   B4-S7  REGRESSION CLAUDE.md historical lineage v1.0..v2.0 all present (11 rows)
 *   B4-S8  REGRESSION plugin.json structural fields preserved (name/author/license/keywords)
 *   B4-S9  EDGE       Version "6.1.0" appears in CHANGELOG + CLAUDE.md + plugin.json simultaneously
 *   B4-S10 EDGE       CHANGELOG [6.1.0] header matches Keep-a-Changelog format `## [6.1.0] - YYYY-MM-DD`
 *
 * Production files under test (NOT yet modified for v6.1.0 — main scenarios MUST FAIL):
 *   - CHANGELOG.md
 *   - CLAUDE.md
 *   - .claude-plugin/plugin.json
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const CLAUDE_MD_PATH = path.join(ROOT, 'CLAUDE.md');
const PLUGIN_JSON_PATH = path.join(ROOT, '.claude-plugin/plugin.json');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== B4 cross-cutting docs (CHANGELOG / CLAUDE.md / plugin.json) ===');

// ----- MAIN -----

test('B4-S1 CHANGELOG.md has [6.1.0] section appearing BEFORE [6.0.0]', () => {
  const md = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const idx610 = md.search(/^##\s*\[6\.1\.0\]/m);
  const idx600 = md.search(/^##\s*\[6\.0\.0\]/m);
  assert.ok(idx610 !== -1, 'expected "## [6.1.0]" heading in CHANGELOG.md');
  assert.ok(idx600 !== -1, 'expected "## [6.0.0]" heading in CHANGELOG.md (sanity)');
  assert.ok(idx610 < idx600,
    `[6.1.0] section must appear before [6.0.0] (got idx610=${idx610}, idx600=${idx600})`);
});

test('B4-S2 CHANGELOG [6.1.0] section mentions D5, D6, AND D7 by name', () => {
  const md = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const section = extractChangelogSection(md, '6.1.0');
  assert.ok(section, '[6.1.0] section not found');
  assert.ok(/\bD5\b/.test(section), '[6.1.0] section must mention "D5"');
  assert.ok(/\bD6\b/.test(section), '[6.1.0] section must mention "D6"');
  assert.ok(/\bD7\b/.test(section), '[6.1.0] section must mention "D7"');
});

test('B4-S3 CHANGELOG [6.1.0] has "Forward dependencies / known limitations" subsection', () => {
  const md = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const section = extractChangelogSection(md, '6.1.0');
  assert.ok(section, '[6.1.0] section not found');
  assert.ok(
    /^###\s+Forward dependencies\s*\/\s*known limitations\s*$/mi.test(section),
    'expected "### Forward dependencies / known limitations" subsection in [6.1.0]'
  );
});

test('B4-S4 CLAUDE.md lineage table has a "v2.1" row', () => {
  const md = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  // Lineage rows look like: | v2.1 | YYYY-MM-DD | ... |
  assert.ok(
    /^\|\s*v2\.1\s*\|/m.test(md),
    'expected a "| v2.1 |" row in CLAUDE.md "Versão deste arquivo" lineage table'
  );
});

test('B4-S5 plugin.json "version" field is exactly "6.1.0"', () => {
  const pkg = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
  assert.equal(pkg.version, '6.1.0',
    `expected plugin.json version "6.1.0", got "${pkg.version}"`);
});

// ----- REGRESSION -----

test('B4-S6 CHANGELOG [6.0.0] section preserved (key phrases intact)', () => {
  const md = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const section = extractChangelogSection(md, '6.0.0');
  assert.ok(section, '[6.0.0] section disappeared from CHANGELOG');
  assert.ok(/MAJOR/.test(section), '[6.0.0] section lost "MAJOR" marker');
  assert.ok(/12 CRITICAL findings/.test(section),
    '[6.0.0] section lost "12 CRITICAL findings" phrase');
  assert.ok(/22\/22 gate registry entries exercised in runtime/.test(section)
    || /22 gates runtime/i.test(section)
    || /22\/22\s+gate/i.test(section),
    '[6.0.0] section lost the "22 gates runtime tested" claim');
});

test('B4-S7 CLAUDE.md historical lineage rows v1.0..v2.0 all present (11 rows)', () => {
  const md = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  const expected = ['v1.0', 'v1.1', 'v1.2', 'v1.3', 'v1.4', 'v1.5',
                    'v1.6', 'v1.7', 'v1.8', 'v1.9', 'v2.0'];
  const missing = expected.filter(
    (v) => !new RegExp(`^\\|\\s*${v.replace('.', '\\.')}\\s*\\|`, 'm').test(md)
  );
  assert.equal(missing.length, 0,
    `historical lineage rows missing from CLAUDE.md: ${missing.join(', ')}`);
});

test('B4-S8 plugin.json structural fields preserved (name/author/license/keywords)', () => {
  const pkg = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
  assert.equal(pkg.name, 'pipeline-orchestrator', 'plugin.json "name" changed');
  assert.ok(pkg.author && typeof pkg.author === 'object',
    'plugin.json "author" must remain an object');
  assert.equal(pkg.author.name, 'FX Studio AI', 'plugin.json "author.name" changed');
  assert.equal(pkg.license, 'MIT', 'plugin.json "license" changed');
  assert.ok(Array.isArray(pkg.keywords), 'plugin.json "keywords" must remain an array');
  const expectedKeywords = [
    'pipeline', 'tdd', 'multi-agent', 'orchestration', 'code-quality',
    'adversarial-review', 'batch-execution', 'classification',
    'sentinel', 'audit', 'report-only', 'open-source'
  ];
  for (const kw of expectedKeywords) {
    assert.ok(pkg.keywords.includes(kw),
      `plugin.json "keywords" missing pre-existing entry "${kw}"`);
  }
});

// ----- EDGE -----

test('B4-S9 Version "6.1.0" appears in CHANGELOG + CLAUDE.md + plugin.json simultaneously', () => {
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const claudemd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
  // CHANGELOG: must have a [6.1.0] section heading at the top section.
  assert.ok(/^##\s*\[6\.1\.0\]/m.test(changelog),
    'CHANGELOG.md missing "## [6.1.0]" top section');
  // CLAUDE.md: must declare 6.1.0 as the canonical version line.
  assert.ok(/\*\*6\.1\.0\*\*|`6\.1\.0`|version.*6\.1\.0|Atualmente:\s*\*\*6\.1\.0\*\*/i.test(claudemd),
    'CLAUDE.md must declare 6.1.0 as the canonical "Versão canônica" line');
  // plugin.json: version exactly 6.1.0.
  assert.equal(pkg.version, '6.1.0',
    `plugin.json version must be "6.1.0", got "${pkg.version}"`);
});

test('B4-S10 CHANGELOG [6.1.0] header matches Keep-a-Changelog `## [6.1.0] - YYYY-MM-DD`', () => {
  const md = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  // The line may carry a trailing " — <summary>" tail, but it MUST start with
  // "## [6.1.0] - YYYY-MM-DD".
  assert.ok(
    /^##\s+\[6\.1\.0\]\s+-\s+\d{4}-\d{2}-\d{2}(\s|—|$)/m.test(md),
    'expected Keep-a-Changelog header "## [6.1.0] - YYYY-MM-DD" in CHANGELOG.md'
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

function extractChangelogSection(md, version) {
  // Capture text from "## [<version>]" up to the next "## [" heading.
  const lines = md.split(/\r?\n/);
  const headerRe = new RegExp(`^##\\s*\\[${version.replace(/\./g, '\\.')}\\]`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s*\[/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}
