// .claude/hooks/__tests__/dispatch-pending-lock.test.cjs
//
// RED tests for the dispatch-pending preventive lock (Fase 1 da rearquitetura
// "parent-orquestra" — plan: docs/plans/2026-06-17-dispatch-pending-lock.md).
//
// Motivador: run furado em D:\Clínica Companion (fidelity 0.0435). O parent não
// atendeu o DISPATCH_REQUEST do STEP 1.7, marcou pipeline_active=false e conduziu
// a spec inline. Esta trava bloqueia escrita de código de produção enquanto há um
// bloco de protocolo (DISPATCH_REQUEST/GATE_REQUEST/PLAN_MODE_REQUEST) pendente e
// não-resolvido no sentinel-state.
//
// Estes testes importam `shouldBlockOnPendingDispatch`, que NÃO EXISTE ainda em
// edit-guard-hook.cjs — por isso falham (RED). Ficam GREEN quando a função for
// implementada conforme o plano.
//
// Cobertura pendente para a fase de implementação (não-RED aqui, anotado p/ não esquecer):
//   - exec-window válida + pending block → ALLOW (executor legítimo autorizado);
//   - PIPELINE_DISPATCH_LOCK=warn → handlePreToolUse audita sem bloquear;
//   - estado ilegível sob deny → fail-CLOSED.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { shouldBlockOnPendingDispatch, handlePreToolUse } = require('../edit-guard-hook.cjs');

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

// tmp project dir com sentinel-state.json sob um run folder Pre-*-action.
function setupState({ pending = [], pipelineActive = true, closedReason } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatchlock-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-17-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 1,
    run_id: '2026-06-17-run',
    pipeline_doc_path: runDir,
    pipeline_active: pipelineActive,
    current_phase: '1.7-routing',
    pending_blocks: pending,
  };
  if (closedReason) state.closed_reason = closedReason;
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  return { tmp, runDir };
}

const RECENT_DISPATCH = () => ([
  { block_type: 'DISPATCH_REQUEST', dispatch_id: 'step-1-7-brainstorm-controller', emitted_at: iso(60_000) },
]);

test('T1: pending DISPATCH recente + Write fora de .pipeline → BLOCK', () => {
  const { tmp } = setupState({ pending: RECENT_DISPATCH() });
  const r = shouldBlockOnPendingDispatch(path.join(tmp, '.kiro/specs/whatsapp-templates/requirements.md'), tmp);
  assert.strictEqual(r.block, true);
  assert.match(r.reason, /DISPATCH|pend/i);
  fs.rmSync(tmp, { recursive: true });
});

