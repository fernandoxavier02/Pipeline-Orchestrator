'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { validateSkillDirectory } = require('../../src/opencode/skill-validator.cjs');

const root = path.resolve(__dirname, '..', '..');
const result = validateSkillDirectory({
  root,
  skillNames: [
    'pipeline-orchestrator',
    'pipeline-contracts',
    'pipeline-tdd',
    'pipeline-adversarial-review',
  ],
});

assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
assert.equal(result.skills.length, 4);
for (const skill of result.skills) {
  assert.equal(skill.name, skill.folderName);
  assert.match(skill.description, /Use when/);
  assert.match(skill.body, /structured question/i);
  assert.match(skill.body, /reject missing evidence/i);
}

console.log('opencode skills OK');
