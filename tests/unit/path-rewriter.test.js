'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PathRewriter } = require('../../lib/path-rewriter.cjs');

test('rewrites .kiro/specs/<feature>/ to pipeline-runs/<run>/01-spec/', () => {
  const r = new PathRewriter('001-add-share');
  assert.equal(
    r.rewrite('.kiro/specs/<feature>/requirements.md'),
    'pipeline-runs/001-add-share/01-spec/requirements.md'
  );
  assert.equal(
    r.rewrite('.kiro/specs/{feature}/spec.json'),
    'pipeline-runs/001-add-share/01-spec/spec.json'
  );
});

test('rewrites Kiro slash commands to local skill names', () => {
  const r = new PathRewriter('001-x');
  assert.equal(r.rewrite('/kiro-spec-design'), '/pipeline-orchestrator:spec-design');
  assert.equal(r.rewrite('/kiro-validate-gap'), '/pipeline-orchestrator:validate-gap');
  assert.equal(r.rewrite('/kiro-spec-init'), '/pipeline-orchestrator:spec-init');
});

test('rewrites .kiro/settings/templates/specs/ to references/spec-templates/', () => {
  const r = new PathRewriter('001-x');
  assert.equal(
    r.rewrite('.kiro/settings/templates/specs/init.json'),
    'references/spec-templates/init.json'
  );
});

test('preserves text that has no kiro reference', () => {
  const r = new PathRewriter('001-x');
  const text = 'This skill reads the .pipeline/sentinel-state.json file.';
  assert.equal(r.rewrite(text), text);
});

test('rewrites all occurrences in multiline text', () => {
  const r = new PathRewriter('001-x');
  const input = [
    'Read .kiro/specs/<feature>/spec.json',
    'Then run /kiro-spec-design',
    'And finally /kiro-validate-design',
  ].join('\n');
  const expected = [
    'Read pipeline-runs/001-x/01-spec/spec.json',
    'Then run /pipeline-orchestrator:spec-design',
    'And finally /pipeline-orchestrator:validate-design',
  ].join('\n');
  assert.equal(r.rewrite(input), expected);
});

test('rejects construction with empty run_id', () => {
  assert.throws(() => new PathRewriter(''), /run_id required/);
  assert.throws(() => new PathRewriter(null), /run_id required/);
});
