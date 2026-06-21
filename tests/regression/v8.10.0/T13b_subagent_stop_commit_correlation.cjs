#!/usr/bin/env node
'use strict';

// =============================================================================
// T13b (v8.10.0) — run-002 BL-1: SubagentStop commit-flag CORRELATION HONESTY.
//
// Finding BL-1 (Important): the valid-result commit path in
//   .claude/hooks/subagent-stop-commit-hook.cjs
// correlated the "committed" flag by agent_type, not by the dispatch's identity.
// The SubagentStop payload carries the FINISHING subagent's own `agent_id` but NOT
// the dispatch's tool_use_id (the dispatch records are keyed by tool_use_id). The
// manifest allows MULTIPLE pending dispatches of one agent_type. The old loop flagged
// EVERY same-type record committed — so the FIRST agent to finish falsely marked a
// still-running SIBLING's dispatch committed. The state then records a commitment
// that did not happen (an honesty violation, not just a benign collision).
//
// FIX under test: only consume a dispatch record when correlation is UNAMBIGUOUS —
// exactly ONE un-committed pending dispatch matches the agent_type. With 2+ matches
// (ambiguous) the hook marks NEITHER dispatch committed; it records a best-effort
// observation keyed by agent_id instead, never touching a dispatch it may not own.
//
// This file is hook-as-process (spawn the real hook with a SubagentStop payload on
// stdin) and asserts the per-dispatch state side effects. ARMED is irrelevant to the
// success-side flag — a VALID result block ALLOWS in both warn and deny; we exercise
// the default (warn) so the test is independent of the block path.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't13b-bl1-correlation-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/subagent-stop-commit-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');
const { BEGIN, END } = require('../../../lib/contracts/pipeline-agent-result.cjs');

function gateExists() { return fs.existsSync(HOOK); }

// pre-tester maps to the FULL 'tdd' step, which the manifest reports as
// result_required:true — so the success path (valid block → flag committed) is live.
// The manifest also maps quality-gate-router to 'tdd', i.e. two real agents share a
// governed step; here we exercise the same-agent_type ambiguity directly.
function seedTwoPending(root) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, {
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1,
    // TWO pending dispatches of the SAME agent_type (pre-tester) — the manifest
    // permits multiple dispatches of one agent_type at a step / on re-dispatch.
    pending_dispatches: {
      'tu-A': { dispatch_id: 'tu-A', agent_type: 'pre-tester', status: 'pending', correction_attempts: 0 },
      'tu-B': { dispatch_id: 'tu-B', agent_type: 'pre-tester', status: 'pending', correction_attempts: 0 },
    },
    subagent_corrections: {},
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}

function seedOnePending(root) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, {
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1,
    pending_dispatches: {
      'tu-solo': { dispatch_id: 'tu-solo', agent_type: 'pre-tester', status: 'pending', correction_attempts: 0 },
    },
    subagent_corrections: {},
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}

