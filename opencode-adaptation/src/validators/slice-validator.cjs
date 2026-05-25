'use strict';

const fs = require('node:fs');
const path = require('node:path');

function evidencePath(stateRoot, runId) {
  return path.join(stateRoot, 'runs', runId, 'evidence.jsonl');
}

function readEvidence({ stateRoot, runId, sliceId }) {
  const filePath = evidencePath(stateRoot, runId);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.sliceId === sliceId);
}

function hasType(events, type) {
  return events.some((event) => event.type === type);
}

function blocked(code, message) {
  return { ok: false, blockers: [{ code, message }] };
}

function validateBeforeImplementation({ stateRoot, runId, sliceId }) {
  const events = readEvidence({ stateRoot, runId, sliceId });
  if (!hasType(events, 'acceptance.recorded')) {
    return blocked('ACCEPTANCE_MISSING', 'Acceptance evidence is required before implementation.');
  }
  if (!hasType(events, 'test.red')) {
    return blocked('RED_MISSING', 'A failing test is required before implementation.');
  }
  return { ok: true, blockers: [] };
}

function validateBeforePrompt({ stateRoot, runId, sliceId }) {
  const events = readEvidence({ stateRoot, runId, sliceId });
  if (!hasType(events, 'test.green')) {
    return blocked('GREEN_MISSING', 'A passing test is required before prompt execution.');
  }
  return { ok: true, blockers: [] };
}

function validateBeforeNextSlice({ stateRoot, runId, sliceId }) {
  const events = readEvidence({ stateRoot, runId, sliceId });
  const resolvedFindingIds = new Set(events
    .filter((event) => event.type === 'finding.resolved' && event.payload && event.payload.findingId)
    .map((event) => event.payload.findingId));
  const blockingFinding = events.find((event) => event.type === 'finding.recorded'
    && event.payload
    && event.payload.severity === 'blocking'
    && !resolvedFindingIds.has(event.payload.id));
  if (blockingFinding) {
    return blocked('BLOCKING_FINDING_OPEN', 'Blocking findings must be resolved before the next slice.');
  }
  return { ok: true, blockers: [] };
}

module.exports = {
  validateBeforeImplementation,
  validateBeforePrompt,
  validateBeforeNextSlice,
};
