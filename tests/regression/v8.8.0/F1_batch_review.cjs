#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.8.0) — per-batch adversarial-review gate (TDD RED→GREEN).
//
// The prose rule "run the adversarial review every batch BEFORE advancing"
// (Inline Invariant #7 / ADVERSARIAL_GATE) lived only in agent markdown — a run
// could implement every batch and review once at the very end and still pass.
// This proves the CODE decision: before a batch-boundary agent (checkpoint-
// validator = next batch) or the closure (final-validator) is spawned, the
// signed state must show batch_reviews_done >= batch_checkpoints_done. Pure brain
// (decideBatchReview) + a LIVE CLI deny/allow smoke. Mirrors F8 + F11.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MOD = '../../../lib/batch-review-guard.cjs';
const GATE = path.resolve(__dirname, '../../../.claude/hooks/batch-review-gate.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

// Seed an ACTIVE, SIGNED run under <root>/.pipeline/ (mirror F11's seedRun) with
// the two batch counters in the signed sentinel-state.
function seedRun(root, checkpoints, reviews) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r',
    pipeline_active: true,
    task_type: 'Bug Fix',
    pipeline_doc_path: docDir,
    batch_checkpoints_done: checkpoints,
    batch_reviews_done: reviews,
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-19T12:00:00.000Z' }, null, 2)
  );
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batchrev-f1-'));
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

console.log('=== F1 v8.8.0 — per-batch adversarial-review gate ===');

// ---- Pure brain: decideBatchReview ------------------------------------------

test('F1-1 — reviews caught up (>=) → allow', () => {
  const { decideBatchReview } = require(MOD);
  assert.equal(decideBatchReview({ agentLeaf: 'checkpoint-validator', checkpointsDone: 0, reviewsDone: 0 }).decision, 'allow');
  assert.equal(decideBatchReview({ agentLeaf: 'checkpoint-validator', checkpointsDone: 1, reviewsDone: 1 }).decision, 'allow');
  assert.equal(decideBatchReview({ agentLeaf: 'checkpoint-validator', checkpointsDone: 1, reviewsDone: 2 }).decision, 'allow');
});

test('F1-2 — review LAGS checkpoint (deny) → BLOCK + BATCH_REVIEW_MISSING', () => {
  const { decideBatchReview } = require(MOD);
  const r = decideBatchReview({ agentLeaf: 'checkpoint-validator', checkpointsDone: 1, reviewsDone: 0, enforce: 'deny' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /BATCH_REVIEW_MISSING/);
  assert.match(r.reason, /checkpoint-validator/);
});

test('F1-3 — final-validator with an unreviewed batch → BLOCK (closure hole closed)', () => {
  const { decideBatchReview } = require(MOD);
  const r = decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 3, reviewsDone: 2, enforce: 'deny' });
  assert.equal(r.decision, 'block');
});

test('F1-4 — ungoverned agent → allow EVEN IF reviews lag', () => {
  const { decideBatchReview } = require(MOD);
  assert.equal(decideBatchReview({ agentLeaf: 'executor-controller', checkpointsDone: 5, reviewsDone: 0, enforce: 'deny' }).decision, 'allow');
  assert.equal(decideBatchReview({ agentLeaf: 'sentinel', checkpointsDone: 5, reviewsDone: 0, enforce: 'deny' }).decision, 'allow');
});

test('F1-5 — warn mode → allow + warn even when behind (escape)', () => {
  const { decideBatchReview } = require(MOD);
  const r = decideBatchReview({ agentLeaf: 'checkpoint-validator', checkpointsDone: 2, reviewsDone: 0, enforce: 'warn' });
  assert.equal(r.decision, 'allow');
  assert.equal(r.warn, true);
});

test('F1-6 — malformed ctx → allow (fail-open)', () => {
  const { decideBatchReview } = require(MOD);
  assert.equal(decideBatchReview(null).decision, 'allow');
  assert.equal(decideBatchReview({}).decision, 'allow');
  assert.equal(decideBatchReview({ agentLeaf: '' }).decision, 'allow');
});

