#!/usr/bin/env node
'use strict';

// =============================================================================
// B2 (v8.13.0) — AUDIT READ-BUDGET — LIVE end-to-end (spawn the real hooks).
// =============================================================================
// Drives the real PreToolUse blocker + PostToolUse counter via child_process,
// with a signed arm-pending marker + signed ledger, exactly as the harness runs
// them. Mirrors tests/regression/v8.12.0/T3_*.cjs.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b2-audit-read-budget-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const GATE = path.join(ROOT, '.claude/hooks/audit-read-budget-gate.cjs');
const COUNTER = path.join(ROOT, '.claude/hooks/audit-read-counter-hook.cjs');
const signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));
const budget = require(path.join(ROOT, 'lib/audit-read-budget.cjs'));

function writeMarker(dir, type, requestedAt) {
  const marker = {
    requested_at: requestedAt || new Date().toISOString(),
    workflow: 'FULL/' + type, mode: 'FULL', type, variant: null, complexity: null, source: 'test',
  };
  const signed = signer.signState(marker, signer.getOrCreateHmacKey());
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pipeline', 'pipeline-arm-pending.json'), JSON.stringify(signed));
  return marker;
}

// Arm a run: write a signed active sentinel-state + the active-run.json pointer
// so runStateContext(dir) resolves runActive=true. The run dir MUST live UNDER
// <dir>/.pipeline/ — discoverStatePath (edit-guard) only trusts a pointer whose
// pipeline_doc_path is contained in .pipeline/ (out-of-tree pointers are rejected
// as a security guard), exactly like production (.pipeline/docs/Pre-*-action/...).
function armRun(dir) {
  const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Test-action', 'b2-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = signer.signState({ schema_version: 1, run_id: 'b2-run', pipeline_active: true, updated_at: new Date().toISOString() }, signer.getOrCreateHmacKey());
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(dir, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: runDir, run_id: 'b2-run', updated_at: new Date().toISOString() }));
}

function fill(dir, marker, n) { for (let i = 0; i < n; i++) budget.bumpLedger(dir, marker); }

function run(bin, payload, env) {
  const base = { ...process.env };
  return spawnSync(process.execPath, [bin], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function denyReason(r) {
  try { const o = JSON.parse(r.stdout || '{}'); return (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny') ? o.hookSpecificOutput.permissionDecisionReason : null; }
  catch { return null; }
}
const readPayload = (dir, fp) => ({ tool_name: 'Read', tool_input: { file_path: fp || 'lib/some-prod-file.cjs' }, cwd: dir });

let pass = 0, fail = 0; const failed = [];
function t(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-arb-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== B2 v8.13.0 — audit read-budget LIVE (real hooks) ===');

t('L1 Audit, under budget (count 0) → ALLOW', (dir) => {
  writeMarker(dir, 'Audit');
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'must allow under budget');
});

t('L2 Audit, count==budget(12) → DENY AUDIT_RAN_INLINE', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 12);
  const r = denyReason(run(GATE, readPayload(dir)));
  assert.ok(r && /AUDIT_RAN_INLINE/.test(r), 'must deny the budget+1th read: ' + r);
});

t('L3 Bug Fix, count 99 → ALLOW (not a read-only-escapable type)', (dir) => {
  const m = writeMarker(dir, 'Bug Fix'); fill(dir, m, 99);
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'Bug Fix is not policed by read-budget');
});

t('L4 Audit, count 99 but run ARMED → ALLOW', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 99); armRun(dir);
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'armed run releases reads');
});

t('L5 Audit, over budget but pipelineAligned read (.pipeline/) → ALLOW', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 99);
  const r = denyReason(run(GATE, readPayload(dir, path.join('.pipeline', 'state', 'x.json'))));
  assert.equal(r, null, 'coordination read is never blocked');
});

t('L6 Audit, over budget but ENFORCEMENT=warn → ALLOW', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 99);
  assert.equal(denyReason(run(GATE, readPayload(dir), { PIPELINE_AUDIT_BUDGET_ENFORCEMENT: 'warn' })), null, 'warn escape allows');
});

t('L7 Audit, over budget but marker EXPIRED (TTL) → ALLOW', (dir) => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
  const m = writeMarker(dir, 'Audit', old); fill(dir, m, 99);
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'expired marker = out of window');
});

t('L8 counter hook actually increments the ledger (real spawn)', (dir) => {
  const m = writeMarker(dir, 'Audit');
  const armId = budget.armIdFor(m.requested_at);
  assert.equal(budget.readLedger(dir, armId).count, 0, 'starts at 0');
  run(COUNTER, readPayload(dir));
  assert.equal(budget.readLedger(dir, armId).count, 1, 'counter bumped to 1');
});

t('L9 reset on NEW /pipeline (ledger arm_id mismatch → count 0 → ALLOW)', (dir) => {
  const m1 = writeMarker(dir, 'Audit', new Date(Date.now() - 5000).toISOString()); fill(dir, m1, 99);
  // a new /pipeline arrives → new requested_at → new marker; old ledger is stale
  writeMarker(dir, 'Audit', new Date().toISOString());
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'stale ledger ignored on new invocation');
});

t('L10 tampered ledger signature → count 0 fail-safe (ALLOW under budget)', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 5);
  const p = budget.ledgerPath(dir);
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  obj.count = 999; // tamper WITHOUT re-signing → present-but-invalid signature
  fs.writeFileSync(p, JSON.stringify(obj));
  const armId = budget.armIdFor(m.requested_at);
  assert.equal(budget.readLedger(dir, armId).count, 0, 'tampered ledger reads as count 0');
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'fail-safe: forged count ignored');
});

t('L11 counter NEVER denies (exit 0, no deny output)', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 99);
  const r = run(COUNTER, readPayload(dir));
  assert.equal(r.status, 0, 'counter exits 0');
  assert.equal(denyReason(r), null, 'counter never emits a deny');
});

t('L12 arming RELEASES a previously-blocked read', (dir) => {
  const m = writeMarker(dir, 'Audit'); fill(dir, m, 12);
  assert.ok(denyReason(run(GATE, readPayload(dir))), 'blocked before arming');
  armRun(dir);
  assert.equal(denyReason(run(GATE, readPayload(dir))), null, 'allowed after arming');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
