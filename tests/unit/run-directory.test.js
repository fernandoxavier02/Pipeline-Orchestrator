'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RunDirectory, generateUniqueId } = require('../../lib/run-directory.cjs');

// v7.5.0+ runId format: `${displayOrdinal}-${uniqueId}-${slug}`.
// uniqueId = base36(Date.now()) + 12 hex chars (>= 14 chars total).
const RUN_ID_RE = /^(\d{3})-([a-z0-9]{14,})-(.+)$/;

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runs-test-'));
}

test('allocates run with ordinal 001 in fresh repo and propagates PIPELINE_RUN_ID', () => {
  const root = makeTmpRoot();
  const r = RunDirectory.allocate(root, 'fix login redirect bug');
  assert.equal(r.runNumber, '001');
  assert.equal(r.slug, 'fix-login-redirect-bug');
  const m = r.runId.match(RUN_ID_RE);
  assert.ok(m, `runId ${r.runId} does not match ${RUN_ID_RE}`);
  assert.equal(m[1], '001');
  assert.equal(m[3], 'fix-login-redirect-bug');
  assert.ok(fs.existsSync(r.absPath));
  assert.ok(fs.existsSync(path.join(r.absPath, 'manifest.yaml')));
  assert.equal(process.env.PIPELINE_RUN_ID, r.runId);
});

test('allocates monotonically incremented display ordinals', () => {
  const root = makeTmpRoot();
  RunDirectory.allocate(root, 'one');
  RunDirectory.allocate(root, 'two');
  const r = RunDirectory.allocate(root, 'three');
  assert.equal(r.runNumber, '003');
});

test('same prompt repeated yields same slug but distinct runId via uniqueId', () => {
  const root = makeTmpRoot();
  const a = RunDirectory.allocate(root, 'fix login bug');
  const b = RunDirectory.allocate(root, 'fix login bug');
  assert.equal(a.slug, 'fix-login-bug');
  assert.equal(b.slug, 'fix-login-bug');
  assert.notEqual(a.runId, b.runId);
  assert.notEqual(a.uniqueId, b.uniqueId);
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
  const m = r.runId.match(RUN_ID_RE);
  assert.ok(m);
  assert.equal(m[3], 'run');
});

test('generateUniqueId yields collision-resistant identifiers', () => {
  const N = 1000;
  const ids = new Set();
  for (let i = 0; i < N; i += 1) ids.add(generateUniqueId());
  assert.equal(ids.size, N, 'unique-id duplicates detected within 1000 draws');
});
