// .claude/hooks/session-lock-hook.cjs
const fs = require('node:fs');
const path = require('node:path');

const PIPELINE_REGEX = /^\/pipeline-orchestrator:pipeline(\s|$)/;

function detectPipelineInvocation(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return PIPELINE_REGEX.test(text.trim());
}

function createLock(baseDir, sessionId, opts = {}) {
  const ttlHours = opts.ttl_hours ?? 2;
  const sessionsDir = path.join(baseDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  const lock = {
    session_id: sessionId,
    created_at: now,
    expires_at: now + ttlHours * 3600 * 1000,
    status: 'active',
  };
  fs.writeFileSync(
    path.join(sessionsDir, `${sessionId}.lock`),
    JSON.stringify(lock, null, 2)
  );
  return lock;
}

function handleUserPromptSubmit(payload) {
  if (!detectPipelineInvocation(payload.prompt)) {
    return { action: 'noop' };
  }
  const pipelineDir = path.join(payload.cwd, '.pipeline');
  const lock = createLock(pipelineDir, payload.session_id, { ttl_hours: 2 });
  return { action: 'lock_created', lock };
}

// CLI entry point: lê stdin JSON, chama handler, exit 0
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      handleUserPromptSubmit(payload);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`session-lock-hook error: ${err.message}\n`);
      process.exit(0); // fail-safe: não bloquear UserPromptSubmit por bug no hook
    }
  });
}

module.exports = { detectPipelineInvocation, createLock, handleUserPromptSubmit };
