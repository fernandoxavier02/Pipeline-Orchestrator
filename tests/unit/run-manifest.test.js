'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RunManifest } = require('../../lib/run-manifest.cjs');

test('RunManifest accepts a valid manifest object', () => {
  const valid = {
    schema_version: 1,
    run_id: '001-add-share',
    created_at: '2026-05-06T14:30:00Z',
    updated_at: '2026-05-06T14:30:00Z',
    status: 'ready',
    phase: 0,
    step_completed: null,
    type: 'Feature',
    complexity: 'MEDIA',
    brainstorm_completed: false,
    spec_lifecycle_completed: false,
    handoff_decision: null,
    linked_pipeline_doc_path: null,
    notes: '',
  };
  const m = RunManifest.fromObject(valid);
  assert.equal(m.run_id, '001-add-share');
  assert.equal(m.status, 'ready');
});

test('RunManifest rejects missing required field', () => {
  const invalid = { schema_version: 1, run_id: '001-x' }; // missing created_at etc.
  assert.throws(() => RunManifest.fromObject(invalid), /missing required field/);
});

test('RunManifest rejects unknown status', () => {
  const invalid = {
    schema_version: 1, run_id: '001-x', created_at: '2026-05-06T14:30:00Z',
    updated_at: '2026-05-06T14:30:00Z', status: 'bogus', phase: 0, step_completed: null,
    type: 'Feature', complexity: 'MEDIA', brainstorm_completed: false,
    spec_lifecycle_completed: false, handoff_decision: null,
    linked_pipeline_doc_path: null, notes: '',
  };
  assert.throws(() => RunManifest.fromObject(invalid), /invalid status/);
});

test('RunManifest rejects unknown phase', () => {
  const invalid = {
    schema_version: 1, run_id: '001-x', created_at: '2026-05-06T14:30:00Z',
    updated_at: '2026-05-06T14:30:00Z', status: 'ready', phase: 99,
    step_completed: null, type: 'Feature', complexity: 'MEDIA',
    brainstorm_completed: false, spec_lifecycle_completed: false,
    handoff_decision: null, linked_pipeline_doc_path: null, notes: '',
  };
  assert.throws(() => RunManifest.fromObject(invalid), /invalid phase/);
});

test('RunManifest serializes to YAML deterministically', () => {
  const m = RunManifest.fromObject({
    schema_version: 1, run_id: '001-x', created_at: '2026-05-06T14:30:00Z',
    updated_at: '2026-05-06T14:30:00Z', status: 'ready', phase: 0,
    step_completed: null, type: 'Feature', complexity: 'MEDIA',
    brainstorm_completed: false, spec_lifecycle_completed: false,
    handoff_decision: null, linked_pipeline_doc_path: null, notes: '',
  });
  const yaml = m.toYaml();
  assert.match(yaml, /^schema_version: 1$/m);
  assert.match(yaml, /^run_id: 001-x$/m);
  assert.match(yaml, /^status: ready$/m);
});

test('RunManifest round-trips through YAML', () => {
  const original = {
    schema_version: 1, run_id: '042-foo-bar', created_at: '2026-05-06T14:30:00Z',
    updated_at: '2026-05-06T15:30:00Z', status: 'partial', phase: 1,
    step_completed: 3, type: 'Bug Fix', complexity: 'COMPLEXA',
    brainstorm_completed: true, spec_lifecycle_completed: false,
    handoff_decision: null, linked_pipeline_doc_path: null,
    notes: 'validate-design failed twice',
  };
  const yaml = RunManifest.fromObject(original).toYaml();
  const parsed = RunManifest.fromYaml(yaml).toObject();
  assert.deepEqual(parsed, original);
});
