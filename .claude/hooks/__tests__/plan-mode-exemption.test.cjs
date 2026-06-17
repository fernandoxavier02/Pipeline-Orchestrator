// .claude/hooks/__tests__/plan-mode-exemption.test.cjs
//
// v8.2.1 hotfix (RED→GREEN). The deterministic Plan-Mode gate (v8.2.0) blocks ALL writes
// outside .pipeline/ while armed — including the harness Plan-Mode plan file in
// ~/.claude/plans/. Since the plan file is written DURING Plan Mode (before approval), the
// gate deadlocks Plan Mode in every real pipeline run. Discovered by the live dogfood of the
// OpenCode portability run.
//
// Fix contract: the plan-file directory is EXEMPT (like .pipeline/) — writing the plan is part
// of planning, not production code. Detect it via os.homedir()/.claude/plans, CLAUDE_CONFIG_DIR/plans,
// or any path containing a `.claude/plans/` segment. Production code stays blocked.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { shouldBlockWithoutApprovedPlan, handlePreToolUse } = require('../edit-guard-hook.cjs');

function armedState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planex-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 2, run_id: 'run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '1.5',
    phase_1_5_plan: { required: true, executed: false, approved: false, decision: null, approved_at: null },
  };
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  return { tmp };
}

test('EX1: armed gate + Write to a .claude/plans path → ALLOW (Plan Mode cannot be deadlocked)', () => {
  const { tmp } = armedState();
  const planFile = path.join(tmp, '.claude', 'plans', 'my-plan.md');
  const r = shouldBlockWithoutApprovedPlan(planFile, tmp);
  assert.strictEqual(r.block, false, 'plan file must be exempt so Plan Mode can write the plan');
  fs.rmSync(tmp, { recursive: true });
});

test('EX2: armed gate + Write under CLAUDE_CONFIG_DIR/plans → ALLOW', () => {
  const { tmp } = armedState();
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'cfg');
  const planFile = path.join(tmp, 'cfg', 'plans', 'p.md');
  const r = shouldBlockWithoutApprovedPlan(planFile, tmp);
  if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = prev;
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('EX3 (regression): armed gate + Write to production code → BLOCK', () => {
  const { tmp } = armedState();
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src', 'foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block', 'production code must still be blocked');
  fs.rmSync(tmp, { recursive: true });
});

test('EX4 (integration): handlePreToolUse Write to plan file → ALLOW', () => {
  const { tmp } = armedState();
  const planFile = path.join(tmp, '.claude', 'plans', 'p.md');
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: planFile }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('EX5 (dispatch lock also exempts plan file): pending dispatch + plan file → ALLOW', () => {
  // A pending dispatch handshake must not deadlock the plan file either.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planex2-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 2, run_id: 'run', pipeline_doc_path: runDir, pipeline_active: true, current_phase: '0',
    pending_blocks: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'd1', emitted_at: new Date().toISOString() }],
  }, null, 2));
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, '.claude', 'plans', 'p.md') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow', 'plan file must be exempt from the dispatch lock too');
  fs.rmSync(tmp, { recursive: true });
});
