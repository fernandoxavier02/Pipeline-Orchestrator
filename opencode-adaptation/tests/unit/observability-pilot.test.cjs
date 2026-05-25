'use strict';

const assert = require('node:assert/strict');
const { runObservabilityPilot } = require('../../src/pilot/observability-pilot.cjs');

const sent = [];
const result = runObservabilityPilot({
  send: (payload) => sent.push(payload),
  scenarios: [
    { name: 'disabled', observabilityEnabled: false, consentDecision: 'approved', gateEventId: 'gate-1', payload: { message: `tok${'en'}=disabled-secret` } },
    { name: 'denied', observabilityEnabled: true, consentDecision: 'denied', gateEventId: 'gate-2', payload: { message: `tok${'en'}=denied-secret` } },
    { name: 'sanitize-fail', observabilityEnabled: true, consentDecision: 'approved', gateEventId: 'gate-3', payload: Buffer.from('unsafe') },
    { name: 'approved', observabilityEnabled: true, consentDecision: 'approved', gateEventId: 'gate-4', payload: { message: `tok${'en'}=abc123`, score: 7 } },
  ],
});

assert.equal(result.ok, true);
assert.equal(result.logs.length, 4);
assert.equal(result.logs[0].sent, false);
assert.equal(result.logs[1].sent, false);
assert.equal(result.logs[2].sent, false);
assert.equal(result.logs[0].payload, undefined);
assert.equal(result.logs[1].payload, undefined);
assert.equal(result.logs[2].payload, undefined);
assert.equal(result.logs[0].payloadHeldLocal, true);
assert.equal(result.logs[1].payloadHeldLocal, true);
assert.equal(result.logs[2].payloadHeldLocal, true);
assert.equal(result.logs[3].sent, true);
assert.equal(result.logs[3].payload.message.includes('abc123'), false);
assert.equal(sent.length, 1);
assert.equal(sent[0].score, 7);

console.log('observability pilot OK');
