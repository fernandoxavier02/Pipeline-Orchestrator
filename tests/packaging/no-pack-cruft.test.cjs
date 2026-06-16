#!/usr/bin/env node
'use strict';

/**
 * v8.0.2 packaging guard — the published npm artifact MUST contain no runtime
 * cruft. v8.0.1 shipped commands/.pipeline/sessions/<uuid>.lock (a per-machine
 * runtime session lock) because package.json files[] whitelists "commands/"
 * wholesale and the unanchored `.pipeline/` .npmignore line was not honored for
 * a nested occurrence under a whitelisted dir. This test fails the release gate
 * if any `.pipeline/` path or any `*.lock` file would be packed, so the leak
 * can never recur silently.
 *
 * It asks npm itself what it would pack (`npm pack --dry-run --json`) — the same
 * computation `npm publish` uses — so it reflects the real tarball, not a guess.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== packaging: no runtime cruft in the npm tarball ===');

function packedFiles() {
  // --ignore-scripts so this never re-enters prepublishOnly/prepack lifecycle.
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32', // npm is npm.cmd on Windows
    timeout: 120000,
  });
  if (res.status !== 0) {
    throw new Error(`npm pack --dry-run failed (status ${res.status}): ${(res.stderr || '').slice(0, 400)}`);
  }
  // npm emits the JSON array on stdout; tolerate leading noise by slicing to the
  // first '['.
  const out = res.stdout || '';
  const start = out.indexOf('[');
  assert.ok(start !== -1, 'npm pack --json produced no JSON array');
  const parsed = JSON.parse(out.slice(start));
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  assert.ok(entry && Array.isArray(entry.files), 'npm pack --json missing files[]');
  return entry.files.map((f) => String(f.path).replace(/\\/g, '/'));
}

// npm-availability guard: mirror scripts/run-tests.cjs category-gate SKIP
// semantics (v7.13.0) — a hermetic environment without `npm` on PATH must NOT
// turn the release red for an environment reason. An absent npm can never hide
// cruft, so skipping here is safe (zero false-green risk).
function npmAvailable() {
  const r = spawnSync('npm', ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 30000,
  });
  return r.status === 0;
}

if (!npmAvailable()) {
  console.log('  [SKIP] npm not resolvable on PATH — packaging guard skipped');
  console.log('\nSummary: 0 pass / 0 fail / 0 total (SKIPPED: npm unavailable)');
  process.exit(0);
}

const files = packedFiles();

test('tarball is non-empty (sanity)', () => {
  assert.ok(files.length > 50, `only ${files.length} files packed — pack likely broke`);
});

test('no .pipeline/ runtime directory is packed', () => {
  const hits = files.filter((f) => /(^|\/)\.pipeline\//.test(f));
  assert.equal(hits.length, 0, `leaked .pipeline/ paths: ${hits.join(', ')}`);
});

test('no *.lock file is packed', () => {
  const hits = files.filter((f) => /\.lock$/.test(f));
  assert.equal(hits.length, 0, `leaked .lock files: ${hits.join(', ')}`);
});

test('no editor/OS/backup cruft is packed', () => {
  const hits = files.filter((f) => /(^|\/)(\.DS_Store|Thumbs\.db)$|\.(bak|orig|tgz)$|~$/.test(f));
  assert.equal(hits.length, 0, `leaked cruft: ${hits.join(', ')}`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total (${files.length} files packed)`);
process.exit(fail > 0 ? 1 : 0);
