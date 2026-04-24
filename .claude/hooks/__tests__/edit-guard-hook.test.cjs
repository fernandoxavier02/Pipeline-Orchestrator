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
  // F-002 (Group C): replaced hard "wait for TTL (2h)" with softer Stop-hook cleanup language
  assert.match(msg, /Stop hook|Claude Code stops|automatically/i);
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

test('handlePreToolUse: bloqueia MultiEdit fora de .pipeline/ com lock ativo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-m.lock'),
    JSON.stringify({ session_id: 'sess-m', status: 'active', expires_at: Date.now() + 3600_000 })
  );
  const result = handlePreToolUse({
    tool_name: 'MultiEdit',
    tool_input: { file_path: path.join(tmp, 'src/baz.py') },
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

// --- Adversarial fix F-002 (Group C) ---

test('getActiveLock: retorna o lock com created_at mais recente', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  // Name "aaa-*" sorts first alphabetically but is OLDER — naive readdir order would pick this
  fs.writeFileSync(
    path.join(sessionsDir, 'aaa-old.lock'),
    JSON.stringify({
      session_id: 'aaa-old',
      status: 'active',
      created_at: now - 10_000,
      expires_at: now + 3600_000,
    })
  );
  // Name "zzz-*" sorts last alphabetically but is NEWER — should be returned
  fs.writeFileSync(
    path.join(sessionsDir, 'zzz-new.lock'),
    JSON.stringify({
      session_id: 'zzz-new',
      status: 'active',
      created_at: now - 1_000,
      expires_at: now + 3600_000,
    })
  );
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true);
  assert.strictEqual(result.lock.session_id, 'zzz-new');
  fs.rmSync(tmp, { recursive: true });
});

test('getActiveLock: ignora locks expirados mesmo se mais recentes que ativos', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  // Expired but newer created_at
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-expired-new.lock'),
    JSON.stringify({
      session_id: 'sess-expired-new',
      status: 'active',
      created_at: now - 1_000,
      expires_at: now - 500,
    })
  );
  // Active but older created_at
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-active-old.lock'),
    JSON.stringify({
      session_id: 'sess-active-old',
      status: 'active',
      created_at: now - 10_000,
      expires_at: now + 3600_000,
    })
  );
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true);
  assert.strictEqual(result.lock.session_id, 'sess-active-old');
  fs.rmSync(tmp, { recursive: true });
});

test('buildBlockMessage: sugere /pipeline continue antes de delete manual', () => {
  const msg = buildBlockMessage('src/foo.py', 'sess-xyz');
  // "/pipeline-orchestrator:pipeline continue" deve aparecer antes de "delete"
  const idxContinue = msg.indexOf('/pipeline-orchestrator:pipeline continue');
  const idxDelete = msg.toLowerCase().indexOf('delete');
  assert.ok(idxContinue >= 0, 'should mention /pipeline-orchestrator:pipeline continue');
  assert.ok(idxDelete >= 0, 'should still mention manual delete as last resort');
  assert.ok(idxContinue < idxDelete, '/pipeline continue should appear BEFORE delete');
});

test('buildBlockMessage: menciona Stop hook como mecanismo de cleanup', () => {
  const msg = buildBlockMessage('src/foo.py', 'sess-xyz');
  assert.match(msg, /Stop hook|Claude Code stops|automatically/i);
});

// --- Adversarial fix F-001 (Group D): exec-window cooperative authorization ---

test('exec-window: allows Edit outside .pipeline/ when exec-window file exists and is active', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  // Active lock
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.lock'),
    JSON.stringify({ session_id: 'sess-1', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  // Active exec-window
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.exec-window'),
    JSON.stringify({ session_id: 'sess-1', opened_at: Date.now(), expires_at: Date.now() + 1800_000, purpose: 'test', spawning_agent: 'pipeline-controller' }));
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, false);
  fs.rmSync(tmp, { recursive: true });
});

test('exec-window: expired exec-window is IGNORED, edit still blocked', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.lock'),
    JSON.stringify({ session_id: 'sess-1', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.exec-window'),
    JSON.stringify({ session_id: 'sess-1', opened_at: Date.now() - 7200_000, expires_at: Date.now() - 1000, purpose: 'test' }));
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true);
  fs.rmSync(tmp, { recursive: true });
});

