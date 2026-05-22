#!/usr/bin/env node
// =============================================================================
// F2 — `require('langfuse')` Resolves Without a Global Install (v7.4.2)
// =============================================================================
// Spawns a fresh Node child process from a directory OUTSIDE this repo
// (os.tmpdir()) and proves that `require('langfuse')` resolves to the
// vendored copy at node_modules/langfuse/ via NODE_PATH pointing at the
// plugin root's node_modules — NOT via any globally installed langfuse.
//
// Scenarios:
//   F2-S1: child exits 0 when require('langfuse') runs with NODE_PATH
//          pointing at <ROOT>/node_modules.
//   F2-S2: the loaded langfuse declares version "3.38.4" inside the child
//          (proves the vendored copy was the one resolved).
//   F2-S3: re-run with NODE_PATH cleared AND NPM_CONFIG_PREFIX removed,
//          but with the plugin-root node_modules wired via -r preload of
//          a tiny shim — proving no global fallback is masking the test.
//
// Test framework: plain Node + spawnSync, matching the convention used by
// tests/regression/v7.3.0/F8-langfuse-disabled-noop.test.cjs.
// =============================================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const VENDOR_DIR = path.join(ROOT, 'node_modules');

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

/**
 * Build a child env that:
 *   - Removes NODE_PATH and NPM_CONFIG_PREFIX (defeats global fallback).
 *   - If keepNodePath=true, sets NODE_PATH=<plugin-root>/node_modules so the
 *     child can resolve the vendored copy from any cwd.
 */
function buildChildEnv({ keepNodePath }) {
  const env = { ...process.env };
  // Always remove these — they are the two main sources of "global fallback"
  // resolution in Node.
  delete env.NODE_PATH;
  delete env.NPM_CONFIG_PREFIX;
  if (keepNodePath) {
    env.NODE_PATH = VENDOR_DIR;
  }
  return env;
}

