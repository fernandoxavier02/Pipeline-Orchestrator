'use strict';

const { appendEvidence } = require('../state/evidence-writer.cjs');

const REVIEWER_NAMES = Object.freeze(['security', 'architecture', 'quality']);

function recordReview({ stateRoot, runId, batchId, sliceId, reviewerName, review }) {
  appendEvidence({
    stateRoot,
    runId,
    batchId,
    sliceId,
    type: 'review.recorded',
    artifactOrigin: 'adaptation-owned',
    payload: {
      reviewerIdentity: reviewerName,
      reviewContextId: `${sliceId}:${reviewerName}`,
      findings: review.findings || [],
      verdict: (review.findings || []).some((finding) => finding.severity === 'blocking') ? 'blocked' : 'approved',
    },
  });
}

function hasBlockingFinding(reviews) {
  return reviews.some((review) => (review.findings || []).some((finding) => finding.severity === 'blocking'));
}

function runAdversarialReviewLoop({ stateRoot, runId, batchId, sliceId, contextPacket, reviewers, repairAndVerify }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const reviews = REVIEWER_NAMES.map((reviewerName) => {
      const review = reviewers[reviewerName](contextPacket);
      recordReview({ stateRoot, runId, batchId, sliceId, reviewerName, review });
      return review;
    });

    if (!hasBlockingFinding(reviews)) {
      return { ok: true, attempts: attempt };
    }

    if (attempt === 3) {
      appendEvidence({
        stateRoot,
        runId,
        batchId,
        sliceId,
        type: 'batch.verdict',
        artifactOrigin: 'adaptation-owned',
        payload: {
          completedSlices: [],
          blockedSlices: [sliceId],
          warnings: [],
          touchedSurfaces: [],
          nextActions: ['Ask for explicit decision after third failure.'],
        },
      });
      return { ok: false, code: 'THIRD_FAILURE_REQUIRES_DECISION', attempts: attempt, explicitDecisionRequired: true };
    }

    repairAndVerify({ attempt, contextPacket });
  }

  throw new Error('unreachable review loop state');
}

module.exports = { runAdversarialReviewLoop, REVIEWER_NAMES };
