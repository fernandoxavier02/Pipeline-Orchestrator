'use strict';

const REQUIRED_REVIEWERS = Object.freeze(['security', 'architecture', 'quality']);

function hasAllReviewers(reviewerNames) {
  return REQUIRED_REVIEWERS.every((name) => reviewerNames.includes(name));
}

function validateAdversarialFixture({ implementerContext, adversarialContext, reviewerNames, findings, attempts, repairCount }) {
  if (adversarialContext === implementerContext
    || adversarialContext.kind === implementerContext.kind
    || Object.prototype.hasOwnProperty.call(adversarialContext, 'implementerRationale')) {
    return { ok: false, code: 'ADVERSARIAL_CONTEXT_NOT_ISOLATED' };
  }
  if (!Array.isArray(reviewerNames) || reviewerNames.length !== 3 || !hasAllReviewers(reviewerNames)) {
    return { ok: false, code: 'THREE_REVIEWERS_REQUIRED' };
  }
  const warningWithoutJustification = findings.find((finding) => finding.severity === 'warning' && !finding.justification);
  if (warningWithoutJustification) {
    return { ok: false, code: 'WARNING_JUSTIFICATION_MISSING' };
  }
  const blocker = findings.find((finding) => finding.severity === 'blocking');
  if (blocker && attempts >= 3 && repairCount >= 2) {
    return { ok: false, code: 'THIRD_FAILURE_REQUIRES_DECISION' };
  }
  if (blocker) {
    return { ok: false, code: 'BLOCKER_PREVENTS_COMPLETION' };
  }
  return { ok: true };
}

module.exports = { validateAdversarialFixture, REQUIRED_REVIEWERS };
