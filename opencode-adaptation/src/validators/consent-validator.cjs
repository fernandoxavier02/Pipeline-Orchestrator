'use strict';

function block(code, message) {
  return { ok: false, code, message };
}

function validateExternalSend({ observabilityEnabled, consentDecision, gateEventId, sanitizedPayload }) {
  if (!observabilityEnabled) {
    return block('OBSERVABILITY_DISABLED', 'External observability is disabled.');
  }
  if (consentDecision !== 'approved') {
    return block('CONSENT_DENIED', 'External send requires approved consent.');
  }
  if (typeof gateEventId !== 'string' || gateEventId.trim().length === 0) {
    return block('EXPLICIT_GATE_MISSING', 'Each external send requires an explicit gate event.');
  }
  if (!sanitizedPayload
    || sanitizedPayload.ok !== true
    || !Object.prototype.hasOwnProperty.call(sanitizedPayload, 'redacted')
    || typeof sanitizedPayload.redacted === 'undefined') {
    return block('SANITIZED_PAYLOAD_REQUIRED', 'External send requires verified sanitized payload.');
  }
  return { ok: true, payload: sanitizedPayload.redacted };
}

module.exports = { validateExternalSend };
