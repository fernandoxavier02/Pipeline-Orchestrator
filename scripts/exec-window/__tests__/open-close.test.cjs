// scripts/exec-window/__tests__/open-close.test.cjs
//
// Verifies that the open.cjs / close.cjs wrappers produce exec-windows that
// the live edit-guard-hook accepts. This is the regression net for the v4.5
// fix that replaced the LLM-driven 3-step ritual with a deterministic call.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OPEN = path.join(REPO_ROOT, 'scripts', 'exec-window', 'open.cjs');
const CLOSE = path.join(REPO_ROOT, 'scripts', 'exec-window', 'close.cjs');
const { getActiveExecWindow } = require(
  path.join(REPO_ROOT, '.claude', 'hooks', 'edit-guard-hook.cjs')
);

function setupPipelineDir(sessionId) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const sessions = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(
    path.join(sessions, `${sessionId}.lock`),
    JSON.stringify({
      session_id: sessionId,
      status: 'active',
      created_at: Date.now(),
      expires_at: Date.now() + 3_600_000,
    })
  );
  // openExecWindow's audit append requires an active Pre-*-action subfolder.
  const preDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Test-action', '2026-05-01-fix-bug');
  fs.mkdirSync(preDir, { recursive: true });
  fs.writeFileSync(path.join(preDir, 'gate-decisions.jsonl'), '');
  return { tmp, preDir };
}

function runScript(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

test('open.cjs: writes window file, appends audit, and is accepted by edit-guard-hook', () => {
  const sid = 'sess-fix-1';
  const { tmp, preDir } = setupPipelineDir(sid);
  const r = runScript(
    OPEN,
    [sid, 'pipeline-orchestrator:executor:executor-implementer-task', 'apply task 1.2', '5'],
    tmp
  );
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout.trim());
  assert.strictEqual(out.session_id, sid);

  const winPath = path.join(tmp, '.pipeline', 'sessions', `${sid}.exec-window`);
  assert.ok(fs.existsSync(winPath), 'exec-window file should exist');

  const audit = fs
    .readFileSync(path.join(preDir, 'gate-decisions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
  const opens = audit.filter((e) => e.gate === 'EXEC_WINDOW_OPEN' && e.session_id === sid);
  assert.strictEqual(opens.length, 1, 'exactly one EXEC_WINDOW_OPEN audit line should be appended');

  // The crucial regression check — the hook itself must accept the wrapper-written window.
  const win = getActiveExecWindow(tmp, sid);
  assert.ok(win, 'getActiveExecWindow should accept the window written by open.cjs');

  fs.rmSync(tmp, { recursive: true });
});

test('open.cjs: refuses orphan window when no active lock matches the session', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const r = runScript(
    OPEN,
    ['sess-orphan', 'pipeline-orchestrator:executor:executor-implementer-task', 'x', '5'],
    tmp
  );
  assert.notStrictEqual(r.status, 0, 'open.cjs without a matching lock must fail');
  assert.match(r.stderr, /no active lock/i);
  fs.rmSync(tmp, { recursive: true });
});

test('open.cjs: rejects ttl_minutes above the 60-minute hard cap', () => {
  const sid = 'sess-fix-ttl';
  const { tmp } = setupPipelineDir(sid);
  const r = runScript(
    OPEN,
    [sid, 'pipeline-orchestrator:executor:executor-implementer-task', 'x', '120'],
    tmp
  );
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /ttl_minutes/i);
  fs.rmSync(tmp, { recursive: true });
});

test('open.cjs: rejects negative or zero ttl_minutes', () => {
  const sid = 'sess-fix-ttl-neg';
  const { tmp } = setupPipelineDir(sid);
  const r = runScript(
    OPEN,
    [sid, 'pipeline-orchestrator:executor:executor-implementer-task', 'x', '0'],
    tmp
  );
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /ttl_minutes/i);
  fs.rmSync(tmp, { recursive: true });
});

test('open.cjs: usage error when required args are missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const r = runScript(OPEN, [], tmp);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /usage:/i);
  fs.rmSync(tmp, { recursive: true });
});

test('close.cjs: deletes window and appends EXEC_WINDOW_CLOSE audit', () => {
  const sid = 'sess-fix-2';
  const { tmp, preDir } = setupPipelineDir(sid);
  const r1 = runScript(OPEN, [sid, 'pipeline-orchestrator:executor:executor-fix', 'fix', '5'], tmp);
  assert.strictEqual(r1.status, 0, r1.stderr);

  const r2 = runScript(CLOSE, [sid], tmp);
  assert.strictEqual(r2.status, 0, r2.stderr);
  const out = JSON.parse(r2.stdout.trim());
  assert.strictEqual(out.existed, true);

  assert.ok(
    !fs.existsSync(path.join(tmp, '.pipeline', 'sessions', `${sid}.exec-window`)),
    'exec-window file should be removed after close'
  );
  const audit = fs
    .readFileSync(path.join(preDir, 'gate-decisions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
  const closes = audit.filter((e) => e.gate === 'EXEC_WINDOW_CLOSE' && e.session_id === sid);
  assert.strictEqual(closes.length, 1);

  fs.rmSync(tmp, { recursive: true });
});

test('close.cjs: idempotent — exits 0 with existed=false when no window present', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const r = runScript(CLOSE, ['sess-noop'], tmp);
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim());
  assert.strictEqual(out.existed, false);
  fs.rmSync(tmp, { recursive: true });
});

test('close.cjs: usage error when session_id is missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'execwin-'));
  const r = runScript(CLOSE, [], tmp);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /usage:/i);
  fs.rmSync(tmp, { recursive: true });
});
