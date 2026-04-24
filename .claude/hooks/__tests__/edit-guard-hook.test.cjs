// .claude/hooks/__tests__/edit-guard-hook.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { shouldBlock, buildBlockMessage } = require('../edit-guard-hook.cjs');

function setupFixture(withLock) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  if (withLock) {
    const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'sess-active.lock'),
      JSON.stringify({ session_id: 'sess-active', status: 'active', expires_at: Date.now() + 3600_000 })
    );
  }
  return tmp;
}

test('shouldBlock: bloqueia Edit fora de .pipeline/ quando lock ativo', () => {
  const tmp = setupFixture(true);
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true);
  assert.match(result.reason, /PIPELINE_LOCK_ACTIVE/);
  fs.rmSync(tmp, { recursive: true });
});

test('shouldBlock: permite Edit em .pipeline/ mesmo com lock ativo', () => {
  const tmp = setupFixture(true);
  const result = shouldBlock(path.join(tmp, '.pipeline/docs/report.md'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('shouldBlock: permite Edit em qualquer path quando NÃO há lock', () => {
  const tmp = setupFixture(false);
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('shouldBlock: ignora lock expirado', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-old.lock'),
    JSON.stringify({ session_id: 'sess-old', status: 'active', expires_at: Date.now() - 1000 })
  );
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('buildBlockMessage: contém instrução de spawn + delete lock', () => {
  const msg = buildBlockMessage('src/foo.py', 'sess-xyz');
  assert.match(msg, /pipeline-orchestrator:core:pipeline-controller/);
  assert.match(msg, /sess-xyz\.lock/);
  assert.match(msg, /TTL/);
});

const { handlePreToolUse } = require('../edit-guard-hook.cjs');

test('handlePreToolUse: permite Edit quando não há lock', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const result = handlePreToolUse({
    tool_name: 'Edit',
    tool_input: { file_path: path.join(tmp, 'src/foo.py') },
    cwd: tmp,
  });
  assert.strictEqual(result.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

test('handlePreToolUse: bloqueia Write fora de .pipeline/ com lock ativo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-x.lock'),
    JSON.stringify({ session_id: 'sess-x', status: 'active', expires_at: Date.now() + 3600_000 })
  );
  const result = handlePreToolUse({
    tool_name: 'Write',
    tool_input: { file_path: path.join(tmp, 'src/bar.py') },
    cwd: tmp,
  });
  assert.strictEqual(result.decision, 'block');
  assert.match(result.reason, /PIPELINE_LOCK_ACTIVE/);
  fs.rmSync(tmp, { recursive: true });
});

test('handlePreToolUse: ignora tools não-Edit (Bash, Read)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-x.lock'),
    JSON.stringify({ session_id: 'sess-x', status: 'active', expires_at: Date.now() + 3600_000 })
  );
  const result = handlePreToolUse({
    tool_name: 'Bash',
    tool_input: { command: 'echo foo' },
    cwd: tmp,
  });
  assert.strictEqual(result.decision, 'allow');
  fs.rmSync(tmp, { recursive: true });
});

// --- Regression tests for adversarial fix pass 1 ---

test('fix#2: handlePreToolUse falha fechado quando payload.cwd ausente', () => {
  const result = handlePreToolUse({
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/whatever.py' },
    // cwd ausente propositalmente
  });
  assert.strictEqual(result.decision, 'block');
  assert.match(result.reason, /PIPELINE_LOCK_ACTIVE/);
});

test('fix#2: handlePreToolUse falha fechado quando payload.cwd não é string', () => {
  const result = handlePreToolUse({
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/whatever.py' },
    cwd: 42,
  });
  assert.strictEqual(result.decision, 'block');
});

test('fix#3: CLI emite deny em stdout quando stdin é JSON inválido', () => {
  const { spawnSync } = require('node:child_process');
  const hookPath = path.join(__dirname, '..', 'edit-guard-hook.cjs');
  const res = spawnSync(process.execPath, [hookPath], {
    input: 'not-valid-json{{',
    encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /permissionDecision":"deny"/);
  assert.match(res.stdout, /failing closed/);
});

test('fix#4: shouldBlock com file_path relativo ancora em pipelineDir', () => {
  const tmp = setupFixture(true);
  // 'foo.py' relativo: deve ser resolvido contra tmp, ficar fora de .pipeline/ → bloquear
  const result = shouldBlock('foo.py', tmp);
  assert.strictEqual(result.block, true);
  // '.pipeline/docs/x.md' relativo: resolve para dentro de .pipeline/ → permitir
  const allowed = shouldBlock('.pipeline/docs/x.md', tmp);
  assert.strictEqual(allowed.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('fix#5: Windows trata .PIPELINE e .pipeline como mesmo diretório', () => {
  if (process.platform !== 'win32') return;
  const tmp = setupFixture(true);
  const result = shouldBlock(path.join(tmp, '.PIPELINE', 'docs', 'x.md'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('fix#6: lock com session_id inválido (path traversal) é ignorado', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'bad.lock'),
    JSON.stringify({ session_id: '../../etc', status: 'active', expires_at: Date.now() + 3600_000 })
  );
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('fix#6: lock com expires_at não-numérico é ignorado', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'bad.lock'),
    JSON.stringify({ session_id: 'sess-ok', status: 'active', expires_at: 'not-a-number' })
  );
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});
