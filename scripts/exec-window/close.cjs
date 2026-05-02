#!/usr/bin/env node
// scripts/exec-window/close.cjs
//
// Deterministic wrapper to close an exec-window for a pipeline session.
// Reuses closeExecWindow() from .claude/hooks/edit-guard-hook.cjs.
//
// Usage:
//   node scripts/exec-window/close.cjs <session_id>
//
// Output (stdout, single JSON object):
//   { "existed": true | false }
//
// Idempotent: returns existed=false (exit 0) when no window file is on disk.
// Appends EXEC_WINDOW_CLOSE audit only when a window actually existed.
//
// Exit codes:
//   0 — close attempted (window deleted or already absent)
//   1 — argument or environment failure (invalid session id, fs error, etc.)

const path = require('node:path');
const { closeExecWindow } = require(
  path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'edit-guard-hook.cjs')
);

function fail(msg) {
  process.stderr.write(`close-exec-window: ${msg}\n`);
  process.exit(1);
}

const [, , sessionId] = process.argv;
if (!sessionId) fail('usage: node close.cjs <session_id>');

try {
  const existed = closeExecWindow(process.cwd(), sessionId);
  process.stdout.write(JSON.stringify({ existed }) + '\n');
  process.exit(0);
} catch (err) {
  fail(err && err.message ? err.message : String(err));
}
