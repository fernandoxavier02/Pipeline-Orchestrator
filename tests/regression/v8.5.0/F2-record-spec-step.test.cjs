#!/usr/bin/env node
'use strict';

/**
 * F2 (v8.5.0) — B2: scripts/record-spec-step.cjs + spec-controller stamping
 *
 * RED phase (TDD). These tests MUST FAIL today because
 * scripts/record-spec-step.cjs does NOT exist yet — both the require() of the
 * module and the child-process CLI invocations will throw / exit non-zero.
 *
 * Scenarios covered (7): B2-S1 .. B2-S7.
 *
 * Contract under test (from 05-plan-architect.md B2):
 *   recordSpecStep(pipelineDocPath, step, status)
 *     - step  ∈ {intake, explore, alternatives, ideation, interrogator,
 *               requirements, design, research, tasks}  (closed vocabulary)
 *     - status ∈ {done, auto-skipped}
 *     - merges spec_authoring_progress[step] = status into the signed sentinel
 *     - returns { ok:true } / { ok:false, error }
 *   CLI: node record-spec-step.cjs <docPath> <step> <status>
 *     - exit 0 + JSON {ok:true} on success; exit 2 + usage on too few args.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts', 'record-spec-step.cjs');
const { writeSignedState, readVerifiedState } =
  require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const _tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  _tmpDirs.push(d);
  return d;
}
function cleanup() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
  }
}

// require() the module fresh; if the file is absent this throws (RED).
function loadModule() {
  return require(SCRIPT); // MODULE_NOT_FOUND today → caught per-test
}

// Seed a signed sentinel-state.json in a doc dir, with optional initial progress.
function seedSentinel(docPath, extra = {}) {
  writeSignedState(path.join(docPath, 'sentinel-state.json'), { run_id: 'f2-run', ...extra });
}

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8', timeout: 15000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

console.log('=== F2 v8.5.0 — record-spec-step (RED) ===');

// ---- B2-S1 (main) — fresh sentinel gets a signed step ----------------------
test('B2-S1: recordSpecStep writes spec_authoring_progress.intake=done with valid HMAC', () => {
  const docPath = mkTmp('f2-s1-');
  seedSentinel(docPath); // no spec_authoring_progress yet
  const { recordSpecStep } = loadModule();
  const res = recordSpecStep(docPath, 'intake', 'done');
  assert.ok(res && res.ok !== false, 'recordSpecStep should succeed');
  const { state, verification } = readVerifiedState(path.join(docPath, 'sentinel-state.json'));
  assert.equal(state.spec_authoring_progress.intake, 'done');
  assert.equal(verification.valid, true, 'updated sentinel must remain HMAC-valid');
});

// ---- B2-S2 (main) — merge preserves prior steps ----------------------------
test('B2-S2: recordSpecStep merges research without dropping prior intake', () => {
  const docPath = mkTmp('f2-s2-');
  seedSentinel(docPath, { spec_authoring_progress: { intake: 'done' } });
  const { recordSpecStep } = loadModule();
  recordSpecStep(docPath, 'research', 'auto-skipped');
  const { state } = readVerifiedState(path.join(docPath, 'sentinel-state.json'));
  assert.equal(state.spec_authoring_progress.research, 'auto-skipped');
  assert.equal(state.spec_authoring_progress.intake, 'done', 'prior step must survive the merge');
});

// ---- B2-S3 (regression) — unknown step rejected ----------------------------
test('B2-S3: recordSpecStep rejects an unknown step name', () => {
  const docPath = mkTmp('f2-s3-');
  seedSentinel(docPath);
  const { recordSpecStep } = loadModule();
  const res = recordSpecStep(docPath, 'invalid-step', 'done');
  assert.equal(res.ok, false, 'unknown step must return ok:false');
  assert.match(String(res.error || ''), /unknown step/i);
  const { state } = readVerifiedState(path.join(docPath, 'sentinel-state.json'));
  assert.ok(!state.spec_authoring_progress || !('invalid-step' in state.spec_authoring_progress),
    'sentinel must not be modified for an unknown step');
});

// ---- B2-S4 (regression) — invalid status rejected --------------------------
test('B2-S4: recordSpecStep rejects an invalid status value', () => {
  const docPath = mkTmp('f2-s4-');
  seedSentinel(docPath);
  const { recordSpecStep } = loadModule();
  const res = recordSpecStep(docPath, 'intake', 'invalid-status');
  assert.equal(res.ok, false, 'invalid status must return ok:false');
  assert.match(String(res.error || ''), /invalid status/i);
});

// ---- B2-S5 (regression) — CLI happy path exits 0 with ok:true --------------
test('B2-S5: CLI `record-spec-step <path> design done` exits 0 with ok:true', () => {
  const docPath = mkTmp('f2-s5-');
  seedSentinel(docPath);
  const { code, stdout } = runCli([docPath, 'design', 'done']);
  assert.equal(code, 0, `CLI must exit 0; stdout=${stdout}`);
  assert.match(stdout, /"ok"\s*:\s*true/, 'stdout must contain ok:true');
});

// ---- B2-S6 (edge) — CLI exits 2 with usage on too few args -----------------
test('B2-S6: CLI exits 2 with a usage hint when given fewer than 3 args', () => {
  const docPath = mkTmp('f2-s6-');
  seedSentinel(docPath);
  const { code, stderr } = runCli([docPath]); // only 1 positional
  assert.equal(code, 2, 'too-few-args must exit 2');
  assert.match(stderr, /usage/i, 'stderr must carry a usage hint');
});

// ---- B2-S7 (edge) — re-stamping is idempotent (last write wins) ------------
test('B2-S7: re-stamping the same step overwrites without error', () => {
  const docPath = mkTmp('f2-s7-');
  seedSentinel(docPath, { spec_authoring_progress: { intake: 'done' } });
  const { recordSpecStep } = loadModule();
  const res = recordSpecStep(docPath, 'intake', 'auto-skipped');
  assert.ok(res && res.ok !== false, 're-stamp should not error');
  const { state } = readVerifiedState(path.join(docPath, 'sentinel-state.json'));
  assert.equal(state.spec_authoring_progress.intake, 'auto-skipped', 'last write wins');
});

cleanup();
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
