// .claude/hooks/session-cleanup-hook.cjs
// On Claude Code Stop event: mark active locks owned by this session as completed
// so the edit-guard no longer blocks edits. Users should not learn `rm lock` as habit.
//
// v8.9.0 (T5 / REQ-STOP-SINGLE-WRITER / DoD#16) cleanup reorder: this hook fires in
// the parallel Stop group, so it must NOT declare a run complete BEFORE the single
// authoritative Stop gate (stop-gate-hook.cjs) has decided and persisted the terminal
// state. It therefore marks a session lock `completed` ONLY when the governed run has
// already reached a terminal state (terminal_state/status in the honest terminal
// vocabulary), OR when there is no governed run state to consult (a plain non-pipeline
// session — backward compatible). An incomplete governed run is left untouched so the
// armed Stop gate can block/own the terminal write without a cleanup race.
const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let manifest = null;
try { manifest = require('../../lib/contracts/workflow-manifest.cjs'); } catch { manifest = null; }

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function isTerminalState(value) {
  if (manifest && typeof manifest.isTerminal === 'function') return manifest.isTerminal(value);
  return ['completed', 'hard_failed', 'aborted_by_user', 'cancelled'].includes(value);
}

// May this Stop-group cleanup mark the session lock completed yet?
//   - No governed run state on disk  → yes (plain non-pipeline session, legacy behavior).
//   - Corrupt state                  → no (do not declare completion over unreadable state).
//   - Governed run NOT yet terminal  → no (the Stop gate owns the terminal write first).
//   - Governed run terminal          → yes (cleanup runs AFTER the terminal is persisted).
function cleanupAllowed(cwd) {
  let state = null;
  try { state = eg && eg.findActiveSentinelState(cwd); } catch { state = null; }
  if (!state) return true; // no governed run → legacy non-pipeline cleanup
  if (eg && state === eg.CORRUPT_SENTINEL) return false;
  if (isTerminalState(state.terminal_state) || isTerminalState(state.status)) return true;
  if (state.pipeline_active === true) return false; // incomplete governed run → defer to Stop gate
  return true;
}

function handleStop(payload) {
  try {
    if (!payload || typeof payload !== 'object') return;
    const { session_id: sessionId, cwd } = payload;
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return;
    if (typeof cwd !== 'string' || cwd.length === 0) return;

    const sessionsDir = path.join(cwd, '.pipeline', 'sessions');
    if (!fs.existsSync(sessionsDir)) return;

    // T5 reorder gate: only mark a lock completed once the governed run is terminal
    // (or there is no governed run). The exec-window unlink below is unconditional —
    // it tears down a transient authorization, not a completion claim.
    const mayMarkCompleted = cleanupAllowed(cwd);

    const files = fs.readdirSync(sessionsDir);
    for (const f of files) {
      const filePath = path.join(sessionsDir, f);
      try {
        let stat;
        try {
          stat = fs.lstatSync(filePath);
        } catch (err) {
          process.stderr.write(`session-cleanup-hook: lstat failed for ${f}: ${err.message}
`);
          continue;
        }
        if (!stat.isFile()) {
          process.stderr.write(`session-cleanup-hook: skipping non-file entry ${f}
`);
          continue;
        }
        if (f.endsWith('.lock')) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const lock = JSON.parse(raw);
          if (mayMarkCompleted && lock && lock.session_id === sessionId && lock.status !== 'completed') {
            lock.status = 'completed';
            lock.completed_at = Date.now();
            const tmpPath = `${filePath}.${process.pid}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify(lock, null, 2));
            fs.renameSync(tmpPath, filePath);
          }
        } else if (f.endsWith('.exec-window')) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const win = JSON.parse(raw);
          if (win && win.session_id === sessionId) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (err) {
        process.stderr.write(`session-cleanup-hook: skip ${f}: ${err.message}\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`session-cleanup-hook error: ${err.message}\n`);
  }
}

// CLI entry point
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      handleStop(payload);
    } catch (err) {
      process.stderr.write(`session-cleanup-hook error: ${err.message}\n`);
    }
    process.exit(0); // fail-safe
  });
}

module.exports = { handleStop };
