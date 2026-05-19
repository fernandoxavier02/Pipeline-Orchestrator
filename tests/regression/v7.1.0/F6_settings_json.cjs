#!/usr/bin/env node
'use strict';

/**
 * F6 — .claude/settings.json exists, is valid JSON, and registers the
 * Stop hook pointing to .claude/hooks/stop-hook.cjs.
 *
 * EXPECTED RED STATE: file does not exist yet OR has no Stop registration.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F6 (Finding #6 wiring).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, '.claude/settings.json');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F6 settings.json registers Stop hook ===');

test('.claude/settings.json exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('.claude/settings.json is valid JSON', () => {
  const raw = fs.readFileSync(TARGET, 'utf8');
  JSON.parse(raw);  // throws if invalid
});

test('settings.json has hooks.Stop registration pointing to stop-hook.cjs', () => {
  const cfg = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  assert.ok(cfg.hooks, 'expected top-level "hooks" object');
  assert.ok(cfg.hooks.Stop, 'expected hooks.Stop registration');
  const stopBlob = JSON.stringify(cfg.hooks.Stop);
  assert.ok(
    /stop-hook\.cjs/.test(stopBlob),
    `expected hooks.Stop to reference stop-hook.cjs, got: ${stopBlob}`
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
