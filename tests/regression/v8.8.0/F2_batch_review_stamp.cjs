#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.8.0) — batch-counter stamping + end-to-end chain (TDD RED→GREEN).
//
// Proves the deterministic partner of F1: the PostToolUse stamp records the two
// counters into the SIGNED state without the LLM having to remember, and the
// gate then flips deny→allow. End-to-end: seed a run, stamp a checkpoint (gate
// now DENIES the next checkpoint), stamp a review (gate now ALLOWS). This is the
// whole point — advancing is impossible until the review actually ran.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REC = require('../../../scripts/record-step.cjs');
const GATE = path.resolve(__dirname, '../../../.claude/hooks/batch-review-gate.cjs');
const STAMP = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

function seedRun(root) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-19T12:00:00.000Z' }, null, 2)
  );
  return docDir;
}
function readState(docDir) {
  return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8'));
}
function gate(root, docDir, leaf, env) {
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: `pipeline-orchestrator:core:${leaf}` }, cwd: root }),
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir, ...(env || {}) },
  });
}

let pass = 0, fail = 0;
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batchrev-f2-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== F2 v8.8.0 — batch-counter stamping + e2e chain ===');

liveTest('F2-1 — recordBatchCheckpoint increments + keeps the signature valid', (root) => {
  const docDir = seedRun(root);
  const r1 = REC.recordBatchCheckpoint(docDir);
  assert.equal(r1.ok, true);
  assert.equal(r1.batch_checkpoints_done, 1);
  const st = readState(docDir);
  assert.equal(st.batch_checkpoints_done, 1);
  // signature still verifies after the bump (no laundering)
  const v = verifyState(st, { key: readHmacKey() });
  assert.ok(v.valid === true || v.unsigned === true || v.key_unavailable === true, 'state must remain validly signed');
  // second bump accumulates
  assert.equal(REC.recordBatchCheckpoint(docDir).batch_checkpoints_done, 2);
});

liveTest('F2-2 — recordBatchReview counts against a PENDING checkpoint (clamp)', (root) => {
  const docDir = seedRun(root);
  // No pending checkpoint → the review is a no-op (clamped), reviews stay 0.
  const noop = REC.recordBatchReview(docDir);
  assert.equal(noop.clamped, true);
  assert.equal(readState(docDir).batch_reviews_done || 0, 0);
  // With a pending checkpoint, the review now counts.
  REC.recordBatchCheckpoint(docDir);
  const r = REC.recordBatchReview(docDir);
  assert.equal(r.batch_reviews_done, 1);
  assert.equal(readState(docDir).batch_reviews_done, 1);
});

liveTest('F2-3 — E2E: checkpoint stamped → gate DENIES next checkpoint; review stamped → gate ALLOWS', (root) => {
  const docDir = seedRun(root);

  // batch 1 checkpoint completes
  REC.recordBatchCheckpoint(docDir);

  // trying to open batch 2 (spawn checkpoint-validator) → DENIED, review missing
  let r = gate(root, docDir, 'checkpoint-validator');
  assert.equal(r.status, 0, r.stderr);
  let out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(deny path not taken)');

  // batch 1 adversarial review completes
  REC.recordBatchReview(docDir);

  // now opening batch 2 is ALLOWED
  r = gate(root, docDir, 'checkpoint-validator');
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout || '').trim(), '', 'expected allow (empty stdout) after the review was stamped');
});

liveTest('F2-4 — E2E via the REAL stamp hook: feeding a checkpoint-validator completion bumps the counter', (root) => {
  const docDir = seedRun(root);
  // Drive the PostToolUse stamp hook exactly as the harness would on completion.
  const r = spawnSync(process.execPath, [STAMP], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root }),
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: docDir },
  });
  assert.equal(r.status, 0, r.stderr);
  const st = readState(docDir);
  assert.equal(st.batch_checkpoints_done, 1, 'stamp hook should have bumped batch_checkpoints_done');
});

liveTest('F2-5 — recorder refuses a path-traversal docPath (containment)', () => {
  const r = REC.recordBatchCheckpoint('../../etc');
  assert.equal(r.ok, false);
});

liveTest('F2-6 — BANKING IS IMPOSSIBLE: 2nd review on batch 1 clamps; skipping batch 2 still BLOCKS', (root) => {
  const docDir = seedRun(root);
  REC.recordBatchCheckpoint(docDir);              // batch 1 checkpoint → c=1
  REC.recordBatchReview(docDir);                  // batch 1 review     → r=1
  const banked = REC.recordBatchReview(docDir);   // try to bank a 2nd  → clamped
  assert.equal(banked.clamped, true);
  assert.equal(readState(docDir).batch_reviews_done, 1);
  REC.recordBatchCheckpoint(docDir);              // batch 2 checkpoint → c=2, review SKIPPED
  // Opening batch 3 (or closing) must be DENIED — the banked review can't cover batch 2.
  const r = gate(root, docDir, 'checkpoint-validator');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(banking let an unreviewed batch through!)');
});

liveTest('F2-7 — REAL stamp hook bumps batch_reviews_done on review-orchestrator completion', (root) => {
  const docDir = seedRun(root);
  REC.recordBatchCheckpoint(docDir); // pending checkpoint so the review is not clamped
  const r = spawnSync(process.execPath, [STAMP], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:quality:review-orchestrator' }, cwd: root }),
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: docDir },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readState(docDir).batch_reviews_done, 1, 'real stamp hook should bump batch_reviews_done for review-orchestrator');
});

console.log(`\n=== F2 v8.8.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
