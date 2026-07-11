// =============================================================================
// F4 (v8.23.0) — dispatch-pending-gate: subagent-fallback clause (Batch 3)
// =============================================================================
// SOURCE: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §4 P1 / CR6.
// buildReason (INLINE_WORK_BLOCKED) told the reader to "despache via Agent
// tool" without knowing the reader might be a dispatched SUBAGENT with no
// Agent tool at all (Achado #7 — session_id is identical for parent and
// subagent, a hook can never tell them apart from the payload alone). Same gap
// in the DISPATCH_PENDING_STATE_CORRUPT reason. Both now append the shared
// clause from lib/next-action.cjs::buildSubagentFallbackClause.
// =============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const gate = require('../../../.claude/hooks/dispatch-pending-gate.cjs');

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

function setupState({ pending = [], pipelineActive = true, corruptJson = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f4-fallback-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-08-run');
  fs.mkdirSync(runDir, { recursive: true });
  const statePath = path.join(runDir, 'sentinel-state.json');
  if (corruptJson) {
    fs.writeFileSync(statePath, '{ not valid json !!');
  } else {
    fs.writeFileSync(statePath, JSON.stringify({
      schema_version: 1,
      run_id: '2026-07-08-run',
      pipeline_doc_path: runDir,
      pipeline_active: pipelineActive,
      current_phase: '1.7-routing',
      pending_blocks: pending,
    }, null, 2));
  }
  return { tmp, runDir };
}

test('F4-S1: INLINE_WORK_BLOCKED reason includes the subagent-fallback clause', () => {
  const { tmp } = setupState({
    pending: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'step-1-7-brainstorm-controller', emitted_at: iso(60_000) }],
  });
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /subagente sem a ferramenta Agent/i, `reason must offer a subagent-reachable exit: ${r.reason}`);
  assert.match(r.reason, /DISPATCH_REQUEST/, 'must name the specific block_type actually pending');
  assert.match(r.reason, /gate-request-protocol/i);
  fs.rmSync(tmp, { recursive: true });
});

test('F4-S2: the fallback clause names the ACTUAL pending block_type, not always DISPATCH_REQUEST', () => {
  const { tmp } = setupState({
    pending: [{ block_type: 'GATE_REQUEST', gate_id: 'step-1-plan-approval', emitted_at: iso(60_000) }],
  });
  const r = gate.decideInlineGate({ tool_name: 'Bash', tool_input: { command: 'echo hi' }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /emita agora um bloco GATE_REQUEST/, `must name GATE_REQUEST specifically, got: ${r.reason}`);
  fs.rmSync(tmp, { recursive: true });
});

test('F4-S3: original primary instruction is preserved verbatim (additive, not replaced)', () => {
  const { tmp } = setupState({
    pending: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'x', emitted_at: iso(60_000) }],
  });
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'x.cjs') }, cwd: tmp });
  assert.match(r.reason, /despache o subagente alvo via Agent tool/, 'the parent-facing primary instruction must still be there');
  fs.rmSync(tmp, { recursive: true });
});

test('F4-S4: DISPATCH_PENDING_STATE_CORRUPT reason also gets the fallback clause', () => {
  const { tmp, runDir } = setupState({ corruptJson: true });
  // discoverStatePath (edit-guard-hook.cjs) only classifies a malformed file as
  // CORRUPT_SENTINEL for an AUTHORITATIVE discovery (PIPELINE_DOC_PATH env /
  // active-run.json pointer / PIPELINE_RUN_ID) — the mtime-fallback discovery a
  // bare corrupt file would hit otherwise silently returns null (ignored, not
  // corrupt). An authoritative pointer is required to reach the real branch.
  fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: runDir }));
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'x.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /DISPATCH_PENDING_STATE_CORRUPT/);
  assert.match(r.reason, /subagente sem a ferramenta Agent/i, `corrupt-state reason must also offer a subagent-reachable exit: ${r.reason}`);
  fs.rmSync(tmp, { recursive: true });
});

test('F4-S5: fallback clause never breaks the deny itself if next-action.cjs is unreadable', () => {
  // The require is best-effort inside subagentFallbackSuffix — simulate its
  // absence by requiring the gate fresh with a poisoned module cache entry
  // for next-action.cjs, mirroring the technique used in F3 S7.
  const gatePath = require.resolve(path.join(__dirname, '../../../.claude/hooks/dispatch-pending-gate.cjs'));
  const nextActionPath = require.resolve(path.join(__dirname, '../../../lib/next-action.cjs'));
  const savedGate = require.cache[gatePath];
  const savedNextAction = require.cache[nextActionPath];
  delete require.cache[gatePath];
  require.cache[nextActionPath] = { id: nextActionPath, filename: nextActionPath, loaded: true, exports: {} };
  try {
    const freshGate = require(gatePath);
    const { tmp } = setupState({
      pending: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'x', emitted_at: iso(60_000) }],
    });
    const r = freshGate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'x.cjs') }, cwd: tmp });
    assert.strictEqual(r.decision, 'block', 'the deny itself must survive a missing/broken next-action.cjs');
    assert.match(r.reason, /INLINE_WORK_BLOCKED/);
    fs.rmSync(tmp, { recursive: true });
  } finally {
    delete require.cache[gatePath];
    delete require.cache[nextActionPath];
    if (savedGate) require.cache[gatePath] = savedGate;
    if (savedNextAction) require.cache[nextActionPath] = savedNextAction;
  }
});
