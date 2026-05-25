'use strict';

const assert = require('node:assert/strict');
const { validateAdversarialFixture } = require('../../src/verification/adversarial-fixture-suite.cjs');

let result = validateAdversarialFixture({
  implementerContext: { kind: 'implementer', implementerRationale: 'because' },
  adversarialContext: { kind: 'adversarial' },
  reviewerNames: ['security', 'architecture', 'quality'],
  findings: [],
  attempts: 1,
  repairCount: 0,
});
assert.equal(result.ok, true);

result = validateAdversarialFixture({
  implementerContext: { kind: 'implementer', implementerRationale: 'because' },
  adversarialContext: { kind: 'implementer', implementerRationale: 'because' },
  reviewerNames: ['security', 'architecture', 'quality'],
  findings: [],
  attempts: 1,
  repairCount: 0,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'ADVERSARIAL_CONTEXT_NOT_ISOLATED');

result = validateAdversarialFixture({
  implementerContext: { kind: 'implementer' },
  adversarialContext: { kind: 'adversarial' },
  reviewerNames: ['security', 'quality'],
  findings: [],
  attempts: 1,
  repairCount: 0,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'THREE_REVIEWERS_REQUIRED');

result = validateAdversarialFixture({
  implementerContext: { kind: 'implementer' },
  adversarialContext: { kind: 'adversarial' },
  reviewerNames: ['security', 'architecture', 'quality'],
  findings: [{ severity: 'warning', summary: 'minor' }],
  attempts: 1,
  repairCount: 0,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'WARNING_JUSTIFICATION_MISSING');

result = validateAdversarialFixture({
  implementerContext: { kind: 'implementer' },
  adversarialContext: { kind: 'adversarial' },
  reviewerNames: ['security', 'architecture', 'quality'],
  findings: [{ severity: 'blocking', summary: 'unsafe' }],
  attempts: 1,
  repairCount: 0,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'BLOCKER_PREVENTS_COMPLETION');

result = validateAdversarialFixture({
  implementerContext: { kind: 'implementer' },
  adversarialContext: { kind: 'adversarial' },
  reviewerNames: ['security', 'architecture', 'quality'],
  findings: [{ severity: 'blocking', summary: 'unsafe' }],
  attempts: 3,
  repairCount: 2,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'THIRD_FAILURE_REQUIRES_DECISION');

console.log('adversarial fixture suite OK');
