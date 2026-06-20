#!/usr/bin/env node
'use strict';

// =============================================================================
// F9 (v8.8.0) — B6: version bump to 8.8.0 across the lockstep surfaces
// (AUDIT-005).
//
// TDD RED phase. The five user-APPROVED B6 scenarios as labeled sub-checks.
//
// ----------------------------------------------------------------------------
// EXPECTED RED SPLIT — read before running.
// ----------------------------------------------------------------------------
// The repo currently declares 8.7.0 across the version surfaces. B6 bumps them
// to 8.8.0 in lockstep, updates the existing F7 version-sync test (VERSION=8.8.0,
// PREV=8.7.0), and documents a [8.8.0] CHANGELOG section. All B6 checks below are
// NEW-BEHAVIOR: they assert the POST-bump end state and so FAIL now (the surfaces
// still read 8.7.0) — valid RED on assertions, not load errors.
//
//   B6-MAIN    every VERIFIED lockstep surface reads 8.8.0
//   B6-REG-1   F7 version-sync test is pinned to 8.8.0 (VERSION + PREV constants)
//   B6-REG-2   CHANGELOG has a [8.8.0] section
//   B6-EDGE-1  no VERIFIED lockstep surface still reads 8.7.0 (partial bump = ship-blocker)
//   B6-EDGE-2  the F7 test is genuinely pinned to 8.8.0 (not a no-op)
//
// SURFACE SET — important honesty note. The 05-router scenario lists nine files,
// three of which (commands/help.md, references/skill-governance.md,
// references/team-registry.md) do NOT currently carry the canonical plugin
// version (help.md + team-registry have no version token at all; skill-governance
// pins older per-skill versions like 7.4.0, not the plugin version). Asserting a
// hard "8.8.0" into those would invent a contract the repo never had. So this
// test anchors B6-MAIN/EDGE-1 on the VERIFIED lockstep surfaces (the same set the
// shipping gate F7_version_sync enforces) and probes the three soft files only
// DEFENSIVELY: if a soft file happens to contain the OLD plugin version 8.7.0, it
// must move to 8.8.0; if it carries no plugin-version token, it is not asserted.
// This keeps the test faithful to the real lockstep contract.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const VERSION = '8.8.0';
const PREV = '8.7.0';

function read(p) { return fs.readFileSync(p, 'utf8'); }
function readJSON(p) { return JSON.parse(read(p)); }

// VERIFIED lockstep surfaces — each returns the version string it currently
// declares (or throws a descriptive error if the surface shape is unexpected).
const VERIFIED_SURFACES = {
  '.claude-plugin/plugin.json': () => readJSON(path.join(ROOT, '.claude-plugin/plugin.json')).version,
  '.cursor-plugin/plugin.json': () => readJSON(path.join(ROOT, '.cursor-plugin/plugin.json')).version,
  'package.json': () => readJSON(path.join(ROOT, 'package.json')).version,
  '.claude-plugin/marketplace.json (entry.version)': () => {
    const j = readJSON(path.join(ROOT, '.claude-plugin/marketplace.json'));
    const e = (j.plugins || []).find((p) => p.name === 'pipeline-orchestrator');
    assert.ok(e, 'pipeline-orchestrator entry not found in marketplace.json');
    return e.version;
  },
  'lib/index.cjs (version: \'…\')': () => {
    const m = read(path.join(ROOT, 'lib/index.cjs')).match(/version:\s*['"]([^'"]+)['"]/);
    assert.ok(m, 'lib/index.cjs must declare a version string');
    return m[1];
  },
  'CLAUDE.md (Atualmente: **…**)': () => {
    const m = read(path.join(ROOT, 'CLAUDE.md')).match(/Atualmente:\s*\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/);
    assert.ok(m, 'CLAUDE.md must declare a canonical "Atualmente: **x.y.z**" version');
    return m[1];
  },
  'README.md (version badge)': () => {
    const m = read(path.join(ROOT, 'README.md')).match(/badge\/version-([0-9]+\.[0-9]+\.[0-9]+)-/);
    assert.ok(m, 'README.md must carry a version badge');
    return m[1];
  },
};

// Soft surfaces from the 05-router list that do NOT today carry the plugin
// version. Probed defensively (see header). Returns the OLD-version token if
// present, else null.
const SOFT_SURFACES = {
  'commands/help.md': () => read(path.join(ROOT, 'commands/help.md')),
  'references/skill-governance.md': () => read(path.join(ROOT, 'references/skill-governance.md')),
  'references/team-registry.md': () => read(path.join(ROOT, 'references/team-registry.md')),
};

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F9 v8.8.0 — B6 version bump to 8.8.0 (RED: all NEW, surfaces still at 8.7.0) ===');

