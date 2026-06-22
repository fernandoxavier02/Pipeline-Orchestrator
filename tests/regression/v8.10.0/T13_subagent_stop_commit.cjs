#!/usr/bin/env node
'use strict';

// =============================================================================
// T13 (v8.10.0) — REQ-SUBAGENTSTOP-COMMIT: the SubagentStop commit hook (NEW).
// TDD RED phase. Hook-as-process tests for the NOT-YET-EXISTING hook
//   .claude/hooks/subagent-stop-commit-hook.cjs
// registered under the SubagentStop event. Covers the full user-APPROVED AC-3
// triplet T13-S1..S9.
//
// CONTRACT under test (design L3b.1):
//   discover run → map agent_type→step via workflow-manifest → not-in-spine OR
//   resultRequired===false ⇒ ALLOW → parseResultBlock(last_assistant_message) →
//   BLOCK iff (armed AND resultRequired AND ok:false) with reason + additionalContext
//   → cap 3 per (run_id, agent_type) in subagent_corrections; the 4th writes
//   terminal_state='hard_failed' and ALLOWS → a valid block flags the dispatch
//   committed + ALLOWS. Governed-corrupt ⇒ DENY(armed)/ALLOW(warn). Default OFF
//   (PIPELINE_SUBAGENTSTOP_ENFORCEMENT defaults 'warn'; '=deny' arms).
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The hook file does NOT exist yet. Each test spawns it as a node child process
// with a SubagentStop JSON payload on stdin (agent_type + last_assistant_message
// per HARNESS-FACTS-CONFIRMED) and asserts the decision / state side effects.
// Because the script is absent, `node <missing>.cjs` exits non-zero with empty
// stdout (ENOENT). A guard at the top of EACH test (assert gateExists) converts
// that into a clear "missing hook" assertion message rather than an opaque crash
// — a valid "missing hook" RED, NOT a test bug. Turns GREEN when the hook ships.
//
// run-001 C1 lesson: the block path (S1) fires over a MISSING/ok:false result
// block — a value the producer (T11) is being made to emit — so the test never
// asserts a value the system can never produce. S2 supplies a VALID T11-shaped
// block (the same shape T11-S2 proves the parser accepts) and asserts ALLOW.
//
// Q3 / AC-3 triplet:
//   deny-bad   : T13-S1 (armed + ok:false → block), T13-S8 (armed + corrupt → deny).
//   allow-good : T13-S2 (valid → allow+commit), S3 (ungoverned), S4 (resultRequired
//                false), S5 (state absent), S7 (warn default), S9 (warn + corrupt).
//   recovery   : T13-S6 (3-cap → hard_failed terminal + allow, never a 4th block).
//
// Determinism + CRLF-safety: payloads serialized once; the result-block samples
// are built with explicit \n; no wall-clock waits.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't13-subagent-stop-commit-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/subagent-stop-commit-hook.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');
const { BEGIN, END } = require('../../../lib/contracts/pipeline-agent-result.cjs');

function gateExists() { return fs.existsSync(HOOK); }

const ARMED = { PIPELINE_SUBAGENTSTOP_ENFORCEMENT: 'deny' };
// default (no env) = warn = OFF.

// Seed a SIGNED active FULL-workflow run. The hook maps agent_type→step via the
// workflow-manifest FULL spine; we set workflow FULL so the spine is non-null.
function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1, pending_dispatches: {}, subagent_corrections: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const v = verifyState(written, { key: readHmacKey() });
  return { docDir, statePath, signingActive: !(v.unsigned || v.key_unavailable) };
}

function tamper(statePath) {
  const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  written.run_id = 'TAMPERED';
  fs.writeFileSync(statePath, JSON.stringify(written));
}

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

// A SubagentStop payload (HARNESS-FACTS: agent_id, agent_type, last_assistant_message).
function stopPayload(root, agentType, lastMsg) {
  return {
    hook_event_name: 'SubagentStop',
    agent_id: 'agent-xyz',
    agent_type: agentType,
    last_assistant_message: lastMsg === undefined ? '' : lastMsg,
    cwd: root,
  };
}

