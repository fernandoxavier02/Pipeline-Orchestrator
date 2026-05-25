'use strict';

const { readResumeSnapshot } = require('../state/resume-snapshot.cjs');

function validateResumePilot({ stateRoot, runId }) {
  try {
    const snapshot = readResumeSnapshot({ stateRoot, runId });
    return {
      ok: true,
      canResume: true,
      activeBatchId: snapshot.activeBatchId,
      activeSliceId: snapshot.activeSliceId,
    };
  } catch (error) {
    return {
      ok: false,
      canResume: false,
      code: 'RESUME_SNAPSHOT_INCOMPLETE',
      explanation: error.message,
    };
  }
}

module.exports = { validateResumePilot };
