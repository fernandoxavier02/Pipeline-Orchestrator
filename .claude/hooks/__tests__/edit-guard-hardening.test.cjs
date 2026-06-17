// .claude/hooks/__tests__/edit-guard-hardening.test.cjs
//
// Tests for the security hardening (Batch 1.x) found by the adversarial review:
// #1 terminal bypass (Bash/PowerShell), #2 state substitution (canonical discovery),
// #4 path containment, #5 three block-id aliases, #6 corrupt-vs-absent fail-closed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  handlePreToolUse, detectShellWrite, findActiveSentinelState, CORRUPT_SENTINEL,
} = require('../edit-guard-hook.cjs');

function setup({ pending = [], plan = null, activeRunPointer = false, corrupt = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', 'run1');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 2, run_id: 'run1', pipeline_doc_path: runDir,
    pipeline_active: true, pending_blocks: pending,
  };
  if (plan) state.phase_1_5_plan = plan;
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), corrupt ? 'not json {{' : JSON.stringify(state));
  if (activeRunPointer) {
    fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'),
      JSON.stringify({ pipeline_doc_path: runDir, run_id: 'run1' }));
  }
  return { tmp, runDir };
}
const recentDispatch = () => [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'd1', emitted_at: new Date().toISOString() }];
const planArmed = { required: true, approved: false };

