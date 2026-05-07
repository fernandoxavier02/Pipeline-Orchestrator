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
  test(`clone ${c} has correct frontmatter and substantive content`, () => {
    const skillPath = path.join('skills', c, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `missing ${skillPath}`);
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(content.length >= 500, `${c}: SKILL.md too small (${content.length} bytes)`);

    const m = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(m, `${c}: no frontmatter`);
    const fm = m[1];
    assert.match(fm, new RegExp(`^name:\\s*${c}$`, 'm'), `${c}: name wrong`);
    assert.match(fm, /^disable-model-invocation:\s*true$/m, `${c}: disable flag missing`);
    assert.match(fm, /^description:\s*.+/m, `${c}: description missing or empty`);
    assert.match(fm, /^allowed-tools:\s*.+/m, `${c}: allowed-tools missing`);
  });
}