test('exec-window: malformed exec-window (non-JSON) is IGNORED, edit blocked', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.lock'),
    JSON.stringify({ session_id: 'sess-1', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.exec-window'), 'not json {{{');
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true);
  fs.rmSync(tmp, { recursive: true });
});

test('exec-window: only allows edit for session_id matching the lock (no cross-session escalation)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  // Lock for sess-A
  fs.writeFileSync(path.join(sessionsDir, 'sess-A.lock'),
    JSON.stringify({ session_id: 'sess-A', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  // Exec-window for DIFFERENT session sess-B
  fs.writeFileSync(path.join(sessionsDir, 'sess-B.exec-window'),
    JSON.stringify({ session_id: 'sess-B', opened_at: Date.now(), expires_at: Date.now() + 1800_000 }));
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true, 'cross-session exec-window MUST NOT authorize');
  fs.rmSync(tmp, { recursive: true });
});

test('exec-window: session_id with invalid regex is IGNORED (no filename injection)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sess-1.lock'),
    JSON.stringify({ session_id: 'sess-1', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  fs.writeFileSync(path.join(sessionsDir, '..traversal.exec-window'),
    JSON.stringify({ session_id: '..traversal', opened_at: Date.now(), expires_at: Date.now() + 1800_000 }));
  const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
  assert.strictEqual(result.block, true);
  fs.rmSync(tmp, { recursive: true });
});

// --- NI-5 lifecycle tests (v4.1) ---

const { openExecWindow, closeExecWindow } = require('../edit-guard-hook.cjs');

// Helper for NI-5 tests: create tmp pipelineDir with valid active lock for sessionId
function setupValidLock(sessionId) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'withlock-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, `${sessionId}.lock`),
    JSON.stringify({
      session_id: sessionId,
      status: 'active',
      created_at: Date.now(),
      expires_at: Date.now() + 3600_000,
    })
  );
  return tmp;
}


test('NI-5 lifecycle: no window -> edit blocked; open -> allowed; close -> blocked again', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  // Setup: active lock
  fs.writeFileSync(path.join(sessionsDir, 'sess-L.lock'),
    JSON.stringify({ session_id: 'sess-L', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  const target = path.join(tmp, 'src', 'foo.py');

  // Stage 1: no window -> blocked
  assert.strictEqual(shouldBlock(target, tmp).block, true, 'stage 1: no window, expect blocked');

  // Stage 2: open -> allowed
  openExecWindow(tmp, 'sess-L', { purpose: 'test-n2', spawning_agent: 'executor-implementer-task' });
  assert.ok(fs.existsSync(path.join(sessionsDir, 'sess-L.exec-window')), 'window file created');
  assert.strictEqual(shouldBlock(target, tmp).block, false, 'stage 2: window open, expect allowed');

  // Stage 3: close -> blocked again
  const deleted = closeExecWindow(tmp, 'sess-L');
  assert.strictEqual(deleted, true, 'close returned true');
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'sess-L.exec-window')), 'window file removed');
  assert.strictEqual(shouldBlock(target, tmp).block, true, 'stage 3: window closed, expect blocked');

  fs.rmSync(tmp, { recursive: true });
});

test('NI-5 openExecWindow: rejeita session_id invalido', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-'));
  assert.throws(() => openExecWindow(tmp, '../../../etc/passwd'), /invalid session_id/);
  fs.rmSync(tmp, { recursive: true });
});

test('NI-5 closeExecWindow: idempotente (retorna false quando window nao existe)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-'));
  assert.strictEqual(closeExecWindow(tmp, 'sess-none'), false);
  fs.rmSync(tmp, { recursive: true });
});

test('NI-5 openExecWindow: TTL e positivo e honra ttl_minutes quando passado', () => {
  const tmp = setupValidLock('sess-ttl-check');
  const win1 = openExecWindow(tmp, 'sess-ttl-check', { ttl_minutes: 7 });
  assert.strictEqual(win1.expires_at - win1.opened_at, 7 * 60 * 1000, 'explicit 7min honored');
  closeExecWindow(tmp, 'sess-ttl-check');
  const win2 = openExecWindow(tmp, 'sess-ttl-check');
  assert.ok(win2.expires_at > win2.opened_at, 'default TTL is positive');
  fs.rmSync(tmp, { recursive: true });
});

// --- NI-5 adversarial fix pass 1 (v4.1 Batch 1 fix) RED tests ---

test('NI-5 openExecWindow: rejeita se nao ha lock ativo para o sessionId', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nolock-'));
  assert.throws(() => openExecWindow(tmp, 'sess-orphan'), /no active lock/);
  fs.rmSync(tmp, { recursive: true });
});

test('NI-5 openExecWindow: rejeita se lock existe mas e de OUTRO sessionId', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wronglock-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-A.lock'),
    JSON.stringify({
      session_id: 'sess-A',
      status: 'active',
      created_at: Date.now(),
      expires_at: Date.now() + 3600_000,
    })
  );
  assert.throws(() => openExecWindow(tmp, 'sess-B'), /no active lock/);
  fs.rmSync(tmp, { recursive: true });
});

