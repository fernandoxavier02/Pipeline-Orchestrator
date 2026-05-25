'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path`);
  }
}

function evidencePath(stateRoot, runId) {
  return path.join(stateRoot, 'runs', runId, 'evidence.jsonl');
}

function appendLine(filePath, line) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, line + '\n');
}

const REQUIRED_PAYLOAD_FIELDS = Object.freeze({
  'acceptance.recorded': [
    'initialState',
    'triggeringAction',
    'expectedObservableResult',
    'author',
  ],
  'test.red': ['command', 'output', 'exitCode', 'changedFilesSinceRed'],
  'test.green': ['command', 'output', 'exitCode', 'changedFilesSinceRed'],
  'prompt.recorded': [
    'prompt',
    'expectedOutput',
    'actualOutput',
    'rawLogPath',
    'environment',
    'verdict',
  ],
  'review.recorded': [
    'reviewerIdentity',
    'reviewContextId',
    'findings',
    'verdict',
  ],
  'gate.decided': ['gateName', 'phase', 'decision', 'actor', 'rationale'],
  'batch.verdict': [
    'completedSlices',
    'blockedSlices',
    'warnings',
    'touchedSurfaces',
    'nextActions',
  ],
});

function validatePayload(type, payload) {
  const required = REQUIRED_PAYLOAD_FIELDS[type];
  if (!required) return;
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`${type} payload missing ${field}`);
    }
  }
}

function appendEvidence({ stateRoot, runId, batchId = null, sliceId = null, type, artifactOrigin, payload }) {
  assertAbsolute('stateRoot', stateRoot);
  if (artifactOrigin === 'original-protected') {
    throw new Error('artifactOrigin must not be original-protected for generated adaptation evidence');
  }
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  if (typeof type !== 'string' || type.length === 0) throw new TypeError('type is required');
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  validatePayload(type, safePayload);

  const event = {
    schemaVersion: 1,
    eventId: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    runId,
    batchId,
    sliceId,
    type,
    artifactOrigin: artifactOrigin || 'adaptation-owned',
    timestamp: new Date().toISOString(),
    payload: safePayload,
  };

  const line = JSON.stringify(event);
  JSON.parse(line);
  appendLine(evidencePath(stateRoot, runId), line);
  return { ok: true, eventId: event.eventId };
}

function readEvidence({ stateRoot, runId }) {
  assertAbsolute('stateRoot', stateRoot);
  const filePath = evidencePath(stateRoot, runId);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = { appendEvidence, readEvidence, evidencePath };
