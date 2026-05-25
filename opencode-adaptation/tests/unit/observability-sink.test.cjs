'use strict';

const assert = require('node:assert/strict');
const { publishObservability } = require('../../src/runtime/observability-sink.cjs');

let sent = [];
let result = publishObservability({
  observabilityEnabled: false,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  payload: { message: 'trace' },
  send: (payload) => sent.push(payload),
  sanitize: () => { throw new Error('should not sanitize'); },
});
assert.equal(result.ok, true);
assert.equal(result.sent, false);
assert.equal(result.reason, 'OBSERVABILITY_DISABLED');
assert.equal(sent.length, 0);

result = publishObservability({
  observabilityEnabled: true,
  consentDecision: 'denied',
  gateEventId: 'gate-1',
  payload: { message: 'trace' },
  send: (payload) => sent.push(payload),
});
assert.equal(result.ok, true);
assert.equal(result.sent, false);
assert.equal(result.reason, 'CONSENT_DENIED');
assert.equal(sent.length, 0);

result = publishObservability({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  payload: Buffer.from('unsafe'),
  send: (payload) => sent.push(payload),
});
assert.equal(result.ok, true);
assert.equal(result.sent, false);
assert.equal(result.reason, 'SANITIZED_PAYLOAD_REQUIRED');
assert.equal(sent.length, 0);

result = publishObservability({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  payload: { message: 'trace' },
  send: (payload) => sent.push(payload),
  sanitize: () => { throw new Error('sanitize failed'); },
});
assert.equal(result.ok, true);
assert.equal(result.sent, false);
assert.equal(result.reason, 'SANITIZATION_FAILED');
assert.equal(sent.length, 0);

result = publishObservability({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  payload: { message: `tok${'en'}=abc123`, score: 1 },
  send: (payload) => sent.push(payload),
});
assert.equal(result.ok, true);
assert.equal(result.sent, true);
assert.equal(sent.length, 1);
assert.equal(sent[0].message.includes('abc123'), false);
assert.equal(sent[0].score, 1);

console.log('observability sink OK');
