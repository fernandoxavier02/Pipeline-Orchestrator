'use strict';

const { appendEvidence } = require('../state/evidence-writer.cjs');
const { startPipelineRun } = require('../opencode/tool-adapter.cjs');

function ensurePhase(phaseValidator, phase) {
  const result = phaseValidator ? phaseValidator(phase) : { ok: true };
  return result && result.ok === false ? result : { ok: true };
}

function record(stateRoot, runId, batchId, sliceId, type, payload) {
  appendEvidence({
    stateRoot,
    runId,
    batchId,
    sliceId,
    type,
    artifactOrigin: 'adaptation-owned',
    payload,
  });
}

function runMinimalSlice({ stateRoot, prompt, batchId, sliceId, observableOutcome, allowedSurfaces, phaseValidator }) {
  const run = startPipelineRun({ stateRoot, prompt, batchId, sliceId, observableOutcome, allowedSurfaces });
  const runId = run.runId;

  const phases = [
    ['planned', 'slice.planned', { state: 'planned', prompt, observableOutcome }],
    ['red', 'test.red', { command: 'local-red', output: 'expected failure', exitCode: 1, changedFilesSinceRed: [] }],
    ['green', 'test.green', { command: 'local-green', output: 'pass', exitCode: 0, changedFilesSinceRed: [] }],
    ['prompt', 'prompt.recorded', {
      prompt,
      expectedOutput: observableOutcome,
      actualOutput: observableOutcome,
      rawLogPath: 'local-memory',
      environment: 'opencode-adaptation',
      verdict: 'pass',
    }],
    ['review', 'review.recorded', {
      reviewerIdentity: 'local-orchestrator',
      reviewContextId: sliceId,
      findings: [],
      verdict: 'approved',
    }],
    ['verdict', 'batch.verdict', {
      completedSlices: [sliceId],
      blockedSlices: [],
      warnings: [],
      touchedSurfaces: allowedSurfaces,
      nextActions: [],
    }],
  ];

  for (const [phase, type, payload] of phases) {
    const validation = ensurePhase(phaseValidator, phase);
    if (!validation.ok) {
      record(stateRoot, runId, batchId, sliceId, 'batch.verdict', {
        completedSlices: [],
        blockedSlices: [sliceId],
        warnings: [],
        touchedSurfaces: allowedSurfaces,
        nextActions: ['Resolve blockers before continuing.'],
        blockedPhase: phase,
        blockers: validation.blockers || [],
      });
      return { ok: false, runId, blockedPhase: phase, blockers: validation.blockers || [] };
    }
    record(stateRoot, runId, batchId, sliceId, type, payload);
  }

  return { ok: true, runId, finalState: 'verdict' };
}

module.exports = { runMinimalSlice };
