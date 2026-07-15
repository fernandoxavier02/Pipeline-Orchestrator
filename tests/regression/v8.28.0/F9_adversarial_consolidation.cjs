#!/usr/bin/env node
'use strict';

// =============================================================================
// F9 (S5 / Requirement 2) — proportional adversarial-review consolidation.
//
// A governed run with exactly 1 batch (or SIMPLES) and NO sensitive domain
// collapses the per-batch adversarial round into the single surviving 3-way
// final round (2.1-2.3). A signed, VERIFIED flag (`review_consolidated`) records
// that collapse; decideBatchReview treats it as satisfying reviews>=checkpoints —
// but ONLY for a non-sensitive run (2.5), re-reading domains_touched FRESH at
// consume time (TOCTOU close). A forged/unsigned flag never reaches the pure
// brain (the wrapper's findActiveSentinelState fails closed on an invalid
// signature). Multi-batch runs never get the flag → behaviour byte-identical
// (2.2). bugfix-heavy wrapped uses a distinct signal (`final_review_scheduled`,
// 2.4). Writers live in scripts/record-step.cjs (lock + allowlist + AUDIT event).
//
// TDD: the flag-acceptance cases + writer cases FAIL against pre-S5 code (RED).
// Mirrors the F1 v8.8.0 harness (pure brain + live spawnSync of the gate).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MOD = '../../../lib/batch-review-guard.cjs';
const REC = '../../../scripts/record-step.cjs';
const GATE = path.resolve(__dirname, '../../../.claude/hooks/batch-review-gate.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

// Seed an ACTIVE, SIGNED run with counters + optional flags/domains.
function seedRun(root, opts) {
  const o = opts || {};
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const state = {
    run_id: 'r',
    pipeline_active: true,
    task_type: 'Bug Fix',
    pipeline_doc_path: docDir,
    batch_checkpoints_done: o.checkpoints || 0,
    batch_reviews_done: o.reviews || 0,
  };
  if (Array.isArray(o.domains)) state.domains_touched = o.domains;
  if (o.reviewConsolidated || o.finalReviewScheduled) {
    state.review_state = {};
    if (o.reviewConsolidated) state.review_state.review_consolidated = true;
    if (o.finalReviewScheduled) state.review_state.final_review_scheduled = true;
  }
  writeSignedState(path.join(docDir, 'sentinel-state.json'), state);
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-07-15T15:00:00.000Z' }, null, 2)
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consol-f9-'));
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
function denyReason(r) {
  if (!r.stdout || !r.stdout.trim()) return null;
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason; } catch { return null; }
}

console.log('=== F9 (S5) — proportional adversarial-review consolidation ===');

// ---- Pure brain: decideBatchReview + the collapse flag ----------------------

test('F9-1 [RED] verified review_consolidated + non-sensitive + reviews<checkpoints → allow (collapse)', () => {
  const { decideBatchReview } = require(MOD);
  const r = decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 1, reviewsDone: 0, reviewConsolidated: true, sensitive: false, enforce: 'deny' });
  assert.equal(r.decision, 'allow', 'a verified collapse flag must satisfy the invariant for a non-sensitive 1-batch run');
});

test('F9-2 review_consolidated but SENSITIVE → block (2.5: collapse never eliminates the round on a sensitive run)', () => {
  const { decideBatchReview } = require(MOD);
  const r = decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 1, reviewsDone: 0, reviewConsolidated: true, sensitive: true, domains: ['auth'], enforce: 'deny' });
  assert.equal(r.decision, 'block', 'a sensitive run must ignore the collapse flag and enforce the classic invariant');
});

test('F9-3 [RED] final_review_scheduled + non-sensitive + reviews<checkpoints → allow (2.4 bugfix-heavy wrapped)', () => {
  const { decideBatchReview } = require(MOD);
  const r = decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 2, reviewsDone: 0, finalReviewScheduled: true, sensitive: false, enforce: 'deny' });
  assert.equal(r.decision, 'allow', 'a verified final_review_scheduled flag satisfies the invariant for a non-sensitive run');
});

test('F9-4 no flag, reviews>=checkpoints → allow (classic path preserved / 2.2)', () => {
  const { decideBatchReview } = require(MOD);
  assert.equal(decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 2, reviewsDone: 2 }).decision, 'allow');
});

test('F9-5 no flag, reviews<checkpoints, deny → block (classic invariant unchanged / 2.2)', () => {
  const { decideBatchReview } = require(MOD);
  assert.equal(decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 2, reviewsDone: 0, enforce: 'deny' }).decision, 'block');
});

test('F9-6 flag present but agent ungoverned → allow (unchanged; gate only bites governed leaves)', () => {
  const { decideBatchReview } = require(MOD);
  assert.equal(decideBatchReview({ agentLeaf: 'implementer', reviewConsolidated: true }).decision, 'allow');
});

// ---- Writers: recordReviewConsolidated / recordFinalReviewScheduled ---------

test('F9-7 [RED] recordReviewConsolidated writes a signed review_state.review_consolidated=true', () => {
  const rec = require(REC);
  assert.equal(typeof rec.recordReviewConsolidated, 'function', 'recordReviewConsolidated writer must exist');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consol-rec7-'));
  try {
    const docDir = seedRun(dir, { checkpoints: 1, reviews: 0 });
    const res = rec.recordReviewConsolidated(docDir);
    assert.ok(res && res.ok !== false, 'writer should succeed');
    const st = JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8'));
    assert.equal(st.review_state && st.review_state.review_consolidated, true, 'flag must be set under review_state');
    const v = verifyState(st, { key: readHmacKey ? readHmacKey() : undefined, strict: false });
    assert.equal(v.valid, true, 'state must remain validly signed after the write');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F9-8 [RED] recordFinalReviewScheduled writes a signed review_state.final_review_scheduled=true', () => {
  const rec = require(REC);
  assert.equal(typeof rec.recordFinalReviewScheduled, 'function', 'recordFinalReviewScheduled writer must exist');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consol-rec8-'));
  try {
    const docDir = seedRun(dir, { checkpoints: 2, reviews: 0 });
    const res = rec.recordFinalReviewScheduled(docDir);
    assert.ok(res && res.ok !== false, 'writer should succeed');
    const st = JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8'));
    assert.equal(st.review_state && st.review_state.final_review_scheduled, true, 'flag must be set under review_state');
    const v = verifyState(st, { key: readHmacKey ? readHmacKey() : undefined, strict: false });
    assert.equal(v.valid, true, 'state must remain validly signed after the write');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- Live wrapper (spawnSync of the gate) -----------------------------------

liveTest('F9-9 [RED] live gate: signed review_consolidated + non-sensitive final-validator spawn → ALLOW (no deny)', (dir) => {
  seedRun(dir, { checkpoints: 1, reviews: 0, reviewConsolidated: true });
  const r = run({ tool_name: 'Agent', cwd: dir, tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' } });
  assert.equal(denyReason(r), null, 'a validly-signed collapse flag must let the closure spawn through');
});

liveTest('F9-10 live gate: signed flag but domains_touched=[auth] → DENY (sensitive overrides collapse, 2.5)', (dir) => {
  seedRun(dir, { checkpoints: 1, reviews: 0, reviewConsolidated: true, domains: ['auth'] });
  const r = run({ tool_name: 'Agent', cwd: dir, tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' } });
  const reason = denyReason(r);
  assert.ok(reason && /BATCH_REVIEW_MISSING/.test(reason), 'a sensitive run must still deny despite the flag');
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
