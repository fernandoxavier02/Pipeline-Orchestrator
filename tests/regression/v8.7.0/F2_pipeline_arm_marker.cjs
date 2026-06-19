#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.7.0) — Arm-pending marker writer (TDD RED→GREEN).
//
// Written BEFORE lib/pipeline-arm.cjs exists (RED-first, addressing the
// methodology gap called out for F1). On the unmodified worktree every case
// fails because the module is absent; implementing lib/pipeline-arm.cjs turns it
// GREEN. The marker is the deterministic bridge: UserPromptSubmit writes it when
// a /pipeline command is seen, and pipeline-arm-gate.cjs reads it to deny work
// until the run is armed.
//
// Pure I/O against an isolated temp dir (no real .pipeline touched).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MOD = '../../../lib/pipeline-arm.cjs'; // lazy require → per-assertion RED

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-marker-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

const FIXED_ISO = '2026-06-18T12:00:00.000Z';

console.log('=== F2 v8.7.0 — arm-pending marker writer ===');

test('F2-1 — non-pipeline prompt → no marker, returns null', (dir) => {
  const { writeArmPending, markerPath } = require(MOD);
  const r = writeArmPending(dir, 'oi, tudo bem?', FIXED_ISO);
  assert.equal(r, null);
  assert.equal(fs.existsSync(markerPath(dir)), false);
});

test('F2-2 — pipeline prompt → marker written, workflow classified (Audit)', (dir) => {
  const { writeArmPending, markerPath } = require(MOD);
  const r = writeArmPending(dir, '/pipeline-orchestrator:pipeline faça uma auditoria do módulo X', FIXED_ISO);
  assert.ok(r, 'should return the marker');
  assert.equal(r.type, 'Audit');
  assert.equal(fs.existsSync(markerPath(dir)), true);
});

test('F2-3 — marker on disk is valid JSON with requested_at + workflow', (dir) => {
  const { writeArmPending, markerPath } = require(MOD);
  writeArmPending(dir, '/pipeline-orchestrator:pipeline corrige o bug do login', FIXED_ISO);
  const m = JSON.parse(fs.readFileSync(markerPath(dir), 'utf8'));
  assert.equal(m.requested_at, FIXED_ISO);
  assert.equal(m.type, 'Bug Fix');
  assert.ok(typeof m.workflow === 'string' && m.workflow.length > 0);
});

test('F2-4 — --bugfix --heavy prompt → FULL mode, Bug Fix, variant heavy captured', (dir) => {
  const { writeArmPending } = require(MOD);
  const r = writeArmPending(dir, '/pipeline-orchestrator:pipeline --bugfix --heavy corrige o crash', FIXED_ISO);
  assert.equal(r.mode, 'FULL');
  assert.equal(r.type, 'Bug Fix');
  assert.equal(r.variant, 'heavy');
});

test('F2-5 — clearArmPending removes the marker', (dir) => {
  const { writeArmPending, clearArmPending, markerPath } = require(MOD);
  writeArmPending(dir, '/pipeline-orchestrator:pipeline audita isso', FIXED_ISO);
  assert.equal(fs.existsSync(markerPath(dir)), true);
  assert.equal(clearArmPending(dir), true);
  assert.equal(fs.existsSync(markerPath(dir)), false);
});

test('F2-6 — prompt_excerpt is capped at 200 chars (sanitization)', (dir) => {
  const { writeArmPending } = require(MOD);
  const long = '/pipeline-orchestrator:pipeline ' + 'x'.repeat(500);
  const r = writeArmPending(dir, long, FIXED_ISO);
  assert.ok(r.prompt_excerpt.length <= 200);
});

console.log(`\n=== F2 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
