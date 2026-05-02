#!/usr/bin/env node
// scripts/exec-window/open.cjs
//
// Deterministic wrapper to open an exec-window for the active pipeline session.
// Reuses openExecWindow() from .claude/hooks/edit-guard-hook.cjs so file schema,
// active-lock validation, audit-pairing append, and TTL bounds are produced by
// tested code instead of an LLM controller's prose-following discipline.
//
// Usage:
//   node scripts/exec-window/open.cjs <session_id> <spawning_agent> [purpose] [ttl_minutes]
//
// Output (stdout, single JSON object):
//   { "session_id": "...", "opened_at": <ms>, "expires_at": <ms>, "purpose": "...", "spawning_agent": "..." }
//
// Exit codes:
//   0 — window opened
//   1 — argument or environment failure (no active lock, invalid session id, audit append failed, etc.)
//
// pipeline_dir is process.cwd() — call this from the project root that contains .pipeline/.

const path = require('node:path');
const { openExecWindow } = require(
  path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'edit-guard-hook.cjs')
);

function fail(msg) {
  process.stderr.write(`open-exec-window: ${msg}\n`);
  process.exit(1);
}

const [, , sessionId, spawningAgent, purposeArg, ttlArg] = process.argv;
if (!sessionId || !spawningAgent) {
  fail('usage: node open.cjs <session_id> <spawning_agent> [purpose] [ttl_minutes]');
}

const opts = {
  spawning_agent: spawningAgent,
  purpose: purposeArg || '',
};
if (ttlArg !== undefined && ttlArg !== '') {
  const n = Number(ttlArg);
  if (!Number.isFinite(n) || n <= 0) fail(`invalid ttl_minutes: ${ttlArg}`);
  opts.ttl_minutes = n;
}

try {
  const win = openExecWindow(process.cwd(), sessionId, opts);
  process.stdout.write(JSON.stringify(win) + '\n');
  process.exit(0);
} catch (err) {
  fail(err && err.message ? err.message : String(err));
}
