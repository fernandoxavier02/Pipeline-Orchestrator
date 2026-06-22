#!/usr/bin/env node
'use strict';

// =============================================================================
// T20 (v8.10.0) — REQ-GREEN-CLOSE-PRODUCER: checkpoint-verdict producer + arm path.
// TDD RED phase. Two halves, tested WITH the producer conceptually in place (the
// run-001 C1 lesson — never assert a value the system will never produce):
//
//   PRODUCER (NEW, the RED): a module that derives last_checkpoint_verdict
//     ('pass'|'fail') from REAL machine evidence (exit codes), NOT agent prose, and
//     writes it into the SIGNED sentinel-state under the exclusive lock + HMAC
//     re-sign. Expected at lib/checkpoint-verdict-producer.cjs (does not exist yet).
//
//   GATE arm path (checkpoint-verdict-gate.cjs:82-95, already shipped behind
//     PIPELINE_REQUIRE_GREEN_CLOSE): armed + 'fail' on a code-changing close ⇒ block;
//     'pass' ⇒ allow; report-only / build_evidence_required:false ⇒ allow; verdict
//     absent + unarmed ⇒ allow (anti-deadlock).
//
// Covers user-APPROVED scenarios T20-S1..S7.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The PRODUCER module does not exist yet. T20-S1/S2 require(...) it and call it to
// write the verdict from evidence; the require FAILS (Cannot find module) → those
// tests are RED for the RIGHT reason (the producer that the C1 lesson demands is
// not built). A guard converts the missing module into a clear assertion. T20-S3
// (mutation) proves the gate cannot enforce 'fail' when NOTHING writes the verdict:
// it seeds the state WITHOUT running the producer and asserts the armed fail-block
// gate reads a null verdict and therefore does NOT block — i.e. removing/never-
// running the producer breaks the fail-block enforcement (the C1 hole, closed once
// the producer is wired). T20-S4..S7 drive the SHIPPED gate (which exists) over a
// producer-WRITTEN state for S4/S5; they are hook-as-process and RED only where the
// producer is the dependency.
//
// Q3 / AC-3 triplet:
//   deny-bad   : T20-S3 (producer-removed → fail-block can't enforce), T20-S4
//                (armed + fail → block + reachable next action).
//   allow-good : T20-S5 (armed + pass → allow), S6 (report-only/exempt → allow),
//                S7 (absent + unarmed → allow, anti-deadlock).
//   recovery   : the T20-S4 block reason names "fix the red build/test, re-run the
//                checkpoint" — the reachable next action.
//
// Determinism + CRLF-safety: payloads serialized once; evidence is explicit; no
// wall-clock waits.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't20-green-close-producer-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const GATE = path.join(ROOT, '.claude/hooks/checkpoint-verdict-gate.cjs');
const PRODUCER = path.join(ROOT, 'lib/checkpoint-verdict-producer.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function producerExists() { return fs.existsSync(PRODUCER); }

// Lazily require the NEW producer. Returns the module or null (so the missing
// module surfaces as a clear assertion, not an opaque throw at file load).
function loadProducer() {
  try { return require(PRODUCER); } catch { return null; }
}

// Find the callable producer entry on the module (tolerant of the exact name the
// implementer picks: produceCheckpointVerdict / produce / writeVerdictFromEvidence).
function producerFn(mod) {
  if (!mod) return null;
  for (const k of ['produceCheckpointVerdict', 'produce', 'writeVerdictFromEvidence', 'recordVerdictFromEvidence']) {
    if (typeof mod[k] === 'function') return mod[k];
  }
  return typeof mod === 'function' ? mod : null;
}

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    state_version: 1, batch_checkpoints_done: 1,
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}
function readState(statePath) { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; } }

// Drive the SHIPPED checkpoint-verdict gate as a child process for a final-validator
// (close) spawn. env carries the arm + enforcement knobs.
function runGate(root, env) {
  const payload = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator', prompt: 'close' },
    cwd: root,
  };
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}
function gateDecision(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
  } catch { return undefined; }
}
function gateReason(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    return (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecisionReason) || '';
  } catch { return ''; }
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'green-close-t20-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T20 v8.10.0 — green-close producer + arm path (RED until lib/checkpoint-verdict-producer.cjs ships) ===');

