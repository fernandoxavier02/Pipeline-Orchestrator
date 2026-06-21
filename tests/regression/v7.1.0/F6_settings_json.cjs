#!/usr/bin/env node
'use strict';

/**
 * F6 — the Stop hook (stop-hook.cjs) is registered exactly ONCE, in the
 * canonical shipped manifest hooks/hooks.json — NOT duplicated in
 * .claude/settings.json.
 *
 * HISTORY: v7.1.0 originally registered the Stop hook in .claude/settings.json
 * (this test asserted that). The enforcement audit (2026-06-21, DoD #2 "exactly
 * one state-writer per critical event") moved the canonical registration into
 * hooks/hooks.json — which is the file package.json actually ships — and removed
 * the settings.json duplicate that double-fired stop-hook.cjs in the dev runtime.
 * F6 is retargeted to lock in the single-registration contract.
 *
 * EXPECTED RED STATE: settings.json still carries a Stop block (double registration).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, '.claude/settings.json');
const MANIFEST = path.join(ROOT, 'hooks', 'hooks.json');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F6 Stop hook registered exactly once (canonical = hooks/hooks.json) ===');

test('.claude/settings.json exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('.claude/settings.json is valid JSON', () => {
  const raw = fs.readFileSync(TARGET, 'utf8');
  JSON.parse(raw);  // throws if invalid
});

test('settings.json does NOT register the Stop hook (no duplicate)', () => {
  const cfg = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  const stopBlob = JSON.stringify((cfg.hooks && cfg.hooks.Stop) || null);
  assert.ok(
    !(cfg.hooks && cfg.hooks.Stop),
    `settings.json must not register Stop (canonical lives in hooks/hooks.json), got: ${stopBlob}`
  );
});

test('hooks/hooks.json registers stop-hook.cjs exactly once for Stop', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const groups = (manifest.hooks && manifest.hooks.Stop) || [];
  let n = 0;
  for (const g of groups) for (const h of (g.hooks || [])) {
    if (String(h.command || '').includes('stop-hook.cjs')) n++;
  }
  assert.equal(n, 1, `expected stop-hook.cjs registered exactly once in hooks/hooks.json, got ${n}`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
