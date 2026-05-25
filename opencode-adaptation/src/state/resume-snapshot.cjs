'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_RESUME_FIELDS = Object.freeze([
  'runId',
  'activeBatchId',
  'activeSliceId',
  'lastCompletedStep',
  'pendingGateDecisions',
  'latestRedEvidence',
  'latestGreenEvidence',
  'latestPromptRunEvidence',
  'latestAdversarialFindings',
]);

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path`);
  }
}

function snapshotPath(stateRoot, runId) {
  return path.join(stateRoot, 'runs', runId, 'resume-snapshot.json');
}

function validateResumeSnapshot(snapshot) {
  const missing = [];
  for (const field of REQUIRED_RESUME_FIELDS) {
    if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, field)) {
      missing.push(field);
    }
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function writeResumeSnapshot({ stateRoot, snapshot }) {
  assertAbsolute('stateRoot', stateRoot);
  const validation = validateResumeSnapshot(snapshot);
  if (!validation.ok) return validation;
  const filePath = snapshotPath(stateRoot, snapshot.runId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...snapshot,
  }, null, 2) + '\n');
  return { ok: true, filePath };
}

function readResumeSnapshot({ stateRoot, runId }) {
  assertAbsolute('stateRoot', stateRoot);
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath(stateRoot, runId), 'utf8'));
  const validation = validateResumeSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`resume snapshot missing ${validation.missing[0]}`);
  }
  return snapshot;
}

module.exports = {
  REQUIRED_RESUME_FIELDS,
  validateResumeSnapshot,
  writeResumeSnapshot,
  readResumeSnapshot,
};
