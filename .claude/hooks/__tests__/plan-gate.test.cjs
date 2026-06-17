// .claude/hooks/__tests__/plan-gate.test.cjs
//
// RED tests for the DETERMINISTIC PLAN-MODE GATE (Batch B-core, plan:
// idempotent-imagining-fountain.md). The user's root-cause cure: no production
// code may be written in a pipeline run until an APPROVED PLAN is registered in
// the state — enforced by code, in ALL workflows, so it cannot be skipped.
//
// Contract: block Edit/Write/NotebookEdit/MultiEdit (and, later, write-commands)
// to paths OUTSIDE .pipeline/ when the active run REQUIRES a plan and
// sentinel-state.phase_1_5_plan.approved !== true.
//
// These import `shouldBlockWithoutApprovedPlan`, which does NOT exist yet in
// edit-guard-hook.cjs → they FAIL (RED) until Batch B-core is implemented.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { shouldBlockWithoutApprovedPlan, handlePreToolUse } = require('../edit-guard-hook.cjs');

function setupState({ planRequired = true, planApproved = false, pipelineActive = true, includePlanField = true, schemaVersion = 2 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plangate-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-17-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: schemaVersion,
    run_id: '2026-06-17-run',
    pipeline_doc_path: runDir,
    pipeline_active: pipelineActive,
    current_phase: '2',
  };
  if (includePlanField) {
    state.phase_1_5_plan = {
      required: planRequired,
      executed: planApproved,
      approved: planApproved,
      decision: planApproved ? 'APPROVED' : null,
      approved_at: planApproved ? new Date().toISOString() : null,
    };
  }
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  return { tmp, runDir };
}

test('PG1: run exige plano + plano NÃO aprovado + Write fora de .pipeline → BLOCK', () => {
  const { tmp } = setupState({ planRequired: true, planApproved: false });
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, true);
  assert.match(r.reason, /plan|plano/i);
  fs.rmSync(tmp, { recursive: true });
});

test('PG2: plano aprovado → ALLOW', () => {
  const { tmp } = setupState({ planRequired: true, planApproved: true });
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('PG3: run não exige plano (required=false) → ALLOW', () => {
  const { tmp } = setupState({ planRequired: false, planApproved: false });
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('PG4: plano não aprovado + Write DENTRO de .pipeline → ALLOW', () => {
  const { tmp } = setupState({ planRequired: true, planApproved: false });
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, '.pipeline/docs/Pre-Heavy-action/2026-06-17-run/plan.md'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('PG5: sem sentinel-state (sem pipeline) → ALLOW', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noplan-'));
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('PG6: estado LEGADO schema 1 sem phase_1_5_plan → ALLOW (retrocompat na transição)', () => {
  const { tmp } = setupState({ includePlanField: false, schemaVersion: 1 });
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('PG8: run NOVO schema 2 ativo SEM phase_1_5_plan → BLOCK (fail-safe, não depende de armar)', () => {
  const { tmp } = setupState({ includePlanField: false, schemaVersion: 2, pipelineActive: true });
  const r = shouldBlockWithoutApprovedPlan(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, true, 'run novo ativo sem plano aprovado deve bloquear por padrão');
  fs.rmSync(tmp, { recursive: true });
});

test('PG7 (integração): handlePreToolUse bloqueia Write sem plano aprovado', () => {
  const { tmp } = setupState({ planRequired: true, planApproved: false });
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/bar.ts') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /plan|plano/i);
  fs.rmSync(tmp, { recursive: true });
});
