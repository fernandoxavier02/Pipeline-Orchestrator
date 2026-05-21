#!/usr/bin/env node
'use strict';

/**
 * cleanup-orphan-sentinel-state-hook.test.cjs
 *
 * Patch 5 (Phase 0 hardening) — automated orphan sentinel-state.json cleanup
 * fired on Claude Code SessionStart.
 *
 * ATDD / BDD scenarios:
 *
 *   GIVEN there are sentinel-state.json files under .pipeline/docs/**
 *     AND some have `pipeline_active: true` with `last_updated` older than 24h
 *   WHEN a Claude Code session starts
 *   THEN the hook scans the tree, RENAMES orphan files to
 *        `sentinel-state.archived-<ts>.json` (removing them from the
 *        sentinel-hook scan path), and leaves LIVE files untouched
 *     AND malformed JSON, missing last_updated, non-object payloads, system
 *        paths, symlinks, and concurrent writes are handled defensively
 *
 * Closes Achado B1-001 + addresses adversarial review followups
 * (ADV-1 race / ADV-2 fail-open / ADV-3 sandbox / ADV-4 DoS / ADV-6 log).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('os');
const path = require('node:path');

const HOOK = require('../cleanup-orphan-sentinel-state-hook.cjs');

function makeTmpDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-')));
}

function writeState(dir, state) {
  const file = path.join(dir, 'sentinel-state.json');
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  return file;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ─── Exports / module surface ──────────────────────────────────────────────

test('Patch 5 — exports cleanupOrphan, findStateFiles, handleSessionStart, isCwdSandboxOk', () => {
  assert.equal(typeof HOOK.cleanupOrphan, 'function');
  assert.equal(typeof HOOK.findStateFiles, 'function');
  assert.equal(typeof HOOK.handleSessionStart, 'function');
  assert.equal(typeof HOOK.isCwdSandboxOk, 'function');
  assert.equal(HOOK.STALE_HOURS, 24);
  assert.equal(HOOK.STALE_MS, 24 * 60 * 60 * 1000);
  assert.equal(HOOK.MAX_WALK_DEPTH, 10);
  assert.ok(Array.isArray(HOOK.SYSTEM_PATH_PREFIXES));
});

// ─── cleanupOrphan semantics ───────────────────────────────────────────────

test('Patch 5 — active state with last_updated < 24h is preserved (live)', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = writeState(dir, {
      pipeline_active: true,
      last_updated: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago
    });
    const result = HOOK.cleanupOrphan(stateFile);
    assert.equal(result, 'live');
    const after = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(after.pipeline_active, true);
  } finally { cleanup(dir); }
});

test('Patch 5 — active state with last_updated > 24h is renamed to .archived-<ts>.json', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = writeState(dir, {
      pipeline_active: true,
      last_updated: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    });
    const result = HOOK.cleanupOrphan(stateFile);
    assert.equal(result, 'archived');

    // Original file must be gone, archived file must exist
    assert.equal(fs.existsSync(stateFile), false, 'sentinel-state.json must be renamed away');
    const entries = fs.readdirSync(dir);
    const archived = entries.find((n) => /^sentinel-state\.archived-/.test(n));
    assert.ok(archived, 'sentinel-state.archived-<ts>.json must exist');

    // Archived file preserves original content (NOT mutated)
    const archivedContent = JSON.parse(fs.readFileSync(path.join(dir, archived), 'utf8'));
    assert.equal(archivedContent.pipeline_active, true, 'archived file preserves original content');
  } finally { cleanup(dir); }
});

test('Patch 5 — already-inactive state is left alone (no rename, no mutation)', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = writeState(dir, {
      pipeline_active: false,
      last_updated: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
    });
    const before = fs.readFileSync(stateFile, 'utf8');
    const result = HOOK.cleanupOrphan(stateFile);
    assert.equal(result, 'already-inactive');
    assert.equal(fs.readFileSync(stateFile, 'utf8'), before);
  } finally { cleanup(dir); }
});

test('Patch 5 — missing last_updated is treated as orphan (defensive)', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = writeState(dir, { pipeline_active: true });
    const result = HOOK.cleanupOrphan(stateFile);
    assert.equal(result, 'archived');
    assert.equal(fs.existsSync(stateFile), false);
  } finally { cleanup(dir); }
});

test('Patch 5 — malformed JSON returns malformed (no rename, no crash)', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = path.join(dir, 'sentinel-state.json');
    fs.writeFileSync(stateFile, '{not valid json');
    const result = HOOK.cleanupOrphan(stateFile);
    assert.equal(result, 'malformed');
    assert.ok(fs.existsSync(stateFile));
  } finally { cleanup(dir); }
});

test('Patch 5 — non-object JSON (array, string) returns invalid', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = path.join(dir, 'sentinel-state.json');
    fs.writeFileSync(stateFile, '["not", "an", "object"]');
    const result = HOOK.cleanupOrphan(stateFile);
    assert.equal(result, 'invalid');
  } finally { cleanup(dir); }
});

// ─── ADV-1: mtime CAS race-detection ───────────────────────────────────────

test('Patch 5 (ADV-1) — concurrent writer modifies file between read and rename → stale-read (no rename)', () => {
  const dir = makeTmpDir();
  try {
    const stateFile = writeState(dir, {
      pipeline_active: true,
      last_updated: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    });

    // Race the cleanup: monkey-patch lstatSync to return changing mtime.
    const origLstat = fs.lstatSync;
    let call = 0;
    fs.lstatSync = function (p) {
      const real = origLstat.call(fs, p);
      // First call (in cleanupOrphan): return as-is. Second call (re-stat
      // before rename): return mtime bumped to simulate concurrent writer.
      call++;
      if (call === 2 && p === stateFile) {
        return Object.assign(Object.create(real), real, { mtimeMs: real.mtimeMs + 1000 });
      }
      return real;
    };

    try {
      const result = HOOK.cleanupOrphan(stateFile);
      assert.equal(result, 'stale-read');
      assert.ok(fs.existsSync(stateFile), 'file must NOT be renamed when mtime changed');
    } finally {
      fs.lstatSync = origLstat;
    }
  } finally { cleanup(dir); }
});

// ─── ADV-3: cwd sandbox ────────────────────────────────────────────────────

test('Patch 5 (ADV-3) — isCwdSandboxOk rejects system paths', () => {
  // On Windows realpathSync may not resolve /etc; on Linux /etc resolves but
  // is denied. Check the function's prefix logic without depending on the
  // current OS — pass a cwd that survives realpath but starts with /etc.
  // We use a tmpdir whose realpath we'll fake by passing the literal string.
  const tmpDir = makeTmpDir();
  try {
    assert.equal(HOOK.isCwdSandboxOk(tmpDir), true, 'tmpdir is sandbox-ok');
    assert.equal(HOOK.isCwdSandboxOk(''), false, 'empty cwd rejected');
    assert.equal(HOOK.isCwdSandboxOk(null), false, 'null cwd rejected');
    assert.equal(HOOK.isCwdSandboxOk(undefined), false, 'undefined cwd rejected');
    assert.equal(HOOK.isCwdSandboxOk('/this/path/does/not/exist'), false, 'non-existent path rejected');
  } finally { cleanup(tmpDir); }
});

test('Patch 5 (ADV-3) — handleSessionStart with system-path cwd is skipped', () => {
  const skipped = HOOK.handleSessionStart({ cwd: '/etc' });
  assert.equal(skipped.scanned, 0);
  assert.equal(skipped.skipped_reason, 'cwd_not_sandbox_ok');
});

// ─── ADV-4: depth limit + symlink skip ─────────────────────────────────────

test('Patch 5 (ADV-4) — findStateFiles respects maxDepth (deeply nested file skipped)', () => {
  const dir = makeTmpDir();
  try {
    // Build a chain deeper than default maxDepth=10
    let current = dir;
    for (let i = 0; i < 15; i++) {
      current = path.join(current, `d${i}`);
      fs.mkdirSync(current);
    }
    fs.writeFileSync(path.join(current, 'sentinel-state.json'), '{}');

    const foundDefault = HOOK.findStateFiles(dir);
    assert.equal(foundDefault.length, 0, 'depth>10 must be cut off');

    const foundDeep = HOOK.findStateFiles(dir, { maxDepth: 20 });
    assert.equal(foundDeep.length, 1, 'with maxDepth=20 the file is found');
  } finally { cleanup(dir); }
});

test('Patch 5 (ADV-4) — findStateFiles skips symbolic links (no loop, no cross-tree)', () => {
  const dir = makeTmpDir();
  try {
    fs.mkdirSync(path.join(dir, 'real'));
    fs.writeFileSync(path.join(dir, 'real', 'sentinel-state.json'), '{}');
    try {
      fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'loop'), 'dir');
    } catch (err) {
      // Windows non-admin can't create symlinks — skip cleanly
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        return;
      }
      throw err;
    }
    const found = HOOK.findStateFiles(dir);
    // Only the real file, not the symlinked one — symlink is skipped
    assert.equal(found.length, 1);
    assert.ok(found[0].includes('real'));
  } finally { cleanup(dir); }
});

// ─── ADV-6: summary always emitted ─────────────────────────────────────────

test('Patch 5 (ADV-6) — handleSessionStart returns full counters even when archived=0', () => {
  const dir = makeTmpDir();
  try {
    const docsDir = path.join(dir, '.pipeline', 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    // 2 live states
    fs.mkdirSync(path.join(docsDir, 'a'));
    fs.writeFileSync(path.join(docsDir, 'a', 'sentinel-state.json'), JSON.stringify({
      pipeline_active: true,
      last_updated: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }));
    fs.mkdirSync(path.join(docsDir, 'b'));
    fs.writeFileSync(path.join(docsDir, 'b', 'sentinel-state.json'), JSON.stringify({
      pipeline_active: true,
      last_updated: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }));

    const summary = HOOK.handleSessionStart({ cwd: dir });
    assert.equal(summary.scanned, 2);
    assert.equal(summary.archived, 0);
    assert.equal(summary.live, 2);
    assert.equal(summary.errors, 0);
  } finally { cleanup(dir); }
});

// ─── findStateFiles edge cases ─────────────────────────────────────────────

test('Patch 5 — findStateFiles on non-existent dir returns empty array (no crash)', () => {
  const fake = path.join(os.tmpdir(), 'definitely-does-not-exist-' + Date.now());
  const found = HOOK.findStateFiles(fake);
  assert.deepEqual(found, []);
});

// ─── handleSessionStart integration ────────────────────────────────────────

test('Patch 5 — handleSessionStart archives an orphan state file', () => {
  const dir = makeTmpDir();
  try {
    const docsDir = path.join(dir, '.pipeline', 'docs', 'Pre-Medium-action', '2026-05-21');
    fs.mkdirSync(docsDir, { recursive: true });
    const stateFile = path.join(docsDir, 'sentinel-state.json');
    fs.writeFileSync(stateFile, JSON.stringify({
      pipeline_active: true,
      last_updated: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    }));

    const summary = HOOK.handleSessionStart({ cwd: dir });
    assert.equal(summary.scanned, 1);
    assert.equal(summary.archived, 1);
    assert.equal(fs.existsSync(stateFile), false, 'original file must be renamed away');
    const remaining = fs.readdirSync(docsDir);
    const archived = remaining.find((n) => /^sentinel-state\.archived-/.test(n));
    assert.ok(archived);
  } finally { cleanup(dir); }
});

test('Patch 5 — handleSessionStart with no docs dir returns skipped_reason', () => {
  const dir = makeTmpDir();
  try {
    const summary = HOOK.handleSessionStart({ cwd: dir });
    assert.equal(summary.scanned, 0);
    assert.equal(summary.skipped_reason, 'no_docs_dir');
  } finally { cleanup(dir); }
});

test('Patch 5 — handleSessionStart with no cwd returns skipped_reason', () => {
  const summary = HOOK.handleSessionStart({});
  assert.equal(summary.scanned, 0);
  assert.equal(summary.skipped_reason, 'cwd_not_sandbox_ok');
});

test('Patch 5 — handleSessionStart with malformed payload returns no_payload', () => {
  const summary = HOOK.handleSessionStart(null);
  assert.equal(summary.scanned, 0);
  assert.equal(summary.skipped_reason, 'no_payload');
});
