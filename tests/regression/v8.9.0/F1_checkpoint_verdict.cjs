#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.9.0) — Wave 1: don't-advance-on-RED (A1) + STOP_RULE counter (A2/A3)
// + sensitive-domain scanner (A4 lib). TDD RED→GREEN.
//
// Converts three prompt-only flow rules into code: a hook reads the checkpoint
// verdict stamped into signed state and DENIES advancing (review-orchestrator /
// final-validator) while the last build/test is RED or after N consecutive fails.
// Pure brains + live CLI deny/allow + recorder e2e + real stamp-hook path.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CPV = '../../../lib/checkpoint-verdict.cjs';
const CFC = '../../../lib/consecutive-failure-counter.cjs';
const DS = '../../../lib/domain-scanner.cjs';
const REC = require('../../../scripts/record-step.cjs');
const GATE = path.resolve(__dirname, '../../../.claude/hooks/checkpoint-verdict-gate.cjs');
const STAMP = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), Object.assign({
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-20T12:00:00.000Z' }, null, 2)
  );
  return docDir;
}
function readState(docDir) { return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')); }
function run(payload, env) {
  return spawnSync(process.execPath, [GATE], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}
function gate(root, docDir, leaf, env) {
  return run({ tool_name: 'Agent', tool_input: { subagent_type: `pipeline-orchestrator:quality:${leaf}` }, cwd: root },
    { PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir, ...(env || {}) });
}

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpv-f1-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F1 v8.9.0 — checkpoint-verdict + stop-rule + domain-scanner ===');

// ---- A1 pure brain ----------------------------------------------------------
test('F1-1 — A1: last verdict pass/null → allow; fail → block (governed)', () => {
  const { decideCheckpointVerdict } = require(CPV);
  assert.equal(decideCheckpointVerdict({ agentLeaf: 'review-orchestrator', lastVerdict: 'pass' }).decision, 'allow');
  assert.equal(decideCheckpointVerdict({ agentLeaf: 'review-orchestrator', lastVerdict: null }).decision, 'allow');
  const r = decideCheckpointVerdict({ agentLeaf: 'final-validator', lastVerdict: 'fail', enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /CHECKPOINT_RED/);
});
test('F1-2 — A1: ungoverned agent never blocked even when RED', () => {
  const { decideCheckpointVerdict } = require(CPV);
  assert.equal(decideCheckpointVerdict({ agentLeaf: 'executor-fix', lastVerdict: 'fail', enforce: 'deny' }).decision, 'allow');
  assert.equal(decideCheckpointVerdict({ agentLeaf: 'checkpoint-validator', lastVerdict: 'fail', enforce: 'deny' }).decision, 'allow');
});
test('F1-3 — A1: warn escape + malformed → allow', () => {
  const { decideCheckpointVerdict } = require(CPV);
  assert.equal(decideCheckpointVerdict({ agentLeaf: 'review-orchestrator', lastVerdict: 'fail', enforce: 'warn' }).warn, true);
  assert.equal(decideCheckpointVerdict(null).decision, 'allow');
  assert.equal(decideCheckpointVerdict({}).decision, 'allow');
});
test('F1-4 — normalizeVerdict maps pass/fail synonyms + bool, else null', () => {
  const { normalizeVerdict } = require(CPV);
  assert.equal(normalizeVerdict('pass'), 'pass');
  assert.equal(normalizeVerdict('GREEN'), 'pass');
  assert.equal(normalizeVerdict({ verdict: 'failed' }), 'fail');
  assert.equal(normalizeVerdict('red'), 'fail');
  assert.equal(normalizeVerdict(true), 'pass');
  assert.equal(normalizeVerdict(false), 'fail');
  assert.equal(normalizeVerdict('whatever'), null);
  assert.equal(normalizeVerdict(undefined), null);
});

// ---- A2/A3 pure brain -------------------------------------------------------
test('F1-5 — A2: under cap allow; at cap block (governed)', () => {
  const { decideConsecutiveFailures } = require(CFC);
  assert.equal(decideConsecutiveFailures({ agentLeaf: 'review-orchestrator', failures: 1 }).decision, 'allow');
  const r = decideConsecutiveFailures({ agentLeaf: 'final-validator', failures: 2, enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /STOP_RULE/);
});
test('F1-6 — A2: default cap 2; ungoverned allow; warn escape', () => {
  const { decideConsecutiveFailures } = require(CFC);
  assert.equal(decideConsecutiveFailures({ agentLeaf: 'review-orchestrator', failures: 2 }).decision, 'block');
  assert.equal(decideConsecutiveFailures({ agentLeaf: 'executor-fix', failures: 9, enforce: 'deny' }).decision, 'allow');
  assert.equal(decideConsecutiveFailures({ agentLeaf: 'final-validator', failures: 5, enforce: 'warn' }).warn, true);
});

// ---- A4 domain-scanner ------------------------------------------------------
test('F1-7 — domain-scanner detects sensitive domains by path', () => {
  const { scanDomains } = require(DS);
  assert.deepEqual(scanDomains(['src/auth/login.ts']), ['auth']);
  assert.deepEqual(scanDomains(['lib/crypto/hmac.cjs', 'api/payment_service.py']), ['crypto', 'payment']);
  assert.deepEqual(scanDomains(['db/migrations/001.sql']), ['data-model']);
  assert.deepEqual(scanDomains(['README.md', 'src/ui/button.tsx']), []);
  assert.deepEqual(scanDomains('not-an-array'), []);
});
test('F1-7b — PLURAL directory names are NOT evaded (adversarial fix)', () => {
  const { scanDomains } = require(DS);
  // conventional plural dirs must HIT
  assert.deepEqual(scanDomains(['src/sessions/store.ts']), ['auth']);
  assert.deepEqual(scanDomains(['src/credentials/x.ts', 'src/tokens/y.ts']), ['auth']);
  assert.deepEqual(scanDomains(['api/charges/create.ts', 'src/payments/p.ts', 'src/payouts/q.ts']), ['payment']);
  assert.deepEqual(scanDomains(['db/repositories/user.ts', 'db/schemas/s.ts']), ['data-model']);
  assert.deepEqual(scanDomains(['lib/signatures/verify.ts']), ['crypto']);
  // but plain words that merely START with a keyword must still MISS (no over-match)
  assert.deepEqual(scanDomains(['src/authors/list.ts', 'src/tokenizer/lex.ts', 'docs/signage.md']), []);
});

// ---- LIVE gate --------------------------------------------------------------
liveTest('F1-8 — LIVE DENY: advance while last checkpoint RED', (root) => {
  const docDir = seedRun(root, { last_checkpoint_verdict: 'fail' });
  const r = gate(root, docDir, 'review-orchestrator');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(red advance allowed!)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /CHECKPOINT_RED/);
});
liveTest('F1-9 — LIVE ALLOW: advance when last checkpoint GREEN', (root) => {
  const docDir = seedRun(root, { last_checkpoint_verdict: 'pass' });
  const r = gate(root, docDir, 'review-orchestrator');
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});
liveTest('F1-10 — LIVE DENY: 2 consecutive failures circuit-breaks (final-validator)', (root) => {
  const docDir = seedRun(root, { last_checkpoint_verdict: 'pass', consecutive_checkpoint_failures: 2 });
  const r = gate(root, docDir, 'final-validator');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(stop-rule not enforced!)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /STOP_RULE/);
});
liveTest('F1-11 — LIVE ALLOW: ungoverned (executor-fix) never blocked even RED+tripped', (root) => {
  const docDir = seedRun(root, { last_checkpoint_verdict: 'fail', consecutive_checkpoint_failures: 5 });
  const r = run({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-fix' }, cwd: root },
    { PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});
liveTest('F1-12 — LIVE: corrupt state + governed → deny (fail closed)', (root) => {
  const docDir = seedRun(root, { last_checkpoint_verdict: 'pass' });
  const p = path.join(docDir, 'sentinel-state.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  raw.last_checkpoint_verdict = 'pass'; raw.run_id = 'tampered'; // invalidates signature
  fs.writeFileSync(p, JSON.stringify(raw));
  const r = gate(root, docDir, 'final-validator');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(corrupt failed open!)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /CORRUPT/);
});
liveTest('F1-13 — LIVE: no state / non-Agent / malformed stdin → allow (fail-open)', (dir) => {
  let r = gate(dir, dir, 'review-orchestrator'); // no seeded run
  assert.equal((r.stdout || '').trim(), '', 'no-state must allow');
  r = run({ tool_name: 'Edit', tool_input: {}, cwd: dir }, { PIPELINE_DOC_PATH: dir });
  assert.equal((r.stdout || '').trim(), '', 'non-Agent must allow');
  r = spawnSync(process.execPath, [GATE], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal((r.stdout || '').trim(), '');
});
liveTest('F1-14 — LIVE: warn env relaxes the real RED deny', (root) => {
  const docDir = seedRun(root, { last_checkpoint_verdict: 'fail' });
  const r = gate(root, docDir, 'review-orchestrator', { PIPELINE_CHECKPOINT_VERDICT_ENFORCEMENT: 'warn' });
  assert.equal((r.stdout || '').trim(), '');
});

// ---- recorder e2e + real stamp hook ----------------------------------------
liveTest('F1-15 — recordCheckpointVerdict maintains last + consecutive counter; gate flips', (root) => {
  const docDir = seedRun(root, {});
  REC.recordCheckpointVerdict(docDir, { verdict: 'fail' });
  assert.equal(readState(docDir).consecutive_checkpoint_failures, 1);
  REC.recordCheckpointVerdict(docDir, { verdict: 'fail' });
  let st = readState(docDir);
  assert.equal(st.consecutive_checkpoint_failures, 2);
  assert.equal(st.last_checkpoint_verdict, 'fail');
  // gate now DENIES advance (both A1 red AND A2 tripped)
  let r = gate(root, docDir, 'review-orchestrator');
  assert.equal(JSON.parse(r.stdout || '{}').hookSpecificOutput.permissionDecision, 'deny');
  // a PASS resets the counter and clears red → gate allows
  REC.recordCheckpointVerdict(docDir, { verdict: 'pass' });
  st = readState(docDir);
  assert.equal(st.consecutive_checkpoint_failures, 0);
  assert.equal(st.last_checkpoint_verdict, 'pass');
  r = gate(root, docDir, 'review-orchestrator');
  assert.equal((r.stdout || '').trim(), '', 'green should re-open advance');
});
liveTest('F1-16 — REAL stamp hook reads checkpoint-verdict.json and records (fail)', (root) => {
  const docDir = seedRun(root, {});
  fs.writeFileSync(path.join(docDir, 'checkpoint-verdict.json'), JSON.stringify({ verdict: 'fail' }));
  const r = spawnSync(process.execPath, [STAMP], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root }),
    encoding: 'utf8', env: { ...process.env, PIPELINE_DOC_PATH: docDir },
  });
  assert.equal(r.status, 0, r.stderr);
  const st = readState(docDir);
  assert.equal(st.last_checkpoint_verdict, 'fail', 'stamp should record verdict from the file');
  assert.equal(st.consecutive_checkpoint_failures, 1);
});

const GREEN = { PIPELINE_REQUIRE_GREEN_CLOSE: 'true' };
liveTest('F1-17 — LIVE (opt-in): cannot CLOSE with a checkpointed batch that never went green (A1b)', (root) => {
  const docDir = seedRun(root, { batch_checkpoints_done: 1 });
  const r = gate(root, docDir, 'final-validator', GREEN);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(closed without a green checkpoint!)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /CHECKPOINT_NOT_GREEN/);
});
liveTest('F1-18 — LIVE (opt-in): report-only (zero checkpoints) closes; green checkpoint closes', (root) => {
  let docDir = seedRun(root, { batch_checkpoints_done: 0 });
  let r = gate(root, docDir, 'final-validator', GREEN);
  assert.equal((r.stdout || '').trim(), '', 'report-only must close');
  fs.rmSync(path.join(root, '.pipeline'), { recursive: true, force: true });
  docDir = seedRun(root, { batch_checkpoints_done: 2, last_checkpoint_verdict: 'pass' });
  r = gate(root, docDir, 'final-validator', GREEN);
  assert.equal((r.stdout || '').trim(), '', 'green checkpoint must close');
});
liveTest('F1-18b — LIVE: DEFAULT (opt-in OFF) never deadlocks closure on an absent verdict (adversarial fix)', (root) => {
  // Release-critical guarantee: with producers unwired, a checkpointed-but-no-verdict run
  // must STILL close by default (no PIPELINE_REQUIRE_GREEN_CLOSE) — no deadlock.
  const docDir = seedRun(root, { batch_checkpoints_done: 3 });
  const r = gate(root, docDir, 'final-validator'); // no GREEN flag
  assert.equal((r.stdout || '').trim(), '', 'default mode must NOT deadlock closure');
});

console.log(`\n=== F1 v8.9.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
