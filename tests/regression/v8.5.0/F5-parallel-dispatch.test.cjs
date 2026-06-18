#!/usr/bin/env node
'use strict';

/**
 * F5 (v8.5.0) — B5: parallel-dispatch-gate.cjs (warn-first) +
 *                    DISPATCH_REQUEST group_id/batch_mode schema doc.
 *
 * RED phase (TDD). These tests MUST FAIL today because:
 *   - .claude/hooks/parallel-dispatch-gate.cjs does NOT exist yet, so every
 *     child-process invocation fails (missing file → non-zero exit / MODULE
 *     error).
 *   - references/gate-request-protocol.md does NOT document group_id /
 *     batch_mode in the DISPATCH_REQUEST schema yet.
 *
 * The hook is a PreToolUse:Agent gate that reads sentinel-state.json from
 * PIPELINE_DOC_PATH (SSOT discovery), is warn-first by default, and fails open
 * on every read/parse error. It always exits 0; a deny appears as
 * permissionDecision:"deny" only under PIPELINE_PARALLEL_ENFORCEMENT=deny.
 *
 * Scenarios covered (7): B5-S1 .. B5-S7.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const GATE = path.join(ROOT, '.claude', 'hooks', 'parallel-dispatch-gate.cjs');
const PROTOCOL_DOC = path.join(ROOT, 'references', 'gate-request-protocol.md');
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

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

function runGate(docPath, subagentType, { enforcement } = {}) {
  const env = { ...process.env, PIPELINE_DOC_PATH: docPath };
  delete env.PIPELINE_RUN_ID;
  if (enforcement) env.PIPELINE_PARALLEL_ENFORCEMENT = enforcement;
  else delete env.PIPELINE_PARALLEL_ENFORCEMENT;
  const input = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: subagentType, description: 'x', prompt: 'y' },
  });
  try {
    const stdout = execFileSync(process.execPath, [GATE], {
      input, env, encoding: 'utf8', timeout: 15000,
    });
    return { code: 0, stdout: stdout || '' };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, stdout: (e.stdout || '').toString() };
  }
}

function isDeny(stdout) { return /"permissionDecision"\s*:\s*"deny"/.test(stdout); }
function readEvents(docPath) {
  const p = path.join(docPath, 'protocol-events.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

// Seed a signed sentinel, optionally arming a parallel group.
function seed(docPath, { expected } = {}) {
  const state = { run_id: 'f5-run' };
  if (expected !== undefined) state.parallel_dispatch_expected = expected;
  writeSignedState(path.join(docPath, 'sentinel-state.json'), state);
}

console.log('=== F5 v8.5.0 — parallel-dispatch-gate + group_id schema (RED) ===');

// ---- B5-S1 (main) — no group armed → allow ---------------------------------
test('B5-S1: gate exits 0 (allow) when no parallel_dispatch_expected field exists', () => {
  assert.ok(fs.existsSync(GATE), 'parallel-dispatch-gate.cjs must exist');
  const docPath = mkTmp('f5-s1-');
  seed(docPath, { expected: undefined });
  const { code, stdout } = runGate(docPath, 'agentA');
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'no group armed → allow');
});

// ---- B5-S2 (main) — spawn is in the group → allow --------------------------
test('B5-S2: gate exits 0 when subagent_type is in dispatch_ids (group satisfied)', () => {
  assert.ok(fs.existsSync(GATE), 'parallel-dispatch-gate.cjs must exist');
  const docPath = mkTmp('f5-s2-');
  seed(docPath, { expected: { dispatch_ids: ['agentA', 'agentB', 'agentC'], armed_ts: new Date().toISOString() } });
  const { code, stdout } = runGate(docPath, 'agentA');
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'member of the group → allow');
});

// ---- B5-S3 (main) — outside group within window → VIOLATION audit, no deny --
test('B5-S3: gate emits PARALLEL_DISPATCH_VIOLATION but exits 0 (warn-first) for an out-of-group spawn', () => {
  assert.ok(fs.existsSync(GATE), 'parallel-dispatch-gate.cjs must exist');
  const docPath = mkTmp('f5-s3-');
  seed(docPath, { expected: { dispatch_ids: ['agentA', 'agentB'], armed_ts: new Date().toISOString() } });
  const { code, stdout } = runGate(docPath, 'agentZ'); // NOT in dispatch_ids
  assert.equal(code, 0, 'warn-first: hook still exits 0');
  assert.ok(!isDeny(stdout), 'warn-first: no deny by default');
  assert.match(readEvents(docPath), /PARALLEL_DISPATCH_VIOLATION/,
    'must record PARALLEL_DISPATCH_VIOLATION');
});

// ---- B5-S4 (regression) — enforcement=deny + out-of-group → deny -----------
test('B5-S4: gate denies when PIPELINE_PARALLEL_ENFORCEMENT=deny and spawn is outside the group', () => {
  assert.ok(fs.existsSync(GATE), 'parallel-dispatch-gate.cjs must exist');
  const docPath = mkTmp('f5-s4-');
  seed(docPath, { expected: { dispatch_ids: ['agentA', 'agentB'], armed_ts: new Date().toISOString() } });
  const { stdout } = runGate(docPath, 'agentZ', { enforcement: 'deny' });
  assert.ok(isDeny(stdout), 'out-of-group spawn under deny enforcement → deny');
});

// ---- B5-S5 (regression) — unreadable sentinel → fail-open ------------------
test('B5-S5: gate exits 0 (fail-open) when sentinel is unreadable', () => {
  assert.ok(fs.existsSync(GATE), 'parallel-dispatch-gate.cjs must exist');
  const docPath = mkTmp('f5-s5-'); // no sentinel-state.json
  const { code, stdout } = runGate(docPath, 'agentA', { enforcement: 'deny' });
  assert.equal(code, 0, 'hook exits 0 (fail-open) even under deny');
  assert.ok(!isDeny(stdout), 'unreadable sentinel → no deny (fail-open)');
});

// ---- B5-S6 (regression) — malformed dispatch_ids → fail-open + MALFORMED ----
test('B5-S6: gate exits 0 and emits PARALLEL_DISPATCH_MALFORMED when dispatch_ids is not an array', () => {
  assert.ok(fs.existsSync(GATE), 'parallel-dispatch-gate.cjs must exist');
  const docPath = mkTmp('f5-s6-');
  seed(docPath, { expected: { dispatch_ids: 'not-an-array', armed_ts: new Date().toISOString() } });
  const { code, stdout } = runGate(docPath, 'agentA', { enforcement: 'deny' });
  assert.equal(code, 0, 'fail-open: never blocks on malformed config');
  assert.ok(!isDeny(stdout), 'malformed config → no deny');
  assert.match(readEvents(docPath), /PARALLEL_DISPATCH_MALFORMED/,
    'must record PARALLEL_DISPATCH_MALFORMED');
});

// ---- B5-S7 (edge) — protocol doc documents group_id + batch_mode -----------
test('B5-S7: gate-request-protocol.md documents group_id and batch_mode for DISPATCH_REQUEST', () => {
  const md = fs.readFileSync(PROTOCOL_DOC, 'utf8');
  assert.match(md, /group_id/, 'must document group_id');
  assert.match(md, /batch_mode/, 'must document batch_mode');
  assert.match(md, /batch_mode\s*:?\s*parallel/i, "must show batch_mode value 'parallel'");
  // Back-compat note: blocks without group_id keep legacy serial behavior.
  assert.match(md, /without\s+(?:a\s+)?group_id|legacy serial/i,
    'must carry a back-compat note for blocks without group_id');
});

cleanup();
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
