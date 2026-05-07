'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('brainstorm command file exists with correct frontmatter', () => {
  const f = 'commands/brainstorm.md';
  assert.ok(fs.existsSync(f), `${f} missing`);
  const c = fs.readFileSync(f, 'utf8');
  assert.match(c, /^---/, 'no frontmatter');
  assert.match(c, /argument-hint:/m);
});

test('brainstorm-controller agent exists with correct frontmatter and tools', () => {
  const f = 'agents/core/brainstorm-controller.md';
  assert.ok(fs.existsSync(f), `${f} missing`);
  const c = fs.readFileSync(f, 'utf8');
  assert.match(c, /^name: brainstorm-controller$/m);
  assert.match(c, /^tools: .*Agent.*AskUserQuestion/m);
  assert.match(c, /^model: opus$/m);
});

test('step-00-intake and step-01-explore agents exist', () => {
  for (const name of ['step-00-intake', 'step-01-explore']) {
    const f = `agents/brainstorm/${name}.md`;
    assert.ok(fs.existsSync(f), `${f} missing`);
    const c = fs.readFileSync(f, 'utf8');
    assert.match(c, new RegExp(`^name: brainstorm-${name}$`, 'm'));
  }
});

test('brainstorm-controller references all 8 cloned skills by their plugin names', () => {
  const c = fs.readFileSync('agents/core/brainstorm-controller.md', 'utf8');
  for (const skill of ['spec-init', 'spec-requirements', 'spec-design', 'spec-tasks',
                        'validate-gap', 'validate-design']) {
    assert.match(c, new RegExp(`pipeline-orchestrator:${skill}`),
      `controller does not reference pipeline-orchestrator:${skill}`);
  }
});
