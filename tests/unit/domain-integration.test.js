'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RunDirectory } = require('../../lib/run-directory.cjs');
const { KiroSkillCloner } = require('../../lib/kiro-skill-cloner.cjs');
const { RunManifest } = require('../../lib/run-manifest.cjs');

test('full domain round-trip: allocate → clone → manifest update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-int-'));
  const rd = RunDirectory.allocate(root, 'add share button to player');
  const cloner = new KiroSkillCloner({ runId: rd.runId });
  const sourceSkill = `---\nname: kiro-spec-init\ndescription: x\nallowed-tools: Read\n---\n\nWrites .kiro/specs/<feature>/spec.json.`;
  const cloned = cloner.clone(sourceSkill, { newName: 'spec-init' });
  assert.match(cloned, /pipeline-runs\/001-add-share-button-player\/01-spec\/spec\.json/);

  const manifestPath = path.join(rd.absPath, 'manifest.yaml');
  const m = RunManifest.fromYaml(fs.readFileSync(manifestPath, 'utf8'));
  const updated = RunManifest.fromObject({
    ...m.toObject(),
    step_completed: 0,
    updated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  });
  fs.writeFileSync(manifestPath, updated.toYaml());
  const reread = RunManifest.fromYaml(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(reread.step_completed, 0);
});