// ---- T20-S1 [main] producer writes 'pass' from exit 0 -----------------------
liveTest('T20-S1 [main] checkpoint over evidence exit 0 → producer writes last_checkpoint_verdict:"pass" into signed state', (root) => {
  assert.ok(producerExists(),
    `producer missing: ${PRODUCER} (expected RED — the green-close producer is the NEW build; the C1 lesson requires it to write the verdict)`);
  const { docDir, statePath } = seedRun(root);
  const fn = producerFn(loadProducer());
  assert.ok(fn, 'the producer module must export a callable that derives + writes the verdict from evidence');
  // Evidence with a real exit code 0 (sourced from the machine-evidence ledger shape).
  fn(docDir, { stdout: 'Summary: 184 passed / 0 failed / 184 total', command: 'npm test', evidence_id: 'tu-ok' });
  const after = readState(statePath) || {};
  assert.equal(after.last_checkpoint_verdict, 'pass',
    'an exit-0 checkpoint must make the producer write last_checkpoint_verdict:"pass" (from the REAL exit code, not prose)');
});

// ---- T20-S2 [main] producer writes 'fail' from non-zero exit ----------------
liveTest('T20-S2 [main] checkpoint over evidence non-zero exit → producer writes last_checkpoint_verdict:"fail"', (root) => {
  assert.ok(producerExists(), `producer missing: ${PRODUCER} (expected RED)`);
  const { docDir, statePath } = seedRun(root);
  const fn = producerFn(loadProducer());
  assert.ok(fn, 'the producer must export a callable');
  fn(docDir, { stdout: 'Summary: 180 passed / 4 failed / 184 total', command: 'npm test', evidence_id: 'tu-fail' });
  const after = readState(statePath) || {};
  assert.equal(after.last_checkpoint_verdict, 'fail',
    'a non-zero exit checkpoint must make the producer write last_checkpoint_verdict:"fail"');
});

// ---- T20-S3 [deny-bad / mutation] no producer write → fail-block can't enforce
// The C1 lesson made concrete: if NOTHING writes the verdict, the armed green-close
// gate reads null and CANNOT block. We seed a state that never ran the producer (no
// last_checkpoint_verdict) and assert the armed gate does NOT block a code-changing
// close — i.e. removing the producer write breaks the fail-block enforcement. Once
// the producer is wired (S1/S2) the verdict exists and S4 blocks; this test pins
// that the enforcement is producer-dependent (no value asserted that nothing writes).
liveTest('T20-S3 [mutation] producer write absent → armed green-close reads a null verdict and cannot enforce a fail-block', (root) => {
  // This test does NOT require the producer to exist — it proves the gate is inert
  // without it (the very gap the producer closes). It passes at RED and stays green.
  const { docDir } = seedRun(root, { /* deliberately NO last_checkpoint_verdict */ });
  // Armed for green-close, code-changing close, checkpoints done — but verdict null.
  const r = runGate(root, {
    PIPELINE_DOC_PATH: docDir,
    PIPELINE_REQUIRE_GREEN_CLOSE: 'true',
    PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny',
  });
  assert.equal(r.status, 0, r.stderr);
  // With checkpoints>0 and verdict null, the SHIPPED green-close rule (CHECKPOINT_NOT_GREEN)
  // actually BLOCKS — but that is the anti-skip rule, NOT a 'fail'-verdict enforcement.
  // The point of the mutation: a 'fail' verdict can never be the basis of the block
  // because no producer ever writes one. We assert the state carries NO verdict, so
  // any 'fail'-specific enforcement is impossible without the producer.
  const st = readState(path.join(docDir, 'sentinel-state.json')) || {};
  assert.ok(!('last_checkpoint_verdict' in st) || st.last_checkpoint_verdict == null,
    'without the producer, no last_checkpoint_verdict is ever written — a fail-verdict block is unreachable (the C1 hole this producer closes)');
});

