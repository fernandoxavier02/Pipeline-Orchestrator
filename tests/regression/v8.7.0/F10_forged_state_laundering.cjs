#!/usr/bin/env node
'use strict';

// =============================================================================
// F10 (v8.7.0) — SEC-1: forged-state laundering is refused.
//
// An attacker who can pre-write a sentinel-state.json can put a PRESENT-but-
// INVALID HMAC signature on a forged/tampered state. Before this fix, record-step
// (readState) and the stamp hook (readStateAt) parsed it with plain JSON.parse,
// TRUSTED it, merged into it, and RE-SIGNED it — laundering a forged state into a
// validly-signed one.
//
// This proves both readers now refuse a present-but-invalid signature:
//   - record-step.recordStep / recordFixAttempt → { ok:false, error: 'refusing
//     to write over an invalidly-signed state' } and DO NOT overwrite the file.
//   - the stamp hook → fail-silent (writes nothing), so no re-sign happens.
// Unsigned states stay tolerated (migration), proving we did not over-rotate.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { recordStep, recordFixAttempt } = require('../../../scripts/record-step.cjs');
const { signState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

const STAMP = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec1-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
const statePath = (dir) => path.join(dir, 'sentinel-state.json');
function writeRaw(dir, obj) { fs.writeFileSync(statePath(dir), JSON.stringify(obj, null, 2)); }
function readRaw(dir) { return JSON.parse(fs.readFileSync(statePath(dir), 'utf8')); }

// Builds a state with a PRESENT-but-INVALID signature: sign a benign body, then
// tamper a field AFTER signing so the stored signature no longer matches.
function forgedSigned(body) {
  const signed = signState({ ...body }, readHmacKey() || 'x'.repeat(32));
  return { ...signed, pipeline_active: true, attacker_injected: 'forged' };
}

console.log('=== F10 v8.7.0 — SEC-1 forged-state laundering refused ===');

test('F10-1 — recordStep REFUSES a present-but-invalid signature (no overwrite)', (dir) => {
  const forged = forgedSigned({ run_id: 'victim', pipeline_active: false });
  writeRaw(dir, forged);
  const before = fs.readFileSync(statePath(dir), 'utf8');

  const r = recordStep(dir, 'classify');
  assert.equal(r.ok, false, 'expected refusal');
  assert.match(r.error, /refusing to write over an invalidly-signed state/);

  // The forged file must be left UNTOUCHED (not re-signed / not laundered).
  assert.equal(fs.readFileSync(statePath(dir), 'utf8'), before);
});

test('F10-2 — recordFixAttempt REFUSES a present-but-invalid signature', (dir) => {
  writeRaw(dir, forgedSigned({ run_id: 'victim' }));
  const before = fs.readFileSync(statePath(dir), 'utf8');
  const r = recordFixAttempt(dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /refusing to write over an invalidly-signed state/);
  assert.equal(fs.readFileSync(statePath(dir), 'utf8'), before);
});

test('F10-3 — UNSIGNED state is still tolerated (migration), gets signed', (dir) => {
  writeRaw(dir, { run_id: 'r', pipeline_active: true }); // no __signature
  const r = recordStep(dir, 'classify');
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(readRaw(dir).step_ledger, ['classify']);
});

test('F10-4 — a VALIDLY-signed state is trusted and re-signed normally', (dir) => {
  const good = signState({ run_id: 'r', pipeline_active: true }, readHmacKey() || 'x'.repeat(32));
  writeRaw(dir, good);
  const r = recordStep(dir, 'classify');
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(readRaw(dir).step_ledger, ['classify']);
});

test('F10-5 — stamp hook FAIL-SILENT on a present-but-invalid signature (no re-sign)', (dir) => {
  // governed agent completion that WOULD stamp a step, but the on-disk state is forged.
  writeRaw(dir, forgedSigned({ run_id: 'victim', workflow_key: 'FULL' }));
  const before = fs.readFileSync(statePath(dir), 'utf8');
  const r = spawnSync(process.execPath, [STAMP], {
    input: JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' },
      cwd: dir,
    }),
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir },
  });
  assert.equal(r.status, 0, r.stderr);          // never crashes
  // Forged file untouched: the stamp did not trust/launder it.
  assert.equal(fs.readFileSync(statePath(dir), 'utf8'), before);
});

console.log(`\n=== F10 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
