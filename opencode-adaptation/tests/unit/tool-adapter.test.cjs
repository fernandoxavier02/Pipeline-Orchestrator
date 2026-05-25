'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startPipelineRun } = require('../../src/opencode/tool-adapter.cjs');
const { readEvidence } = require('../../src/state/evidence-writer.cjs');

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-tool-'));

const result = startPipelineRun({
  stateRoot,
  prompt: 'Implement local entry',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  observableOutcome: 'Run starts and records first event',
  allowedSurfaces: ['../opencode-adaptation/src/opencode/**'],
});

assert.equal(result.ok, true);
assert.equal(typeof result.runId, 'string');
assert.equal(result.batchId, 'batch-001');
assert.equal(result.sliceId, 'slice-001');

const events = readEvidence({ stateRoot, runId: result.runId });
assert.equal(events.length, 1);
assert.equal(events[0].type, 'run.started');
assert.equal(events[0].artifactOrigin, 'adaptation-owned');
assert.equal(events[0].payload.source, 'opencode-tool-adapter');
assert.equal(events[0].payload.claudeManifestUsed, false);

assert.throws(
  () => startPipelineRun({ stateRoot: 'relative', prompt: 'bad' }),
  /stateRoot must be an absolute path/
);

console.log('tool adapter OK');
