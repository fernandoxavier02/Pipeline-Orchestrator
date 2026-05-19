#!/usr/bin/env node
'use strict';

/**
 * F5 — .claude/hooks/stop-hook.cjs exists, wraps in SOFT-fail try/catch,
 * calls appendRunLog from lib/run-log.cjs, and exits 0 always.
 *
 * EXPECTED RED STATE: file does not exist yet.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F5 (Finding #6).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, '.claude/hooks/stop-hook.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read() { return fs.readFileSync(TARGET, 'utf8'); }

console.log('=== F5 stop-hook.cjs SOFT-fail + appendRunLog ===');

test('.claude/hooks/stop-hook.cjs exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('stop-hook requires run-log.cjs or imports appendRunLog', () => {
  const src = read();
  assert.ok(
    /require\(.*run-log(\.cjs)?['"]\)/.test(src) || /appendRunLog/.test(src),
    'expected reference to run-log.cjs / appendRunLog'
  );
});

test('stop-hook wraps body in try/catch (SOFT-fail)', () => {
  const src = read();
  assert.ok(/try\s*\{/.test(src), 'expected try { ... } block');
  assert.ok(/catch\s*\(/.test(src), 'expected catch (...) block');
});

test('stop-hook never exits non-zero (process.exit(0) or no explicit exit)', () => {
  const src = read();
  // Forbid process.exit with anything other than 0
  const badExit = /process\.exit\s*\(\s*[^0\s)]/g;
  const matches = src.match(badExit) || [];
  assert.equal(matches.length, 0, `process.exit with non-zero argument found: ${matches.join(', ')}`);
});

test('stop-hook reads sentinel-state.json or session-aware payload', () => {
  const src = read();
  assert.ok(
    /sentinel-state\.json|sessions\/|payload/.test(src),
    'expected sentinel-state.json read or session payload handling'
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
