#!/usr/bin/env node
'use strict';
// F1 (v8.0.0) — the spec-authoring surfaces exist with their key contracts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../..');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('=== F1 v8.0.0 spec-authoring surfaces ===');

test('skills/spec/SKILL.md is the authoring take-over (manual-only, dispatches spec-controller, points legacy to variants, --amend)', () => {
  const s = read('skills/spec/SKILL.md');
  assert.match(s, /name:\s*spec\b/, 'name: spec');
  assert.match(s, /disable-model-invocation:\s*true/, 'manual-only');
  assert.match(s, /SPEC_AUTHORING_MODE|spec-controller/, 'dispatches spec-controller');
  assert.match(s, /pipeline-orchestrator:spec-(light|heavy|audit-only)/, 'legacy processing pointer');
  assert.match(s, /--amend/, 'amendment flow documented');
});

test('agents/core/spec-controller.md declares its seal-keyed terminal guard + relay + loop + seal contracts', () => {
  const s = read('agents/core/spec-controller.md');
  assert.match(s, /spec_sealed/, 'terminal guard keyed on spec_sealed');
  assert.match(s, /controller_type\s*=\s*"spec"|controller_type/, 'stamps controller_type');
  assert.match(s, /PLAN_MODE_REQUEST/, 'services the plan-mode handshake');
  assert.match(s, /max_review_attempts/, 'bounded review loop');
  assert.match(s, /sealed_spec/, 'seal stores sealed_spec pointer');
  assert.match(s, /--amend/, 'amendment flow');
});

test('agents/brainstorm/step-01c-ideation.md PROPOSES across dimensions, auto-skips, canonical telemetry', () => {
  const s = read('agents/brainstorm/step-01c-ideation.md');
  assert.match(s, /IDEATION_PROPOSED/, 'emits IDEATION_PROPOSED');
  assert.match(s, /auto-skip/i, 'auto-skip rule');
  assert.match(s, /Product|architecture|code.?quality/i, 'dimension coverage');
  assert.match(s, /"decision":"(TRIGGERED|APPROVED|REJECTED|SKIPPED)"/, 'canonical decision values only');
});

test('agents/executor/type-specific/spec-adversarial-critic.md is read-only, own schema, no seal logic', () => {
  const s = read('agents/executor/type-specific/spec-adversarial-critic.md');
  assert.match(s, /tools:\s*Read,\s*Grep,\s*Glob/, 'read-only tools declared');
  assert.match(s, /SPEC_REVIEW_FINDINGS/, 'own findings schema');
  assert.match(s, /No seal logic here/, 'seal is the caller decision, not the critic');
});

test('skills/spec-review/SKILL.md runs the critic outside the locked pipelines', () => {
  const s = read('skills/spec-review/SKILL.md');
  assert.match(s, /disable-model-invocation:\s*true/, 'manual-only');
  assert.match(s, /spec-adversarial-critic/, 'dispatches the spec critic');
  assert.match(s, /OUTSIDE|outside/, 'runs outside the locked sequences');
});

test('references/run-orchestration-substrate.md documents the sealed lifecycle + controller_type ownership', () => {
  const s = read('references/run-orchestration-substrate.md');
  assert.match(s, /sealed/, 'documents the sealed lifecycle');
  assert.match(s, /controller_type/, 'documents notes.options ownership');
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
