'use strict';

const assert = require('node:assert/strict');
const { validateBatchTransition } = require('../../src/verification/batch-transition-suite.cjs');

let result = validateBatchTransition({
  slices: [
    { id: 'slice-001', state: 'completed' },
    { id: 'slice-002', state: 'completed' },
  ],
  summary: {
    completedSlices: ['slice-001', 'slice-002'],
    blockedSlices: [],
    warnings: [],
    touchedSurfaces: ['src/runtime/orchestrator.cjs'],
    nextActions: [],
  },
});
assert.equal(result.ok, true);
assert.equal(result.canAdvance, true);

result = validateBatchTransition({
  slices: [
    { id: 'slice-001', state: 'completed' },
    { id: 'slice-002', state: 'planned' },
  ],
  summary: {
    completedSlices: ['slice-001'],
    blockedSlices: [],
    warnings: [],
    touchedSurfaces: [],
    nextActions: [],
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'BATCH_HAS_INCOMPLETE_SLICES');
assert.equal(result.canAdvance, false);

result = validateBatchTransition({
  slices: [{ id: 'slice-001', state: 'blocked' }],
  summary: {
    completedSlices: [],
    blockedSlices: ['slice-001'],
    warnings: [],
    touchedSurfaces: ['src/runtime/orchestrator.cjs'],
    nextActions: ['Resolve blockers before next batch.'],
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'BATCH_BLOCKED');
assert.equal(result.canAdvance, false);

result = validateBatchTransition({
  slices: [{ id: 'slice-001', state: 'failed' }],
  summary: {
    completedSlices: [],
    blockedSlices: ['slice-001'],
    warnings: [],
    touchedSurfaces: ['src/runtime/orchestrator.cjs'],
    nextActions: ['Resolve failed slice before next batch.'],
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'BATCH_BLOCKED');
assert.equal(result.canAdvance, false);

result = validateBatchTransition({
  slices: [
    { id: 'slice-001', state: 'completed' },
    { id: 'slice-002', state: 'blocked' },
  ],
  summary: {
    completedSlices: ['slice-001', 'slice-002'],
    blockedSlices: [],
    warnings: [],
    touchedSurfaces: ['src/runtime/orchestrator.cjs'],
    nextActions: [],
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'BATCH_SUMMARY_MISMATCH');

result = validateBatchTransition({
  slices: [{ id: 'slice-001', state: 'completed' }],
  summary: {
    completedSlices: ['slice-001'],
    blockedSlices: [],
    warnings: [],
    nextActions: [],
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'BATCH_SUMMARY_FIELD_MISSING');
assert.equal(result.field, 'touchedSurfaces');

console.log('batch transition suite OK');
