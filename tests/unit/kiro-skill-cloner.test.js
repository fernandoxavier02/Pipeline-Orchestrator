'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { KiroSkillCloner } = require('../../lib/kiro-skill-cloner.cjs');

const SOURCE = `---
name: kiro-spec-design
description: Generate technical design from requirements
allowed-tools: Read, Write, Glob, Grep, Agent
---

# kiro-spec-design Skill

Read .kiro/specs/<feature>/spec.json and produce design.md.
After approval, run /kiro-spec-tasks {feature}.
Reference template at .kiro/settings/templates/specs/design.md.
`;

test('clones SKILL.md with renamed frontmatter and rewritten paths', () => {
  const cloner = new KiroSkillCloner({ runId: '001-test' });
  const out = cloner.clone(SOURCE, { newName: 'spec-design' });
  assert.match(out, /^name: spec-design$/m);
  assert.doesNotMatch(out, /^name: kiro-spec-design$/m);
  assert.match(out, /pipeline-runs\/001-test\/01-spec\/spec\.json/);
  assert.match(out, /\/pipeline-orchestrator:spec-tasks/);
  assert.match(out, /references\/spec-templates\/design\.md/);
});

test('clones add disable-model-invocation: true if absent', () => {
  const cloner = new KiroSkillCloner({ runId: '001-test' });
  const out = cloner.clone(SOURCE, { newName: 'spec-design' });
  assert.match(out, /^disable-model-invocation: true$/m);
});

test('preserves disable-model-invocation if already set', () => {
  const src = SOURCE.replace('allowed-tools', 'disable-model-invocation: true\nallowed-tools');
  const cloner = new KiroSkillCloner({ runId: '001-test' });
  const out = cloner.clone(src, { newName: 'spec-design' });
  const matches = out.match(/^disable-model-invocation: true$/gm) || [];
  assert.equal(matches.length, 1);
});

test('throws if newName is missing or empty', () => {
  const cloner = new KiroSkillCloner({ runId: '001-test' });
  assert.throws(() => cloner.clone(SOURCE, { newName: '' }), /newName required/);
  assert.throws(() => cloner.clone(SOURCE, {}), /newName required/);
});

test('throws if frontmatter is missing', () => {
  const cloner = new KiroSkillCloner({ runId: '001-test' });
  assert.throws(() => cloner.clone('# no frontmatter here', { newName: 'x' }), /frontmatter required/);
});

test('clone is run-id-agnostic when runId is the placeholder token <run_id>', () => {
  const cloner = new KiroSkillCloner({ runId: '<run_id>' });
  const out = cloner.clone(SOURCE, { newName: 'spec-design' });
  assert.match(out, /pipeline-runs\/<run_id>\/01-spec\/spec\.json/);
});

test('accepts an injected PathRewriter', () => {
  const { PathRewriter } = require('../../lib/path-rewriter.cjs');
  const customRewriter = new PathRewriter('999-custom');
  const cloner = new KiroSkillCloner({ rewriter: customRewriter });
  const out = cloner.clone(SOURCE, { newName: 'spec-design' });
  assert.match(out, /pipeline-runs\/999-custom\/01-spec\/spec\.json/);
});

test('clone rewrites the body H1 identity to the new name', () => {
  const src = `---\nname: kiro-spec-design\nallowed-tools: Read\n---\n\n# kiro-spec-design Skill\n\nbody.`;
  const cloner = new KiroSkillCloner({ runId: '<run_id>' });
  const out = cloner.clone(src, { newName: 'spec-design' });
  assert.match(out, /^# spec-design$/m);
  assert.doesNotMatch(out, /^# kiro-spec-design/m);
});
