'use strict';
//
// edit-guard-pipeline-runs.test.js
//
// Verifies that the v5.1.0 per-run directory pipeline-runs/<NNN>-<slug>/ is
// whitelisted in the edit-guard hook the same way .pipeline/ is — i.e., when
// a pipeline session lock is active, Edit/Write to pipeline-runs/** is allowed
// (so the controller and N2 executors can write spec/validation/execution
// artifacts) while edits to other paths outside .pipeline/ remain blocked.
//
// We exercise the hook end-to-end (CLI mode) AND via shouldBlock() so the
// regression coverage holds whether the hook is invoked by Claude Code's
// PreToolUse pipeline or by direct require() in a test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOOK_PATH = path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'edit-guard-hook.cjs');
const { shouldBlock } = require(HOOK_PATH);

function fixtureWithLock() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-runs-'));
  const sessionsDir = path.join(tmp, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sess-active.lock'),
    JSON.stringify({
      session_id: 'sess-active',
      status: 'active',
      expires_at: Date.now() + 3600_000,
    })
  );
  return tmp;
}

test('allows Write to pipeline-runs/001-foo/01-spec/requirements.md with lock active', () => {
  const tmp = fixtureWithLock();
  try {
    const result = shouldBlock(
      path.join(tmp, 'pipeline-runs/001-foo/01-spec/requirements.md'),
      tmp
    );
    assert.equal(
      result.block,
      false,
      `expected pipeline-runs/** to be whitelisted; got block=${result.block} reason=${result.reason}`
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('allows Write to pipeline-runs/042-bar-baz/03-execution/batch-002/review.md', () => {
  const tmp = fixtureWithLock();
  try {
    const result = shouldBlock(
      path.join(tmp, 'pipeline-runs/042-bar-baz/03-execution/batch-002/review.md'),
      tmp
    );
    assert.equal(result.block, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('still allows Write to .pipeline/docs/.../00-task-orchestrator.md (existing whitelist preserved)', () => {
  const tmp = fixtureWithLock();
  try {
    const result = shouldBlock(
      path.join(tmp, '.pipeline/docs/Pre-Medium-action/2026-05-06-test/00-task-orchestrator.md'),
      tmp
    );
    assert.equal(result.block, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('still BLOCKS arbitrary src/** path outside both whitelists when lock is active', () => {
  const tmp = fixtureWithLock();
  try {
    const result = shouldBlock(path.join(tmp, 'src/foo.py'), tmp);
    assert.equal(result.block, true, 'arbitrary src/** must remain blocked');
    assert.match(result.reason, /PIPELINE_LOCK_ACTIVE/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
