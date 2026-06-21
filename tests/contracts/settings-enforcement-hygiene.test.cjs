#!/usr/bin/env node
'use strict';

// =============================================================================
// settings-enforcement-hygiene.test.cjs — enforcement-audit Batch SETTINGS
// (DoD #17 "no unsupported config used as enforcement" + DoD #2 "exactly one
//  state-writer per critical event").
//
// Two cross-surface drift contracts that the enforcement audit (2026-06-21)
// converted from prose into code:
//
//   B2 (DoD#17): .claude/settings.json MUST NOT carry the Claude-Code-unsupported
//   trio subagent_permissions / max_depth / max_parallel_agents. Claude Code
//   v2.1.185 silently ignores those keys (grep across lib/+hooks = 0 refs), so
//   their presence is false-enforcement: the README/markdown markets them as
//   guardrails while the runtime honours none of them. Removing inert config
//   cannot change runtime behaviour; leaf-spawn/parallel containment is enforced
//   in code by dispatch-guard / parallel-dispatch-gate.
//
//   B3 (DoD#2): the Stop event must have a SINGLE registration. hooks/hooks.json
//   is the canonical, SHIPPED manifest (package.json files[] ships hooks/ but NOT
//   .claude/settings.json). settings.json previously ALSO registered stop-hook.cjs
//   under Stop, so in the dev/dogfood runtime two OS processes both append
//   run-log/fidelity (read-then-write dedup is not cross-process atomic). The
//   canonical registration stays in hooks.json; settings.json carries no Stop.
//
// RED state before the fix: settings.json contains the forbidden trio AND a
// hooks.Stop block -> tests 1-3 fail.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const SETTINGS = path.join(ROOT, '.claude/settings.json');
const HOOKS_MANIFEST = path.join(ROOT, 'hooks/hooks.json');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

// Deep walk: does any key in `obj` (recursively) equal one of `names`?
function hasKeyDeep(obj, names) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) {
    if (names.includes(k)) return true;
    if (hasKeyDeep(obj[k], names)) return true;
  }
  return false;
}

// Count how many command strings across a hooks-config object reference `needle`.
function countHookRefs(hooksConfig, eventName, needle) {
  let n = 0;
  const groups = (hooksConfig && hooksConfig[eventName]) || [];
  for (const g of groups) {
    for (const h of (g.hooks || [])) {
      const cmd = String(h.command || '');
      if (cmd.includes(needle)) n++;
    }
  }
  return n;
}

console.log('=== settings enforcement hygiene (DoD #17 + #2) ===');

const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(HOOKS_MANIFEST, 'utf8'));

test('B2 — settings.json carries none of the unsupported enforcement keys', () => {
  const FORBIDDEN = ['subagent_permissions', 'max_depth', 'max_parallel_agents'];
  for (const key of FORBIDDEN) {
    assert.ok(
      !hasKeyDeep(settings, [key]),
      `settings.json must not contain "${key}" (Claude Code ignores it; false enforcement)`
    );
  }
});

test('B3 — settings.json registers NO Stop hook (canonical lives in hooks.json)', () => {
  const stopInSettings = settings.hooks && settings.hooks.Stop;
  assert.ok(
    !stopInSettings,
    'settings.json must not register the Stop event — hooks/hooks.json is the single ' +
    'canonical, shipped registration. A second registration double-fires stop-hook.cjs.'
  );
});

test('B3 — stop-hook.cjs is registered exactly ONCE across settings.json + hooks.json', () => {
  const inSettings = countHookRefs(settings.hooks || {}, 'Stop', 'stop-hook.cjs');
  const inManifest = countHookRefs(manifest.hooks || {}, 'Stop', 'stop-hook.cjs');
  assert.equal(
    inSettings + inManifest, 1,
    `stop-hook.cjs must be registered exactly once for Stop (settings=${inSettings}, hooks.json=${inManifest})`
  );
  assert.equal(inManifest, 1, 'the single Stop registration must live in hooks/hooks.json');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
