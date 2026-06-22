#!/usr/bin/env node
'use strict';

// =============================================================================
// B2 (v8.11.0) — REQ-GREEN-CLOSE-WIRE: wire the orphan green-close producer
// (lib/checkpoint-verdict-producer.cjs) into the machine-evidence-hook so a REAL
// test/checkpoint command outcome populates state.last_checkpoint_verdict — the
// field the shipped checkpoint-verdict-gate reads to deny a non-green close.
// TDD RED phase — today the producer is NEVER called, so the field stays null.
//
// CONTRACT under test:
//   PostToolUse:Bash|PowerShell on a CHECKPOINT command (a test/verify run) →
//   derive verdict from REAL evidence (test summary / interrupted) → record
//   last_checkpoint_verdict. A BUILD/lint/other intermediate command must NOT
//   produce a verdict (no false 'fail' mid-fix-loop). The hook NEVER blocks.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b2-green-close-wire-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/machine-evidence-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rB2', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1,
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rB2', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}
function bashPayload(root, command, stdout, interrupted) {
  return {
    hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'tu-b2',
    tool_input: { command }, tool_response: { stdout: stdout || '', stderr: '', interrupted: !!interrupted },
    cwd: root,
  };
}
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function verdictOf(p) { const s = readState(p) || {}; return s.last_checkpoint_verdict; }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-greenwire-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== B2 v8.11.0 — green-close producer wire (RED until machine-evidence-hook calls produceCheckpointVerdict) ===');

// ---- B2-S1: a GREEN test run records last_checkpoint_verdict='pass' ----------
liveTest('B2-S1 [pass] a checkpoint test command with a green summary records last_checkpoint_verdict=pass', (root) => {
  const { docDir, statePath } = seedRun(root);
  const r = run(bashPayload(root, 'npm test', 'Summary: 42 passed / 0 failed / 42 total', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(verdictOf(statePath), 'pass', 'a green test summary must record last_checkpoint_verdict=pass');
});

// ---- B2-S2: a RED test run records last_checkpoint_verdict='fail' ------------
liveTest('B2-S2 [fail] a checkpoint test command with a red summary records last_checkpoint_verdict=fail', (root) => {
  const { docDir, statePath } = seedRun(root);
  const r = run(bashPayload(root, 'node scripts/run-tests.cjs', 'Summary: 3 passed / 2 failed / 5 total', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(verdictOf(statePath), 'fail', 'a red test summary must record last_checkpoint_verdict=fail');
});

// ---- B2-S3: an intermediate BUILD command must NOT record a verdict ----------
liveTest('B2-S3 [anti-build] an intermediate build command (even interrupted) must NOT record a checkpoint verdict', (root) => {
  const { docDir, statePath } = seedRun(root);
  const r = run(bashPayload(root, 'npm run build', 'error TS1005: build failed', true), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(verdictOf(statePath), undefined, 'a build command must not produce a checkpoint verdict (no false fail mid-fix-loop)');
});

// ---- B2-S4: a non-checkpoint command (git) must NOT record a verdict ---------
liveTest('B2-S4 [non-checkpoint] a plain git command must NOT record a checkpoint verdict', (root) => {
  const { docDir, statePath } = seedRun(root);
  const r = run(bashPayload(root, 'git status --porcelain', ' M lib/foo.cjs', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(verdictOf(statePath), undefined, 'a git command is not a checkpoint — no verdict');
});

// ---- B2-S5: the hook still NEVER blocks (no decision output) -----------------
liveTest('B2-S5 [never-blocks] the evidence hook emits no block decision even on a red checkpoint', (root) => {
  const { docDir } = seedRun(root);
  const r = run(bashPayload(root, 'npm test', 'Summary: 0 passed / 9 failed / 9 total', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const out = (r.stdout || '').trim();
  if (out) {
    let parsed; try { parsed = JSON.parse(out); } catch { parsed = null; }
    if (parsed) assert.notEqual(parsed.decision, 'block', 'machine-evidence-hook must never block');
  }
  assert.ok(true);
});

// ---- B2-S6: non-test commands containing "test" must NOT record a verdict -----
liveTest('B2-S6 [no-false-positive] non-test commands with "test" in an argument record nothing (even interrupted)', (root) => {
  for (const cmd of ['git checkout test-branch', 'rm -rf test-data', 'cat tests/fixture.json', 'echo "running tests"', 'cd src/__tests__']) {
    const { docDir, statePath } = seedRun(root);
    const r = run(bashPayload(root, cmd, 'whatever output', true), { PIPELINE_DOC_PATH: docDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(verdictOf(statePath), undefined, `"${cmd}" is not a checkpoint — must not record a verdict`);
  }
});

// ---- B2-S7: pytest red summary → fail ---------------------------------------
liveTest('B2-S7 [pytest] a pytest red summary records last_checkpoint_verdict=fail', (root) => {
  const { docDir, statePath } = seedRun(root);
  const r = run(bashPayload(root, 'pytest tests/', '===== 5 failed, 3 passed in 1.2s =====', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(verdictOf(statePath), 'fail', 'pytest "N failed" must record fail');
});

// ---- B2-S8: jest red summary → fail -----------------------------------------
liveTest('B2-S8 [jest] a jest red summary records last_checkpoint_verdict=fail', (root) => {
  const { docDir, statePath } = seedRun(root);
  const r = run(bashPayload(root, 'npx jest', 'Tests: 2 failed, 10 passed, 12 total', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(verdictOf(statePath), 'fail', 'jest "Tests: N failed" must record fail');
});

// ---- B2-S9: the wire records the verdict WITHOUT bumping the A2/A3 counter ----
liveTest('B2-S9 [no-double-count] the green-close wire records the verdict but does NOT bump the A2/A3 failure counter', (root) => {
  const { docDir, statePath } = seedRun(root, { consecutive_checkpoint_failures: 0 });
  const r = run(bashPayload(root, 'npm test', 'Summary: 0 passed / 4 failed / 4 total', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const s = readState(statePath) || {};
  assert.equal(s.last_checkpoint_verdict, 'fail', 'the green-close signal must be recorded');
  assert.equal(s.consecutive_checkpoint_failures, 0, 'the wire must NOT bump the A2/A3 counter (owned by the agent checkpoint path)');
});

// ---- B2-S10: a GREEN checkpoint via the wire RESETS the A2/A3 counter --------
liveTest('B2-S10 [reset-on-pass] a green checkpoint via the wire resets consecutive_checkpoint_failures even with countFailure off', (root) => {
  const { docDir, statePath } = seedRun(root, { consecutive_checkpoint_failures: 2 });
  const r = run(bashPayload(root, 'npm test', 'Summary: 9 passed / 0 failed / 9 total', false), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const s = readState(statePath) || {};
  assert.equal(s.last_checkpoint_verdict, 'pass');
  assert.equal(s.consecutive_checkpoint_failures, 0, 'a green checkpoint must reset the failure counter (green = recovered)');
});

// ---- B2-S11: prefixed test invocations are recognized ------------------------
liveTest('B2-S11 [prefix] env-var / time / sudo prefixed test commands are still checkpoints', (root) => {
  for (const cmd of ['PIPELINE_X=1 npm test', 'time npm test', 'sudo pytest tests/', 'env FOO=bar npx jest']) {
    const { docDir, statePath } = seedRun(root);
    const r = run(bashPayload(root, cmd, 'Summary: 0 passed / 1 failed / 1 total', false), { PIPELINE_DOC_PATH: docDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(verdictOf(statePath), 'fail', `"${cmd}" must be recognized as a checkpoint despite the prefix`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until the producer is wired into machine-evidence-hook):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
