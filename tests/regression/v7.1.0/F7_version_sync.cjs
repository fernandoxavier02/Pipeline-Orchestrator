#!/usr/bin/env node
'use strict';

/**
 * F7 — version 7.9.0 declared consistently across plugin.json, package.json,
 * marketplace.json, CLAUDE.md canonical line, and CHANGELOG [7.8.0] header.
 *
 * v7.8.0 (2026-05-26) — Paperclip company provisioner (MINOR).
 * Test rolled forward from prior releases. The same five-file
 * invariant applies: every release MUST bump these surfaces in lockstep, or
 * downstream consumers (marketplace, NPM, vendored installs) will see version
 * drift.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const VERSION = '7.9.3';
const PREV_VERSION = '7.9.2';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log(`=== F7 version ${VERSION} sync across 5 files ===`);

test(`plugin.json version === "${VERSION}"`, () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(j.version, VERSION, `plugin.json version = ${j.version}`);
});

test(`marketplace.json plugin entry version === "${VERSION}" and source.ref === "v${VERSION}"`, () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = (j.plugins || []).find(p => p.name === 'pipeline-orchestrator');
  assert.ok(entry, 'pipeline-orchestrator entry not found in marketplace.json');
  assert.equal(entry.version, VERSION, `marketplace.json version = ${entry.version}`);
  if (entry.source && entry.source.ref) {
    assert.equal(entry.source.ref, `v${VERSION}`, `marketplace.json source.ref = ${entry.source.ref}`);
  }
});

test(`package.json version === "${VERSION}"`, () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(j.version, VERSION, `package.json version = ${j.version}`);
});

test(`CLAUDE.md canonical version line declares ${VERSION}`, () => {
  const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const re = new RegExp(`Atualmente:\\s*\\*\\*${VERSION.replace(/\./g, '\\.')}\\*\\*`);
  assert.ok(re.test(md), `CLAUDE.md must contain "Atualmente: **${VERSION}**"`);
});

test(`CHANGELOG.md has "## [${VERSION}]" header at top of release sections`, () => {
  const md = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const reCurrent = new RegExp(`^##\\s*\\[${VERSION.replace(/\./g, '\\.')}\\]`, 'm');
  const idxCurrent = md.search(reCurrent);
  const idxPrev = md.search(new RegExp(`^##\\s*\\[${PREV_VERSION.replace(/\./g, '\\.')}\\]`, 'm'));
  assert.ok(idxCurrent !== -1, `CHANGELOG.md missing "## [${VERSION}]" section`);
  if (idxPrev !== -1) {
    assert.ok(
      idxCurrent < idxPrev,
      `[${VERSION}] section must appear before [${PREV_VERSION}]`
    );
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