function validResultBlock() {
  // Only KNOWN governance keys (status/summary/next_agent) + closed status vocab —
  // exactly the T11-S2 shape the parser accepts (ok:true). No invented keys.
  return (
    'All done. Emitting my result block now.\n' +
    `${BEGIN}\n` +
    '{ "status": "completed", "summary": "pre-tester RED tests written", "next_agent": "executor-controller" }\n' +
    `${END}\n`
  );
}

function decisionOf(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    if (out.decision) return out.decision;
    return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
  } catch { return undefined; }
}
function reasonOf(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    return out.reason || (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecisionReason) || '';
  } catch { return ''; }
}
function additionalContextOf(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    return (out.hookSpecificOutput && out.hookSpecificOutput.additionalContext) || out.additionalContext || '';
  } catch { return ''; }
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagentstop-t13-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T13 v8.10.0 — SubagentStop commit hook (RED until .claude/hooks/subagent-stop-commit-hook.cjs ships) ===');

// ---- T13-S1 [deny-bad] armed + resultRequired + NO/ok:false block → block ----
liveTest('T13-S1 [deny-bad] armed governed agent on a resultRequired step with no valid result → block + fix reason + additionalContext', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED — commit hook not built yet)`);
  // pre-tester maps to the 'tdd' step (FULL_AGENTS_BY_STEP), which is result_required:true.
  const { docDir } = seedRun(root);
  const r = run(stopPayload(root, 'pre-tester', 'I finished but I forgot to emit a result block.'),
    Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', r.stdout || '(armed + missing result block on a resultRequired step must block)');
  assert.ok(reasonOf(r).trim().length > 0, 'the block must carry a reason naming the fix (re-emit a valid result block)');
  assert.ok(additionalContextOf(r).trim().length > 0,
    'the block must carry hookSpecificOutput.additionalContext pointing at the reachable next action');
});

// ---- T13-S2 [allow-good] armed + VALID block → allow + flag committed --------
liveTest('T13-S2 [allow-good] armed governed agent with a parser-valid result block → allow + dispatch flagged committed', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  // Seed a pending dispatch for this agent_type so "committed" has a record to flag.
  const { docDir, statePath } = seedRun(root, {
    pending_dispatches: { 'tu-pt': { dispatch_id: 'tu-pt', agent_type: 'pre-tester', status: 'pending', correction_attempts: 0 } },
  });
  const r = run(stopPayload(root, 'pre-tester', validResultBlock()),
    Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a valid result block must allow completion, never block');
  const after = readState(statePath) || {};
  const rec = (after.pending_dispatches || {})['tu-pt'] || {};
  // Best-effort committed flag: accept either a status flip or a committed marker.
  const committed = rec.status === 'committed' || rec.committed === true || after.last_committed_agent_type === 'pre-tester';
  assert.ok(committed,
    'a valid completion must mark the matching dispatch record committed in sentinel-state (best-effort flag)');
});

// ---- T13-S3 [allow-good / exempt — ungoverned] not in spine → allow ----------
liveTest('T13-S3 [exempt] agent_type not anywhere in the workflow spine → allow unconditionally, regardless of mode', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir } = seedRun(root);
  // 'executor-implementer-task' is a real subagent but is NOT a FULL spine step agent.
  const r = run(stopPayload(root, 'executor-implementer-task', 'no result block here at all'),
    Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'an agent not in the workflow spine is ungoverned for the commit point — must allow even armed');
});

// ---- T13-S4 [allow-good / exempt — resultRequired false] → allow -------------
liveTest('T13-S4 [exempt] in-spine step whose resultRequired is false → allow regardless of mode, no message inspection', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  // The FULL 'proposal' step is result_required:false, but no agent stamps it. The
  // honest in-spine resultRequired:false agent... none exists in FULL (every mapped
  // step is result_required:true). So instead force the obligation off via a
  // recognized but obligation-free path: an agent mapped to a step we mark not
  // required. We model this by an agent whose step the manifest reports
  // result_required:false. The manifest's only result_required:false step
  // ('proposal') has no agent, so this scenario is satisfied by the manifest
  // returning resultRequired=false for a step with no agents → treated as exempt.
  //
  // Concretely: an agent_type that the hook maps to a step with result_required
  // false must allow WITHOUT looking at the message. We assert that property by
  // using an agent_type the manifest does not require a result for; the hook must
  // allow even with a deliberately broken (non-block) message.
  const { docDir } = seedRun(root);
  const r = run(stopPayload(root, 'task-orchestrator', 'garbage with no block'),
    Object.assign({ PIPELINE_DOC_PATH: docDir, PIPELINE_SUBAGENTSTOP_RESULT_REQUIRED_OVERRIDE: 'false' }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  // task-orchestrator maps to 'classify' which IS result_required:true in FULL, so
  // this would block UNLESS the hook honors a resultRequired:false determination.
  // The override env models a step the manifest reports as not-required; the hook
  // must allow. If the hook ignores resultRequired entirely it will block → FAIL,
  // surfacing that the exempt path is unimplemented.
  assert.notEqual(decisionOf(r), 'block',
    'a step whose resultRequired is false must allow completion without inspecting the last message');
});

// ---- T13-S5 [allow-good / exempt — state absent] → allow --------------------
liveTest('T13-S5 [exempt] no active sentinel-state (run dir / state file missing) → allow without error', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true }); // no state file
  const r = run(stopPayload(root, 'pre-tester', 'no block'), Object.assign({}, ARMED)); // no PIPELINE_DOC_PATH
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'absent state must allow completion — never block, never crash');
});

// ---- T13-S6 [recovery — 3-cap → hard_failed] --------------------------------
liveTest('T13-S6 [recovery] 4th correction for the same (run_id, agent_type) → writes hard_failed terminal and ALLOWS (no 4th block)', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  // Three prior corrections already recorded for (r002, pre-tester).
  const { docDir, statePath } = seedRun(root, {
    subagent_corrections: { 'r002::pre-tester': 3 },
  });
  const r = run(stopPayload(root, 'pre-tester', 'still no valid result block'),
    Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'the 4th attempt at the cap must NOT issue a 4th block — it converts to an honest terminal');
  const after = readState(statePath) || {};
  const terminal = after.terminal_state || after.status;
  assert.equal(terminal, 'hard_failed',
    'at the 3-correction cap the hook must persist hard_failed so the run reaches an honest terminal, not an infinite block');
});

// ---- T13-S7 [allow-good / warn — default OFF] -------------------------------
liveTest('T13-S7 [warn-default] unarmed (default warn) → a would-be-bad case ALLOWS + records an audit breadcrumb only', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  const { docDir } = seedRun(root);
  // SAME bad case as S1 (pre-tester, no result block) but NO arming env → default warn.
  const r = run(stopPayload(root, 'pre-tester', 'finished, no result block emitted'),
    { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'default (warn) must be inert — the same case that blocks when armed must ALLOW unarmed (default-OFF safety before T11 is live)');
});

// ---- T13-S8 [deny-bad / governed-corrupt] armed + corrupt → block -----------
liveTest('T13-S8 [deny-bad] armed governed agent + corrupt signed state → decision block', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  const seeded = seedRun(root);
  assert.ok(seeded.signingActive,
    'signing must be active (stable secret seeded) so the governed-corrupt→block invariant is actually exercised');
  tamper(seeded.statePath);
  const r = run(stopPayload(root, 'pre-tester', validResultBlock()),
    Object.assign({ PIPELINE_DOC_PATH: seeded.docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block',
    r.stdout || '(armed + corrupt signed state for a governed agent must block — parity with the shipped governed-corrupt deny)');
});

// ---- T13-S9 [allow-good / governed-corrupt / warn] → allow ------------------
liveTest('T13-S9 [warn] default (warn) + corrupt signed state for a governed agent → allow (warn-escape parity)', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK} (expected RED)`);
  const seeded = seedRun(root);
  assert.ok(seeded.signingActive, 'signing must be active so the corrupt path is real');
  tamper(seeded.statePath);
  const r = run(stopPayload(root, 'pre-tester', 'whatever'), { PIPELINE_DOC_PATH: seeded.docDir }); // no arm
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block',
    'warn (default) must allow even on corrupt state — matching the shipped warn-escape for corrupt-state on governed agents');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until .claude/hooks/subagent-stop-commit-hook.cjs ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
