// .claude/hooks/session-cleanup-hook.cjs
// On Claude Code Stop event: mark active locks owned by this session as completed
// so the edit-guard no longer blocks edits. Users should not learn `rm lock` as habit.
const fs = require('node:fs');
const path = require('node:path');

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function handleStop(payload) {
  try {
    if (!payload || typeof payload !== 'object') return;
    const { session_id: sessionId, cwd } = payload;
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return;
    if (typeof cwd !== 'string' || cwd.length === 0) return;

    const sessionsDir = path.join(cwd, '.pipeline', 'sessions');
    if (!fs.existsSync(sessionsDir)) return;

    const files = fs.readdirSync(sessionsDir);
    for (const f of files) {
      const filePath = path.join(sessionsDir, f);
      try {
        if (f.endsWith('.lock')) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const lock = JSON.parse(raw);
          if (lock && lock.session_id === sessionId && lock.status !== 'completed') {
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
