#!/usr/bin/env node
'use strict';

// =============================================================================
// F11 (S5 / Requirement 2) — the collapse-signal PRODUCER call-site.
//
// F9 proves the WRITER (recordReviewConsolidated) and the CONSUMER
// (decideBatchReview / batch-review-gate) in isolation. But nothing in the live
// flow ever CALLS the writer — the producer was dead code (info-gate finding of
// the r3 dogfood). This suite pins the missing wire: the PostToolUse:Agent stamp
// hook (.claude/hooks/step-ledger-stamp.cjs), on a `plan-architect` return (plan
// close), evaluates the collapse condition from the SIGNED state ONLY and writes
// review_state.review_consolidated=true when — and only when —
//   (complexity === 'SIMPLES' OR batch_state.total_batches_estimated === 1)
//   AND domains_touched is empty (2.5) AND the task is code-changing.
//
// TDD: F11-1/-2 FAIL against pre-wiring code (the hook never writes the flag) = RED.
// Live spawnSync of the real hook (no stubs), mirrors the F9 / F1-v8.8.0 harness.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

const PLAN_ARCHITECT = 'pipeline-orchestrator:quality:plan-architect';

// Seed an ACTIVE, SIGNED run at plan-close (no batches run yet → domains empty).
function seedRun(root, opts) {
  const o = opts || {};
  const docDir = path.join(root, '.pipeline', 'docs', 'Pre-Simples-action', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const state = {
    schema_version: 1,
    run_id: 'r',
    pipeline_active: true,
    pipeline_doc_path: docDir,
    task_type: o.taskType || 'Bug Fix',
    orchestrator_decision: { type: o.taskType || 'Bug Fix', complexity: o.complexity || 'SIMPLES' },
    batch_state: { current_batch: 0, total_batches_estimated: o.plannedBatches != null ? o.plannedBatches : 1, consecutive_failures: 0 },
    batch_checkpoints_done: 0,
    batch_reviews_done: 0,
  };
  if (Array.isArray(o.domains)) state.domains_touched = o.domains;
  writeSignedState(path.join(docDir, 'sentinel-state.json'), state);
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-07-15T15:00:00.000Z' }, null, 2)
  );
  return docDir;
}

function fireStamp(root, leaf, env) {
  const payload = { tool_name: 'Agent', cwd: root, tool_input: { subagent_type: leaf }, tool_response: 'done' };
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}

function readFlag(docDir) {
  const st = JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8'));
  return { st, flag: !!(st.review_state && st.review_state.review_consolidated) };
}

let pass = 0, fail = 0;
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consol-f11-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== F11 (S5) — proportional-consolidation producer call-site ===');

liveTest('F11-1 [RED] SIMPLES non-sensitive plan-architect return → writes signed review_consolidated (2.1-2.3)', (dir) => {
  const docDir = seedRun(dir, { complexity: 'SIMPLES', plannedBatches: 3, taskType: 'Bug Fix' });
  fireStamp(dir, PLAN_ARCHITECT);
  const { st, flag } = readFlag(docDir);
  assert.equal(flag, true, 'the stamp must write review_consolidated on a SIMPLES non-sensitive plan close');
  const v = verifyState(st, { key: readHmacKey ? readHmacKey() : undefined, strict: false });
  assert.equal(v.valid, true, 'state must remain validly signed after the producer write');
});

liveTest('F11-2 [RED] 1-batch MEDIA non-sensitive plan-architect return → writes review_consolidated (2.1)', (dir) => {
  const docDir = seedRun(dir, { complexity: 'MEDIA', plannedBatches: 1, taskType: 'Feature' });
  fireStamp(dir, PLAN_ARCHITECT);
  assert.equal(readFlag(docDir).flag, true, 'exactly-1-batch (planned) non-sensitive run collapses too');
});

liveTest('F11-3 multi-batch MEDIA (not SIMPLES) → NO flag (2.2 preserved)', (dir) => {
  const docDir = seedRun(dir, { complexity: 'MEDIA', plannedBatches: 3, taskType: 'Feature' });
  fireStamp(dir, PLAN_ARCHITECT);
  assert.equal(readFlag(docDir).flag, false, 'a multi-batch MEDIA run must NOT collapse');
});

liveTest('F11-4 SIMPLES but SENSITIVE domain touched → NO flag (2.5)', (dir) => {
  const docDir = seedRun(dir, { complexity: 'SIMPLES', plannedBatches: 1, taskType: 'Bug Fix', domains: ['auth'] });
  fireStamp(dir, PLAN_ARCHITECT);
  assert.equal(readFlag(docDir).flag, false, 'a run that already touched a sensitive domain must not be collapsed by the producer');
});

liveTest('F11-5 code-changing gate: read-only Audit type → NO flag', (dir) => {
  const docDir = seedRun(dir, { complexity: 'SIMPLES', plannedBatches: 1, taskType: 'Audit' });
  fireStamp(dir, PLAN_ARCHITECT);
  assert.equal(readFlag(docDir).flag, false, 'a non-code-changing (Audit) run must not collapse a code review round');
});

liveTest('F11-6 ungoverned leaf (not plan close) → NO flag (only plan-architect triggers)', (dir) => {
  const docDir = seedRun(dir, { complexity: 'SIMPLES', plannedBatches: 1, taskType: 'Bug Fix' });
  fireStamp(dir, 'pipeline-orchestrator:core:information-gate');
  assert.equal(readFlag(docDir).flag, false, 'the producer fires at plan close, not on an unrelated agent return');
});

liveTest('F11-7 idempotent: two plan-architect returns keep the flag true + emit the AUDIT event ONCE (relay-safe)', (dir) => {
  const docDir = seedRun(dir, { complexity: 'SIMPLES', plannedBatches: 1, taskType: 'Bug Fix' });
  fireStamp(dir, PLAN_ARCHITECT);
  fireStamp(dir, PLAN_ARCHITECT);
  const { st, flag } = readFlag(docDir);
  assert.equal(flag, true, 'flag stays true across repeated plan-architect returns');
  const v = verifyState(st, { key: readHmacKey ? readHmacKey() : undefined, strict: false });
  assert.equal(v.valid, true, 'state stays validly signed after repeated writes');
  // Emit-once (2.3): the relay must NOT append duplicate ADVERSARIAL_CONSOLIDATED entries.
  let audit = '';
  try { audit = fs.readFileSync(path.join(docDir, 'gate-decisions.jsonl'), 'utf8'); } catch {}
  const hits = audit.split('\n').filter((l) => l.includes('ADVERSARIAL_CONSOLIDATED')).length;
  assert.equal(hits, 1, `exactly one collapse audit event expected, found ${hits}`);
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
