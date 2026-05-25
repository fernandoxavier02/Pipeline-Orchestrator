'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun } = require('../../src/state/run-store.cjs');
const { readEvidence } = require('../../src/state/evidence-writer.cjs');
const { runAdversarialReviewLoop } = require('../../src/runtime/adversarial-review-loop.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-review-loop-'));
const run = startRun({
  stateRoot,
  prompt: 'review loop',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Review loop completes',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
});

let repairCount = 0;
let result = runAdversarialReviewLoop({
  stateRoot,
  runId: run.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  contextPacket: { kind: 'adversarial', runId: run.runId, batchId: 'batch-001', sliceId: 'slice-001' },
  reviewers: {
    security: () => ({ findings: [] }),
    architecture: () => ({ findings: [] }),
    quality: () => ({ findings: [] }),
  },
  repairAndVerify: () => { repairCount += 1; },
});

assert.equal(result.ok, true);
assert.equal(result.attempts, 1);
assert.equal(repairCount, 0);

let events = readEvidence({ stateRoot, runId: run.runId });
assert.equal(events.filter((event) => event.type === 'review.recorded').length, 3);

const blockedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-review-loop-block-'));
const blockedRun = startRun({
  stateRoot: blockedRoot,
  prompt: 'review loop blocked',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Review loop blocks',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
});

repairCount = 0;
result = runAdversarialReviewLoop({
  stateRoot: blockedRoot,
  runId: blockedRun.runId,
  batchId: 'batch-001',
  sliceId: 'slice-001',
  contextPacket: { kind: 'adversarial', runId: blockedRun.runId, batchId: 'batch-001', sliceId: 'slice-001' },
  reviewers: {
    security: () => ({ findings: [{ id: 'sec-1', severity: 'blocking', summary: 'unsafe' }] }),
    architecture: () => ({ findings: [] }),
    quality: () => ({ findings: [] }),
  },
  repairAndVerify: () => { repairCount += 1; },
});

assert.equal(result.ok, false);
assert.equal(result.code, 'THIRD_FAILURE_REQUIRES_DECISION');
assert.equal(result.attempts, 3);
assert.equal(result.explicitDecisionRequired, true);
assert.equal(repairCount, 2);

events = readEvidence({ stateRoot: blockedRoot, runId: blockedRun.runId });
assert.equal(events.filter((event) => event.type === 'review.recorded').length, 9);
assert.equal(events.some((event) => event.type === 'batch.verdict'), true);

console.log('adversarial review loop OK');
