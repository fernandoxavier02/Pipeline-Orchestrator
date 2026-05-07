#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { KiroSkillCloner } = require('../lib/kiro-skill-cloner.cjs');
const { PathRewriter } = require('../lib/path-rewriter.cjs');

const [, , kiroName, newName] = process.argv;
if (!kiroName || !newName) {
  console.error('usage: node scripts/clone-kiro-skill.cjs <kiro-name> <new-name>');
  process.exit(2);
}

const SRC = path.join(os.homedir(), '.claude', 'skills', kiroName);
const DST = path.join('skills', newName);
const cloner = new KiroSkillCloner({ runId: '<run_id>' });
const rewriter = new PathRewriter('<run_id>');

fs.mkdirSync(DST, { recursive: true });
const skill = fs.readFileSync(path.join(SRC, 'SKILL.md'), 'utf8');
fs.writeFileSync(path.join(DST, 'SKILL.md'), cloner.clone(skill, { newName }));

const rulesDir = path.join(SRC, 'rules');
if (fs.existsSync(rulesDir)) {
  fs.mkdirSync(path.join(DST, 'rules'), { recursive: true });
  for (const f of fs.readdirSync(rulesDir)) {
    const c = fs.readFileSync(path.join(rulesDir, f), 'utf8');
    fs.writeFileSync(path.join(DST, 'rules', f), rewriter.rewrite(c));
  }
}
console.log(`cloned ${kiroName} → skills/${newName}`);