test('T2: pending DISPATCH recente + Write DENTRO de .pipeline → ALLOW', () => {
  const { tmp } = setupState({ pending: RECENT_DISPATCH() });
  const r = shouldBlockOnPendingDispatch(path.join(tmp, '.pipeline/docs/Pre-Heavy-action/2026-06-17-run/02-explore.md'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('T3: sem pending_blocks → ALLOW (não interfere em projeto/pipeline normal)', () => {
  const { tmp } = setupState({ pending: [] });
  const r = shouldBlockOnPendingDispatch(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('T4: pending DISPATCH EXPIRADO (>30min) → ALLOW (deixa o recovery agir, não trava pra sempre)', () => {
  const { tmp } = setupState({ pending: [
    { block_type: 'DISPATCH_REQUEST', dispatch_id: 'x', emitted_at: iso(31 * 60_000) },
  ] });
  const r = shouldBlockOnPendingDispatch(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('T5 (repro Clínica Companion): pending DISPATCH + pipeline_active:false + closed_reason + Write em .kiro/specs → BLOCK', () => {
  const { tmp } = setupState({
    pending: RECENT_DISPATCH(),
    pipelineActive: false,
    closedReason: 'Harness sem SendMessage para continuar subagentes; usuário optou por conduzir a spec diretamente (main LLM).',
  });
  const r = shouldBlockOnPendingDispatch(path.join(tmp, '.kiro/specs/whatsapp-templates/design.md'), tmp);
  assert.strictEqual(r.block, true, 'fechar o pipeline na marra (pipeline_active=false) NÃO pode liberar a escrita com despacho pendente');
  fs.rmSync(tmp, { recursive: true });
});

test('T6: sem sentinel-state (projeto comum, sem pipeline) → ALLOW', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nostate-'));
  const r = shouldBlockOnPendingDispatch(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('T7: pending GATE_REQUEST recente também trava → BLOCK', () => {
  const { tmp } = setupState({ pending: [
    { block_type: 'GATE_REQUEST', dispatch_id: 'phase-1-pipeline-proposal', emitted_at: iso(60_000) },
  ] });
  const r = shouldBlockOnPendingDispatch(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, true);
  fs.rmSync(tmp, { recursive: true });
});

test('T8 (integração): handlePreToolUse bloqueia Write quando há DISPATCH pendente', () => {
  const { tmp } = setupState({ pending: RECENT_DISPATCH() });
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/bar.ts') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /DISPATCH|pend/i);
  fs.rmSync(tmp, { recursive: true });
});

test('T9: executor legítimo (exec-window válida) NÃO é barrado mesmo com pending block → ALLOW', () => {
  const sessionId = 'sess-exec';
  const { tmp, runDir } = setupState({ pending: RECENT_DISPATCH() });
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, `${sessionId}.lock`),
    JSON.stringify({ session_id: sessionId, status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  const opened = Date.now();
  fs.writeFileSync(path.join(sessionsDir, `${sessionId}.exec-window`),
    JSON.stringify({ session_id: sessionId, ttl_minutes: 5, opened_at: opened, expires_at: opened + 5 * 60_000 }));
  // pairing audit entry (getActiveExecWindow exige EXEC_WINDOW_OPEN dentro de ±60s do mtime)
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'EXEC_WINDOW_OPEN', hardness: 'AUDIT', session_id: sessionId, timestamp: opened, detail: 'n2' }) + '\n');
  const r = shouldBlockOnPendingDispatch(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false, 'exec-window válida deve autorizar o executor legítimo');
  fs.rmSync(tmp, { recursive: true });
});

test('T10: desligamento por variável de ambiente REMOVIDO — PIPELINE_DISPATCH_LOCK=warn NÃO desarma → BLOCK', () => {
  const { tmp } = setupState({ pending: RECENT_DISPATCH() });
  const prev = process.env.PIPELINE_DISPATCH_LOCK;
  process.env.PIPELINE_DISPATCH_LOCK = 'warn';
  try {
    const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/bar.ts') }, cwd: tmp });
    assert.strictEqual(r.decision, 'block');
  } finally {
    if (prev === undefined) delete process.env.PIPELINE_DISPATCH_LOCK; else process.env.PIPELINE_DISPATCH_LOCK = prev;
  }
  fs.rmSync(tmp, { recursive: true });
});

test('T11: sentinel-state corrompido (JSON inválido) → ALLOW (fail-open, não trava o projeto inteiro)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corrupt-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-17-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), 'not json {{{ pending');
  const r = shouldBlockOnPendingDispatch(path.join(tmp, 'src/foo.ts'), tmp);
  assert.strictEqual(r.block, false, 'estado ilegível não é evidência de pending → fail-open');
  fs.rmSync(tmp, { recursive: true });
});

test('T12 (dogfood CLI): o hook invocado como o Claude Code o invoca NEGA a escrita da spec — caso Clínica Companion', () => {
  const { spawnSync } = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-deny-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 1, run_id: 'run', pipeline_active: false,
    closed_reason: 'Harness sem SendMessage; usuário optou por conduzir a spec diretamente',
    pending_blocks: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'step-1-7-brainstorm-controller', emitted_at: new Date().toISOString() }],
  }));
  const target = path.join(tmp, '.kiro', 'specs', 'whatsapp-templates', 'design.md');
  const hookPath = path.join(__dirname, '..', 'edit-guard-hook.cjs');
  const res = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target }, cwd: tmp }),
    encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /permissionDecision":"deny"/);
  assert.match(res.stdout, /DISPATCH_LOCK_ACTIVE/);
  fs.rmSync(tmp, { recursive: true });
});
