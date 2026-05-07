'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RunDirectory } = require('../../lib/run-directory.cjs');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runs-test-'));
}

test('allocates run number 001 in fresh repo', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'fix login redirect bug');
  assert.equal(r.runNumber, '001');
  assert.equal(r.slug, 'fix-login-redirect-bug');
  assert.equal(r.runId, '001-fix-login-redirect-bug');
  assert.ok(fs.existsSync(r.absPath));
  assert.ok(fs.existsSync(path.join(r.absPath, 'manifest.yaml')));
});

test('allocates monotonically incremented run numbers', () => {
  const root = makeTmpRoot();
  RunDirectory.allocate(root, 'one');
  RunDirectory.allocate(root, 'two');
  const r = RunDirectory.allocate(root, 'three');
  assert.equal(r.runNumber, '003');
});

test('handles slug collision with -2 suffix', () => {
  const root = makeTmpRoot();
  RunDirectory.allocate(root, 'fix login bug');
  const r = RunDirectory.allocate(root, 'fix login bug');
  assert.equal(r.slug, 'fix-login-bug-2');
});

test('creates expected subfolder structure', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'add share button');
  for (const sub of ['00-brainstorm', '01-spec', '02-validations', '03-execution', 'attachments']) {
    assert.ok(fs.existsSync(path.join(r.absPath, sub)), `missing ${sub}`);
  }
});

test('manifest.yaml is initialized with status=ready phase=0 step_completed=null', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'x');
  const yaml = fs.readFileSync(path.join(r.absPath, 'manifest.yaml'), 'utf8');
  assert.match(yaml, /status: "ready"/);
  assert.match(yaml, /phase: 0/);
  assert.match(yaml, /step_completed: null/);
});

test('slug is kebab-case max 5 words', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'this is a really very long prompt about login redirect bugs in production');
  assert.equal(r.slug.split('-').length, 5);
});

test('slug strips diacritics and special chars', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'corrigir botão de login (urgente!)');
  assert.match(r.slug, /^[a-z0-9-]+$/);
});

test('slug falls back to "run" when prompt is all stop words', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'a the of in to for');
  assert.equal(r.slug, 'run');
  assert.equal(r.runId, '001-run');
  assert.match(r.slug, /^[a-z0-9-]+$/);
});
