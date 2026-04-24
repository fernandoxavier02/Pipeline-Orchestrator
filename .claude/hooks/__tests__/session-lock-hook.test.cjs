// .claude/hooks/__tests__/session-lock-hook.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { detectPipelineInvocation, createLock } = require('../session-lock-hook.cjs');

test('detectPipelineInvocation: match exato do slash', () => {
  assert.strictEqual(detectPipelineInvocation('/pipeline-orchestrator:pipeline implement foo'), true);
});

test('detectPipelineInvocation: match sem args', () => {
  assert.strictEqual(detectPipelineInvocation('/pipeline-orchestrator:pipeline'), true);
});

test('detectPipelineInvocation: NÃO match em texto corrido', () => {
  assert.strictEqual(detectPipelineInvocation('my pipeline broke yesterday'), false);
});

test('detectPipelineInvocation: NÃO match em slash não-pipeline', () => {
  assert.strictEqual(detectPipelineInvocation('/pipeline-orchestrator:review-only'), false);
});

test('detectPipelineInvocation: string vazia retorna false', () => {
  assert.strictEqual(detectPipelineInvocation(''), false);
});

test('detectPipelineInvocation: null/undefined retorna false', () => {
  assert.strictEqual(detectPipelineInvocation(null), false);
  assert.strictEqual(detectPipelineInvocation(undefined), false);
});

test('createLock: escreve arquivo JSON com TTL correto', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-lock-'));
  const lock = createLock(tmp, 'session-abc', { ttl_hours: 2 });
  assert.ok(lock.created_at);
  assert.strictEqual(lock.expires_at - lock.created_at, 2 * 3600 * 1000);
  assert.ok(fs.existsSync(path.join(tmp, 'sessions', 'session-abc.lock')));
  fs.rmSync(tmp, { recursive: true });
});

test('createLock: sobrescreve lock existente do mesmo session', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-lock-'));
  createLock(tmp, 'session-abc', { ttl_hours: 1 });
  const lock2 = createLock(tmp, 'session-abc', { ttl_hours: 3 });
  assert.strictEqual(lock2.expires_at - lock2.created_at, 3 * 3600 * 1000);
  fs.rmSync(tmp, { recursive: true });
});

const { handleUserPromptSubmit } = require('../session-lock-hook.cjs');

test('handleUserPromptSubmit: cria lock quando /pipeline detectado', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-'));
  const result = handleUserPromptSubmit({
    prompt: '/pipeline-orchestrator:pipeline foo',
    session_id: 'sess-xyz',
    cwd: tmp,
  });
  assert.strictEqual(result.action, 'lock_created');
  assert.ok(fs.existsSync(path.join(tmp, '.pipeline', 'sessions', 'sess-xyz.lock')));
  fs.rmSync(tmp, { recursive: true });
});

test('handleUserPromptSubmit: noop quando texto não é /pipeline', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-'));
  const result = handleUserPromptSubmit({
    prompt: 'hello world',
    session_id: 'sess-xyz',
    cwd: tmp,
  });
  assert.strictEqual(result.action, 'noop');
  assert.ok(!fs.existsSync(path.join(tmp, '.pipeline', 'sessions')));
  fs.rmSync(tmp, { recursive: true });
});

const { isValidSessionId } = require('../session-lock-hook.cjs');

test('isValidSessionId: rejeita path traversal', () => {
  assert.strictEqual(isValidSessionId('../../etc/passwd'), false);
  assert.strictEqual(isValidSessionId('..\\..\\win\\evil'), false);
  assert.strictEqual(isValidSessionId('sess/sub'), false);
  assert.strictEqual(isValidSessionId(''), false);
  assert.strictEqual(isValidSessionId(null), false);
  assert.strictEqual(isValidSessionId('a'.repeat(65)), false);
});

test('isValidSessionId: aceita IDs válidos', () => {
  assert.strictEqual(isValidSessionId('sess-abc-123'), true);
  assert.strictEqual(isValidSessionId('UUID_v4.0'), true);
  assert.strictEqual(isValidSessionId('a'), true);
});

test('handleUserPromptSubmit: noop quando payload malformado', () => {
  assert.deepStrictEqual(handleUserPromptSubmit(null), { action: 'noop', reason: 'invalid_payload' });
  assert.deepStrictEqual(handleUserPromptSubmit({}), { action: 'noop', reason: 'invalid_payload' });
  assert.deepStrictEqual(
    handleUserPromptSubmit({ prompt: '/pipeline-orchestrator:pipeline x', session_id: '../evil', cwd: '/tmp' }),
    { action: 'noop', reason: 'invalid_session_id' }
  );
});

test('createLock: lança erro em session_id inválido', () => {
  assert.throws(() => createLock('/tmp/x', '../../etc/passwd'), /invalid session_id/);
});
