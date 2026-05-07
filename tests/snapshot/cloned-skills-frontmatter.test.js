'use strict';
//
// Snapshot test: the YAML frontmatter of the 8 cloned spec-lifecycle skills
// committed under skills/ matches the captured golden in
// tests/snapshot/golden/cloned-skills-frontmatter.txt. This guards against
// silent drift between the cloner output and the manifests Claude Code
// loads at runtime — if a skill's name/description/tools changes, the
// golden must be regenerated alongside.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = [
  'spec-init',
  'spec-requirements',
  'spec-design',
  'spec-tasks',
  'validate-design',
  'validate-gap',
  'review',
  'verify-completion',
];

const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('cloned skills frontmatter matches golden', () => {
  const actual = SKILLS.map((s) => {
    const c = fs.readFileSync(path.join(REPO_ROOT, 'skills', s, 'SKILL.md'), 'utf8');
    const fm = c.match(/^---\n([\s\S]*?)\n---/);
    return `# ${s}\n${fm ? fm[1] : 'NO FRONTMATTER'}\n`;
  }).join('\n---\n\n');
  const goldenPath = path.resolve(__dirname, 'golden', 'cloned-skills-frontmatter.txt');
  const golden = fs.readFileSync(goldenPath, 'utf8');
  assert.equal(actual, golden);
});
