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
  assert.strictEqual(isValidSessionId('..'), false);
  assert.strictEqual(isValidSessionId('.hidden'), false);
  assert.strictEqual(isValidSessionId('-flag'), false);
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

test('createLock: intermediate .tmp file does not persist after success (atomic write contract)', () => {
  // NOTE: This is a contract/regression test. Atomic-write correctness (rename
  // from .tmp) cannot be fully verified from user space without instrumenting fs.
  // This test pins the observable contract: no leftover .tmp after successful write.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
  createLock(tmp, 'sess-atomic', { ttl_hours: 1 });
  const sessionsDir = path.join(tmp, 'sessions');
  const files = fs.readdirSync(sessionsDir);
  assert.ok(files.includes('sess-atomic.lock'), 'final lock file must exist');
  const leftovers = files.filter((f) => f.endsWith('.tmp'));
  assert.strictEqual(leftovers.length, 0, `no leftover .tmp files, got: ${files.join(',')}`);
  // Content must be complete valid JSON (not truncated)
  const content = fs.readFileSync(path.join(sessionsDir, 'sess-atomic.lock'), 'utf8');
  const parsed = JSON.parse(content);
  assert.strictEqual(parsed.session_id, 'sess-atomic');
  fs.rmSync(tmp, { recursive: true });
});

// ============================================================================
// Heartbeat + stale-GC self-healing (root fix for orphan locks across crashes)
// ============================================================================

const { refreshHeartbeatAndGC, STALE_THRESHOLD_MS } = require('../session-lock-hook.cjs');

test('createLock: includes last_seen_at field equal to created_at', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const lock = createLock(tmp, 'sess-hb', { ttl_hours: 1 });
  assert.strictEqual(typeof lock.last_seen_at, 'number');
  assert.strictEqual(lock.last_seen_at, lock.created_at);
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: noop when sessions dir does not exist (does not create it)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  const result = refreshHeartbeatAndGC(baseDir, 'sess-any');
  assert.deepStrictEqual(result, { refreshed: 0, stale_marked: 0 });
  assert.ok(!fs.existsSync(path.join(baseDir, 'sessions')));
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: refreshes own session lock and bumps last_seen_at', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
  const oldStamp = Date.now() - 5 * 60 * 1000; // 5 min old
  fs.writeFileSync(
    path.join(baseDir, 'sessions', 'sess-mine.lock'),
    JSON.stringify({
      session_id: 'sess-mine',
      created_at: oldStamp,
      last_seen_at: oldStamp,
      expires_at: oldStamp + 2 * 3600 * 1000,
      status: 'active',
    })
  );
  const result = refreshHeartbeatAndGC(baseDir, 'sess-mine');
  assert.strictEqual(result.refreshed, 1);
  assert.strictEqual(result.stale_marked, 0);
  const updated = JSON.parse(fs.readFileSync(path.join(baseDir, 'sessions', 'sess-mine.lock'), 'utf8'));
  assert.ok(updated.last_seen_at > oldStamp, 'last_seen_at should be bumped');
  assert.strictEqual(updated.status, 'active');
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: marks foreign lock as completed when heartbeat is stale', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
  const staleStamp = Date.now() - (STALE_THRESHOLD_MS + 60_000); // 1 min past threshold
  fs.writeFileSync(
    path.join(baseDir, 'sessions', 'sess-dead.lock'),
    JSON.stringify({
      session_id: 'sess-dead',
      created_at: staleStamp,
      last_seen_at: staleStamp,
      expires_at: staleStamp + 2 * 3600 * 1000, // still within TTL
      status: 'active',
    })
  );
  const result = refreshHeartbeatAndGC(baseDir, 'sess-other');
  assert.strictEqual(result.stale_marked, 1);
  const updated = JSON.parse(fs.readFileSync(path.join(baseDir, 'sessions', 'sess-dead.lock'), 'utf8'));
  assert.strictEqual(updated.status, 'completed');
  assert.strictEqual(updated.completed_reason, 'stale_heartbeat');
  assert.strictEqual(typeof updated.completed_at, 'number');
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: leaves foreign lock alone when heartbeat is fresh (concurrent session)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
  const freshStamp = Date.now() - 60_000; // 1 min ago, well under threshold
  fs.writeFileSync(
    path.join(baseDir, 'sessions', 'sess-live.lock'),
    JSON.stringify({
      session_id: 'sess-live',
      created_at: freshStamp,
      last_seen_at: freshStamp,
      expires_at: freshStamp + 2 * 3600 * 1000,
      status: 'active',
    })
  );
  const result = refreshHeartbeatAndGC(baseDir, 'sess-other');
  assert.strictEqual(result.stale_marked, 0);
  const updated = JSON.parse(fs.readFileSync(path.join(baseDir, 'sessions', 'sess-live.lock'), 'utf8'));
  assert.strictEqual(updated.status, 'active');
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: legacy foreign lock without last_seen_at is left alone (backwards compat)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, 'sessions', 'sess-legacy.lock'),
    JSON.stringify({
      session_id: 'sess-legacy',
      created_at: Date.now() - 30 * 60 * 1000, // 30 min old, would be stale if we used created_at
      expires_at: Date.now() + 60 * 60 * 1000,
      status: 'active',
      // intentionally no last_seen_at — pre-patch lock format
    })
  );
  const result = refreshHeartbeatAndGC(baseDir, 'sess-other');
  assert.strictEqual(result.stale_marked, 0);
  const updated = JSON.parse(fs.readFileSync(path.join(baseDir, 'sessions', 'sess-legacy.lock'), 'utf8'));
  assert.strictEqual(updated.status, 'active', 'legacy locks must keep relying on expires_at + Stop hook');
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: ignores already-completed locks', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, 'sessions', 'sess-done.lock'),
    JSON.stringify({
      session_id: 'sess-done',
      created_at: Date.now() - 5000,
      last_seen_at: Date.now() - 5000,
      expires_at: Date.now() + 3600_000,
      status: 'completed',
      completed_at: Date.now() - 1000,
    })
  );
  const result = refreshHeartbeatAndGC(baseDir, 'sess-done');
  assert.strictEqual(result.refreshed, 0);
  assert.strictEqual(result.stale_marked, 0);
  fs.rmSync(tmp, { recursive: true });
});

