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
