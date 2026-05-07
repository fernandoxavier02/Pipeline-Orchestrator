'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RunDirectory } = require('../../lib/run-directory.cjs');
const { RunManifest } = require('../../lib/run-manifest.cjs');

test('a partial run can be re-loaded from manifest.yaml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const rd = RunDirectory.allocate(root, 'partial run test');

  const m = RunManifest.fromYaml(fs.readFileSync(path.join(rd.absPath, 'manifest.yaml'), 'utf8'));
  const progressed = RunManifest.fromObject({
    ...m.toObject(),
    step_completed: 3, phase: 1, brainstorm_completed: true,
  });
  fs.writeFileSync(path.join(rd.absPath, 'manifest.yaml'), progressed.toYaml());

  const reloaded = RunManifest.fromYaml(fs.readFileSync(path.join(rd.absPath, 'manifest.yaml'), 'utf8'));
  assert.equal(reloaded.step_completed, 3);
  assert.equal(reloaded.phase, 1);
});

test('brainstorm-controller documents the resume protocol', () => {
  const c = fs.readFileSync('agents/core/brainstorm-controller.md', 'utf8');
  assert.match(c, /--resume/);
  assert.match(c, /start_at_step = manifest\.step_completed \+ 1/);
});