// ---- B6-MAIN [NEW] every verified surface reads 8.8.0 ----------------------
test('B6-MAIN [NEW] every VERIFIED lockstep surface reports version 8.8.0', () => {
  const wrong = [];
  for (const [name, get] of Object.entries(VERIFIED_SURFACES)) {
    let v;
    try { v = get(); } catch (e) { wrong.push(`${name} → ERROR: ${e.message}`); continue; }
    if (v !== VERSION) wrong.push(`${name} → ${v}`);
  }
  assert.equal(wrong.length, 0, `surfaces not at ${VERSION}:\n    ${wrong.join('\n    ')}`);
});

// ---- B6-REG-1 [NEW] F7 version-sync test pinned to 8.8.0 -------------------
test('B6-REG-1 [NEW] tests/regression/v7.1.0/F7_version_sync.cjs constants are VERSION=8.8.0 and PREV_VERSION=8.7.0', () => {
  const f7 = read(path.join(ROOT, 'tests/regression/v7.1.0/F7_version_sync.cjs'));
  const mV = f7.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  const mP = f7.match(/const\s+PREV_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(mV, 'F7 must declare a VERSION constant');
  assert.ok(mP, 'F7 must declare a PREV_VERSION constant');
  assert.equal(mV[1], VERSION, `F7 VERSION must be ${VERSION} (got ${mV[1]})`);
  assert.equal(mP[1], PREV, `F7 PREV_VERSION must be ${PREV} (got ${mP[1]})`);
});

// ---- B6-REG-2 [NEW] CHANGELOG has a [8.8.0] section ------------------------
test('B6-REG-2 [NEW] CHANGELOG.md has a "## [8.8.0]" section', () => {
  const md = read(path.join(ROOT, 'CHANGELOG.md'));
  assert.match(md, /^##\s*\[8\.8\.0\]/m, 'CHANGELOG.md must contain a "## [8.8.0]" release section');
});

// ---- B6-EDGE-1 [NEW] no verified surface still reads 8.7.0 -----------------
test('B6-EDGE-1 [NEW] no VERIFIED lockstep surface still reads 8.7.0 (a partial bump is a ship-blocker)', () => {
  const stillOld = [];
  for (const [name, get] of Object.entries(VERIFIED_SURFACES)) {
    let v;
    try { v = get(); } catch { continue; }
    if (v === PREV) stillOld.push(name);
  }
  assert.equal(stillOld.length, 0, `still at ${PREV}: [${stillOld.join(', ')}]`);

  // Defensive soft-surface probe: a soft file that DID carry the old plugin
  // version must not keep it. Files with no plugin-version token are not asserted.
  const softStale = [];
  for (const [name, get] of Object.entries(SOFT_SURFACES)) {
    let body;
    try { body = get(); } catch { continue; }
    // Only flag the EXACT old plugin version token; ignore unrelated per-skill versions.
    if (new RegExp(`\\b${PREV.replace(/\./g, '\\.')}\\b`).test(body)
        && !new RegExp(`\\b${VERSION.replace(/\./g, '\\.')}\\b`).test(body)) {
      softStale.push(name);
    }
  }
  assert.equal(softStale.length, 0,
    `soft surface(s) still reference the old plugin version ${PREV} without ${VERSION}: [${softStale.join(', ')}]`);
});

// ---- B6-EDGE-2 [NEW] F7 is genuinely pinned to 8.8.0 (not a no-op) ----------
test('B6-EDGE-2 [NEW] the F7 test is genuinely pinned to 8.8.0 (it would fail if VERSION were left at 8.7.0)', () => {
  // Read the F7 source and confirm its asserted constant is literally 8.8.0, so
  // the guard is real (a test pinned to 8.7.0 would silently pass against an
  // un-bumped repo). This is the meta-assertion the scenario asks for.
  const f7 = read(path.join(ROOT, 'tests/regression/v7.1.0/F7_version_sync.cjs'));
  assert.doesNotMatch(f7, /const\s+VERSION\s*=\s*['"]8\.7\.0['"]/,
    'F7 VERSION must NOT still be the old 8.7.0 (that would make F7 a no-op against an un-bumped repo)');
  assert.match(f7, /const\s+VERSION\s*=\s*['"]8\.8\.0['"]/,
    'F7 VERSION must be literally 8.8.0');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (all are [NEW]; expected RED until the 8.8.0 bump lands):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
