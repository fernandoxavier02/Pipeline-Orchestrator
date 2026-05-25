'use strict';

const { startRun } = require('../state/run-store.cjs');
const { appendEvidence } = require('../state/evidence-writer.cjs');

function startPipelineRun({ stateRoot, prompt, batchId, sliceId, observableOutcome, allowedSurfaces }) {
  const run = startRun({ stateRoot, prompt, batchId, sliceId, observableOutcome, allowedSurfaces });
  appendEvidence({
    stateRoot,
    runId: run.runId,
    batchId,
    sliceId,
    type: 'run.started',
    artifactOrigin: 'adaptation-owned',
    payload: {
      source: 'opencode-tool-adapter',
      claudeManifestUsed: false,
      prompt,
      observableOutcome,
      allowedSurfaces,
    },
  });
  return { ok: true, runId: run.runId, batchId, sliceId };
}

module.exports = { startPipelineRun };
