#!/usr/bin/env node
'use strict';

// =============================================================================
// F11 (v8.7.0) — deterministic gate-logging enforcement (TDD RED→GREEN).
//
// The audit trail was prose-only: a phase could transition with NO gate logged.
// This proves the code decision: before a phase-transition agent is spawned, the
// prior phase's REQUIRED gate(s) must already be present in gate-decisions.jsonl.
// Pure brain (decideGateLog / parseLoggedGates) + a LIVE CLI safety smoke of the
// thin hook wrapper — mirrors F4 (brain) + F5 (live) for the step ledger.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MOD = '../../../lib/gate-log-guard.cjs';
const GATE = path.resolve(__dirname, '../../../.claude/hooks/gate-log-gate.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

// Seed an ACTIVE, SIGNED run inside <root>/.pipeline/ so the gate's
// findActiveSentinelState resolves it authoritatively (mirrors F9-3's setup):
//   - docDir lives under <root>/.pipeline/ so the active-run.json pointer and the
//     PIPELINE_DOC_PATH are BOTH `contained` by the discovery containment check;
//   - the sentinel-state is HMAC-signed so the authoritative-path signature check
//     accepts it (a forged/unsigned authoritative state would be rejected);
//   - the gate-decisions.jsonl trail holds the logged gate lines under test.
function seedRun(root, jsonlLines) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r',
    pipeline_active: true,
    task_type: 'Bug Fix',
    pipeline_doc_path: docDir,
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-18T12:00:00.000Z' }, null, 2)
  );
  fs.writeFileSync(path.join(docDir, 'gate-decisions.jsonl'), jsonlLines.join('\n') + '\n');
  return docDir;
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatelog-f11-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function run(payload, env) {
  return spawnSync(process.execPath, [GATE], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}

console.log('=== F11 v8.7.0 — gate-logging enforcement ===');

// ---- Pure brain: decideGateLog ----------------------------------------------

test('F11-1 — required gate logged → allow', () => {
  const { decideGateLog } = require(MOD);
  const r = decideGateLog({ agentLeaf: 'executor-controller', loggedGates: ['TDD_APPROVAL'], enforce: 'deny' });
  assert.equal(r.decision, 'allow');
});

test('F11-2 — required gate MISSING (deny) → block + GATE_LOG_MISSING reason', () => {
  const { decideGateLog } = require(MOD);
  const r = decideGateLog({ agentLeaf: 'executor-controller', loggedGates: ['INFO_GATE_BLOCKED'], enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.deepEqual(r.missing, ['TDD_APPROVAL']);
  assert.match(r.reason, /GATE_LOG_MISSING/);
  assert.match(r.reason, /executor-controller/);
});

test('F11-3 — final-validator before adversarial gate logged → block', () => {
  const { decideGateLog } = require(MOD);
  const r = decideGateLog({ agentLeaf: 'final-validator', loggedGates: ['TDD_APPROVAL'], enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.deepEqual(r.missing, ['ADVERSARIAL_GATE']);
});

test('F11-4 — ungoverned agent (not in map) → allow', () => {
  const { decideGateLog } = require(MOD);
  assert.equal(decideGateLog({ agentLeaf: 'sentinel', loggedGates: [], enforce: 'deny' }).decision, 'allow');
  assert.equal(decideGateLog({ agentLeaf: 'plan-architect', loggedGates: [], enforce: 'deny' }).decision, 'allow');
});

test('F11-5 — warn mode with missing gate → allow + warn + missing list (escape)', () => {
  const { decideGateLog } = require(MOD);
  const r = decideGateLog({ agentLeaf: 'executor-controller', loggedGates: [], enforce: 'warn' });
  assert.equal(r.decision, 'allow');
  assert.equal(r.warn, true);
  assert.ok(r.missing.length > 0);
});

test('F11-6 — malformed ctx → allow (fail-open)', () => {
  const { decideGateLog } = require(MOD);
  assert.equal(decideGateLog(null).decision, 'allow');
  assert.equal(decideGateLog({}).decision, 'allow');
  assert.equal(decideGateLog({ agentLeaf: '' }).decision, 'allow');
});

test('F11-7 — loggedGates accepts a Set too', () => {
  const { decideGateLog } = require(MOD);
  const r = decideGateLog({ agentLeaf: 'executor-controller', loggedGates: new Set(['TDD_APPROVAL']), enforce: 'deny' });
  assert.equal(r.decision, 'allow');
});

test('F11-8 — REQUIRED_GATES_BEFORE is conservative (only known governed agents)', () => {
  const { REQUIRED_GATES_BEFORE } = require(MOD);
  assert.ok(REQUIRED_GATES_BEFORE && typeof REQUIRED_GATES_BEFORE === 'object');
  assert.deepEqual(REQUIRED_GATES_BEFORE['executor-controller'], ['TDD_APPROVAL']);
  assert.deepEqual(REQUIRED_GATES_BEFORE['final-validator'], ['ADVERSARIAL_GATE']);
  // plan-architect must NOT be governed (nothing required before it).
  assert.equal(REQUIRED_GATES_BEFORE['plan-architect'], undefined);
});

// ---- Pure brain: parseLoggedGates -------------------------------------------

test('F11-9 — parseLoggedGates parses valid lines, ignores malformed', () => {
  const { parseLoggedGates } = require(MOD);
  const text = [
    '{"gate":"TDD_APPROVAL","decision":"APPROVED"}',
    'not json at all',
    '{"gate":"ADVERSARIAL_GATE","decision":"SKIPPED"}',
    '{"no_gate_key":true}',
    '   ',
    '{"gate":"","decision":"X"}',
  ].join('\n');
  const set = parseLoggedGates(text);
  assert.ok(set instanceof Set);
  assert.ok(set.has('TDD_APPROVAL'));
  assert.ok(set.has('ADVERSARIAL_GATE'));
  assert.equal(set.size, 2);
});

test('F11-10 — parseLoggedGates fail-open on non-string input', () => {
  const { parseLoggedGates } = require(MOD);
  assert.equal(parseLoggedGates(null).size, 0);
  assert.equal(parseLoggedGates(undefined).size, 0);
  assert.equal(parseLoggedGates('').size, 0);
});

test('F11-10a — parseLoggedGates TRIMS trailing whitespace (manual-edit tolerance, B-1)', () => {
  const { parseLoggedGates, decideGateLog } = require(MOD);
  const set = parseLoggedGates('{"gate":"TDD_APPROVAL ","decision":"APPROVED"}');
  // the trimmed name is what lands in the Set …
  assert.ok(set.has('TDD_APPROVAL'));
  assert.ok(!set.has('TDD_APPROVAL '));
  assert.equal(set.size, 1);
  // … and the trailing-space line STILL satisfies the requirement.
  const r = decideGateLog({ agentLeaf: 'executor-controller', loggedGates: set, enforce: 'deny' });
  assert.equal(r.decision, 'allow');
});

test('F11-10b — parseLoggedGates DEDUPES the same gate name on two lines (T-3)', () => {
  const { parseLoggedGates, decideGateLog } = require(MOD);
  const text = [
    '{"gate":"TDD_APPROVAL","decision":"APPROVED"}',
    '{"gate":"TDD_APPROVAL","decision":"APPROVED"}',
  ].join('\n');
  const set = parseLoggedGates(text);
  assert.equal(set.size, 1); // Set reflects UNIQUE names
  assert.ok(set.has('TDD_APPROVAL'));
  // requirement still satisfied with the deduped Set.
  const r = decideGateLog({ agentLeaf: 'executor-controller', loggedGates: set, enforce: 'deny' });
  assert.equal(r.decision, 'allow');
});

// ---- LIVE CLI safety smoke (mirror F5) --------------------------------------

liveTest('F11-11 — no pipeline state → allow (fail-open, no freeze)', (dir) => {
  const r = run({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: dir }, { PIPELINE_GATE_LOG_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F11-12 — non-Agent tool → allow', (dir) => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'a.js') }, cwd: dir }, { PIPELINE_GATE_LOG_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F11-13 — malformed stdin → exit 0, no crash (fail-open)', () => {
  const r = spawnSync(process.execPath, [GATE], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal((r.stdout || '').trim(), '');
});

// ---- LIVE CLI: the real DENY / ALLOW paths through the hook (T-1) ------------
// These drive the gate CLI via child_process against a seeded ACTIVE+SIGNED run.
// The adversarial finding: every prior live test asserted EMPTY stdout (allow),
// so the deny branch of the real hook was never exercised end-to-end.

liveTest('F11-14 — LIVE DENY: governed agent, required gate NOT logged → deny + GATE_LOG_MISSING', (root) => {
  // ADVERSARIAL_GATE present but TDD_APPROVAL missing → executor-controller blocked.
  const docDir = seedRun(root, ['{"gate":"ADVERSARIAL_GATE","decision":"SKIPPED"}']);
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: root },
    { PIPELINE_GATE_LOG_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(empty stdout — deny path not taken)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /GATE_LOG_MISSING/);
});

liveTest('F11-15 — LIVE ALLOW: governed agent, required gate logged → empty stdout (allow)', (root) => {
  // Same run, but TDD_APPROVAL is ALSO logged → executor-controller allowed.
  const docDir = seedRun(root, [
    '{"gate":"ADVERSARIAL_GATE","decision":"SKIPPED"}',
    '{"gate":"TDD_APPROVAL","decision":"APPROVED"}',
  ]);
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: root },
    { PIPELINE_GATE_LOG_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

console.log(`\n=== F11 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
