// =============================================================================
// F1 — dispatch-pending-gate: ferramentas de investigação (Read/Grep/Glob/ToolSearch)
//      devem passar no ramo CORRUPT_SENTINEL e no ramo handshake vivo (v8.18.0)
// =============================================================================
// Bug: dispatch-pending-gate bloqueia Read/Grep/Glob/ToolSearch quando o
// sentinel-state é CORRUPT ou há handshake pendente, criando deadlock —
// o agente não consegue investigar NEM despachar a resolução. Já o
// pipeline-arm-gate libera essas ferramentas, mas o mais restritivo ganha
// porque ambos rodam em `.*`.
// =============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const gate = require('../../../.claude/hooks/dispatch-pending-gate.cjs');

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

function setupCorruptState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-corrupt-'));
  const pipelineDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'), JSON.stringify({
    pipeline_doc_path: path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run'),
    run_id: '2026-06-28-run',
    updated_at: new Date().toISOString(), // RECENTE — evita flakiness por staleness
    pipeline_active: true,
  }));
  // sentinel-state não é JSON válido → CORRUPT_SENTINEL
  fs.writeFileSync(
    path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run', 'sentinel-state.json'),
    'CLEARED',
  );
  return tmp;
}

function setupPendingState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-pending-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-28-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 1,
    run_id: '2026-06-28-run',
    pipeline_doc_path: runDir,
    pipeline_active: true,
    current_phase: '1.7-routing',
    pending_blocks: [
      { block_type: 'DISPATCH_REQUEST', dispatch_id: 'brainstorm-controller', emitted_at: iso(60_000) },
    ],
  }, null, 2));
  return tmp;
}

function setupInactivePipelineCorruptState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-inactive-'));
  const pipelineDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'), JSON.stringify({
    pipeline_doc_path: path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run'),
    run_id: '2026-06-28-run',
    updated_at: '2026-06-28T20:00:00.000Z',
    pipeline_active: false,
  }));
  fs.writeFileSync(
    path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run', 'sentinel-state.json'),
    'CLEARED',
  );
  return tmp;
}

const INVESTIGATION_TOOLS = ['Read', 'Grep', 'Glob', 'ToolSearch'];

// ===== Ramo CORRUPT_SENTINEL =====

for (const tool of INVESTIGATION_TOOLS) {
  test(`F1-C1-${tool}: ${tool} passa em CORRUPT_SENTINEL (investigação liberada)`, () => {
    const tmp = setupCorruptState();
    const r = gate.decideInlineGate({ tool_name: tool, tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
    assert.strictEqual(r.decision, 'allow', `${tool} deveria ser ALLOW em CORRUPT_SENTINEL`);
    fs.rmSync(tmp, { recursive: true });
  });
}

test('F1-C2: Edit ainda é BLOQUEADO em CORRUPT_SENTINEL (ferramenta de produção)', () => {
  const tmp = setupCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block', 'Edit deveria ser BLOCK em CORRUPT_SENTINEL');
  fs.rmSync(tmp, { recursive: true });
});

test('F1-C3: Bash ainda é BLOQUEADO em CORRUPT_SENTINEL (ferramenta de produção)', () => {
  const tmp = setupCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' }, cwd: tmp });
  assert.strictEqual(r.decision, 'block', 'Bash deveria ser BLOCK em CORRUPT_SENTINEL');
  fs.rmSync(tmp, { recursive: true });
});

// ===== Ramo handshake pendente vivo =====

for (const tool of INVESTIGATION_TOOLS) {
  test(`F1-P1-${tool}: ${tool} passa com handshake pendente (investigação liberada)`, () => {
    const tmp = setupPendingState();
    const r = gate.decideInlineGate({ tool_name: tool, tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
    assert.strictEqual(r.decision, 'allow', `${tool} deveria ser ALLOW com handshake pendente`);
    fs.rmSync(tmp, { recursive: true });
  });
}

test('F1-P2: Write ainda é BLOQUEADO com handshake pendente (ferramenta de produção)', () => {
  const tmp = setupPendingState();
  const r = gate.decideInlineGate({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block', 'Write deveria ser BLOCK com handshake pendente');
  fs.rmSync(tmp, { recursive: true });
});

// ===== Pipeline inativo + CORRUPT → deve liberar =====

test('F1-I1: CORRUPT_SENTINEL com pipeline_active=false no active-run → ALLOW (pipeline não ativo)', () => {
  const tmp = setupInactivePipelineCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow', 'Pipeline inativo + CORRUPT deveria liberar');
  fs.rmSync(tmp, { recursive: true });
});

test('F1-I2: CORRUPT_SENTINEL com pipeline_active=false → Bash também ALLOW', () => {
  const tmp = setupInactivePipelineCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow', 'Pipeline inativo + CORRUPT → Bash deveria liberar');
  fs.rmSync(tmp, { recursive: true });
});

// ===== Staleness recovery: active-run velho demais → liberar =====

function setupStaleActiveRunCorruptState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-stale-'));
  const pipelineDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'), JSON.stringify({
    pipeline_doc_path: path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run'),
    run_id: '2026-06-28-run',
    updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 horas atrás
    pipeline_active: true,
  }));
  fs.writeFileSync(
    path.join(pipelineDir, 'docs', 'Pre-Heavy-action', '2026-06-28-run', 'sentinel-state.json'),
    'CLEARED',
  );
  return tmp;
}

test('F1-I3: CORRUPT_SENTINEL com active-run STALE (>2h) + pipeline_active=true → ALLOW (sessão morta)', () => {
  const tmp = setupStaleActiveRunCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow', 'Active-run stale + CORRUPT deveria liberar');
  fs.rmSync(tmp, { recursive: true });
});

test('F1-I4: CORRUPT_SENTINEL com active-run RECENTE + pipeline_active=true → BLOCK (sessão viva)', () => {
  const tmp = setupCorruptState(); // active-run recente com pipeline_active=true
  const r = gate.decideInlineGate({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, 'src/foo.js') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block', 'Active-run recente + CORRUPT → Edit deve ser bloqueado');
  fs.rmSync(tmp, { recursive: true });
});

// ===== Segurança: ferramentas já existentes no ALWAYS_ALLOW continuam =====

test('F1-S1: AskUserQuestion continua ALLOW em CORRUPT_SENTINEL', () => {
  const tmp = setupCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'AskUserQuestion', tool_input: {}, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('F1-S2: EnterPlanMode continua ALLOW em CORRUPT_SENTINEL', () => {
  const tmp = setupCorruptState();
  const r = gate.decideInlineGate({ tool_name: 'EnterPlanMode', tool_input: {}, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});
