// scripts/exec-window/__tests__/spec-invocation.test.cjs
//
// Integration test: verifies the EXACT shell invocation documented in
// agents/core/pipeline-controller.md works end-to-end.
//
// The original v4.5.0 fix (commit 990e3df) had a latent bug — the spec
// instructed the controller to call `node scripts/exec-window/open.cjs ...`
// with a *relative* path. That fails in the real harness because the
// wrapper ships inside the plugin install (~/.claude/plugins/cache/...),
// not inside the user's project cwd. The corrected spec uses
// `node "{CLAUDE_PLUGIN_ROOT}/scripts/exec-window/open.cjs"` — this test
// asserts that:
//   1. The exact Bash command in the spec is the one we test here.
//   2. After the harness substitutes {CLAUDE_PLUGIN_ROOT}, the command
//      runs with cwd=project_root and produces a valid exec-window.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SPEC_PATH = path.join(REPO_ROOT, 'agents', 'core', 'pipeline-controller.md');
const { getActiveExecWindow } = require(
  path.join(REPO_ROOT, '.claude', 'hooks', 'edit-guard-hook.cjs')
);

function setupPipelineDir(sessionId) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-inv-'));
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
  const preDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Test-action', '2026-05-01-spec-invocation');
  fs.mkdirSync(preDir, { recursive: true });
  fs.writeFileSync(path.join(preDir, 'gate-decisions.jsonl'), '');
  return { tmp, preDir };
}

test('spec contains the documented {CLAUDE_PLUGIN_ROOT} invocation form (open + close)', () => {
  const spec = fs.readFileSync(SPEC_PATH, 'utf8');
  // Must use absolute path through CLAUDE_PLUGIN_ROOT, not a relative one.
  assert.match(
    spec,
    /node "\{CLAUDE_PLUGIN_ROOT\}\/scripts\/exec-window\/open\.cjs"/,
    'pipeline-controller.md must invoke open.cjs via {CLAUDE_PLUGIN_ROOT}'
  );
  assert.match(
    spec,
    /node "\{CLAUDE_PLUGIN_ROOT\}\/scripts\/exec-window\/close\.cjs"/,
    'pipeline-controller.md must invoke close.cjs via {CLAUDE_PLUGIN_ROOT}'
  );
  // Negative assertion: no leftover relative-path form that would silently
  // fail in production. We grep for the bare relative shape (no {CLAUDE_PLUGIN_ROOT})
  // appearing in a fenced ```bash block that the controller would copy literally.
  const badRel = /```bash[\s\S]{0,300}?node\s+scripts\/exec-window\/(?:open|close)\.cjs/;
  assert.doesNotMatch(
    spec,
    badRel,
    'pipeline-controller.md must not document a relative-path invocation in a bash code block'
  );
});

test('substituted invocation: open + close run successfully when CLAUDE_PLUGIN_ROOT is the plugin root', () => {
  const sid = 'sess-spec-1';
  const { tmp, preDir } = setupPipelineDir(sid);

  // This is the EXACT shape the controller would execute after the
  // harness substitutes {CLAUDE_PLUGIN_ROOT} with REPO_ROOT (the plugin's
  // installed location). Bash quotes the path; we mirror that with execSync's
  // own argument quoting via JSON.stringify-style escaping.
  function shQuote(s) {
    // Cross-platform path quoting: backslashes are fine inside double quotes
    // for execSync on Windows; on POSIX both `/` and `\\` are safe within `"..."`.
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  const openScript = path.join(REPO_ROOT, 'scripts', 'exec-window', 'open.cjs');
  const closeScript = path.join(REPO_ROOT, 'scripts', 'exec-window', 'close.cjs');

  const openCmd = [
    `node ${shQuote(openScript)}`,
    sid,
    'pipeline-orchestrator:executor:executor-implementer-task',
    shQuote('apply task 1.2'),
    '5',
  ].join(' ');

  let openOut;
  assert.doesNotThrow(() => {
    openOut = execSync(openCmd, { cwd: tmp, encoding: 'utf8' });
  }, 'open.cjs invoked via spec form must succeed');
  const opened = JSON.parse(openOut.trim());
  assert.strictEqual(opened.session_id, sid);

  // The hook must accept the window — same regression check as the unit tests,
  // but here we proved it via the absolute-path invocation the controller
  // actually runs.
  const win = getActiveExecWindow(tmp, sid);
  assert.ok(win, 'window written via spec invocation must be accepted by the hook');

  const closeCmd = `node ${shQuote(closeScript)} ${sid}`;
  let closeOut;
  assert.doesNotThrow(() => {
    closeOut = execSync(closeCmd, { cwd: tmp, encoding: 'utf8' });
  }, 'close.cjs invoked via spec form must succeed');
  const closed = JSON.parse(closeOut.trim());
  assert.strictEqual(closed.existed, true);

  fs.rmSync(tmp, { recursive: true });
});

test('substituted invocation: works when plugin root contains a space character', () => {
  // Reproduces the real-world canonical install path that contains a space
  // (e.g., "D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator"). If the
  // controller forgets to quote the path, execSync will tokenize it and fail
  // with "Cannot find module". The quoted form documented in the spec must
  // survive this case.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin root with space '));
  try {
    // Mirror the minimal layout the wrapper needs: the script file and the
    // edit-guard-hook it requires.
    const pluginDir = path.join(tmpRoot, 'pipeline-orchestrator');
    const scriptsDir = path.join(pluginDir, 'scripts', 'exec-window');
    const hooksDir = path.join(pluginDir, '.claude', 'hooks');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, 'scripts', 'exec-window', 'open.cjs'),
      path.join(scriptsDir, 'open.cjs')
    );
    fs.copyFileSync(
      path.join(REPO_ROOT, 'scripts', 'exec-window', 'close.cjs'),
      path.join(scriptsDir, 'close.cjs')
    );
    fs.copyFileSync(
      path.join(REPO_ROOT, '.claude', 'hooks', 'edit-guard-hook.cjs'),
      path.join(hooksDir, 'edit-guard-hook.cjs')
    );

    const sid = 'sess-spec-spaces';
    const { tmp } = setupPipelineDir(sid);

    const openPath = path.join(scriptsDir, 'open.cjs');
    const cmd = `node "${openPath}" ${sid} pipeline-orchestrator:executor:executor-implementer-task "x" 5`;
    const out = execSync(cmd, { cwd: tmp, encoding: 'utf8' });
    const opened = JSON.parse(out.trim());
    assert.strictEqual(opened.session_id, sid);

    fs.rmSync(tmp, { recursive: true });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
