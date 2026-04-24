// .claude/hooks/session-lock-hook.cjs
const fs = require('node:fs');
const path = require('node:path');

const PIPELINE_REGEX = /^\/pipeline-orchestrator:pipeline(\s|$)/;
const SESSION_ID_REGEX = /^[A-Za-z0-9._-]{1,64}$/;

function detectPipelineInvocation(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return PIPELINE_REGEX.test(text.trim());
}

function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_REGEX.test(id);
}

function createLock(baseDir, sessionId, opts = {}) {
  if (!isValidSessionId(sessionId)) {
    throw new Error('invalid session_id');
  }
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
  if (!payload || typeof payload !== 'object') {
    return { action: 'noop', reason: 'invalid_payload' };
  }
  if (typeof payload.prompt !== 'string' ||
      typeof payload.session_id !== 'string' ||
      typeof payload.cwd !== 'string') {
    return { action: 'noop', reason: 'invalid_payload' };
  }
  if (!detectPipelineInvocation(payload.prompt)) {
    return { action: 'noop' };
  }
  if (!isValidSessionId(payload.session_id)) {
    return { action: 'noop', reason: 'invalid_session_id' };
  }
  const pipelineDir = path.join(payload.cwd, '.pipeline');
  const lock = createLock(pipelineDir, payload.session_id, { ttl_hours: 2 });
  return { action: 'lock_created', lock };
}

// CLI entry point
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
      process.exit(0); // fail-safe
    }
  });
}

module.exports = { detectPipelineInvocation, createLock, handleUserPromptSubmit, isValidSessionId };
