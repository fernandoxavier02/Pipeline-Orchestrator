'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startRun, loadRun } = require('../../src/state/run-store.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-run-'));

const manifest = startRun({
  stateRoot,
  prompt: 'Criar adaptacao OpenCode',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Run minima criada',
  allowedSurfaces: ['../opencode-adaptation/src/state/**'],
});

assert.equal(manifest.schemaVersion, 1);
assert.match(manifest.runId, /^\d{3}-[a-z0-9]+-[a-z0-9-]+$/);
assert.equal(manifest.status, 'active');
assert.equal(manifest.activeBatchId, 'batch-001');
assert.equal(manifest.activeSliceId, 'slice-001');
assert.equal(manifest.artifactOrigin, 'adaptation-owned');

const runDir = path.join(stateRoot, 'runs', manifest.runId);
assert.equal(fs.existsSync(path.join(runDir, 'run.json')), true);
assert.equal(fs.existsSync(path.join(runDir, 'batches', 'batch-001.json')), true);
assert.equal(fs.existsSync(path.join(runDir, 'slices', 'slice-001.json')), true);

const loaded = loadRun({ stateRoot, runId: manifest.runId });
assert.deepEqual(loaded.run, manifest);
assert.equal(loaded.batch.batchId, 'batch-001');
assert.equal(loaded.slice.sliceId, 'slice-001');
assert.deepEqual(loaded.slice.allowedSurfaces, ['../opencode-adaptation/src/state/**']);

const second = startRun({
  stateRoot,
  prompt: 'Criar adaptacao OpenCode',
  batchId: 'batch-002',
  sliceId: 'slice-002',
  observableOutcome: 'Segunda run criada',
  allowedSurfaces: ['../opencode-adaptation/src/runtime/**'],
});
assert.notEqual(second.runId, manifest.runId);

assert.throws(
  () => startRun({
    stateRoot: 'relative-state',
    prompt: 'x',
    batchId: 'batch',
    sliceId: 'slice',
    observableOutcome: 'outcome',
    allowedSurfaces: [],
  }),
  /stateRoot must be an absolute path/
);

console.log('run store OK');
