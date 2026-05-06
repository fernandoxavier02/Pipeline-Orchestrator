#!/usr/bin/env node
/**
 * tests/unit/plan-mode-trigger.test.js
 *
 * Wave 8-spec (Batch C) — Plan-mode auto-trigger + --no-plan bypass.
 *
 * Validates the v4.17.0 trigger contract for Phase 1.5 (plan-architect):
 *   1. MEDIA without --no-plan → plan runs (NEW behavior; was SKIP in v4.16.0)
 *   2. MEDIA with --no-plan → plan skipped, justification logged in TRACE
 *   3. COMPLEXA without --no-plan → plan runs (unchanged from v4.16.0)
 *   4. COMPLEXA with --no-plan → plan runs anyway (override blocked); flag
 *      logged in TRACE.md as plan_override_attempted: true
 *
 * The contract lives in commands/pipeline.md Phase 1.5 trigger conditions
 * and the modes table. The TRACE.md fields are specified in
 * references/trace-schema/v1.md §4.6.
 *
 * DoD criterion #6: plan-mode-enforcer auto-triggers on MEDIA/COMPLEXA.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readPipelineMd() {
  return fs.readFileSync(path.join(REPO_ROOT, 'commands', 'pipeline.md'), 'utf8');
}

function readTraceSchema() {
  return fs.readFileSync(path.join(REPO_ROOT, 'references', 'trace-schema', 'v1.md'), 'utf8');
}

test('Batch C-1: Phase 1.5 trigger condition includes MEDIA in addition to COMPLEXA', () => {
  const md = readPipelineMd();
  // Locate the Phase 1.5 trigger block.
  const phase15Idx = md.search(/^### Phase 1\.5: Implementation Planning/m);
  assert.ok(phase15Idx >= 0, 'commands/pipeline.md must have a Phase 1.5 header');
  const slice = md.slice(phase15Idx, phase15Idx + 1200);
  // The new auto-trigger must mention BOTH MEDIA and COMPLEXA in the condition.
  assert.match(
    slice,
    /MEDIA[\s\S]{0,200}COMPLEXA|COMPLEXA[\s\S]{0,200}MEDIA/,
    'Phase 1.5 auto-trigger must mention BOTH MEDIA and COMPLEXA'
  );
  // The skip condition must reference --no-plan.
  assert.match(
    slice,
    /--no-plan/,
    'Phase 1.5 trigger block must reference the --no-plan flag'
  );
});

test('Batch C-2: --no-plan flag is documented in modes table', () => {
  const md = readPipelineMd();
  // Modes table is the section near line 240-260 in v4.16.0.
  const modesTableIdx = md.search(/\| Pattern \| Mode \| Description \|/);
  assert.ok(modesTableIdx >= 0, 'modes table must exist');
  const tableSlice = md.slice(modesTableIdx, modesTableIdx + 4000);
  assert.match(
    tableSlice,
    /--no-plan/,
    'modes table must include a row documenting --no-plan'
  );
});

test('Batch C-3: COMPLEXA + --no-plan override is documented as ignored (plan still runs)', () => {
  const md = readPipelineMd();
  // The contract: COMPLEXA always runs plan-architect; --no-plan is logged but ignored.
  // This must be stated somewhere in the Phase 1.5 region.
  const phase15Idx = md.search(/^### Phase 1\.5: Implementation Planning/m);
  const slice = md.slice(phase15Idx, phase15Idx + 2000);
  // Look for keywords indicating the override-blocked semantics.
  assert.ok(
    /COMPLEXA[\s\S]{0,300}(override|ignore|always|anyway|blocked)/i.test(slice) ||
    /override[\s\S]{0,300}COMPLEXA/i.test(slice),
    'Phase 1.5 block must explain that COMPLEXA + --no-plan still runs plan-architect (override blocked/ignored)'
  );
});

test('Batch C-4: TRACE schema declares the Plan Mode override section fields', () => {
  const schema = readTraceSchema();
  // Per trace-schema/v1.md §4.6, when --no-plan is passed, TRACE includes
  // these three fields:
  for (const field of ['plan_mode_skipped', 'plan_override_attempted', 'justification']) {
    assert.match(
      schema,
      new RegExp(`\\b${field}\\b`),
      `trace-schema/v1.md must document the "${field}" field in the Plan Mode section`
    );
  }
  // The schema must also clarify that COMPLEXA + --no-plan sets
  // plan_mode_skipped: false (override was rejected).
  assert.match(
    schema,
    /COMPLEXA[\s\S]{0,300}plan_mode_skipped:\s*false|plan_mode_skipped:\s*false[\s\S]{0,300}COMPLEXA/i,
    'trace-schema/v1.md must explain that COMPLEXA sets plan_mode_skipped: false even with --no-plan'
  );
});

test('Batch C-5: design §8 prose corrected to clarify COMPLEXA + --no-plan semantics', () => {
  const designPath = path.join(REPO_ROOT, 'designs', 'pipeline-orchestrator-v5-consolidated.md');
  const design = fs.readFileSync(designPath, 'utf8');
  // §8 lives between "## 8." and the next "## " heading.
  const sec8Idx = design.search(/^## 8\. /m);
  assert.ok(sec8Idx >= 0, 'design must have a §8 section');
  const section = design.slice(sec8Idx, sec8Idx + 5000);
  // The corrected prose must explain that COMPLEXA always runs plan-architect.
  assert.ok(
    /COMPLEXA[\s\S]{0,400}(always|sempre)/i.test(section) ||
    /(always|sempre)[\s\S]{0,400}COMPLEXA/i.test(section),
    'design §8 must clarify "COMPLEXA always runs plan-architect" (or Portuguese equivalent)'
  );
});
