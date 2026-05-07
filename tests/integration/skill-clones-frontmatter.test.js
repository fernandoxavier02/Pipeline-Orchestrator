'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CLONES = [
  'spec-init', 'spec-requirements', 'spec-design', 'spec-tasks',
  'validate-design', 'validate-gap', 'review', 'verify-completion',
];

for (const c of CLONES) {
  test(`clone ${c} has correct frontmatter`, () => {
    const skillPath = path.join('skills', c, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `missing ${skillPath}`);
    const content = fs.readFileSync(skillPath, 'utf8');
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(m, `${c}: no frontmatter`);
    assert.match(m[1], new RegExp(`^name:\\s*${c}$`, 'm'), `${c}: name wrong`);
    assert.match(m[1], /^disable-model-invocation:\s*true$/m, `${c}: disable flag missing`);
  });
}
