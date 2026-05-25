'use strict';

const assert = require('node:assert/strict');
const { validateAcceptanceEvidence } = require('../../src/verification/atdd-suite.cjs');

let result = validateAcceptanceEvidence({
  type: 'acceptance.recorded',
  timestamp: '2026-01-01T00:00:00.000Z',
  sliceId: 'slice-001',
  payload: {
    given: 'planned slice',
    when: 'implementation starts',
    then: 'RED exists first',
    initialState: 'planned',
    triggeringAction: 'start implementation',
    expectedObservableResult: 'blocked without RED',
    author: 'tester',
  },
});
assert.equal(result.ok, true);

result = validateAcceptanceEvidence({
  type: 'acceptance.recorded',
  timestamp: '2026-01-01T00:00:00.000Z',
  sliceId: 'slice-001',
  payload: {
    when: 'implementation starts',
    then: 'RED exists first',
    initialState: 'planned',
    triggeringAction: 'start implementation',
    expectedObservableResult: 'blocked without RED',
    author: 'tester',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'ATDD_FIELD_MISSING');
assert.equal(result.field, 'given');

result = validateAcceptanceEvidence({
  type: 'test.red',
  timestamp: '2026-01-01T00:00:00.000Z',
  sliceId: 'slice-001',
  payload: {},
});
assert.equal(result.ok, false);
assert.equal(result.code, 'ACCEPTANCE_REQUIRED_BEFORE_IMPLEMENTATION');

result = validateAcceptanceEvidence({
  type: 'acceptance.recorded',
  payload: {
    given: 'planned slice',
    when: 'implementation starts',
    then: 'RED exists first',
    initialState: 'planned',
    triggeringAction: 'start implementation',
    expectedObservableResult: 'blocked without RED',
    author: 'tester',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'ACCEPTANCE_METADATA_MISSING');
assert.equal(result.field, 'timestamp');

result = validateAcceptanceEvidence({
  type: 'acceptance.recorded',
  timestamp: '2026-01-01T00:01:00.000Z',
  implementationStartedAt: '2026-01-01T00:00:00.000Z',
  sliceId: 'slice-001',
  payload: {
    given: 'planned slice',
    when: 'implementation starts',
    then: 'RED exists first',
    initialState: 'planned',
    triggeringAction: 'start implementation',
    expectedObservableResult: 'blocked without RED',
    author: 'tester',
  },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'ACCEPTANCE_RECORDED_TOO_LATE');

console.log('atdd suite OK');
