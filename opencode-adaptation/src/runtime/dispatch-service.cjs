'use strict';

const { appendEvidence } = require('../state/evidence-writer.cjs');

function hasValidContextPacket(packet) {
  return Boolean(packet
    && typeof packet.kind === 'string'
    && typeof packet.runId === 'string'
    && typeof packet.batchId === 'string'
    && typeof packet.sliceId === 'string'
    && packet.scope
    && Array.isArray(packet.gates)
    && Array.isArray(packet.evidence));
}

function dispatchSubagent({ stateRoot, runId, batchId, sliceId, agentName, role, contextPacket, invoke }) {
  if (!hasValidContextPacket(contextPacket)) {
    return { ok: false, code: 'CONTEXT_PACKET_REQUIRED' };
  }
  const output = invoke(contextPacket);
  appendEvidence({
    stateRoot,
    runId,
    batchId,
    sliceId,
    type: 'dispatch.recorded',
    artifactOrigin: 'adaptation-owned',
    payload: {
      agentName,
      role,
      contextKind: contextPacket.kind,
      contextPacket,
      result: output,
    },
  });
  return { ok: true, output };
}

module.exports = { dispatchSubagent, hasValidContextPacket };
