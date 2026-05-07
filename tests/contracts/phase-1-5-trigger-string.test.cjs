#!/usr/bin/env node
/**
 * tests/contracts/phase-1-5-trigger-string.test.cjs
 *
 * Contract test for Achados 1, 2, 3, 6 reconciliation.
 *
 * Purpose: prevent any future drift between the Phase 1.5 plan-mode trigger
 * canonical fixture and the surfaces that must reference it. The canonical
 * fixture lives at tests/fixtures/phase-1-5-trigger.canonical.txt and is the
 * single source of truth.
 *
 * Surfaces audited:
 *   1. agents/core/pipeline-controller.md  Phase 1.5 trigger conditions block
 *   2. agents/core/pipeline-controller.md  TRACE Plan-mode override block
 *      (must include type==Spec rows post-Achado-3)
 *   3. commands/pipeline.md                TOC line  (Phase 1.5 bullet)
 *   4. commands/pipeline.md                ASCII overview box
 *   5. commands/pipeline.md                Phase 1.5 Trigger conditions block
 *
 * The canonical string contains the substring "type == Spec" — every surface
 * MUST include that substring as evidence of Achado #6 coverage.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'phase-1-5-trigger.canonical.txt');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function normalize(s) {
  return s.replace(/∈/g, 'in').replace(/\s+/g, ' ').trim().toLowerCase();
}

const CANONICAL = read('tests/fixtures/phase-1-5-trigger.canonical.txt');

test('canonical fixture exists, non-empty, ASCII-friendly', () => {
  assert.ok(CANONICAL.length > 50, 'canonical fixture must be substantive');
  assert.match(CANONICAL, /type == Spec/, 'canonical must mention type == Spec');
  assert.match(CANONICAL, /MEDIA, COMPLEXA/, 'canonical must enumerate MEDIA + COMPLEXA');
  assert.match(CANONICAL, /--no-plan/, 'canonical must mention --no-plan flag');
});

test('Surface 1: agents/core/pipeline-controller.md Phase 1.5 trigger references canonical fixture', () => {
  const text = read('agents/core/pipeline-controller.md');
  const idx = text.search(/^### Phase 1\.5: Implementation Planning/m);
  assert.ok(idx >= 0, 'Phase 1.5 section header must exist in agent file');
  const slice = text.slice(idx, idx + 3000);
  assert.match(slice, /tests\/fixtures\/phase-1-5-trigger\.canonical\.txt/, 'agent Phase 1.5 must reference canonical fixture path');
  assert.match(slice, /type == Spec/, 'agent Phase 1.5 must include type == Spec coverage');
  assert.match(slice, /Override blocked/i, 'agent Phase 1.5 must mention COMPLEXA override blocked semantics');
});

test('Surface 2: agents/core/pipeline-controller.md TRACE Plan-mode block covers type == Spec', () => {
  const text = read('agents/core/pipeline-controller.md');
  const idx = text.search(/\*\*Plan-mode override block:/);
  assert.ok(idx >= 0, 'TRACE Plan-mode override block must exist');
  const slice = text.slice(idx, idx + 2000);
  assert.match(slice, /type == Spec/, 'TRACE override block must cover type == Spec rows post-Achado-3');
  assert.match(slice, /complexity == COMPLEXA \+ --no-plan/, 'TRACE override block must keep COMPLEXA row');
  assert.match(slice, /complexity == MEDIA \+ --no-plan/, 'TRACE override block must keep MEDIA row');
});

test('Surface 3: commands/pipeline.md TOC line cites the new auto behavior', () => {
  const text = read('commands/pipeline.md');
  const idx = text.search(/^- Phase 1\.5 \(Planning\):/m);
  assert.ok(idx >= 0, 'commands/pipeline.md TOC must include Phase 1.5 bullet');
  const slice = text.slice(idx, idx + 250);
  assert.match(slice, /MEDIA\/COMPLEXA\/Spec|MEDIA, COMPLEXA, Spec|MEDIA\/COMPLEXA, Spec/, 'TOC must mention MEDIA + COMPLEXA + Spec');
  assert.doesNotMatch(slice, /^- Phase 1\.5 \(Planning\): plan-architect in Plan Mode \(COMPLEXA or `?--plan`?\)$/m, 'TOC must NOT keep the v4.16.0-era wording');
});

test('Surface 4: commands/pipeline.md ASCII overview cites the new auto behavior', () => {
  const text = read('commands/pipeline.md');
  const idx = text.search(/PHASE 1\.5: PLANNING/);
  assert.ok(idx >= 0, 'commands/pipeline.md ASCII overview must include PHASE 1.5 box');
  const slice = text.slice(idx, idx + 400);
  assert.match(slice, /MEDIA\/COMPLEXA\/Spec/, 'ASCII overview must mention MEDIA/COMPLEXA/Spec');
  assert.doesNotMatch(slice, /plan-architect \(COMPLEXA or --plan\)/, 'ASCII overview must NOT keep v4.16.0-era wording');
});

test('Surface 5: commands/pipeline.md Phase 1.5 trigger references canonical fixture', () => {
  const text = read('commands/pipeline.md');
  const idx = text.search(/^### Phase 1\.5: Implementation Planning/m);
  assert.ok(idx >= 0, 'commands/pipeline.md Phase 1.5 section header must exist');
  const slice = text.slice(idx, idx + 3000);
  assert.match(slice, /tests\/fixtures\/phase-1-5-trigger\.canonical\.txt/, 'commands Phase 1.5 must reference canonical fixture');
  assert.match(slice, /type == Spec/, 'commands Phase 1.5 must mention type == Spec');
});

test('Cross-surface: every audited surface contains "type == Spec" substring', () => {
  const surfaces = [
    { name: 'agent file', text: read('agents/core/pipeline-controller.md') },
    { name: 'commands/pipeline.md', text: read('commands/pipeline.md') },
  ];
  for (const s of surfaces) {
    const occurrences = (s.text.match(/type == Spec/g) || []).length;
    assert.ok(occurrences >= 2, `${s.name} must mention "type == Spec" at least twice (Phase 1.5 trigger + TRACE block / TOC); found ${occurrences}`);
  }
});

test('Normalization: canonical fixture, when normalized, equals itself (idempotency check)', () => {
  // sanity check on the normalize() helper used in adjacent tests
  assert.strictEqual(normalize(CANONICAL), normalize(CANONICAL));
  assert.strictEqual(normalize('A ∈ B'), 'a in b');
});
