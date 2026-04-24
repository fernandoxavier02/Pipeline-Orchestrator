// .claude/hooks/__tests__/session-cleanup-hook.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { handleStop } = require('../session-cleanup-hook.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-'));
}

function writeLock(tmp, sessionId, extra = {}) {
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const lockPath = path.join(sessionsDir, `${sessionId}.lock`);
  const lock = Object.assign(
    {
      session_id: sessionId,
      created_at: Date.now(),
      expires_at: Date.now() + 3600_000,
      status: 'active',
    },
    extra
  );
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  return lockPath;
}

function readLock(lockPath) {
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

test('handleStop: marca status=completed para lock do session atual', () => {
  const tmp = mkTmp();
  const lockPath = writeLock(tmp, 'sess-current');
  handleStop({ session_id: 'sess-current', cwd: tmp });
  const lock = readLock(lockPath);
  assert.strictEqual(lock.status, 'completed');
  fs.rmSync(tmp, { recursive: true });
});

test('handleStop: não modifica locks de OUTROS sessions', () => {
  const tmp = mkTmp();
  const lockA = writeLock(tmp, 'sess-A');
  const lockB = writeLock(tmp, 'sess-B');
  handleStop({ session_id: 'sess-A', cwd: tmp });
  assert.strictEqual(readLock(lockA).status, 'completed');
  assert.strictEqual(readLock(lockB).status, 'active');
  fs.rmSync(tmp, { recursive: true });
});

test('handleStop: idempotente — chamar 2x não quebra', () => {
  const tmp = mkTmp();
  const lockPath = writeLock(tmp, 'sess-id');
  handleStop({ session_id: 'sess-id', cwd: tmp });
  // segunda chamada não deve lançar
  assert.doesNotThrow(() => handleStop({ session_id: 'sess-id', cwd: tmp }));
  assert.strictEqual(readLock(lockPath).status, 'completed');
  fs.rmSync(tmp, { recursive: true });
});

test('handleStop: noop se lock não existe', () => {
  const tmp = mkTmp();
  // sem nenhum lock criado
  assert.doesNotThrow(() => handleStop({ session_id: 'nao-existe', cwd: tmp }));
  fs.rmSync(tmp, { recursive: true });
});

test('handleStop: noop se sessions dir não existe', () => {
  const tmp = mkTmp();
  assert.doesNotThrow(() => handleStop({ session_id: 'x', cwd: tmp }));
  fs.rmSync(tmp, { recursive: true });
});

test('handleStop: payload inválido não quebra (fail-safe)', () => {
  assert.doesNotThrow(() => handleStop({}));
  assert.doesNotThrow(() => handleStop(null));
  assert.doesNotThrow(() => handleStop({ session_id: 123, cwd: '/tmp' }));
});