// --- #1 Furo do terminal ---
test('H1: Bash com escrita + plano não aprovado → BLOCK', () => {
  const { tmp } = setup({ plan: planArmed, activeRunPointer: true });
  const r = handlePreToolUse({ tool_name: 'Bash', tool_input: { command: "echo 'x' > src/foo.ts" }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});
test('H2: Bash de leitura → ALLOW mesmo com trava', () => {
  const { tmp } = setup({ plan: planArmed, activeRunPointer: true });
  const r = handlePreToolUse({ tool_name: 'Bash', tool_input: { command: 'cat src/foo.ts | grep x' }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});
test('H3: Bash com escrita SEM trava (plano aprovado) → ALLOW', () => {
  const { tmp } = setup({ plan: { required: true, approved: true }, activeRunPointer: true });
  const r = handlePreToolUse({ tool_name: 'Bash', tool_input: { command: 'echo x > foo' }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});
test('H4: PowerShell Set-Content + dispatch pendente → BLOCK', () => {
  const { tmp } = setup({ pending: recentDispatch(), activeRunPointer: true });
  const r = handlePreToolUse({ tool_name: 'PowerShell', tool_input: { command: "Set-Content -Path foo.ts -Value 'x'" }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});

// --- detectShellWrite unit ---
test('H5: detectShellWrite reconhece escrita e ignora leitura', () => {
  // true-positives (writes)
  assert.strictEqual(detectShellWrite('echo x > f'), true);
  assert.strictEqual(detectShellWrite('tee f'), true);
  assert.strictEqual(detectShellWrite('sed -i s/a/b/ f'), true);
  assert.strictEqual(detectShellWrite('cp a b'), true);
  assert.strictEqual(detectShellWrite('mv a b'), true);
  // true-negatives (reads)
  assert.strictEqual(detectShellWrite('cat f'), false);
  assert.strictEqual(detectShellWrite('grep x f'), false);
  assert.strictEqual(detectShellWrite('ls -la 2>&1'), false);
});

test('H5b: detectShellWrite NÃO dispara em > dentro de aspas (false-positive fix CORR-1)', () => {
  assert.strictEqual(detectShellWrite("grep 'a>b' file"), false);
  assert.strictEqual(detectShellWrite('echo "x > y"'), false);
  assert.strictEqual(detectShellWrite("git log --format='%s>%h'"), false);
});

test('H5c: detectShellWrite pega as evasões de interpretador/shell (SEC-2)', () => {
  assert.strictEqual(detectShellWrite('node -e "require(\'fs\').writeFileSync(\'f\',\'x\')"'), true);
  assert.strictEqual(detectShellWrite("perl -e 'open(F,q{>},q{x})'"), true);
  assert.strictEqual(detectShellWrite('echo x >| out.js'), true);
  assert.strictEqual(detectShellWrite('Start-Process node'), true);
  assert.strictEqual(detectShellWrite('Out-File -FilePath x.ts'), true);
});

// --- #2 Substituição de estado (descoberta canônica) ---
test('H6: estado falso mais novo NÃO sobrepõe o run apontado por active-run.json → BLOCK', () => {
  const { tmp } = setup({ plan: planArmed, activeRunPointer: true });
  const fakeDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Simples-action', 'fake');
  fs.mkdirSync(fakeDir, { recursive: true });
  fs.writeFileSync(path.join(fakeDir, 'sentinel-state.json'),
    JSON.stringify({ schema_version: 2, pipeline_active: true, pending_blocks: [], phase_1_5_plan: { required: false, approved: false } }));
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/x.ts') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block', 'o estado falso mais novo não pode liberar; active-run.json amarra ao run real');
  fs.rmSync(tmp, { recursive: true });
});

// --- #6 Corrompido authoritative vs não ---
test('H7: estado corrompido apontado por active-run.json → CORRUPT (fail-closed)', () => {
  const { tmp } = setup({ corrupt: true, activeRunPointer: true });
  assert.strictEqual(findActiveSentinelState(tmp), CORRUPT_SENTINEL);
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/x.ts') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});
test('H8: estado corrompido SEM ponteiro (só mtime) → null (fail-open, não trava projeto)', () => {
  const { tmp } = setup({ corrupt: true, activeRunPointer: false });
  assert.strictEqual(findActiveSentinelState(tmp), null);
  fs.rmSync(tmp, { recursive: true });
});

// --- #5 Três nomes de bloco ---
test('H9: bloco pendente com gate_id (sem dispatch_id) trava → BLOCK', () => {
  const { tmp } = setup({
    pending: [{ block_type: 'GATE_REQUEST', gate_id: 'g1', emitted_at: new Date().toISOString() }],
    activeRunPointer: true,
  });
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/x.ts') }, cwd: tmp });
  assert.strictEqual(r.decision, 'block');
  fs.rmSync(tmp, { recursive: true });
});

// --- SEC-1 signature verification on read ---
const signer = require('../../../lib/sentinel-state-signer.cjs');

test('H10: estado authoritative com assinatura ADULTERADA → CORRUPT/BLOCK (SEC-1)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tamper-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', 'run1');
  fs.mkdirSync(runDir, { recursive: true });
  const statePath = path.join(runDir, 'sentinel-state.json');
  // sign a valid state, then tamper a field WITHOUT re-signing → signature now invalid
  signer.writeSignedState(statePath, { schema_version: 2, run_id: 'run1', pipeline_active: true, phase_1_5_plan: { required: true, approved: false } });
  const signed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  signed.phase_1_5_plan.approved = true; // forge approval on disk
  fs.writeFileSync(statePath, JSON.stringify(signed));
  fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: runDir, run_id: 'run1' }));
  // only assert tamper-detection when a key is actually available to verify against
  if (signer.readHmacKey()) {
    assert.strictEqual(findActiveSentinelState(tmp), CORRUPT_SENTINEL, 'tampered authoritative state must be CORRUPT');
    const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/x.ts') }, cwd: tmp });
    assert.strictEqual(r.decision, 'block', 'forged on-disk approval must not pass');
  }
  fs.rmSync(tmp, { recursive: true });
});

test('H11: estado authoritative SEM assinatura (unsigned) → tolerado, lógica normal aplica', () => {
  // setup() writes unsigned JSON; with a plan armed it should still block via the plan gate,
  // proving unsigned is tolerated (returned as state), not treated as CORRUPT.
  const { tmp } = setup({ plan: { required: true, approved: true }, activeRunPointer: true });
  const r = handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src/x.ts') }, cwd: tmp });
  assert.strictEqual(r.decision, 'allow', 'unsigned + approved plan → allowed (unsigned tolerated)');
  fs.rmSync(tmp, { recursive: true });
});
