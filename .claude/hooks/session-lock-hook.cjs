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

module.exports = { detectPipelineInvocation, createLock };
