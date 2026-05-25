'use strict';

const BLOCKING_CATEGORIES = Object.freeze(new Set([
  'original-protection',
  'scope',
  'gate',
  'atdd',
  'tdd',
  'real-prompt',
  'security',
  'consent',
]));

const WARNING_CATEGORIES = Object.freeze(new Set([
  'documentation',
  'style',
  'observability',
]));

function classifyFindingSeverity(finding) {
  const category = finding && finding.category;
  if (BLOCKING_CATEGORIES.has(category)) {
    return { ok: true, severity: 'blocking', reason: category };
  }
  if (finding && finding.severity === 'warning' && WARNING_CATEGORIES.has(category)) {
    if (!finding.justification) {
      return { ok: false, severity: 'blocking', code: 'WARNING_JUSTIFICATION_MISSING' };
    }
    return { ok: true, severity: 'warning', reason: finding.justification };
  }
  return { ok: false, severity: 'blocking', code: 'UNKNOWN_SEVERITY_BLOCKED' };
}

module.exports = { classifyFindingSeverity, BLOCKING_CATEGORIES, WARNING_CATEGORIES };
