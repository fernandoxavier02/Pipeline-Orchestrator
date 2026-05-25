'use strict';

const REQUIRED_SUMMARY_FIELDS = Object.freeze([
  'completedSlices',
  'blockedSlices',
  'warnings',
  'touchedSurfaces',
  'nextActions',
]);

function validateBatchTransition({ slices, summary }) {
  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (!summary || !Array.isArray(summary[field])) {
      return { ok: false, canAdvance: false, code: 'BATCH_SUMMARY_FIELD_MISSING', field };
    }
  }
  if (!summaryMatchesSlices(slices, summary)) {
    return { ok: false, canAdvance: false, code: 'BATCH_SUMMARY_MISMATCH' };
  }
  if (summary.blockedSlices.length > 0 || slices.some((slice) => slice.state === 'blocked' || slice.state === 'failed')) {
    return { ok: false, canAdvance: false, code: 'BATCH_BLOCKED' };
  }
  if (slices.some((slice) => slice.state !== 'completed')) {
    return { ok: false, canAdvance: false, code: 'BATCH_HAS_INCOMPLETE_SLICES' };
  }
  return { ok: true, canAdvance: true };
}

function sameItems(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function summaryMatchesSlices(slices, summary) {
  const completed = slices.filter((slice) => slice.state === 'completed').map((slice) => slice.id);
  const blocked = slices.filter((slice) => slice.state === 'blocked' || slice.state === 'failed').map((slice) => slice.id);
  return sameItems(completed, summary.completedSlices) && sameItems(blocked, summary.blockedSlices);
}

module.exports = { validateBatchTransition, REQUIRED_SUMMARY_FIELDS, summaryMatchesSlices };