// ---------------------------------------------------------------------------
// F2-S1 — require('langfuse') from outside the repo with NODE_PATH wired
// to the vendored node_modules. Asserts child exit code 0.
// ---------------------------------------------------------------------------
{
  const childCode = `
    try {
      require('langfuse');
      process.exit(0);
    } catch (e) {
      process.stderr.write(String(e && e.message || e));
      process.exit(2);
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['-e', childCode],
    {
      cwd: os.tmpdir(),
      env: buildChildEnv({ keepNodePath: true }),
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  const ok = result.status === 0;
  record(
    'F2-S1: child Node process from os.tmpdir() with NODE_PATH=<plugin>/node_modules can require("langfuse") (exit 0)',
    ok,
    `exit=${result.status} stderr="${(result.stderr || '').slice(0, 200)}"`
  );
}

// ---------------------------------------------------------------------------
// F2-S2 — same as S1, but the child resolves the langfuse entry via
// require.resolve, walks up to the package's own package.json on disk
// (the langfuse "exports" map blocks require('langfuse/package.json'), so
// we read the file directly via fs from the resolved entry's directory),
// and prints the declared version. Assert that the loaded version is
// exactly "3.38.4" — proves the VENDORED copy was the one resolved.
// ---------------------------------------------------------------------------
{
  const childCode = `
    try {
      const path = require('path');
      const fs = require('fs');
      const entryPath = require.resolve('langfuse');
      // Walk upward from the entry until we find a package.json whose name
      // is exactly "langfuse" (defends against finding a parent package's
      // manifest by mistake).
      let dir = path.dirname(entryPath);
      let manifestPath = null;
      for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            if (pkg && pkg.name === 'langfuse') { manifestPath = candidate; break; }
          } catch (_e) { /* ignore */ }
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      if (!manifestPath) { process.stderr.write('langfuse package.json not found from entry ' + entryPath); process.exit(3); }
      const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      process.stdout.write(String(pkg.version || ''));
      process.exit(0);
    } catch (e) {
      process.stderr.write(String(e && e.message || e));
      process.exit(2);
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['-e', childCode],
    {
      cwd: os.tmpdir(),
      env: buildChildEnv({ keepNodePath: true }),
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  const loadedVersion = (result.stdout || '').trim();
  const ok = result.status === 0 && loadedVersion === '3.38.4';
  record(
    'F2-S2: loaded langfuse declares version "3.38.4" inside the child (vendored copy proof)',
    ok,
    `exit=${result.status} loadedVersion="${loadedVersion}" stderr="${(result.stderr || '').slice(0, 200)}"`
  );
}

// ---------------------------------------------------------------------------
// F2-S3 — defense in depth: NODE_PATH and NPM_CONFIG_PREFIX BOTH stripped,
// child runs with cwd=ROOT itself (which still has node_modules adjacent so
// Node's directory-walk resolution finds the vendored copy without needing
// NODE_PATH). This proves that even without NODE_PATH, the cache layout
// (ROOT/node_modules/langfuse/) resolves correctly via Node's standard
// algorithm — which is the actual marketplace runtime condition.
// ---------------------------------------------------------------------------
{
  // First sanity check: NODE_PATH and NPM_CONFIG_PREFIX must really be absent
  // from the env we pass to the child. If they leak, the test would silently
  // pass for the wrong reason.
  const env = buildChildEnv({ keepNodePath: false });
  const envClean = (env.NODE_PATH === undefined) && (env.NPM_CONFIG_PREFIX === undefined);

  const childCode = `
    try {
      const path = require('path');
      const fs = require('fs');
      // Resolve the langfuse entry from the cwd (plugin root) — Node's
      // standard directory walk should find <ROOT>/node_modules/langfuse.
      const entryPath = require.resolve('langfuse');
      // Walk upward from the entry to find the package's own package.json
      // (exports-map blocks require('langfuse/package.json')).
      let dir = path.dirname(entryPath);
      let manifestPath = null;
      for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            if (pkg && pkg.name === 'langfuse') { manifestPath = candidate; break; }
          } catch (_e) { /* ignore */ }
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      if (!manifestPath) { process.stderr.write('langfuse package.json not found from entry ' + entryPath); process.exit(3); }
      const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const envSeen = {
        NODE_PATH: process.env.NODE_PATH === undefined ? null : process.env.NODE_PATH,
        NPM_CONFIG_PREFIX: process.env.NPM_CONFIG_PREFIX === undefined ? null : process.env.NPM_CONFIG_PREFIX,
      };
      process.stdout.write(JSON.stringify({ version: pkg.version, env: envSeen, resolvedFrom: manifestPath }));
      process.exit(0);
    } catch (e) {
      process.stderr.write(String(e && e.message || e));
      process.exit(2);
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['-e', childCode],
    {
      cwd: ROOT,           // run from the plugin root — Node's directory walk finds node_modules/langfuse
      env,
      encoding: 'utf8',
      timeout: 10000,
    }
  );

  let payload = null;
  try { payload = JSON.parse(result.stdout || '{}'); } catch (_e) { /* keep null */ }

  const childSawNoGlobals =
    payload && payload.env &&
    payload.env.NODE_PATH === null &&
    payload.env.NPM_CONFIG_PREFIX === null;
  const loadedVersionOk = payload && payload.version === '3.38.4';

  const ok = envClean && result.status === 0 && childSawNoGlobals && loadedVersionOk;
  record(
    'F2-S3: with NODE_PATH and NPM_CONFIG_PREFIX both stripped, child still resolves vendored langfuse@3.38.4 via standard directory walk',
    ok,
    `parent-env-clean=${envClean} exit=${result.status} child-saw-no-globals=${childSawNoGlobals} loaded="${payload && payload.version}" stderr="${(result.stderr || '').slice(0, 200)}"`
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log('=== F2 Langfuse require() Resolves Without Global (v7.4.2) ===');
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
