'use strict';

const { sanitizePayload } = require('../validators/redactor.cjs');
const { validateExternalSend } = require('../validators/consent-validator.cjs');

function publishObservability({ observabilityEnabled, consentDecision, gateEventId, payload, send, sanitize = sanitizePayload }) {
  if (!observabilityEnabled) {
    return { ok: true, sent: false, reason: 'OBSERVABILITY_DISABLED' };
  }
  if (consentDecision !== 'approved') {
    return { ok: true, sent: false, reason: 'CONSENT_DENIED' };
  }

  let sanitizedPayload;
  try {
    sanitizedPayload = sanitize({ payload });
  } catch (_error) {
    return { ok: true, sent: false, reason: 'SANITIZATION_FAILED' };
  }
  const consent = validateExternalSend({
    observabilityEnabled,
    consentDecision,
    gateEventId,
    sanitizedPayload,
  });

  if (!consent.ok) {
    return { ok: true, sent: false, reason: consent.code };
  }

  send(consent.payload);
  return { ok: true, sent: true };
}

module.exports = { publishObservability };
