'use strict';

const assert = require('node:assert/strict');
const { classifyFindingSeverity } = require('../../src/validators/severity-classifier.cjs');

let result = classifyFindingSeverity({ category: 'original-protection', summary: 'protected file changed' });
assert.equal(result.ok, true);
assert.equal(result.severity, 'blocking');
assert.equal(result.reason, 'original-protection');

for (const category of ['scope', 'gate', 'atdd', 'tdd', 'real-prompt', 'security', 'consent']) {
  result = classifyFindingSeverity({ category, summary: `${category} issue` });
  assert.equal(result.ok, true);
  assert.equal(result.severity, 'blocking');
}

result = classifyFindingSeverity({ category: 'documentation', severity: 'warning', summary: 'minor docs mismatch' });
assert.equal(result.ok, false);
assert.equal(result.code, 'WARNING_JUSTIFICATION_MISSING');

result = classifyFindingSeverity({
  category: 'documentation',
  severity: 'warning',
  summary: 'minor docs mismatch',
  justification: 'Does not affect execution or safety.',
});
assert.equal(result.ok, true);
assert.equal(result.severity, 'warning');

result = classifyFindingSeverity({ category: 'unknown-new-class', summary: 'unmapped finding' });
assert.equal(result.ok, false);
assert.equal(result.severity, 'blocking');
assert.equal(result.code, 'UNKNOWN_SEVERITY_BLOCKED');

console.log('severity classifier OK');
