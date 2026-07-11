#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.9.0) — T5: single authoritative Stop gate + cleanup reorder
// (REQ-STOP-GATE / REQ-STOP-RECOVERY / REQ-STOP-SINGLE-WRITER). TDD RED phase.
//
// Hook-as-process tests for the NOT-YET-EXISTING authoritative Stop gate
//   .claude/hooks/stop-gate-hook.cjs
// (the single owner of the Stop decision; the existing stop-hook.cjs is the
//  telemetry run-log writer, a different concern) covering the 12 user-APPROVED
// scenarios S5-1..S5-12 from 05-quality-gate-router.md → T5.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The authoritative Stop gate hook does not exist yet, and the cleanup reorder
// (session-cleanup-hook no longer marking status='completed' in the parallel
// Stop group) is new behavior. Each test spawns the gate as a node child process
// with a Stop/SessionEnd/StopFailure JSON payload on stdin and asserts the
// decision / terminal-state / cleanup-ordering side effects. Because the gate
// file is absent, the spawn exits non-zero with empty stdout (ENOENT), so the
// decision assertions FAIL — a valid "missing hook" RED, not a test bug. A guard
// at the top of each test surfaces the missing file as a clear assertion.
//
// Default-OFF: enforcement is armed only with PIPELINE_STOP_BLOCK_ENFORCEMENT=deny.
//
// Q3 deny-gate pairing for this task:
//   deny-bad : S5-2 (incomplete + armed → block), S5-3 (pending dispatch → block)
//   allow-good: S5-6 (incomplete but UNARMED → no block), S5-11 (absent state → allow)
//
// Determinism + CRLF-safety: payloads serialized once; no wall-clock waits.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '../../../.claude/hooks');
const GATE = path.join(HOOKS, 'stop-gate-hook.cjs');
const MANIFEST = path.resolve(__dirname, '../../../hooks/hooks.json');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

function gateExists() { return fs.existsSync(GATE); }

// Read the shipped hooks manifest and return the list of hook command strings
// registered for a given event key (empty array if the event is unregistered).
function manifestCommandsFor(eventKey) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; }
  const groups = (manifest && manifest.hooks && manifest.hooks[eventKey]) || [];
  const cmds = [];
  for (const g of groups) {
    for (const h of (g.hooks || [])) {
      if (h && typeof h.command === 'string') cmds.push(h.command);
    }
  }
  return cmds;
}

// Does the shipped manifest register stop-gate-hook.cjs for the given event?
function gateRegisteredFor(eventKey) {
  return manifestCommandsFor(eventKey).some((c) => c.includes('stop-gate-hook.cjs'));
}

const ARMED = { PIPELINE_STOP_BLOCK_ENFORCEMENT: 'deny' };

