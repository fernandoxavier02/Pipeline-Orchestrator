'use strict';

const { publishObservability } = require('../runtime/observability-sink.cjs');

function runObservabilityPilot({ scenarios, send }) {
  const logs = scenarios.map((scenario) => {
    let sentPayload;
    const result = publishObservability({
      observabilityEnabled: scenario.observabilityEnabled,
      consentDecision: scenario.consentDecision,
      gateEventId: scenario.gateEventId,
      payload: scenario.payload,
      send: (payload) => {
        sentPayload = payload;
        send(payload);
      },
    });
    return {
      name: scenario.name,
      sent: result.sent,
      reason: result.reason,
      payloadHeldLocal: result.sent === false,
      payload: sentPayload,
    };
  });
  return { ok: true, logs };
}

module.exports = { runObservabilityPilot };