function validResultBlock() {
  return (
    'All done.\n' +
    `${BEGIN}\n` +
    '{ "status": "completed", "summary": "pre-tester RED tests written", "next_agent": "executor-controller" }\n' +
    `${END}\n`
  );
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}
function stopPayload(root, agentType, lastMsg, agentId) {
  return {
    hook_event_name: 'SubagentStop',
    agent_id: agentId === undefined ? 'agent-xyz' : agentId,
    agent_type: agentType,
    last_assistant_message: lastMsg,
    cwd: root,
  };
}
function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}
function decisionOf(r) {
  try { const o = JSON.parse(r.stdout || '{}'); return o.decision || (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision); }
  catch { return undefined; }
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagentstop-t13b-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T13b v8.10.0 — BL-1 SubagentStop commit-flag correlation honesty ===');

// ---- T13b-S1: two pending same-type + one stop → NEITHER dispatch committed -----
liveTest('T13b-S1 two pending dispatches of the same agent_type + one SubagentStop → the OTHER dispatch is NOT marked committed (ambiguous → consume none)', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK}`);
  const { docDir, statePath } = seedTwoPending(root);
  const r = run(stopPayload(root, 'pre-tester', validResultBlock(), 'agent-finisher-1'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a valid result block must allow completion');

  const after = readState(statePath) || {};
  const pd = after.pending_dispatches || {};
  const aCommitted = pd['tu-A'] && (pd['tu-A'].status === 'committed' || pd['tu-A'].committed === true);
  const bCommitted = pd['tu-B'] && (pd['tu-B'].status === 'committed' || pd['tu-B'].committed === true);

  // The core BL-1 assertion: with TWO same-type pending dispatches, ONE stop must
  // NOT mark BOTH committed (the honesty violation). Stronger: it must mark NEITHER,
  // because the hook cannot prove which dispatch this agent owns.
  assert.ok(!(aCommitted && bCommitted),
    'BL-1 regression: one SubagentStop falsely marked BOTH same-type dispatches committed');
  assert.ok(!aCommitted && !bCommitted,
    'ambiguous correlation must consume NO dispatch record — neither tu-A nor tu-B may be flagged committed by a single same-type stop');

  // And the honest best-effort observation is recorded, keyed by the finishing
  // agent_id, flagged ambiguous — so "committed" is still observable without lying
  // about a specific dispatch.
  const obs = (after.subagent_commit_observations || {})['agent-finisher-1'];
  assert.ok(obs && obs.committed === true && obs.ambiguous === true && obs.pending_same_type === 2,
    'an ambiguous commit must leave a best-effort observation keyed by agent_id (committed+ambiguous), not a per-dispatch claim');
});

// ---- T13b-S2: exactly one pending same-type → that dispatch IS committed --------
liveTest('T13b-S2 exactly one un-committed pending dispatch of the agent_type → that single dispatch IS flagged committed (unambiguous path preserved)', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK}`);
  const { docDir, statePath } = seedOnePending(root);
  const r = run(stopPayload(root, 'pre-tester', validResultBlock(), 'agent-solo'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'valid block allows');
  const after = readState(statePath) || {};
  const rec = (after.pending_dispatches || {})['tu-solo'] || {};
  assert.ok(rec.status === 'committed' && rec.committed === true,
    'with exactly one match the hook MUST consume that dispatch record (no regression to the legacy behavior for the safe case)');
  assert.equal(rec.committed_by_agent_id, 'agent-solo',
    'the unambiguous commit should record the finishing agent_id for traceability');
});

// ---- T13b-S3: a second stop (sibling finishes) then commits the remaining one ---
liveTest('T13b-S3 after the first ambiguous stop, when only ONE pending remains a later stop commits exactly that one (progressive disambiguation)', (root) => {
  assert.ok(gateExists(), `hook missing: ${HOOK}`);
  const { docDir, statePath } = seedTwoPending(root);
  // First stop: ambiguous → consumes none.
  run(stopPayload(root, 'pre-tester', validResultBlock(), 'agent-1'), { PIPELINE_DOC_PATH: docDir });
  // Manually mark tu-A committed to model its dispatch having been resolved out of
  // band (e.g. by a future consumer). Now only tu-B is un-committed.
  const mid = readState(statePath);
  mid.pending_dispatches['tu-A'].status = 'committed';
  mid.pending_dispatches['tu-A'].committed = true;
  // Re-sign via the hook's own writer to keep the state verifiable.
  writeSignedState(statePath, mid);
  // Second stop: now exactly ONE un-committed same-type pending remains → commit it.
  const r2 = run(stopPayload(root, 'pre-tester', validResultBlock(), 'agent-2'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r2.status, 0, r2.stderr);
  const after = readState(statePath) || {};
  const recB = (after.pending_dispatches || {})['tu-B'] || {};
  assert.ok(recB.status === 'committed' && recB.committed === true,
    'once ambiguity resolves to a single remaining match, the next stop must commit exactly that dispatch');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
