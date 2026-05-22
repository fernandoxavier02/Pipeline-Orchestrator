#!/usr/bin/env node
// =============================================================================
// F1 — Langfuse Vendor Bundle Present (v7.4.2)
// =============================================================================
// Verifies that the three vendored Langfuse runtime packages live in the
// repository at the expected pinned versions, that their primary entry
// points exist, that package.json[dependencies][langfuse] matches the
// vendored copy (divergence guard), and that package.json declares the
// bundledDependencies array exactly.
//
// This is the canary that must run BEFORE any release tag — if anyone
// runs `git clean -fdx node_modules/` before tagging, this test fails
// before the bad tag is pushed.
//
// Mirrors the existing tests/regression/v7.3.0/*.test.cjs framework:
//   - plain Node assert + spawnSync
//   - record(scenario, ok, msg) helper
//   - process.exit(fail === 0 ? 0 : 1)
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const VENDORED = [
  { name: 'langfuse',      pinned: '3.38.4'  },
  { name: 'langfuse-core', pinned: '3.38.20' },
  { name: 'mustache',      pinned: '4.2.0'   },
];

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) {
    pass++;
    results.push(`  [PASS] ${scenario}`);
  } else {
    fail++;
    results.push(`  [FAIL] ${scenario}: ${msg}`);
  }
}

function safeReadJson(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { __error: e.message };
  }
}

console.log('=== F1 Langfuse Vendor Bundle Present (v7.4.2) ===');

// ---------------------------------------------------------------------------
// F1-S1 / F1-S2 / F1-S3 — each vendored package.json exists and declares
// the exact pinned version expected by the v7.4.2 ship contract.
// ---------------------------------------------------------------------------
for (const { name, pinned } of VENDORED) {
  const pkgPath = path.join(ROOT, 'node_modules', name, 'package.json');
  const pkg = safeReadJson(pkgPath);
  const exists = !pkg.__error;
  const versionOk = exists && pkg.version === pinned;
  const scenario = `F1-S(${name}): node_modules/${name}/package.json exists and version === "${pinned}"`;
  const ok = exists && versionOk;
  const why = !exists
    ? `cannot read ${pkgPath}: ${pkg.__error}`
    : `version="${pkg.version}" (expected "${pinned}")`;
  record(scenario, ok, why);
}

// ---------------------------------------------------------------------------
// F1-S4 — langfuse primary entry point exists on disk. Reads the
// "main" field from node_modules/langfuse/package.json to find the
// canonical entry, falling back to lib/index.cjs.js if main is missing.
// ---------------------------------------------------------------------------
{
  const pkgPath = path.join(ROOT, 'node_modules', 'langfuse', 'package.json');
  const pkg = safeReadJson(pkgPath);
  if (pkg.__error) {
    record('F1-S4: node_modules/langfuse main entry resolvable', false, `cannot read package.json: ${pkg.__error}`);
  } else {
    const mainField = typeof pkg.main === 'string' ? pkg.main : 'lib/index.cjs.js';
    const mainPath = path.join(ROOT, 'node_modules', 'langfuse', mainField);
    const ok = fs.existsSync(mainPath);
    record(
      'F1-S4: node_modules/langfuse/<main> exists on disk',
      ok,
      ok ? `main="${mainField}"` : `expected file missing: ${mainPath} (main field="${mainField}")`
    );
  }
}

// ---------------------------------------------------------------------------
// F1-S5 — top-level package.json[dependencies][langfuse] semver matches
// the vendored 3.38.4. Pinned dependencies match exactly; ^/~ ranges must
// at least be satisfied by 3.38.4.
// ---------------------------------------------------------------------------
{
  const topPkg = safeReadJson(path.join(ROOT, 'package.json'));
  if (topPkg.__error) {
    record('F1-S5: package.json[dependencies][langfuse] matches vendored 3.38.4', false, `cannot read root package.json: ${topPkg.__error}`);
  } else {
    const declared = topPkg.dependencies && topPkg.dependencies.langfuse;
    let ok = false;
    let why = `declared="${declared}"`;
    if (typeof declared === 'string') {
      // Strip any leading caret/tilde — for THIS fix we expect pinned exact.
      const stripped = declared.replace(/^[\^~]/, '').trim();
      ok = stripped === '3.38.4';
      if (!ok) why += ' (stripped="' + stripped + '"; expected "3.38.4")';
    } else {
      why = 'dependencies.langfuse is missing or not a string';
    }
    record(
      'F1-S5: package.json[dependencies][langfuse] resolves to "3.38.4" (divergence guard vs vendored copy)',
      ok,
      why
    );
  }
}

// ---------------------------------------------------------------------------
// F1-S6 — top-level package.json[bundledDependencies] contains exactly the
// three vendored packages, no more and no less.
// ---------------------------------------------------------------------------
{
  const topPkg = safeReadJson(path.join(ROOT, 'package.json'));
  if (topPkg.__error) {
    record('F1-S6: package.json[bundledDependencies] === ["langfuse","langfuse-core","mustache"]', false, `cannot read root package.json: ${topPkg.__error}`);
  } else {
    const bd = topPkg.bundledDependencies;
    const expected = ['langfuse', 'langfuse-core', 'mustache'];
    let ok = false;
    let why = `bundledDependencies=${JSON.stringify(bd)}`;
    if (Array.isArray(bd)) {
      const sortedActual = [...bd].sort();
      const sortedExpected = [...expected].sort();
      ok =
        sortedActual.length === sortedExpected.length &&
        sortedActual.every((v, i) => v === sortedExpected[i]);
    } else {
      why = 'bundledDependencies is not an array';
    }
    record(
      'F1-S6: package.json[bundledDependencies] contains exactly ["langfuse","langfuse-core","mustache"]',
      ok,
      why
    );
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
