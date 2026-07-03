#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.20.0) — Stop-family hooks must FAIL OPEN when the continuity counter
// cannot be persisted (the "prisão sem saída" from the 2026-07-02 hook audit).
// =============================================================================
// BUG: stop-gate-hook, e2e-eval-gate and subagent-stop-commit-hook all rely on a
// persisted counter (continuity_attempts / e2e_continuity_attempts /
// subagent_corrections) reaching a cap of 3 to convert an armed block into an
// honest terminal and ALLOW. But their persist()/withSignedState() routines
// silently decline to write in several environment-failure shapes (signer module
// unavailable, verifyState throwing at write time, tmp-write/rename failing on a
// read-only file or directory). In those states the counter NEVER advances, the
// cap NEVER fires, and the hook blocks EVERY teardown indefinitely — the only
// exits are an env escape or a session restart. The `!statePath → allow` guard
// (B5 adversarial) already encodes the correct posture for the sibling shape;
// these scenarios extend it to "counter bump did not persist".
//
// FIX CONTRACT: persist()/withSignedState() report real commit success; each
// block call site allows (fail-open, with an audit breadcrumb) when the counter
// bump could not be persisted. Healthy paths are pinned by GUARD scenarios.
//
// EXPECTED RED (before the fix): S1/S3/S5 fail (decision is 'block' forever).
// EXPECTED GREEN (after the fix): every scenario passes.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f1-stop-trap-failopen-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const STOP_GATE = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const E2E_GATE = path.resolve(__dirname, '../../../.claude/hooks/e2e-eval-gate.cjs');
const SUB_STOP = path.resolve(__dirname, '../../../.claude/hooks/subagent-stop-commit-hook.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');
const { stepForAgentType } = require('../../../.claude/hooks/subagent-stop-commit-hook.cjs');

// Pick a real governed FULL leaf dynamically (robust to roster changes).
const GOVERNED_LEAF = [
  'pipeline-orchestrator:core:task-orchestrator',
  'task-orchestrator',
  'pipeline-orchestrator:core:sanity-checker',
  'sanity-checker',
].find((t) => { try { return !!stepForAgentType('FULL', t); } catch { return false; } });

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r1', pipeline_active: true, pipeline_doc_path: docDir,
    state_version: 1, current_phase: '2-execution', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r1', updated_at: new Date().toISOString() }, null, 2));
  return { docDir, statePath };
}

// Make the signed-state ATOMIC REWRITE fail while plain READS keep working —
// the exact shape of the trap. persist() does tmp-write + renameSync(tmp, state):
//   - Windows: renameSync over a READ-ONLY target throws EPERM → chmod the file.
//   - POSIX: a READ-ONLY DIRECTORY makes the tmp writeFileSync throw EACCES.
// Probe on a sacrificial file so the real state is never clobbered. Returns a
// restore() for cleanup.
function makeStateUnwritable(statePath) {
  const dir = path.dirname(statePath);
  const probe = path.join(dir, 'unwritable-probe.json');
  fs.writeFileSync(probe, 'p');
  fs.chmodSync(probe, 0o444);
  const probeTmp = `${probe}.tmp`;
  fs.writeFileSync(probeTmp, 'q');
  let renameOverReadonlyFails = false;
  try { fs.renameSync(probeTmp, probe); } catch { renameOverReadonlyFails = true; try { fs.unlinkSync(probeTmp); } catch { /* */ } }
  try { fs.chmodSync(probe, 0o666); fs.unlinkSync(probe); } catch { /* */ }

  if (renameOverReadonlyFails) {
    fs.chmodSync(statePath, 0o444);
    return { restore: () => { try { fs.chmodSync(statePath, 0o666); } catch { /* */ } }, effective: true };
  }
  fs.chmodSync(dir, 0o555);
  // Root ignores permission bits entirely (CI containers run as root) — re-probe:
  // if a write inside the "read-only" dir still succeeds, the trap is INEFFECTIVE
  // on this platform and the NEW scenarios must SKIP instead of false-failing.
  let effective = true;
  try {
    const rootProbe = path.join(dir, 'root-probe.tmp');
    fs.writeFileSync(rootProbe, 'r');
    fs.unlinkSync(rootProbe);
    effective = false;
  } catch { /* write really blocked → trap effective */ }
  return { restore: () => { try { fs.chmodSync(dir, 0o755); } catch { /* */ } }, effective };
}

function run(hook, payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_STOP_BLOCK_ENFORCEMENT;
  delete base.PIPELINE_E2E_EVAL_ENFORCEMENT;
  delete base.PIPELINE_SUBAGENTSTOP_ENFORCEMENT;
  return spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }
function readState(statePath) { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }

let pass = 0, fail = 0, skipped = 0; const failed = [];
const SKIP = Symbol('skip');
function liveTest(name, fn) {
  let dir; const restores = [];
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-stoptrap-'));
    // fn may signal SKIP (returning the sentinel) when the platform cannot
    // simulate the unwritable-state trap (e.g. running as root — chmod is inert).
    const out = fn(dir, (r) => restores.push(r));
    if (out === SKIP) { console.log(`  [SKIP] ${name} (trap not simulable on this platform)`); skipped++; }
    else { console.log(`  [PASS] ${name}`); pass++; }
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    for (const r of restores) { try { r(); } catch { /* */ } }
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }
  }
}
// Apply the trap; register cleanup; SKIP-signal when ineffective (root).
function armTrapOrSkip(statePath, onCleanup) {
  const trap = makeStateUnwritable(statePath);
  onCleanup(trap.restore);
  return trap.effective ? null : SKIP;
}

