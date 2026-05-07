'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CLONES = [
  'spec-init', 'spec-requirements', 'spec-design', 'spec-tasks',
  'validate-design', 'validate-gap', 'review', 'verify-completion',
];

function readAllText(skillDir) {
  const out = [];
  function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.md')) out.push(fs.readFileSync(p, 'utf8'));
    }
  }
  walk(skillDir);
  return out.join('\n');
}

for (const c of CLONES) {
  test(`clone ${c} has zero kiro path/command refs`, () => {
    const text = readAllText(path.join('skills', c));
    const kiroPathMatches = text.match(/\.kiro\/(specs|settings)/g) || [];
    const kiroCmdMatches = text.match(/\/kiro-/g) || [];
    assert.equal(kiroPathMatches.length, 0, `${c}: ${kiroPathMatches.length} kiro path refs`);
    assert.equal(kiroCmdMatches.length, 0, `${c}: ${kiroCmdMatches.length} kiro cmd refs`);
  });
}
