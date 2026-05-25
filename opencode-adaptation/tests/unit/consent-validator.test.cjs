'use strict';

const assert = require('node:assert/strict');
const { validateExternalSend } = require('../../src/validators/consent-validator.cjs');

let result = validateExternalSend({
  observabilityEnabled: false,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  sanitizedPayload: { ok: true, redacted: 'safe' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'OBSERVABILITY_DISABLED');

result = validateExternalSend({
  observabilityEnabled: true,
  consentDecision: 'denied',
  gateEventId: 'gate-1',
  sanitizedPayload: { ok: true, redacted: 'safe' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'CONSENT_DENIED');

result = validateExternalSend({
  observabilityEnabled: true,
  consentDecision: 'approved',
  sanitizedPayload: { ok: true, redacted: 'safe' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'EXPLICIT_GATE_MISSING');

result = validateExternalSend({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: '   ',
  sanitizedPayload: { ok: true, redacted: 'safe' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'EXPLICIT_GATE_MISSING');

result = validateExternalSend({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  sanitizedPayload: { ok: false, code: 'SANITIZATION_UNVERIFIABLE' },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'SANITIZED_PAYLOAD_REQUIRED');

result = validateExternalSend({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  sanitizedPayload: { ok: true, redacted: undefined },
});
assert.equal(result.ok, false);
assert.equal(result.code, 'SANITIZED_PAYLOAD_REQUIRED');

result = validateExternalSend({
  observabilityEnabled: true,
  consentDecision: 'approved',
  gateEventId: 'gate-1',
  sanitizedPayload: { ok: true, redacted: { message: 'safe' } },
});
assert.equal(result.ok, true);
assert.deepEqual(result.payload, { message: 'safe' });

console.log('consent validator OK');