console.log('=== F1 v8.20.0 — Stop-family fail-open when the continuity counter cannot persist ===');

// ---- stop-gate-hook ----------------------------------------------------------

liveTest('F1-S1 [NEW][stop-gate] unpersistable counter → allow (never an infinite block)', (root, onCleanup) => {
  const { docDir, statePath } = seedRun(root, {});
  if (armTrapOrSkip(statePath, onCleanup) === SKIP) return SKIP;
  const env = { PIPELINE_DOC_PATH: docDir };
  const r1 = run(STOP_GATE, { hook_event_name: 'Stop', cwd: root }, env);
  assert.equal(r1.status, 0, r1.stderr);
  assert.notEqual(decisionOf(r1), 'block',
    'counter bump did not persist → the block would repeat FOREVER; must allow (RED today: block)');
});

liveTest('F1-S2 [GUARD][stop-gate] healthy path still blocks and PERSISTS the counter', (root) => {
  const { docDir, statePath } = seedRun(root, {});
  const r1 = run(STOP_GATE, { hook_event_name: 'Stop', cwd: root }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(decisionOf(r1), 'block', 'an armed incomplete run with a writable state still blocks');
  const st = readState(statePath);
  assert.equal(st.continuity_attempts, 1, 'the continuity counter must really persist on the healthy path');
  const v = verifyState(st, { key: readHmacKey() });
  assert.equal(v.valid, true, 'the persisted state stays validly signed');
});

liveTest('F1-S2b [GUARD][stop-gate] the 3-cap still converts to hard_failed + allow', (root) => {
  const { docDir, statePath } = seedRun(root, { continuity_attempts: 2 });
  const r = run(STOP_GATE, { hook_event_name: 'Stop', cwd: root }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'at the cap the gate must not block again');
  const st = readState(statePath);
  assert.equal(st.terminal_state, 'hard_failed', 'the cap path still writes the honest terminal');
});

// ---- e2e-eval-gate -------------------------------------------------------------

function seedE2E(root) {
  const seeded = seedRun(root, {
    pipeline_active: false, status: 'completed', terminal_state: 'completed', current_phase: '3-closure',
  });
  fs.writeFileSync(path.join(seeded.docDir, 'e2e-eval.json'),
    JSON.stringify({ glitch_count: 2, e2e_score: 60 }, null, 2));
  return seeded;
}

liveTest('F1-S3 [NEW][e2e-eval] unpersistable counter → allow (never an infinite block)', (root, onCleanup) => {
  const { docDir, statePath } = seedE2E(root);
  if (armTrapOrSkip(statePath, onCleanup) === SKIP) return SKIP;
  const r = run(E2E_GATE, { hook_event_name: 'Stop', cwd: root }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'e2e continuity bump did not persist → must allow (RED today: block forever)');
});

liveTest('F1-S4 [GUARD][e2e-eval] healthy glitchy close still blocks and persists the marker', (root) => {
  const { docDir, statePath } = seedE2E(root);
  const r = run(E2E_GATE, { hook_event_name: 'Stop', cwd: root }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'a glitchy terminated run still triggers the self-eval block');
  const st = readState(statePath);
  assert.equal(st.e2e_continuity_attempts, 1, 'the e2e continuity counter must really persist');
});

// ---- subagent-stop-commit-hook -------------------------------------------------

liveTest('F1-S5 [NEW][subagent-stop] unpersistable counter → allow (never an infinite block)', (root, onCleanup) => {
  assert.ok(GOVERNED_LEAF, 'a governed FULL leaf must be resolvable from the manifest');
  const { docDir, statePath } = seedRun(root, {});
  if (armTrapOrSkip(statePath, onCleanup) === SKIP) return SKIP;
  const r = run(SUB_STOP, {
    hook_event_name: 'SubagentStop', cwd: root,
    agent_type: GOVERNED_LEAF, agent_id: 'a1',
    last_assistant_message: 'plain prose, no result block',
  }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'correction bump did not persist → must allow (RED today: block forever)');
});

liveTest('F1-S6 [GUARD][subagent-stop] healthy missing-block still blocks and persists the counter', (root) => {
  assert.ok(GOVERNED_LEAF, 'a governed FULL leaf must be resolvable from the manifest');
  const { docDir, statePath } = seedRun(root, {});
  const r = run(SUB_STOP, {
    hook_event_name: 'SubagentStop', cwd: root,
    agent_type: GOVERNED_LEAF, agent_id: 'a1',
    last_assistant_message: 'plain prose, no result block',
  }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'a governed leaf without a result block still blocks (writable state)');
  const st = readState(statePath);
  const counts = st.subagent_corrections || {};
  const bumped = Object.values(counts).some((v) => v === 1);
  assert.equal(bumped, true, 'the correction counter must really persist on the healthy path');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${skipped} skipped / ${pass + fail + skipped} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
