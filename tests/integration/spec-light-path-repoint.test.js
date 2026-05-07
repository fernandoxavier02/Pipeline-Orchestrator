'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const skillFile of ['skills/spec-light/SKILL.md', 'skills/spec-heavy/SKILL.md', 'skills/spec-audit-only/SKILL.md']) {
  test(`${skillFile} has zero .kiro/specs/<feature>/ refs (placeholder paths)`, () => {
    const c = fs.readFileSync(skillFile, 'utf8');
    const matches = c.match(/\.kiro\/specs\/[<{]/g) || [];
    assert.equal(matches.length, 0);
  });
  test(`${skillFile} references pipeline-runs/<run_id>/01-spec/`, () => {
    const c = fs.readFileSync(skillFile, 'utf8');
    assert.match(c, /pipeline-runs\/<run_id>\/01-spec\//);
  });
}
