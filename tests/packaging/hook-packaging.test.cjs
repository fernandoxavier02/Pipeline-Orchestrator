#!/usr/bin/env node
'use strict';

/**
 * Packaging smoke test (v7.13.0 — R3): the canonical Claude Code hook manifest
 * `hooks/hooks.json` AND every hook script it references must be present in the
 * distributed package. A plugin install that ships the hook SCRIPTS but not the
 * MANIFEST that registers them runs with the security hooks INACTIVE.
 *
 * Three layers:
 *   1. Manifest integrity — every referenced hook path exists on disk.
 *   2. Static allowlist — package.json `files[]` covers the manifest + each hook.
 *   3. Real smoke — `npm pack --dry-run --json` actually includes them (skipped
 *      gracefully if npm is unavailable; the static layer remains the gate).
 *
 * Pure Node + node:assert/strict + counter + process.exit.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== Packaging: Claude Code hook manifest + hooks shipped (R3) ===');

// --- parse the canonical manifest -> referenced hook command paths -------
const manifestRel = 'hooks/hooks.json';
const manifestPath = path.join(ROOT, manifestRel);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const referenced = new Set();
for (const eventGroups of Object.values(manifest.hooks || {})) {
  for (const group of eventGroups) {
    for (const h of (group.hooks || [])) {
      if (h.type === 'command' && typeof h.command === 'string') {
        // command form: node "${CLAUDE_PLUGIN_ROOT}/.claude/hooks/X.cjs"
        const m = h.command.match(/\.claude\/hooks\/[\w.-]+\.cjs/);
        if (m) referenced.add(m[0]);
      }
    }
  }
}
const REFERENCED = [...referenced].sort();

test(`manifest references a non-empty set of hooks (got ${REFERENCED.length})`, () => {
  assert.ok(REFERENCED.length >= 6, `expected >=6 referenced hooks, got ${REFERENCED.length}`);
});

// --- layer 1: every referenced hook exists on disk -----------------------
test('every hook referenced by the manifest exists on disk', () => {
  const missing = REFERENCED.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  assert.equal(missing.length, 0, `manifest references missing files: ${missing.join(', ')}`);
});

// --- layer 2: package.json files[] covers manifest + each hook -----------
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const files = Array.isArray(pkg.files) ? pkg.files : [];

function coveredByFiles(p) {
  return files.some((f) => {
    const fn = f.replace(/\/+$/, '');
    return p === fn || p.startsWith(fn + '/');
  });
}

test('package.json files[] covers the canonical hook manifest (hooks/hooks.json)', () => {
  assert.ok(
    coveredByFiles(manifestRel),
    `package.json "files" must include the hook manifest path "${manifestRel}" (add "hooks/"); ` +
    `otherwise a packaged install ships hooks but never registers them`
  );
});

test('package.json files[] covers every referenced hook script', () => {
  const uncovered = REFERENCED.filter((rel) => !coveredByFiles(rel));
  assert.equal(uncovered.length, 0, `files[] does not cover: ${uncovered.join(', ')}`);
});

// --- layer 3: real npm pack smoke (skip gracefully if npm absent) --------
test('npm pack --dry-run includes the manifest and every referenced hook', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32',
  });
  if (res.error || typeof res.stdout !== 'string' || !res.stdout.trim()) {
    console.log('         (npm unavailable — smoke skipped; static layer is the gate)');
    return; // graceful skip, not a failure
  }
  let parsed;
  try { parsed = JSON.parse(res.stdout); } catch (_) {
    console.log('         (npm pack JSON unparseable — smoke skipped)');
    return;
  }
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const packed = new Set((entry.files || []).map((f) => String(f.path).replace(/\\/g, '/')));
  const want = [manifestRel, ...REFERENCED];
  const missing = want.filter((p) => !packed.has(p));
  assert.equal(missing.length, 0, `npm pack tarball missing: ${missing.join(', ')}`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
