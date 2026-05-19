#!/usr/bin/env node
'use strict';

/**
 * F7 — version 7.1.0 declared consistently across plugin.json, package.json,
 * marketplace.json, CLAUDE.md canonical line, and CHANGELOG [7.1.0] header.
 *
 * EXPECTED RED STATE: still on 7.0.0 across the board.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F7 (release sync).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F7 version 7.1.0 sync across 5 files ===');

test('plugin.json version === "7.1.0"', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(j.version, '7.1.0', `plugin.json version = ${j.version}`);
});

test('marketplace.json plugin entry version === "7.1.0" and source.ref === "v7.1.0"', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = (j.plugins || []).find(p => p.name === 'pipeline-orchestrator');
  assert.ok(entry, 'pipeline-orchestrator entry not found in marketplace.json');
  assert.equal(entry.version, '7.1.0', `marketplace.json version = ${entry.version}`);
  if (entry.source && entry.source.ref) {
    assert.equal(entry.source.ref, 'v7.1.0', `marketplace.json source.ref = ${entry.source.ref}`);
  }
});

test('package.json version === "7.1.0"', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(j.version, '7.1.0', `package.json version = ${j.version}`);
});

test('CLAUDE.md canonical version line declares 7.1.0', () => {
  const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.ok(
    /Atualmente:\s*\*\*7\.1\.0\*\*/.test(md),
    'CLAUDE.md must contain "Atualmente: **7.1.0**"'
  );
});

test('CHANGELOG.md has "## [7.1.0]" header at top of release sections', () => {
  const md = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const idx710 = md.search(/^##\s*\[7\.1\.0\]/m);
  const idx700 = md.search(/^##\s*\[7\.0\.0\]/m);
  assert.ok(idx710 !== -1, 'CHANGELOG.md missing "## [7.1.0]" section');
  assert.ok(idx710 < idx700, '[7.1.0] section must appear before [7.0.0]');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