test('F1-7 — absent counters default to 0 (migration-tolerant)', () => {
  const { decideBatchReview } = require(MOD);
  // checkpoints undefined→0, reviews undefined→0 → 0>=0 → allow
  assert.equal(decideBatchReview({ agentLeaf: 'final-validator' }).decision, 'allow');
  // checkpoints present, reviews absent→0 → lags → block
  assert.equal(decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 1, enforce: 'deny' }).decision, 'block');
});

test('F1-8 — GOVERNED is exactly {checkpoint-validator, final-validator}', () => {
  const { GOVERNED } = require(MOD);
  assert.ok(GOVERNED.has('checkpoint-validator'));
  assert.ok(GOVERNED.has('final-validator'));
  assert.ok(!GOVERNED.has('review-orchestrator')); // the producer, not gated
  assert.ok(!GOVERNED.has('executor-controller'));
});

// ---- LIVE CLI: real deny / allow through the hook ---------------------------

liveTest('F1-9 — LIVE DENY: next checkpoint while batch 1 unreviewed → deny + BATCH_REVIEW_MISSING', (root) => {
  const docDir = seedRun(root, 1, 0); // 1 checkpoint passed, 0 reviews
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(empty stdout — deny path not taken)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /BATCH_REVIEW_MISSING/);
});

liveTest('F1-10 — LIVE ALLOW: review caught up → empty stdout (allow)', (root) => {
  const docDir = seedRun(root, 1, 1);
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F1-11 — LIVE DENY: final-validator with an unreviewed batch → deny', (root) => {
  const docDir = seedRun(root, 2, 1);
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(empty — deny not taken)');
});

liveTest('F1-12 — LIVE ALLOW: ungoverned agent never blocked, even behind', (root) => {
  const docDir = seedRun(root, 3, 0);
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F1-13 — LIVE: no pipeline state → allow (fail-open, no freeze)', (dir) => {
  const r = run({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: dir }, { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F1-14 — LIVE: non-Agent tool → allow', (dir) => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'a.js') }, cwd: dir }, { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F1-15 — LIVE: malformed stdin → exit 0, no crash (fail-open)', () => {
  const r = spawnSync(process.execPath, [GATE], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F1-16 — LIVE: warn env relaxes the real deny path to allow', (root) => {
  const docDir = seedRun(root, 1, 0);
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'warn', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F1-17 — LIVE DENY: governed spawn on a TAMPERED signed state fails CLOSED (CRITICAL fix)', (root) => {
  const docDir = seedRun(root, 1, 0);
  // Tamper a SIGNED field without re-signing → signature invalid → CORRUPT_SENTINEL.
  // Here the adversary forges reviews=999 to try to satisfy the gate.
  const p = path.join(docDir, 'sentinel-state.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  raw.batch_reviews_done = 999;
  fs.writeFileSync(p, JSON.stringify(raw));
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(corrupt state FAILED OPEN — gate bypassed!)');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /CORRUPT/);
});

liveTest('F1-18 — LIVE ALLOW: ungoverned spawn on a tampered state is NOT deadlocked', (root) => {
  const docDir = seedRun(root, 1, 0);
  const p = path.join(docDir, 'sentinel-state.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  raw.run_id = 'tampered';
  fs.writeFileSync(p, JSON.stringify(raw));
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:executor:executor-controller' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '', 'ungoverned must not be blocked by a corrupt state');
});

liveTest('F1-19 — LIVE: trailing-space leaf "final-validator " cannot escape governance', (root) => {
  const docDir = seedRun(root, 1, 0); // 1 checkpoint, 0 reviews → behind
  const r = run(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator ' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(trailing-space leaf escaped governance!)');
});

console.log(`\n=== F1 v8.8.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
