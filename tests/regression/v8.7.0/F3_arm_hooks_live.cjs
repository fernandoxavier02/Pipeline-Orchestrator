#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.7.0) — LIVE hook-CLI integration for the arm keystone.
//
// Drives the real hooks via child_process (stdin JSON → stdout JSON), the same
// contract the Claude Code harness uses. Proves the wiring end-to-end:
// arm-writer writes the marker; arm-gate denies substantive work while a marker
// exists and no run is armed, but never freezes reads/.pipeline writes, and
// fail-opens when there is no marker. Isolated temp dirs; no real .pipeline.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '../../../.claude/hooks');
const WRITER = path.join(HOOKS, 'pipeline-arm-writer.cjs');
const GATE = path.join(HOOKS, 'pipeline-arm-gate.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-f3-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function run(hook, payload, env) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}
const markerPath = (dir) => path.join(dir, '.pipeline', 'pipeline-arm-pending.json');
const DENY = { PIPELINE_ARM_ENFORCEMENT: 'deny' };

console.log('=== F3 v8.7.0 — arm-writer + arm-gate live CLI ===');

test('F3-1 — writer arms marker on /pipeline prompt (classified Bug Fix)', (dir) => {
  const r = run(WRITER, { prompt: '/pipeline-orchestrator:pipeline --bugfix --heavy fix the crash', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(markerPath(dir)), true);
  const m = JSON.parse(fs.readFileSync(markerPath(dir), 'utf8'));
  assert.equal(m.type, 'Bug Fix');
});

test('F3-2 — writer leaves no marker on a non-pipeline prompt', (dir) => {
  const r = run(WRITER, { prompt: 'oi, tudo bem?', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(markerPath(dir)), false);
});

test('F3-3 — gate DENIES Edit while marker present + no active run (deny mode)', (dir) => {
  run(WRITER, { prompt: '/pipeline-orchestrator:pipeline --bugfix fix X', cwd: dir });
  const r = run(GATE, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') }, cwd: dir }, DENY);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny');
});

test('F3-4 — gate ALLOWS Read while marker present (investigation never frozen)', (dir) => {
  run(WRITER, { prompt: '/pipeline-orchestrator:pipeline --bugfix fix X', cwd: dir });
  const r = run(GATE, { tool_name: 'Read', tool_input: { file_path: path.join(dir, 'src', 'a.js') }, cwd: dir }, DENY);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), ''); // no deny output
});

test('F3-5 — gate ALLOWS Edit when NO marker (normal usage untouched)', (dir) => {
  const r = run(GATE, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') }, cwd: dir }, DENY);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

test('F3-6 — gate ALLOWS Write into .pipeline (arming) while marker present', (dir) => {
  run(WRITER, { prompt: '/pipeline-orchestrator:pipeline --bugfix fix X', cwd: dir });
  const r = run(GATE, { tool_name: 'Write', tool_input: { file_path: path.join(dir, '.pipeline', 'docs', 'x', 'sentinel-state.json') }, cwd: dir }, DENY);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

test('F3-7 — warn mode is an explicit escape (allows Edit even with marker)', (dir) => {
  run(WRITER, { prompt: '/pipeline-orchestrator:pipeline --bugfix fix X', cwd: dir });
  const r = run(GATE, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') }, cwd: dir }, { PIPELINE_ARM_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

// SEC-3 recovery path: an EXPIRED marker (requested_at older than the TTL) must
// fail-open so a stuck session is never frozen forever. Write the marker by hand
// with a timestamp 31 minutes in the past (default TTL is 30 min).
test('F3-8 — expired marker (31 min old) → Edit ALLOWED (TTL recovery, no deadlock)', (dir) => {
  const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  fs.mkdirSync(path.dirname(markerPath(dir)), { recursive: true });
  fs.writeFileSync(markerPath(dir), JSON.stringify({ workflow: 'Bug Fix', requested_at: old }, null, 2));
  const r = run(GATE, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') }, cwd: dir }, DENY);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), ''); // expired → no deny
});

test('F3-9 — fresh marker still DENIES (proves F3-8 is the TTL, not a typo)', (dir) => {
  const fresh = new Date().toISOString();
  fs.mkdirSync(path.dirname(markerPath(dir)), { recursive: true });
  fs.writeFileSync(markerPath(dir), JSON.stringify({ workflow: 'Bug Fix', requested_at: fresh }, null, 2));
  const r = run(GATE, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') }, cwd: dir }, DENY);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny');
});

console.log(`\n=== F3 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