test('refreshHeartbeatAndGC: skips malformed lock files without throwing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  const baseDir = path.join(tmp, '.pipeline');
  fs.mkdirSync(path.join(baseDir, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'sessions', 'broken.lock'), 'not-json{{{');
  fs.writeFileSync(path.join(baseDir, 'sessions', 'sess-x.lock'), JSON.stringify({
    session_id: 'sess-x',
    created_at: Date.now(),
    last_seen_at: Date.now() - 60_000,
    expires_at: Date.now() + 3600_000,
    status: 'active',
  }));
  const result = refreshHeartbeatAndGC(baseDir, 'sess-x');
  assert.strictEqual(result.refreshed, 1);
  fs.rmSync(tmp, { recursive: true });
});

test('handleUserPromptSubmit: refreshes existing own-session lock even on non-pipeline prompt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-hb-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const oldStamp = Date.now() - 3 * 60 * 1000;
  fs.writeFileSync(path.join(sessionsDir, 'sess-keepalive.lock'), JSON.stringify({
    session_id: 'sess-keepalive',
    created_at: oldStamp,
    last_seen_at: oldStamp,
    expires_at: oldStamp + 2 * 3600 * 1000,
    status: 'active',
  }));
  const result = handleUserPromptSubmit({
    prompt: 'just a normal message',
    session_id: 'sess-keepalive',
    cwd: tmp,
  });
  assert.strictEqual(result.action, 'noop');
  const updated = JSON.parse(fs.readFileSync(path.join(sessionsDir, 'sess-keepalive.lock'), 'utf8'));
  assert.ok(updated.last_seen_at > oldStamp, 'heartbeat should be refreshed by every prompt');
  fs.rmSync(tmp, { recursive: true });
});

test('handleUserPromptSubmit: stale foreign lock is reaped on any prompt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-gc-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const staleStamp = Date.now() - (STALE_THRESHOLD_MS + 60_000);
  fs.writeFileSync(path.join(sessionsDir, 'sess-orphan.lock'), JSON.stringify({
    session_id: 'sess-orphan',
    created_at: staleStamp,
    last_seen_at: staleStamp,
    expires_at: staleStamp + 2 * 3600 * 1000,
    status: 'active',
  }));
  handleUserPromptSubmit({
    prompt: 'continue work on something else',
    session_id: 'sess-newer',
    cwd: tmp,
  });
  const updated = JSON.parse(fs.readFileSync(path.join(sessionsDir, 'sess-orphan.lock'), 'utf8'));
  assert.strictEqual(updated.status, 'completed');
  assert.strictEqual(updated.completed_reason, 'stale_heartbeat');
  fs.rmSync(tmp, { recursive: true });
});