// Seed a SIGNED run with the given state fields; returns docDir + statePath +
// whether signing is active (corrupt-state-dependent checks self-skip if not).
function seedRun(root, state) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const p = path.join(docDir, 'sentinel-state.json');
  writeSignedState(p, Object.assign({
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  }, state || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  const written = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = verifyState(written, { key: readHmacKey() });
  return { docDir, statePath: p, signingActive: !(v.unsigned || v.key_unavailable) };
}

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

function run(payload, env) {
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

const CLEANUP = path.join(HOOKS, 'session-cleanup-hook.cjs');
function cleanupExists() { return fs.existsSync(CLEANUP); }

// Spawn the REAL session-cleanup-hook.cjs (the lock-cleanup that races in the
// parallel Stop group) with a Stop payload on stdin.
function runCleanup(payload, env) {
  return spawnSync(process.execPath, [CLEANUP], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

// Seed a session lock owned by `sessionId` under <root>/.pipeline/sessions and
// return its path. status starts NON-terminal ('active') so we can prove cleanup
// only flips it to 'completed' when the run is already terminal.
function seedSessionLock(root, sessionId) {
  const sessionsDir = path.join(root, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const lockPath = path.join(sessionsDir, `${sessionId}.lock`);
  fs.writeFileSync(lockPath, JSON.stringify({ session_id: sessionId, status: 'active', acquired_at: Date.now() }, null, 2));
  return lockPath;
}
function readLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return null; }
}
const stopWithSession = (root, sessionId) => ({ hook_event_name: 'Stop', cwd: root, session_id: sessionId });

function decisionOf(r) {
  try {
    const out = JSON.parse(r.stdout || '{}');
    // A Stop hook signals a block via top-level `decision: "block"`.
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

const stopPayload = (root) => ({ hook_event_name: 'Stop', cwd: root });
const sessionEndPayload = (root, reason) => ({ hook_event_name: 'SessionEnd', reason: reason || 'user_interrupt', cwd: root });
const stopFailurePayload = (root) => ({ hook_event_name: 'StopFailure', cwd: root });

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stopgate-f5-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== F5 v8.9.0 — T5 authoritative Stop gate + cleanup reorder (RED until .claude/hooks/stop-gate-hook.cjs ships) ===');

// ---- S5-1 [main] complete run → allow Stop ----------------------------------
liveTest('S5-1 [main] terminal "completed" run → Stop allowed (a complete run is never blocked)', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED — Stop gate not built yet)`);
  const { docDir } = seedRun(root, { status: 'completed', terminal_state: 'completed' });
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a completed run must allow Stop even when armed');
});

// ---- S5-2 [deny-bad] incomplete + armed → block + next action ---------------
liveTest('S5-2 [deny-bad] incomplete run + armed → decision block with exact next action', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', r.stdout || '(incomplete+armed must block)');
  assert.ok(reasonOf(r).trim().length > 0, 'block must carry an exact next-action message, not an empty reason');
});

// ---- S5-3 [deny-bad] pending dispatch → block -------------------------------
liveTest('S5-3 [deny-bad] outstanding pending_dispatches + armed → decision block', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  const { docDir } = seedRun(root, {
    status: 'running',
    pending_dispatches: { 'tool-use-1': { subagent_type: 'x', dispatched_at: '2026-06-21T00:00:00.000Z' } },
  });
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', r.stdout || '(an unresolved pending dispatch must block Stop)');
});

// ---- S5-4 [main] 3rd continuity → hard_failed terminal + allow --------------
liveTest('S5-4 [main] 3rd continuity cap → writes hard_failed terminal and allows Stop', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  const { docDir, statePath } = seedRun(root, { status: 'running', continuity_attempts: 2 });
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  // On the third block the cap converts to a hard-failed terminal rather than a 3rd block.
  assert.notEqual(decisionOf(r), 'block', 'the 3rd continuity must become hard_failed, not a third block');
  const after = readState(statePath) || {};
  const terminal = after.terminal_state || after.status;
  assert.equal(terminal, 'hard_failed', 'the 3rd-continuity cap must persist the hard_failed terminal state');
});

// ---- S5-5 [H3] cleanup DEFERS on an incomplete governed run -------------------
liveTest('S5-5 [H3] incomplete governed run → session-cleanup does NOT mark the lock completed (defers to Stop gate)', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  assert.ok(cleanupExists(), `cleanup hook missing: ${CLEANUP}`);
  const sessionId = 'sess-S5-5';
  // A governed run that is STILL INCOMPLETE (pipeline_active true, no terminal).
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  const lockPath = seedSessionLock(root, sessionId);

  // Actually invoke the REAL cleanup hook (the prior version never did — the bug).
  const r = runCleanup(stopWithSession(root, sessionId), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);

  // The H3 property: cleanup must NOT declare the lock completed before the Stop
  // gate has owned and persisted the terminal state. Because the run is incomplete,
  // the lock must remain non-completed. Remove the deferral guard in
  // session-cleanup-hook (cleanupAllowed) and this assertion fails.
  const lockAfter = readLock(lockPath) || {};
  assert.notEqual(lockAfter.status, 'completed',
    'cleanup must defer: an incomplete governed run must leave the session lock NOT completed (reorder/H3)');
});

// ---- S5-6 [allow-good] incomplete + WARN escape → no block (v8.11.0 B5) ------
liveTest('S5-6 [warn-escape] incomplete run + PIPELINE_STOP_BLOCK_ENFORCEMENT=warn → does NOT block', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  // v8.11.0 B5: warn is now the opt-OUT (the default is ARMED); the block must be inert under warn.
  const r = run(stopPayload(root), { PIPELINE_DOC_PATH: docDir, PIPELINE_STOP_BLOCK_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'block logic must be inert under the warn escape');
});

// ---- S5-6b [block] incomplete + DEFAULT (no env) now blocks (v8.11.0 B5) -----
liveTest('S5-6b [deny-default] incomplete run with NO env now BLOCKS under the default-on Stop gate', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE}`);
  const { docDir } = seedRun(root, { status: 'running', current_phase: '2-execute' });
  const r = run(stopPayload(root), { PIPELINE_DOC_PATH: docDir }); // no env → default-on
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'v8.11.0 B5: an incomplete governed run blocks Stop by default (recover-or-abort)');
});

// ---- S5-7 [main] SessionEnd after interrupt → no completed, no evidence del. -
liveTest('S5-7 [main] SessionEnd after interrupt → does NOT mark completed, does NOT delete evidence', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  const { docDir, statePath } = seedRun(root, { status: 'running' });
  const evidence = path.join(docDir, 'gate-decisions.jsonl');
  fs.writeFileSync(evidence, '{"gate":"X"}\n');
  run(sessionEndPayload(root, 'user_interrupt'), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  const after = readState(statePath) || {};
  assert.notEqual(after.status, 'completed', 'an interrupted session must not be marked completed');
  assert.ok(fs.existsSync(evidence), 'evidence files must be kept recoverable after an interrupt');
});

// ---- S5-8 [main] StopFailure → no success, no evidence deletion --------------
// v8.20.0-glm port: StopFailure event eliminated (not supported by Z-Code).
// stop-gate-hook.cjs still runs in Stop event and provides equivalent coverage.
console.log('  [SKIP] S5-8 [main] StopFailure — event eliminated in v8.20.0-glm port (Z-Code has no StopFailure)');

// ---- S5-8b [wiring] StopFailure registered AND cannot block ------------------
// v8.20.0-glm port: StopFailure event eliminated (not supported by Z-Code).
console.log('  [SKIP] S5-8b [wiring] StopFailure — event eliminated in v8.20.0-glm port (Z-Code has no StopFailure)');

// ---- S5-9 [regression / H3] structural ordering: stop-gate cap, then cleanup --
liveTest('S5-9 [H3] armed cap writes hard_failed FIRST; cleanup then defers (lock NOT completed before terminal)', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  assert.ok(cleanupExists(), `cleanup hook missing: ${CLEANUP}`);
  const sessionId = 'sess-S5-9';
  const { docDir, statePath } = seedRun(root, { status: 'running', continuity_attempts: 2 });
  const lockPath = seedSessionLock(root, sessionId);

  // Step 1: stop-gate at the continuity cap persists the hard_failed terminal.
  run(stopWithSession(root, sessionId), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  const afterGate = readState(statePath) || {};
  assert.equal(afterGate.terminal_state || afterGate.status, 'hard_failed',
    'the armed continuity cap must persist hard_failed as the terminal state (the ordering anchor)');

  // Step 2: now the cleanup hook runs. Because the run reached a terminal state,
  // cleanup MAY mark the lock completed — but the terminal was written FIRST.
  runCleanup(stopWithSession(root, sessionId), { PIPELINE_DOC_PATH: docDir });
  const lockAfter = readLock(lockPath) || {};
  // The H3 structural proof: the lock is completed ONLY after a terminal exists.
  // If completed is stamped, the terminal hard_failed must already be present.
  if (lockAfter.status === 'completed') {
    assert.equal(afterGate.terminal_state || afterGate.status, 'hard_failed',
      'cleanup may only mark the lock completed once the terminal state is persisted (DoD#16 ordering)');
  }
  // And the terminal must survive cleanup unchanged.
  const finalState = readState(statePath) || {};
  assert.equal(finalState.terminal_state || finalState.status, 'hard_failed', 'terminal must remain hard_failed after cleanup');
});

// ---- S5-10 [regression] governed but no active run pointer → allow ----------
liveTest('S5-10 [regression] valid signed state but NO governed run pointer → Stop allowed', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  // Signed state present but pipeline_active false and no run pointer = no governed run.
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r', pipeline_active: false, pipeline_doc_path: docDir,
  });
  // Intentionally NO active-run.json pointer.
  const r = run(stopPayload(root), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'no governed run pointer means no block');
});

// ---- S5-11 [edge] absent state entirely → allow (not corrupt) ---------------
liveTest('S5-11 [edge] sentinel-state absent entirely + armed → Stop allowed (absent ≠ corrupt)', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true }); // no state file
  const r = run(stopPayload(root), ARMED); // no PIPELINE_DOC_PATH
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'absent state is the ungoverned/absent allow path, never a corrupt block');
});

// ---- S5-12 [edge] SessionEnd after mid-pipeline interrupt → terminal-flag gated
liveTest('S5-12 [edge] SessionEnd after interrupt only marks complete if terminal already persisted', (root) => {
  assert.ok(gateExists(), `gate missing: ${GATE} (expected RED)`);
  // Run is mid-pipeline (no terminal flag) and an interrupt fires.
  const { docDir, statePath } = seedRun(root, { status: 'running' /* no terminal_state */ });
  run(sessionEndPayload(root, 'user_interrupt'), Object.assign({ PIPELINE_DOC_PATH: docDir }, ARMED));
  const after = readState(statePath) || {};
  assert.notEqual(after.status, 'completed',
    'SessionEnd must NOT declare success on the basis of an interrupt alone — only a pre-persisted terminal flag may complete');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until .claude/hooks/stop-gate-hook.cjs ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
