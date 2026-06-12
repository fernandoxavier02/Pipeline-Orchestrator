#!/usr/bin/env node
'use strict';

/**
 * F05 (v7.13.0 — R4): sentinel-hook.cjs HMAC verification, warn-first + strict.
 *
 * End-to-end through the real hook (spawnSync). Proves:
 *   - Valid signed active state → allow (no deny, no HMAC warning).
 *   - Tampered signed state, warn mode → ALLOW + auditable stderr event.
 *   - Tampered signed state, strict mode → DENY (fail closed).
 *   - Unsigned active state, strict mode → DENY.
 *   - Unsigned active state, warn mode → ALLOW + auditable stderr event (R4.5).
 */

process.env.PIPELINE_HMAC_SECRET = 'f05-hook-hmac-secret-0123456789abcdef';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const signer = require('../../../lib/sentinel-state-signer.cjs');

const KEY = process.env.PIPELINE_HMAC_SECRET;
const HOOK = path.resolve(__dirname, '../../../.claude/hooks/sentinel-hook.cjs');
const SCANNER = 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner';
const SPAWN = { tool_name: 'Agent', tool_input: { subagent_type: SCANNER } };

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function mkdoc() { return fs.mkdtempSync(path.join(os.tmpdir(), 'f05-hook-')); }
function baseState() {
  return {
    schema_version: 1,
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0,
  };
}
function write(dir, obj) { fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(obj, null, 2)); }
function runHook(doc, extra = {}) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify(SPAWN),
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: doc, PIPELINE_HMAC_SECRET: KEY, PIPELINE_HMAC_STRICT: '', ...extra },
  });
}
const isDeny = (r) => (r.stdout || '').includes('"permissionDecision":"deny"');
const hasHmacWarn = (r) => (r.stderr || '').includes('SENTINEL_HMAC_UNVERIFIED');

console.log('=== F05 v7.13.0 sentinel-hook HMAC warn-first + strict ===');

test('valid signed active state → allow, no HMAC warning', () => {
  const doc = mkdoc();
  write(doc, signer.signState(baseState(), KEY));
  const r = runHook(doc);
  assert.equal(r.status, 0, 'exit 0');
  assert.equal(isDeny(r), false, 'must not deny a validly-signed state');
  assert.equal(hasHmacWarn(r), false, 'no HMAC warning for a valid signature');
});

test('tampered signed state, WARN mode → allow + auditable stderr event', () => {
  const doc = mkdoc();
  const signed = signer.signState(baseState(), KEY);
  signed.consecutive_corrections = 99; // tamper without re-signing
  write(doc, signed);
  const r = runHook(doc);
  assert.equal(isDeny(r), false, 'warn mode must NOT deny');
  assert.equal(hasHmacWarn(r), true, 'tampering must emit SENTINEL_HMAC_UNVERIFIED');
});

test('tampered signed state, STRICT mode → deny (fail closed)', () => {
  const doc = mkdoc();
  const signed = signer.signState(baseState(), KEY);
  signed.consecutive_corrections = 99;
  write(doc, signed);
  const r = runHook(doc, { PIPELINE_HMAC_STRICT: 'true' });
  assert.equal(isDeny(r), true, 'strict mode must deny a tampered state');
  assert.ok((r.stdout || '').includes('HMAC integrity'), 'deny reason cites HMAC integrity');
});

test('unsigned active state, STRICT mode → deny', () => {
  const doc = mkdoc();
  write(doc, baseState()); // unsigned
  const r = runHook(doc, { PIPELINE_HMAC_STRICT: 'true' });
  assert.equal(isDeny(r), true, 'strict mode must deny an unsigned active state');
});

test('unsigned active state, WARN mode → allow + auditable stderr event (R4.5)', () => {
  const doc = mkdoc();
  write(doc, baseState()); // unsigned
  const r = runHook(doc);
  assert.equal(r.status, 0, 'exit 0');
  assert.equal(isDeny(r), false, 'warn mode allows unsigned (migration)');
  assert.equal(hasHmacWarn(r), true, 'unsigned migration MUST still warn (R4.5)');
});

test('unparseable active state, STRICT mode → deny (R4 fail-closed, corrupt>tamper)', () => {
  const doc = mkdoc();
  fs.writeFileSync(path.join(doc, 'sentinel-state.json'), 'GARBAGE NOT JSON {{{');
  const r = runHook(doc, { PIPELINE_HMAC_STRICT: 'true' });
  assert.equal(isDeny(r), true, 'strict must deny an unparseable active state (cannot HMAC-verify)');
});

test('unparseable active state, WARN mode → allow (legacy backward compat)', () => {
  const doc = mkdoc();
  fs.writeFileSync(path.join(doc, 'sentinel-state.json'), 'GARBAGE NOT JSON {{{');
  const r = runHook(doc);
  assert.equal(isDeny(r), false, 'warn mode keeps legacy allow on unparseable state');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
