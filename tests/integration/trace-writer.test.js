#!/usr/bin/env node
/**
 * tests/integration/trace-writer.test.js
 *
 * Wave 8-spec (Batch A) — TRACE.md schema + writer wiring contract.
 *
 * This test validates the SPEC contract — that the v4.17.0 plugin defines:
 *  1. A TRACE.md schema document at references/trace-schema/v1.md
 *  2. The schema declares schema_version=1 with all canonical fields from
 *     designs/pipeline-orchestrator-v5-consolidated.md §13
 *  3. agents/core/pipeline-controller.md Phase 3 closure step references
 *     the writer (instructs the controller to emit TRACE.md after final-
 *     validator returns and before finishing-branch)
 *  4. The output path is .pipeline-orchestrator/runs/<run-id>/TRACE.md in
 *     the user repo (default) — explicitly NOT .pipeline/
 *  5. The opt-out config path ~/.claude/data/pipeline-orchestrator/runs/...
 *     is documented for persist_runs: 'private'
 *
 * It does NOT run an end-to-end pipeline (the runtime emission is governed
 * by hooks + tool permissions and is exercised by the compat suite). The
 * scope of this Wave 8-spec test is the SCHEMA + WIRING contract.
 *
 * DoD criterion #2: TRACE.md in user repo by default.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('Batch A: references/trace-schema/v1.md exists and declares schema_version=1', () => {
  const schemaPath = path.join(REPO_ROOT, 'references', 'trace-schema', 'v1.md');
  assert.ok(
    fs.existsSync(schemaPath),
    'references/trace-schema/v1.md must exist (Wave 8-spec deliverable)'
  );
  const content = fs.readFileSync(schemaPath, 'utf8');
  assert.match(
    content,
    /schema_version[:\s]+1\b/,
    'schema doc must declare schema_version: 1'
  );
});

test('Batch A: TRACE schema declares all canonical fields from design §13', () => {
  const schemaPath = path.join(REPO_ROOT, 'references', 'trace-schema', 'v1.md');
  const content = fs.readFileSync(schemaPath, 'utf8');
  // Canonical top-level fields per design §13.1
  const required = [
    'trace_schema_version',
    'timestamp_utc',
    'started_at',
    'ended_at',
    'duration_seconds',
    'plugin_version',
    'user_identity',
    'branch',
    'repo',
    'task',
  ];
  for (const field of required) {
    assert.match(
      content,
      new RegExp(`\\b${field}\\b`),
      `schema doc must list canonical field "${field}" (design §13.1)`
    );
  }
});

test('Batch A: TRACE schema declares Classification, Pipeline Definition, Execution Log, Final Verdict sections', () => {
  const schemaPath = path.join(REPO_ROOT, 'references', 'trace-schema', 'v1.md');
  const content = fs.readFileSync(schemaPath, 'utf8');
  const sections = [
    'Classification',
    'Pipeline Definition',
    'Execution Log',
    'Final Verdict',
  ];
  for (const sec of sections) {
    assert.match(
      content,
      new RegExp(sec, 'i'),
      `schema doc must reference canonical section "${sec}" from design §13.1`
    );
  }
});

test('Batch A: TRACE schema documents dispatch_mode invariant per phase', () => {
  const schemaPath = path.join(REPO_ROOT, 'references', 'trace-schema', 'v1.md');
  const content = fs.readFileSync(schemaPath, 'utf8');
  // Invariant #6 from design §9: each phase records its own dispatch_mode.
  assert.match(
    content,
    /dispatch_mode/i,
    'schema doc must document the per-phase dispatch_mode field (Invariante #6)'
  );
});

test('Batch A: pipeline-controller.md Phase 3 closure wires TRACE.md writer', () => {
  const controllerPath = path.join(REPO_ROOT, 'agents', 'core', 'pipeline-controller.md');
  const content = fs.readFileSync(controllerPath, 'utf8');
  // The writer instruction must appear in the controller spec.
  assert.match(
    content,
    /TRACE\.md/,
    'pipeline-controller must reference TRACE.md emission'
  );
  // Output path must be the user-repo path, not .pipeline/.
  assert.match(
    content,
    /\.pipeline-orchestrator\/runs/,
    'pipeline-controller must specify .pipeline-orchestrator/runs/<run-id>/TRACE.md as the default emit path'
  );
  // Phase 3 closure timing — after final-validator, before finishing-branch.
  // Match the actual H3 closure section, not the early architecture-overview
  // mention of "Phase 3" on line ~172. Note: JavaScript regex has no \Z; use
  // explicit end-of-string anchor via slice from the closure header.
  const phase3Start = content.search(/^### Phase 3: Closure/m);
  assert.ok(phase3Start >= 0, 'pipeline-controller must have a "### Phase 3: Closure" section');
  // Section ends at the next H2 heading (^## , exactly two hashes + space).
  const after = content.slice(phase3Start);
  const nextH2 = after.search(/\n## [^#]/);
  const phase3Block = [nextH2 > 0 ? after.slice(0, nextH2) : after];
  assert.ok(phase3Block, 'pipeline-controller must have a "### Phase 3: Closure" section');
  assert.match(
    phase3Block[0],
    /TRACE\.md/,
    'Phase 3 Closure section must mention TRACE.md emission'
  );
  // The TRACE writer step must appear BETWEEN final-validator and finishing-branch
  // (after Step 3b verdict is known, before Step 3c closeout asks the user).
  const finalValidatorIdx = phase3Block[0].search(/Step 3b: Final Validator/);
  const traceIdx = phase3Block[0].search(/TRACE\.md/);
  const finishingBranchIdx = phase3Block[0].search(/Step 3c: Finishing Branch/);
  assert.ok(
    finalValidatorIdx >= 0 && traceIdx > finalValidatorIdx && finishingBranchIdx > traceIdx,
    'TRACE.md emission must be ordered AFTER final-validator and BEFORE finishing-branch'
  );
});

test('Batch A: pipeline-controller.md documents persist_runs opt-out', () => {
  const controllerPath = path.join(REPO_ROOT, 'agents', 'core', 'pipeline-controller.md');
  const content = fs.readFileSync(controllerPath, 'utf8');
  // The opt-out behavior must be specified somewhere in the controller.
  assert.match(
    content,
    /persist_runs/,
    'pipeline-controller must document the persist_runs setting'
  );
  assert.match(
    content,
    /private/,
    'pipeline-controller must document the "private" opt-out value'
  );
});

test('Batch A: Iron Law — gate registry (references/gates.md) at 25 gates (v5.1.0)', () => {
  // v5.1.0 gate registry SSOT: references/gates.md has 25 gate rows.
  // 22 baseline (v4.13.0+) + 3 v5.1.0 routing gates (STEP_1_7_ROUTING,
  // STEP_1_7_RECURSION_GUARD, STOP_BEFORE_PA_DE_CAL).
  // Reusing existing names (e.g., for log entries) is allowed;
  // introducing a new name without bumping this lock is not.
  const gatesMdPath = path.join(REPO_ROOT, 'references', 'gates.md');
  const content = fs.readFileSync(gatesMdPath, 'utf8');
  const gateRowRegex = /^\| [A-Z_0-9]{4,} \|/gm;
  const matches = content.match(gateRowRegex) || [];
  assert.equal(
    matches.length,
    25,
    `references/gates.md must remain at 25 gate registry rows (got ${matches.length})`
  );
});
