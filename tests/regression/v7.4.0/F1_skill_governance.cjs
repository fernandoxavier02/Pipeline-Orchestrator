#!/usr/bin/env node
'use strict';

/**
 * F1 — Skill governance + Cursor manifest parity (v7.4.0).
 *
 * Validates the v7.4.0 doc/metadata release that introduces:
 *   1. references/skill-governance.md — SSOT for skill versioning,
 *      lockstep, progressive disclosure, allowed-tools format, and
 *      pattern adoption history.
 *   2. .cursor-plugin/plugin.json — byte-equivalent mirror of
 *      .claude-plugin/plugin.json so the same plugin can be
 *      installed through the Cursor channel without drift.
 *   3. CLAUDE.md — gains a "Skill governance" section that points
 *      to references/skill-governance.md (governance is discoverable
 *      from the canonical project doc, not buried in a sub-folder).
 *
 * RED-phase expectation (before Phase 2 execution):
 *   - references/skill-governance.md DOES NOT EXIST.
 *   - .cursor-plugin/ directory DOES NOT EXIST.
 *   - CLAUDE.md does not yet contain a "Skill governance" section.
 *   All 5 subcases MUST fail at first run.
 *
 * Scenarios covered (from 03-quality-gate-router.md):
 *   Cenario 1 — Governance doc with 5 mandatory sections.
 *   Cenario 2 — Cursor manifest parity with Claude manifest.
 *   Cenario 3 — CLAUDE.md gains a governance section.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const GOVERNANCE_DOC = path.join(ROOT, 'references', 'skill-governance.md');
const CLAUDE_PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const CURSOR_PLUGIN_JSON = path.join(ROOT, '.cursor-plugin', 'plugin.json');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`);
    fail++;
  }
}

console.log('=== F1 skill governance + Cursor manifest parity (v7.4.0) ===');

// ---------------------------------------------------------------------------
// F1-S1 — references/skill-governance.md exists and is non-empty markdown.
// ---------------------------------------------------------------------------
test('F1-S1: references/skill-governance.md exists and is non-empty markdown', () => {
  assert.ok(
    fs.existsSync(GOVERNANCE_DOC),
    `references/skill-governance.md missing at ${GOVERNANCE_DOC}`
  );
  const content = fs.readFileSync(GOVERNANCE_DOC, 'utf8');
  assert.ok(content.length > 0, 'skill-governance.md is empty');
  // Must look like markdown — at least one top-level heading.
  assert.ok(
    /^#\s+\S/m.test(content),
    'skill-governance.md has no top-level "# Heading" — does not look like markdown'
  );
});

// ---------------------------------------------------------------------------
// F1-S2 — Governance doc contains all 5 required topic markers (case-insens).
// ---------------------------------------------------------------------------
test('F1-S2: governance doc covers all 5 required topics', () => {
  if (!fs.existsSync(GOVERNANCE_DOC)) {
    throw new Error('references/skill-governance.md does not exist (S1 prerequisite)');
  }
  const content = fs.readFileSync(GOVERNANCE_DOC, 'utf8');

  const required = [
    { name: 'semver',                pattern: /semver|semantic\s+versioning|patch.*minor.*major/i },
    { name: 'lockstep',              pattern: /lockstep|lock-step/i },
    { name: 'progressive disclosure', pattern: /progressive\s+disclosure/i },
    { name: 'allowed-tools',         pattern: /allowed[-_ ]?tools/i },
    { name: 'pattern adoption',      pattern: /pattern\s+adoption|adoption\s+(of|log)|adopted\s+vs/i },
  ];

  const missing = required.filter((r) => !r.pattern.test(content)).map((r) => r.name);
  assert.equal(
    missing.length, 0,
    `governance doc missing required topics: ${missing.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// F1-S3 — .cursor-plugin/plugin.json exists, parseable JSON, has required keys.
// ---------------------------------------------------------------------------
test('F1-S3: .cursor-plugin/plugin.json exists, is valid JSON with required keys', () => {
  assert.ok(
    fs.existsSync(CURSOR_PLUGIN_JSON),
    `.cursor-plugin/plugin.json missing at ${CURSOR_PLUGIN_JSON}`
  );
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CURSOR_PLUGIN_JSON, 'utf8'));
  } catch (e) {
    throw new Error(`.cursor-plugin/plugin.json is not valid JSON: ${e.message}`);
  }
  const requiredKeys = ['name', 'version', 'description', 'author', 'license', 'keywords'];
  const missing = requiredKeys.filter((k) => !(k in parsed));
  assert.equal(
    missing.length, 0,
    `.cursor-plugin/plugin.json missing required keys: ${missing.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// F1-S4 — Cursor manifest field parity with Claude manifest.
//   Identical: name, description, author, license, autoDiscover, keywords.
//   version: equal (lockstep).
//   No extraneous keys not present in Claude manifest.
// ---------------------------------------------------------------------------
test('F1-S4: cursor plugin field parity with Claude plugin (lockstep)', () => {
  if (!fs.existsSync(CURSOR_PLUGIN_JSON)) {
    throw new Error('.cursor-plugin/plugin.json does not exist (S3 prerequisite)');
  }
  const claude = JSON.parse(fs.readFileSync(CLAUDE_PLUGIN_JSON, 'utf8'));
  const cursor = JSON.parse(fs.readFileSync(CURSOR_PLUGIN_JSON, 'utf8'));

  const parityFields = ['name', 'description', 'author', 'license', 'autoDiscover', 'keywords'];
  for (const field of parityFields) {
    assert.deepEqual(
      cursor[field], claude[field],
      `field "${field}" differs between cursor and claude manifests`
    );
  }

  // Lockstep version (same release vector).
  assert.equal(
    cursor.version, claude.version,
    `version drift: cursor=${cursor.version} claude=${claude.version} (must be lockstep)`
  );

  // No extra keys in cursor that don't exist in claude.
  const cursorKeys = Object.keys(cursor);
  const claudeKeys = new Set(Object.keys(claude));
  const extra = cursorKeys.filter((k) => !claudeKeys.has(k));
  assert.equal(
    extra.length, 0,
    `cursor manifest has extra keys not present in claude manifest: ${extra.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// F1-S5 — CLAUDE.md gains a "Skill governance" section pointing to the doc.
// ---------------------------------------------------------------------------
test('F1-S5: CLAUDE.md has a "Skill governance" section referencing the SSOT', () => {
  const md = fs.readFileSync(CLAUDE_MD, 'utf8');

  // A heading mentioning "skill governance" (case-insensitive).
  const hasHeading = /^#{1,6}\s+.*skill\s+governance/im.test(md);
  assert.ok(
    hasHeading,
    'CLAUDE.md has no heading mentioning "Skill governance"'
  );

  // The section must point to references/skill-governance.md (the SSOT).
  const hasPointer = /references\/skill-governance\.md/i.test(md);
  assert.ok(
    hasPointer,
    'CLAUDE.md skill-governance section must reference references/skill-governance.md'
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
