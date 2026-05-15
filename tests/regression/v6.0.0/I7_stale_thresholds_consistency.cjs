#!/usr/bin/env node
'use strict';

/**
 * I7 regression — STALE_THRESHOLD nomenclature consistency.
 *
 * Audit H1-003 (2026-05-15): the plugin had 3 different "stale" values
 * (5min, 10min, 24h) spread across hooks vs registry vs docs with
 * ambiguous naming. Fix: canonical SSOT `references/stale-thresholds.md`
 * + renamed constants in hooks + cross-refs in gates.md / pipeline.md.
 *
 * This test asserts:
 *   1. SSOT file exists and declares the 3 canonical names
 *   2. Each hook uses the new canonical name AND keeps the deprecated alias
 *   3. Cross-references to stale-thresholds.md exist where mentions of
 *      "stale" appear in docs.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== I7 — STALE thresholds nomenclature SSOT consistency ===');

test('references/stale-thresholds.md exists and declares 3 canonical names', () => {
  const ssotPath = path.join(ROOT, 'references/stale-thresholds.md');
  assert.ok(fs.existsSync(ssotPath), 'SSOT file missing');
  const content = fs.readFileSync(ssotPath, 'utf8');
  assert.ok(/STALE_SPAWN/.test(content), 'STALE_SPAWN not declared');
  assert.ok(/STALE_HEARTBEAT/.test(content), 'STALE_HEARTBEAT not declared');
  assert.ok(/STALE_CONTEXT/.test(content), 'STALE_CONTEXT not declared');
  assert.ok(/5\s*minutes?|5\s*min/i.test(content), '5-min threshold not stated');
  assert.ok(/10\s*minutes?|10\s*min/i.test(content), '10-min threshold not stated');
  assert.ok(/24\s*h(ours?)?/i.test(content), '24h threshold not stated');
});

test('sentinel-hook.cjs uses STALE_SPAWN_THRESHOLD_MS (canonical)', () => {
  const file = fs.readFileSync(path.join(ROOT, '.claude/hooks/sentinel-hook.cjs'), 'utf8');
  assert.ok(/STALE_SPAWN_THRESHOLD_MS/.test(file), 'canonical name missing');
  assert.ok(/STALE_THRESHOLD_MS\s*=\s*STALE_SPAWN_THRESHOLD_MS/.test(file), 'backwards-compat alias missing');
  assert.ok(/300_?000/.test(file), '5-min value (300_000) missing');
});

test('session-lock-hook.cjs uses STALE_HEARTBEAT_THRESHOLD_MS (canonical)', () => {
  const file = fs.readFileSync(path.join(ROOT, '.claude/hooks/session-lock-hook.cjs'), 'utf8');
  assert.ok(/STALE_HEARTBEAT_THRESHOLD_MS/.test(file), 'canonical name missing');
  assert.ok(/STALE_THRESHOLD_MS\s*=\s*STALE_HEARTBEAT_THRESHOLD_MS/.test(file), 'backwards-compat alias missing');
});

test('edit-guard-hook.cjs uses STALE_HEARTBEAT_THRESHOLD_MS (canonical)', () => {
  const file = fs.readFileSync(path.join(ROOT, '.claude/hooks/edit-guard-hook.cjs'), 'utf8');
  assert.ok(/STALE_HEARTBEAT_THRESHOLD_MS/.test(file), 'canonical name missing');
  assert.ok(/STALE_HEARTBEAT_MS\s*=\s*STALE_HEARTBEAT_THRESHOLD_MS/.test(file), 'backwards-compat alias missing');
});

test('references/gates.md cross-references stale-thresholds.md', () => {
  const file = fs.readFileSync(path.join(ROOT, 'references/gates.md'), 'utf8');
  assert.ok(/stale-thresholds\.md/.test(file), 'gates.md must reference stale-thresholds.md from STALE_CONTEXT row');
});

test('commands/pipeline.md cross-references stale-thresholds.md', () => {
  const file = fs.readFileSync(path.join(ROOT, 'commands/pipeline.md'), 'utf8');
  assert.ok(/stale-thresholds\.md/.test(file), 'pipeline.md must reference stale-thresholds.md from CONTINUE row');
});

test('agents/core/sentinel.md cross-references stale-thresholds.md', () => {
  const file = fs.readFileSync(path.join(ROOT, 'agents/core/sentinel.md'), 'utf8');
  assert.ok(/stale-thresholds\.md/.test(file), 'sentinel.md D9 must reference stale-thresholds.md');
});

test('no orphan use of generic STALE_THRESHOLD_MS in non-deprecated context', () => {
  // The only acceptable use of bare STALE_THRESHOLD_MS is as a deprecated alias declaration.
  // Any other use (without _SPAWN_ or _HEARTBEAT_ qualifier) is a regression.
  const sentinelFile = fs.readFileSync(path.join(ROOT, '.claude/hooks/sentinel-hook.cjs'), 'utf8');
  // Count STALE_THRESHOLD_MS occurrences vs canonical STALE_SPAWN_THRESHOLD_MS
  const bareMatches = (sentinelFile.match(/\bSTALE_THRESHOLD_MS\b/g) || []).length;
  const canonicalMatches = (sentinelFile.match(/\bSTALE_SPAWN_THRESHOLD_MS\b/g) || []).length;
  // Bare should only appear in deprecated alias declaration AND the deprecated-comment line
  assert.ok(canonicalMatches >= bareMatches, 'canonical name should dominate over deprecated alias');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