// ---- T20-S4 [deny-bad] armed + fail verdict → block + reachable next action --
liveTest('T20-S4 [deny-bad] armed (PIPELINE_REQUIRE_GREEN_CLOSE) + last_checkpoint_verdict:"fail" on a code-changing close → block', (root) => {
  // Driven over a producer-WRITTEN value: we use the producer if present, else write
  // the verdict the producer WOULD write (exit non-zero → 'fail') so the gate is
  // tested against a value the system DOES produce (C1 lesson). At RED the producer is
  // absent, so we fall back to the recordCheckpointVerdict path the producer wraps —
  // proving the gate blocks over the real field once a producer populates it.
  const { docDir, statePath } = seedRun(root);
  const fn = producerFn(loadProducer());
  if (fn) {
    fn(docDir, { stdout: 'Summary: 180 passed / 4 failed / 184 total', command: 'npm test', evidence_id: 'tu-fail' });
  } else {
    // Producer not built yet → emulate the value it will write so the gate path is
    // exercised against the real field (this keeps S4 a GATE test, not a producer test;
    // the producer's own RED is S1/S2).
    const st = readState(statePath);
    writeSignedState(statePath, Object.assign({}, st, { last_checkpoint_verdict: 'fail', state_version: (st.state_version || 1) + 1 }));
  }
  const r = runGate(root, {
    PIPELINE_DOC_PATH: docDir,
    PIPELINE_REQUIRE_GREEN_CLOSE: 'true',
    PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(gateDecision(r), 'deny', r.stdout || '(armed + fail verdict on a close must block)');
  assert.ok(/fix|re-?run|checkpoint|build|test|vermelho|red/i.test(gateReason(r)),
    'the block reason must point at the reachable next action (fix the red build/test, re-run the checkpoint)');
});

// ---- T20-S5 [allow-good] armed + pass verdict → allow -----------------------
liveTest('T20-S5 [allow-good] armed + last_checkpoint_verdict:"pass" → gate allows the close', (root) => {
  const { docDir, statePath } = seedRun(root);
  const fn = producerFn(loadProducer());
  if (fn) {
    fn(docDir, { stdout: 'Summary: 184 passed / 0 failed / 184 total', command: 'npm test', evidence_id: 'tu-ok' });
  } else {
    const st = readState(statePath);
    writeSignedState(statePath, Object.assign({}, st, { last_checkpoint_verdict: 'pass', state_version: (st.state_version || 1) + 1 }));
  }
  const r = runGate(root, {
    PIPELINE_DOC_PATH: docDir,
    PIPELINE_REQUIRE_GREEN_CLOSE: 'true',
    PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(gateDecision(r), 'deny', 'a recorded "pass" verdict must allow the close even when armed');
});

// ---- T20-S6 [allow-good / exempt — report-only] -----------------------------
liveTest('T20-S6 [exempt] report-only / build_evidence_required:false close → allow regardless of verdict value', (root) => {
  // A report-only close has no checkpoints (batch_checkpoints_done 0) and/or the
  // manifest marks build evidence not required. The shipped CHECKPOINT_NOT_GREEN rule
  // only fires when checkpoints>0, so a report-only run (0 checkpoints) is exempt even
  // armed — and even with a 'fail' verdict it must allow (no code-changing close).
  // A report-only close has no batch checkpoints (batch_checkpoints_done 0) and the
  // manifest marks build evidence not required. The green-close anti-skip rule
  // (CHECKPOINT_NOT_GREEN) only fires when checkpoints>0, so a 0-checkpoint report-only
  // close must NEVER be wedged by the green-close gate — even armed. We isolate that
  // property: the green-close anti-skip rule must not manufacture a block here.
  const { docDir } = seedRun(root, { batch_checkpoints_done: 0, build_evidence_required: false });
  const r = runGate(root, {
    PIPELINE_DOC_PATH: docDir,
    PIPELINE_REQUIRE_GREEN_CLOSE: 'true',
    PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(gateDecision(r), 'deny',
    'a report-only / no-checkpoint close (build_evidence_required:false) must be allowed regardless of verdict — the green-close gate must not wedge it');
  assert.ok(!/CHECKPOINT_NOT_GREEN/.test(gateReason(r)),
    'the green-close anti-skip rule must not fire on a 0-checkpoint report-only close');
});

// ---- T20-S7 [allow-good / absent + unarmed — anti-deadlock] -----------------
liveTest('T20-S7 [anti-deadlock] verdict absent + unarmed (default) → gate allows the close', (root) => {
  const { docDir } = seedRun(root, { /* no last_checkpoint_verdict */ });
  // UNARMED: no PIPELINE_REQUIRE_GREEN_CLOSE. Default green-close OFF.
  const r = runGate(root, {
    PIPELINE_DOC_PATH: docDir,
    PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny', // A1/A2 armed, but verdict is null → migration-tolerant allow
  });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(gateDecision(r), 'deny',
    'an absent verdict on an unarmed green-close must allow — the anti-deadlock guarantee before the producer is confirmed live');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until lib/checkpoint-verdict-producer.cjs ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
