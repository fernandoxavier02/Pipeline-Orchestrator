#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.9.0) — T4: PreToolUse:Agent dispatch-record writer (REQ-DISPATCH-RECORD)
// TDD RED phase. Hook-as-process tests for the NOT-YET-EXISTING hook
//   .claude/hooks/dispatch-record-hook.cjs
// covering the 10 user-APPROVED scenarios S4-1..S4-10 from
//   05-quality-gate-router.md → T4.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The hook file does not exist yet. Each test spawns it as a node child process
// with JSON on stdin (exactly how Claude Code invokes a PreToolUse hook) and
// asserts the stdout decision / state-file side-effect. Because the script is
// absent, `node <missing>.cjs` exits non-zero with empty stdout (ENOENT), so
// every assertion about decision/record/breadcrumb FAILS — a valid "missing
// hook" RED (NOT a test bug). A guard at the top of each test makes the missing
// file produce a clear assertion message rather than an opaque crash. Turns
// GREEN when the writer ships with the lock + fallback + governed-corrupt deny.
//
// Q3 deny-gate pairing for this task:
//   deny-bad : S4-4 (governed-corrupt → block)
//   allow-good: S4-5 (absent state → allow), S4-6 (valid governed → allow, no updatedInput)
//
// Determinism + CRLF-safety: payloads are serialized once; the input-parse test
// (S4-8) feeds explicit \r\n. No wall-clock waits; the race test (S4-2) joins
// two child processes and asserts the post-condition, not timing.
// =============================================================================

// DETERMINISTIC SIGNING (H2 fix / UNIQUE-QUAL-1): seed a STABLE HMAC key via the
// env secret BEFORE requiring the signer, so signing is ALWAYS active in this
// process AND in every spawned child (the env is inherited). This guarantees the
// forge-and-deny invariant (S4-4) is exercised on every machine — it must never
// self-skip in a keyless CI runner, which was the headline security gap.
process.env.PIPELINE_HMAC_SECRET = 'f4-dispatch-record-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '../../../.claude/hooks');
const HOOK = path.join(HOOKS, 'dispatch-record-hook.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

function hookExists() { return fs.existsSync(HOOK); }

// Seed a SIGNED active run directory + active-run pointer. Returns docDir and
// whether HMAC signing is actually active in this env (so corrupt-state tests
// can self-skip rather than false-pass when no key is available).
function seedSignedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const p = path.join(docDir, 'sentinel-state.json');
  writeSignedState(p, Object.assign({
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    state_version: 1, pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  const written = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = verifyState(written, { key: readHmacKey() });
  const signingActive = !(v.unsigned || v.key_unavailable);
  return { docDir, statePath: p, signingActive };
}

function tamper(statePath) {
  const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  written.run_id = 'TAMPERED'; // break the signed body without re-signing
  fs.writeFileSync(statePath, JSON.stringify(written));
}

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

function run(payload, env, rawInput) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof rawInput === 'string' ? rawInput : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

function decisionOf(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
  } catch { return undefined; }
}

function agentPayload(root, toolUseId) {
  const p = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-implementer-task', prompt: 'go' },
    cwd: root,
  };
  if (toolUseId !== undefined) p.tool_use_id = toolUseId;
  return p;
}

let pass = 0, fail = 0;
const failed = [];
// Tests register here; they run SEQUENTIALLY in an async driver at the end so a
// test body may be async (S4-2 needs real concurrent child processes). A sync
// body that throws still rejects the awaited call and is caught here.
const REGISTERED = [];
function liveTest(name, fn) { REGISTERED.push({ name, fn }); }

async function runRegistered() {
  for (const { name, fn } of REGISTERED) {
    let dir;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatchrec-f4-'));
      await fn(dir);
      console.log(`  [PASS] ${name}`); pass++;
    } catch (e) {
      console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
    } finally {
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    }
  }
}

console.log('=== F4 v8.9.0 — T4 dispatch-record writer (RED until .claude/hooks/dispatch-record-hook.cjs ships) ===');