test('NI-5 openExecWindow: rejeita ttl_minutes <= 0', () => {
  const tmp = setupValidLock('sess-ttl-neg');
  assert.throws(
    () => openExecWindow(tmp, 'sess-ttl-neg', { ttl_minutes: 0 }),
    /ttl_minutes must be > 0/
  );
  assert.throws(
    () => openExecWindow(tmp, 'sess-ttl-neg', { ttl_minutes: -5 }),
    /ttl_minutes must be > 0/
  );
  fs.rmSync(tmp, { recursive: true });
});

test('NI-5 openExecWindow: nao deixa .tmp leftover apos sucesso', () => {
  const tmp = setupValidLock('sess-atomic');
  openExecWindow(tmp, 'sess-atomic');
  const files = fs.readdirSync(path.join(tmp, '.pipeline', 'sessions'));
  const tmps = files.filter((f) => f.endsWith('.tmp'));
  assert.strictEqual(tmps.length, 0, `expected no .tmp files, got: ${tmps.join(',')}`);
  fs.rmSync(tmp, { recursive: true });
});

// --- NI-4 TTL formalization (v4.1) ---------------------------------

test('NI-4 openExecWindow: rejeita ttl_minutes > MAX_TTL_MINUTES (60)', () => {
  const tmp = setupValidLock('sess-ttl-max');
  assert.throws(() => openExecWindow(tmp, 'sess-ttl-max', { ttl_minutes: 61 }),
    /ttl_minutes must be <= 60/);
  assert.throws(() => openExecWindow(tmp, 'sess-ttl-max', { ttl_minutes: 1440 }),
    /ttl_minutes must be <= 60/);
  fs.rmSync(tmp, { recursive: true });
});

test('NI-4 openExecWindow: aceita ttl_minutes exatamente igual a 60', () => {
  const tmp = setupValidLock('sess-ttl-max-ok');
  const win = openExecWindow(tmp, 'sess-ttl-max-ok', { ttl_minutes: 60 });
  assert.strictEqual(win.expires_at - win.opened_at, 60 * 60 * 1000);
  fs.rmSync(tmp, { recursive: true });
});

test('NI-4 getActiveExecWindow: ignora window escrito com expires_at > 60min alem de opened_at', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttl-raw-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sess-L.lock'),
    JSON.stringify({ session_id: 'sess-L', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  const opened = Date.now();
  fs.writeFileSync(path.join(sessionsDir, 'sess-L.exec-window'),
    JSON.stringify({ session_id: 'sess-L', opened_at: opened, expires_at: opened + 120 * 60 * 1000 }));
  const target = path.join(tmp, 'src/foo.py');
  assert.strictEqual(shouldBlock(target, tmp).block, true,
    'window with TTL > 60min must not authorize');
  fs.rmSync(tmp, { recursive: true });
});

test('NI-4 getActiveExecWindow: ignora window com opened_at no futuro (pre-armed)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'future-open-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sess-F.lock'),
    JSON.stringify({ session_id: 'sess-F', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  const now = Date.now();
  // TTL = 20min (valid), but opened_at is 30min in the future (pre-armed window)
  fs.writeFileSync(path.join(sessionsDir, 'sess-F.exec-window'),
    JSON.stringify({ session_id: 'sess-F', opened_at: now + 30 * 60_000, expires_at: now + 50 * 60_000 }));
  assert.strictEqual(shouldBlock(path.join(tmp, 'src/foo.py'), tmp).block, true,
    'pre-armed window (opened_at > now) must not authorize');
  fs.rmSync(tmp, { recursive: true });
});

test('NI-4 getActiveExecWindow: ignora window legacy sem opened_at', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sess-L2.lock'),
    JSON.stringify({ session_id: 'sess-L2', status: 'active', created_at: Date.now(), expires_at: Date.now() + 3600_000 }));
  // Window missing opened_at entirely
  fs.writeFileSync(path.join(sessionsDir, 'sess-L2.exec-window'),
    JSON.stringify({ session_id: 'sess-L2', expires_at: Date.now() + 10 * 60_000 }));
  assert.strictEqual(shouldBlock(path.join(tmp, 'src/foo.py'), tmp).block, true,
    'legacy window without opened_at must not authorize');
  fs.rmSync(tmp, { recursive: true });
});

test('NI-4 openExecWindow: rejeita NaN / Infinity em ttl_minutes', () => {
  const tmp = setupValidLock('sess-nan');
  assert.throws(() => openExecWindow(tmp, 'sess-nan', { ttl_minutes: NaN }), /finite number/);
  assert.throws(() => openExecWindow(tmp, 'sess-nan', { ttl_minutes: Infinity }), /finite number/);
  assert.throws(() => openExecWindow(tmp, 'sess-nan', { ttl_minutes: -Infinity }), /finite number/);
  fs.rmSync(tmp, { recursive: true });
});
