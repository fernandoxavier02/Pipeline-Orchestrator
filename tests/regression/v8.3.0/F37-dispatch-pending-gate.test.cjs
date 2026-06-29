// =============================================================================
// F37 — dispatch-pending-gate: OBRIGA o dispatch de subagentes (v8.3.0)
// =============================================================================
// Fecha o buraco do "parent trabalha INLINE sem escrever nada": a trava de
// dispatch-pending existente (shouldBlockOnPendingDispatch) só barra ESCRITA de
// arquivo. Este novo hook intercepta QUALQUER ação do parent enquanto há um
// handshake (DISPATCH/GATE/PLAN_MODE_REQUEST) pendente+vivo no sentinel-state e
// só deixa passar a RESOLUÇÃO (Agent / AskUserQuestion / EnterPlanMode / Task*)
// e as isenções (exec-window válida, caminho .pipeline/, pending expirado).
// Default = deny (OBRIGA). Escape: PIPELINE_DISPATCH_INLINE_ENFORCEMENT=warn.
//
// Importa do hook novo `.claude/hooks/dispatch-pending-gate.cjs` (RED: ainda não existe).
// =============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const gate = require('../../../.claude/hooks/dispatch-pending-gate.cjs');

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

function setupState({ pending = [], pipelineActive = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f37-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-17-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 1,
    run_id: '2026-06-17-run',
    pipeline_doc_path: runDir,
    pipeline_active: pipelineActive,
    current_phase: '1.7-routing',
    pending_blocks: pending,
  }, null, 2));
  return { tmp, runDir };
}

const RECENT = () => ([
  { block_type: 'DISPATCH_REQUEST', dispatch_id: 'step-1-7-brainstorm-controller', emitted_at: iso(60_000) },
]);

test('F37-I1: pending vivo + Edit fora de .pipeline → BLOCK (inline barrado)', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /INLINE_WORK_BLOCKED|dispatch|pend/i);
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I1a: pending vivo + Read fora de .pipeline → ALLOW (investigação liberada, v8.18.0)', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I1b: pending vivo + Bash (não-resolução) → BLOCK', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I2: Agent que despacha o ALVO do pending → ALLOW (resolução)', () => {
  const { tmp } = setupState({ pending: RECENT() }); // dispatch_id: step-1-7-brainstorm-controller
  const r = gate.decideInlineGate({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:brainstorm-controller', prompt: 'go' }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I2b: Agent IRRELEVANTE (não-alvo, sem payload de resolução) → BLOCK (fecha o wrong-Agent bypass, SEC-1)', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:quality:plan-architect', prompt: 'faz o trabalho inline disfarçado' }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I2c: Agent com DISPATCH_RESULTS no prompt (re-dispatch de resolução) → ALLOW', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:pipeline-controller', prompt: 'DISPATCH_RESULTS:\n  ok: true' }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I3: AskUserQuestion (resolve GATE) → ALLOW', () => {
  const { tmp } = setupState({ pending: [{ block_type: 'GATE_REQUEST', gate_id: 'g1', emitted_at: iso(30_000) }] });
  const r = gate.decideInlineGate({ tool_name: 'AskUserQuestion', tool_input: {}, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I4: EnterPlanMode (resolve PLAN_MODE) → ALLOW', () => {
  const { tmp } = setupState({ pending: [{ block_type: 'PLAN_MODE_REQUEST', plan_id: 'p1', emitted_at: iso(30_000) }] });
  const r = gate.decideInlineGate({ tool_name: 'EnterPlanMode', tool_input: {}, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I5: sem pending → ALLOW (não interfere fora de handshake)', () => {
  const { tmp } = setupState({ pending: [] });
  const r = gate.decideInlineGate({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I6: pending EXPIRADO (>timeout) → ALLOW (recovery, nunca trava pra sempre)', () => {
  const { tmp } = setupState({ pending: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'x', emitted_at: iso(31 * 60_000) }] });
  const r = gate.decideInlineGate({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I7: ação dentro de .pipeline → ALLOW', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, '.pipeline/docs/Pre-Heavy-action/2026-06-17-run/note.md') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I8: exec-window válida → ALLOW (executor legítimo autorizado)', () => {
  const sid = 'sess-x';
  const { tmp, runDir } = setupState({ pending: RECENT() });
  const sd = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, `${sid}.lock`), JSON.stringify({ session_id: sid, status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  const opened = Date.now();
  fs.writeFileSync(path.join(sd, `${sid}.exec-window`), JSON.stringify({ session_id: sid, ttl_minutes: 5, opened_at: opened, expires_at: opened + 5 * 60_000 }));
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), JSON.stringify({ gate: 'EXEC_WINDOW_OPEN', hardness: 'AUDIT', session_id: sid, timestamp: opened, detail: 'n2' }) + '\n');
  const r = gate.decideInlineGate({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I9: escape PIPELINE_DISPATCH_INLINE_ENFORCEMENT=warn → ALLOW', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const prev = process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT;
  process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT = 'warn';
  try {
    // Usa Edit (ferramenta de produção) — Read agora é investigação e passa direto (v8.18.0)
    const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
    assert.strictEqual(r.decision, 'allow');
  } finally {
    if (prev === undefined) delete process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT; else process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT = prev;
  }
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I10: sem sentinel-state (projeto comum) → ALLOW', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f37-nostate-'));
  const r = gate.decideInlineGate({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I12: payload sem tool_input + pending vivo → BLOCK (sem crash)', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'Write', cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I13: sentinel-state CORROMPIDO (authoritative) → ALLOW (fail-open)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f37-corrupt-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-17-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), 'not json {{{ pending');
  const r = gate.decideInlineGate({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I14: ferramenta MCP (fora da allowlist) + pending vivo → BLOCK', () => {
  const { tmp } = setupState({ pending: RECENT() });
  const r = gate.decideInlineGate({ tool_name: 'mcp__claude_ai_Google_Drive__create_file', tool_input: {}, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I15: warn mode registra INLINE_WORK_BLOCKED em protocol-events.jsonl', () => {
  const { tmp, runDir } = setupState({ pending: RECENT() });
  const prev = process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT;
  process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT = 'warn';
  try {
    // Usa Edit (ferramenta de produção) — Read agora é investigação e passa direto (v8.18.0)
    const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp });
    assert.strictEqual(r.decision, 'allow');
    const log = fs.readFileSync(path.join(runDir, 'protocol-events.jsonl'), 'utf8');
    assert.match(log, /INLINE_WORK_BLOCKED/);
  } finally {
    if (prev === undefined) delete process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT; else process.env.PIPELINE_DISPATCH_INLINE_ENFORCEMENT = prev;
  }
  fs.rmSync(tmp, { recursive: true });
});

test('F37-I11 (dogfood CLI): hook nega Edit inline com pending vivo', () => {
  const { spawnSync } = require('node:child_process');
  const { tmp } = setupState({ pending: RECENT() });
  const hookPath = path.join(__dirname, '..', '..', '..', '.claude', 'hooks', 'dispatch-pending-gate.cjs');
  // Usa Edit (ferramenta de produção) — Read agora é investigação e passa direto (v8.18.0)
  const res = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp }),
    encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /permissionDecision":"deny"/);
  assert.match(res.stdout, /INLINE_WORK_BLOCKED/);
  fs.rmSync(tmp, { recursive: true });
});