// ---- S4-1 [main] two parallel same-type → distinct records ------------------
liveTest('S4-1 [main] two same-type Agent dispatches → two distinct records in pending_dispatches', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED — writer not built yet)`);
  const { docDir, statePath } = seedSignedRun(root);
  const r1 = run(agentPayload(root, 'tool-use-AAA'), { PIPELINE_DOC_PATH: docDir });
  const r2 = run(agentPayload(root, 'tool-use-BBB'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r2.status, 0, r2.stderr);
  const pd = (readState(statePath) || {}).pending_dispatches || {};
  assert.ok(Object.prototype.hasOwnProperty.call(pd, 'tool-use-AAA'), 'first dispatch record missing');
  assert.ok(Object.prototype.hasOwnProperty.call(pd, 'tool-use-BBB'), 'second dispatch record missing');
  assert.equal(Object.keys(pd).length, 2, 'two same-type dispatches must yield two distinct records, no overwrite');
});

// Barrier-synchronized concurrent child: requires the REAL hook's decide(), spins
// on a GO file so all writers enter the locked read-modify-write at the SAME
// instant (after module load), then performs exactly one dispatch write. This
// guarantees the critical sections genuinely OVERLAP — the original test ran two
// SEQUENTIAL spawnSync calls and discarded its async launcher (`void launch`), so
// the lock was never exercised and the test passed trivially.
//
// SEC-NEW-01: readiness handshake instead of a fixed sleep. After module load and
// BEFORE the spin, each child writes a ready-<id> file; the orchestrator drops GO
// only once BOTH ready files exist. On a cold/slow machine the old fixed 150ms
// setTimeout could fire before a child reached the spin, letting the two writes
// serialize and masking a lock failure. The handshake guarantees both children are
// parked at the barrier when GO drops, so the critical sections always overlap.
const BARRIER_CHILD = `
const fs = require('node:fs');
const { decide } = require(${JSON.stringify(HOOK)});
const [root, docDir, goFile, id, readyFile] = process.argv.slice(2);
process.env.PIPELINE_DOC_PATH = docDir;
try { fs.writeFileSync(readyFile, '1'); } catch {} // signal "parked at the barrier"
const deadline = Date.now() + 10000;
while (!fs.existsSync(goFile)) { if (Date.now() > deadline) process.exit(2); } // spin barrier
decide({ tool_name: 'Agent', tool_input: { subagent_type: 'x' }, cwd: root, tool_use_id: id });
`;

// ---- S4-2 [main] lock prevents lost update under GENUINE concurrency ---------
liveTest('S4-2 [main] two barrier-synchronized concurrent writers → no lost update (the exclusive lock serializes the RMW)', async (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { spawn } = require('node:child_process');

  const childPath = path.join(root, 'barrier-child.cjs');
  fs.writeFileSync(childPath, BARRIER_CHILD);

  // PROOF THE LOCK IS LOAD-BEARING (verified empirically while authoring): under
  // this barrier, a build with NO lock around the read-modify-write loses a record
  // on ~92% of batches (both writers read the same baseline; the later atomic
  // rename clobbers the earlier one). WITH the exclusive lock the writers serialize
  // and BOTH records always survive. We require EVERY barrier batch to be clean
  // across a few batches: the lock makes that deterministic; a lockless build fails
  // it with overwhelming probability (≈1 - 0.08^BATCHES).
  function barrierBatch() {
    const sub = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatchrec-race-'));
    const { docDir, statePath } = seedSignedRun(sub);
    const goFile = path.join(sub, 'GO');
    const ids = ['race-A', 'race-B'];
    const readyFiles = ids.map((id) => path.join(sub, `ready-${id}`));
    const closes = [];
    for (let i = 0; i < ids.length; i += 1) {
      const c = spawn(process.execPath, [childPath, sub, docDir, goFile, ids[i], readyFiles[i]]);
      closes.push(new Promise((res) => c.on('close', (code) => res(code))));
    }
    // Readiness handshake (SEC-NEW-01): release the barrier ONLY once BOTH children
    // have parked at the spin (their ready-<id> files exist). Guarantees temporal
    // overlap regardless of machine speed — no fixed-time sleep that could let a
    // slow child serialize behind the other and false-PASS a lockless build.
    const goDeadline = Date.now() + 10000;
    const dropGo = () => {
      if (readyFiles.every((f) => fs.existsSync(f))) { try { fs.writeFileSync(goFile, '1'); } catch {} return; }
      if (Date.now() > goDeadline) { try { fs.writeFileSync(goFile, '1'); } catch {} return; } // safety: never hang
      setImmediate(dropGo);
    };
    dropGo();
    return Promise.all(closes).then((codes) => {
      for (const code of codes) assert.equal(code, 0, 'a barrier writer exited non-zero (barrier timeout?)');
      const pd = (readState(statePath) || {}).pending_dispatches || {};
      const survived = ['race-A', 'race-B'].filter((k) => Object.prototype.hasOwnProperty.call(pd, k)).length;
      try { fs.rmSync(sub, { recursive: true, force: true }); } catch {}
      return survived;
    });
  }

  const BATCHES = 3;
  for (let b = 0; b < BATCHES; b += 1) {
    const survived = await barrierBatch();
    assert.equal(survived, 2,
      `lost update under genuine concurrency (batch ${b + 1}/${BATCHES}): only ${survived}/2 records survived — ` +
      'the exclusive lock did not serialize the read-modify-write');
  }
});

// ---- S4-3 [main] tool_use_id absent → 'unknown' + DISPATCH_ID_FALLBACK ------
liveTest('S4-3 [main] absent tool_use_id → record under "unknown" + DISPATCH_ID_FALLBACK breadcrumb', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir, statePath } = seedSignedRun(root);
  const r = run(agentPayload(root, /* no tool_use_id */ undefined), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const pd = (readState(statePath) || {}).pending_dispatches || {};
  assert.ok(Object.prototype.hasOwnProperty.call(pd, 'unknown'),
    'absent tool_use_id must key the record under "unknown", not drop it');
  const audit = fs.existsSync(path.join(docDir, 'gate-decisions.jsonl'))
    ? fs.readFileSync(path.join(docDir, 'gate-decisions.jsonl'), 'utf8') : '';
  assert.match(audit, /DISPATCH_ID_FALLBACK/,
    'absent tool_use_id must emit a DISPATCH_ID_FALLBACK AUDIT breadcrumb');
  // DD-NEW-01: the breadcrumb MUST go through the canonical SSOT writer, so the
  // line carries the 5 correlation fields (run_id/plugin_version/schema_version/
  // type/complexity) AND a parseable canonical AUDIT/TRIGGERED shape. A raw
  // fs.appendFileSync of the hand-built entry would omit these — assert they exist.
  const fbLine = audit.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((o) => o && o.gate === 'DISPATCH_ID_FALLBACK');
  assert.ok(fbLine, 'DISPATCH_ID_FALLBACK breadcrumb line must be valid canonical JSONL');
  assert.equal(fbLine.hardness, 'AUDIT', 'breadcrumb must stay AUDIT-class');
  assert.equal(fbLine.decision, 'TRIGGERED', 'breadcrumb must keep the canonical TRIGGERED decision');
  for (const k of ['run_id', 'plugin_version', 'schema_version', 'type', 'complexity']) {
    assert.ok(Object.prototype.hasOwnProperty.call(fbLine, k),
      `breadcrumb must carry the "${k}" correlation field stamped by the canonical writer (no raw fs.appendFileSync)`);
  }
});

// ---- S4-4 [deny-bad] governed-corrupt → block ------------------------------
// H2 fix (UNIQUE-QUAL-1): NO self-skip. The stable PIPELINE_HMAC_SECRET seeded at
// the top of this file makes signing deterministically active in every env, so the
// forge-and-deny core invariant is ALWAYS exercised. We ASSERT signingActive
// rather than silently `return`-ing on a keyless runner — a build that somehow
// disabled signing would FAIL here, not pass as a no-op.
//
// Mutation-resistance (b): weakening the deny in dispatch-record-hook.cjs (e.g.
// removing the governed-corrupt deny branch) makes this DENY assertion FAIL.
liveTest('S4-4 [deny-bad] governed run + corrupt signed state → decision deny (H2 parity, signing always active)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir, statePath, signingActive } = seedSignedRun(root);
  assert.ok(signingActive,
    'signing MUST be active (stable PIPELINE_HMAC_SECRET seeded) — the governed-corrupt→deny invariant must never self-skip on a keyless CI runner (UNIQUE-QUAL-1)');
  tamper(statePath);
  const r = run(agentPayload(root, 'tu-corrupt'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'deny', r.stdout || '(empty stdout — corrupt state FAILED OPEN; expected deny)');
});

// ---- S4-4b [allow-good] no DURABLE key → unsigned-tolerated → allow ----------
// Companion branch to S4-4 (H2 fix / SEC-1). Forces the H1 no-durable-key
// condition: NO env secret AND a HOME/USERPROFILE pointed at a read-only-ish temp
// dir whose plugin-cache path cannot hold a key. getOrCreateHmacKey() must return
// null, writeSignedState must emit the state UNSIGNED, and the dispatch hook must
// see verifyState → { valid:true, unsigned:true } and ALLOW (migration-tolerated),
// NOT classify it CORRUPT and DENY. This is the brick the ephemeral-key fallback
// caused; the H1 fix removes it.
//
// Mutation-resistance (a): reverting the H1 signer change (back to fabricating an
// ephemeral pid+Date.now() key) makes getOrCreateHmacKey return a non-null key, so
// writeSignedState SIGNS with a key the spawned hook child (different process,
// different ephemeral key, no shared durable key file) cannot reproduce → the hook
// classifies the state CORRUPT and DENIES → this ALLOW assertion FAILS.
liveTest('S4-4b [allow-good] no durable HMAC key → state written UNSIGNED → governed dispatch ALLOWED (not corrupt)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);

  // A child env with NO durable key AND no way to persist one: blank the env secret,
  // point the home dir at a fresh temp dir, and OCCUPY the version-agnostic key path
  // with a DIRECTORY so fs.writeFileSync(keyPath, ...) throws EISDIR — forcing
  // getOrCreateHmacKey() down the catch branch (return null) on every OS. Without
  // this, getOrCreateHmacKey would happily CREATE a durable key under the fake home
  // and sign, defeating the no-durable-key scenario.
  const fakeHome = path.join(root, 'no-key-home');
  const keyDir = path.join(fakeHome, '.claude', 'plugins', 'cache', 'FX-studio-AI', 'pipeline-orchestrator', '.hmac-key');
  fs.mkdirSync(keyDir, { recursive: true }); // key PATH is a directory → write fails
  // Clear PIPELINE_HMAC_SECRET (the file-level stable secret) for the child by
  // setting it empty; HOME/USERPROFILE drive os.homedir() for the cache path.
  const keylessEnv = {
    ...process.env,
    PIPELINE_HMAC_SECRET: '',     // no env key
    HOME: fakeHome,
    USERPROFILE: fakeHome,        // Windows homedir source
  };

  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');

  // Write the state THROUGH a keyless child so getOrCreateHmacKey() resolves null
  // in that process and the body lands UNSIGNED (no __signature field).
  const writerSrc =
    'const s = require(' + JSON.stringify(path.resolve(__dirname, '../../../lib/sentinel-state-signer.cjs')) + ');\n' +
    'const fs = require("node:fs"); const p = process.argv[2];\n' +
    's.writeSignedState(p, { run_id: "r", pipeline_active: true, task_type: "Bug Fix", pipeline_doc_path: ' + JSON.stringify(docDir) + ', state_version: 1, pending_dispatches: {} });\n';
  const writerPath = path.join(root, 'keyless-writer.cjs');
  fs.writeFileSync(writerPath, writerSrc);
  const w = spawnSync(process.execPath, [writerPath, statePath], { encoding: 'utf8', env: keylessEnv });
  assert.equal(w.status, 0, w.stderr || '(keyless writer child failed)');

  // The state on disk MUST be unsigned (the H1 contract) — no __signature field.
  const onDisk = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.ok(!('__signature' in onDisk),
    'with no durable key, writeSignedState must emit the state UNSIGNED (no __signature) — not an ephemeral-key signature that bricks the next process');

  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );

  // Now the dispatch hook (same keyless env) must treat the unsigned state as
  // migration-tolerated and ALLOW the governed dispatch — never DENY.
  const r = run(agentPayload(root, 'tu-nokey'), { ...keylessEnv, PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny',
    'a run with no durable key writes UNSIGNED state and must be ALLOWED (unsigned-tolerated), not bricked into a corrupt-DENY (SEC-1)');
});

// ---- S4-5 [allow-good] absent state → allow (anti-deadlock) -----------------
liveTest('S4-5 [allow-good] no sentinel-state at all → does NOT block (ungoverned/absent allowed)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true }); // no state file
  const r = run(agentPayload(root, 'tu-absent'), {}); // no PIPELINE_DOC_PATH
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny', 'absent state must never block — non-pipeline work stays free');
});

// ---- S4-6 [allow-good] valid governed → write proceeds + envelope updatedInput
// SUPERSEDED 2026-06-21 (T12 / REQ-DISPATCH-ENVELOPE, v8.10.0): the v8.9.0 contract
// DEFER'd envelope injection ("must NOT emit updatedInput"). Run 002 amends that
// DEFER→IMPLEMENT: on the governed allow path with a string prompt the hook NOW emits
// a prepend-once hookSpecificOutput.updatedInput (full coverage lives in T12). This
// pin is updated to the new shipped contract — the record-write side effect is
// unchanged (S4-1/S4-7 still pin it); here we assert the envelope is present and the
// decision is still allow.
liveTest('S4-6 [allow-good] valid governed state → write proceeds and hook emits the prepend-once envelope updatedInput (T12)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir } = seedSignedRun(root);
  const r = run(agentPayload(root, 'tu-valid'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny', 'valid governed state must not be blocked');
  const out = (() => { try { return JSON.parse(r.stdout || '{}'); } catch { return {}; } })();
  const hso = out.hookSpecificOutput || {};
  const ui = out.updatedInput || hso.updatedInput;
  assert.ok(ui && typeof ui === 'object',
    'the governed allow path now emits updatedInput carrying the prepend-once [PIPELINE run=…] envelope (T12)');
  assert.equal(ui.subagent_type, 'pipeline-orchestrator:executor:executor-implementer-task',
    'updatedInput must carry every non-prompt tool_input field byte-identical (only prompt is rewritten)');
  assert.match(String(ui.prompt), /^\[PIPELINE run=/, 'the rewritten prompt must start with one envelope header');
});

// ---- S4-7 [regression] state_version bumped by one --------------------------
liveTest('S4-7 [regression] write bumps state_version by exactly one (read→verify→bump→atomic-rename)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir, statePath } = seedSignedRun(root, { state_version: 7 });
  run(agentPayload(root, 'tu-bump'), { PIPELINE_DOC_PATH: docDir });
  const after = readState(statePath) || {};
  assert.equal(after.state_version, 8, 'state_version must be exactly one higher after a record write');
});

// ---- S4-8 [regression] CRLF input parses without error ----------------------
liveTest('S4-8 [regression] CRLF-laden stdin parses cleanly (CRLF-safe split)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir } = seedSignedRun(root);
  // A JSON payload with embedded CRLFs around it (as a Windows pipe may deliver).
  const raw = '\r\n' + JSON.stringify(agentPayload(root, 'tu-crlf')) + '\r\n';
  const r = run(null, { PIPELINE_DOC_PATH: docDir }, raw);
  assert.equal(r.status, 0, r.stderr || '(non-zero exit — CRLF input crashed the parser)');
  assert.notEqual(decisionOf(r), undefined, 'hook must produce a parseable decision on CRLF input');
});

// ---- S4-9 [edge] present-but-unsigned (migration tolerance) → allow ---------
liveTest('S4-9 [edge] present but unsigned state (HMAC_STRICT off) → does NOT block (migration tolerance)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  // Write an UNSIGNED state (plain JSON, no __signature) under a run dir.
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, 'sentinel-state.json'),
    JSON.stringify({ run_id: 'r', pipeline_active: true, pipeline_doc_path: docDir, pending_dispatches: {}, state_version: 1 }));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-21T00:00:00.000Z' }));
  const r = run(agentPayload(root, 'tu-unsigned'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny',
    'unsigned-but-present state is migration-tolerated, not corrupt — must not block');
});

// ---- S4-10 [edge] empty-string tool_use_id treated as absent ----------------
liveTest('S4-10 [edge] empty-string tool_use_id → falls back to "unknown" (not an empty-string key)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir, statePath } = seedSignedRun(root);
  run(agentPayload(root, ''), { PIPELINE_DOC_PATH: docDir });
  const pd = (readState(statePath) || {}).pending_dispatches || {};
  assert.ok(Object.prototype.hasOwnProperty.call(pd, 'unknown'),
    'empty-string id must degrade to the "unknown" key');
  assert.ok(!Object.prototype.hasOwnProperty.call(pd, ''),
    'an empty-string key must never be stored');
});

// ---- S4-11 [SEC-01] verification THROW during write → fail closed, NO write --
// In-process test: the signer module is a shared singleton (require cache), so the
// hook's captured `signer` reference is the same object we patch here. We force
// verifyState to THROW on the write-time re-read and assert the hook does NOT
// fall through to the signed-state write (no record added, state_version NOT
// bumped). Restoring the catch to a silent fall-through makes this FAIL — the
// exact SEC-01 silent-HMAC-bypass regression guard.
liveTest('S4-11 [SEC-01] verifyState throws on write-time re-read → NO state write (fail closed)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED)`);
  const signer = require('../../../lib/sentinel-state-signer.cjs');
  const { decide } = require('../../../.claude/hooks/dispatch-record-hook.cjs');
  const { docDir, statePath } = seedSignedRun(root, { state_version: 42 });
  process.env.PIPELINE_DOC_PATH = docDir;
  const before = readState(statePath) || {};
  const beforeKeys = Object.keys(before.pending_dispatches || {}).length;

  const realVerify = signer.verifyState;
  signer.verifyState = () => { throw new Error('planted verification throw (SEC-01)'); };
  try {
    const out = decide(agentPayload(root, 'tu-throw'));
    // The decision path still ALLOWS (this is a valid governed dispatch); the
    // GUARD is on the WRITE — a verify throw must abort it.
    assert.notEqual(out && out.decision, 'deny', 'a verify hiccup must not flip the decision to deny here');
  } finally {
    signer.verifyState = realVerify;
    delete process.env.PIPELINE_DOC_PATH;
  }

  const after = readState(statePath) || {};
  assert.equal(after.state_version, 42,
    'a verification THROW must NOT bump state_version — the write must be aborted (SEC-01 fail closed)');
  assert.equal(Object.keys(after.pending_dispatches || {}).length, beforeKeys,
    'a verification THROW must NOT add a pending_dispatches record (no write over unverified state)');
  // And the on-disk signature must remain the original valid one.
  const v = signer.verifyState(after, { key: signer.readHmacKey() });
  assert.ok(v.valid || v.unsigned || v.key_unavailable,
    'the state on disk must be untouched (still validly signed) after the aborted write');
});

runRegistered().then(() => {
  console.log('');
  console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
  if (failed.length) {
    console.log('Failed checks (expected RED until .claude/hooks/dispatch-record-hook.cjs ships):');
    for (const n of failed) console.log(`  - ${n}`);
  }
  process.exit(fail > 0 ? 1 : 0);
});
