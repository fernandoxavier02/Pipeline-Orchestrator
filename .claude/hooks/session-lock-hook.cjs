// .claude/hooks/session-lock-hook.cjs
const fs = require('node:fs');
const path = require('node:path');
// v7.13.0 (R6): derive the pipeline entry-point matcher from the shared registry
// (references/entry-points.json) so this hook and force-pipeline-agents.cjs can
// no longer drift. Loaded defensively — falls back to the legacy PIPELINE_REGEX.
let entryPoints = null;
try {
  entryPoints = require('../../lib/entry-points.cjs');
} catch (err) {
  // lib unavailable (e.g. partial install) → legacy PIPELINE_REGEX fallback below,
  // which is known-incomplete. Surface the degradation so it is never silent.
  try { process.stderr.write(`session-lock-hook: entry-points lib unavailable (${err && err.message}); using legacy regex fallback\n`); } catch { /* ignore */ }
}

// v4.2: accepts /pipeline-orchestrator:pipeline OR thin entry-points
// (bugfix, feature, userstory, audit, ux). All entry-points open the same
// session lock contract — without this, /bugfix etc. would bypass v4 protection.
// v4.2.1 (SEC-1 fix): /i flag aligns with force-pipeline-agents.cjs isPipelineSkill.
// Without it, "/BUGFIX" would inject PIPELINE_SKILL_MESSAGE but fail to create the
// session lock — pipeline ran without protection.
const PIPELINE_REGEX = /^\/pipeline-orchestrator:(pipeline|bugfix|feature|userstory|audit|ux)(\s|$)/i;
const SESSION_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// STALE_HEARTBEAT_THRESHOLD_MS — 10 minutes (v5.3.0+ canonical name).
//
// A live session updates last_seen_at on every UserPromptSubmit. If a foreign
// lock has not been seen for this long, the owning Claude Code process is
// presumed dead (crash, kill, OS reboot) and we mark it completed so edits
// are no longer blocked. Without this, locks survived until expires_at (2h).
//
// NOMENCLATURE (per references/stale-thresholds.md):
//   - STALE_SPAWN (5 min, sentinel-hook): controller forgot Write between spawns
//   - STALE_HEARTBEAT (10 min, THIS file + edit-guard-hook): lock owner is dead
//   - STALE_CONTEXT (24 h, gate registry): /pipeline continue on old context
// Three distinct concepts. See references/stale-thresholds.md for decision tree.
//
// Backwards compat: STALE_THRESHOLD_MS exported as alias for one release.
const STALE_HEARTBEAT_THRESHOLD_MS = 10 * 60 * 1000;
const STALE_THRESHOLD_MS = STALE_HEARTBEAT_THRESHOLD_MS; // deprecated alias, do not use in new code

function detectPipelineInvocation(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (entryPoints && typeof entryPoints.isPipelineEntryPoint === 'function') {
    return entryPoints.isPipelineEntryPoint(text);
  }
  return PIPELINE_REGEX.test(text.trim()); // legacy fallback when the registry is unavailable
}

function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_REGEX.test(id);
}

function writeLockAtomically(filePath, lock) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(lock, null, 2));
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    throw err;
  }
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
    last_seen_at: now,
    expires_at: now + ttlHours * 3600 * 1000,
    status: 'active',
  };
  writeLockAtomically(path.join(sessionsDir, `${sessionId}.lock`), lock);
  return lock;
}

// Refresh heartbeat for the calling session's lock and mark stale foreign
// locks as completed. Runs on every UserPromptSubmit so liveness signals
// flow without requiring a pipeline invocation.
//
// Backwards compatibility: locks lacking last_seen_at fall back to created_at
// for staleness checks. Locks with neither field are treated as fresh (their
// expires_at remains the only escape hatch — preserves legacy behavior).
//
// Only acts when sessions/ already exists. Never creates the directory; that
// stays the responsibility of createLock() under a real pipeline invocation.
function refreshHeartbeatAndGC(baseDir, currentSessionId) {
  const sessionsDir = path.join(baseDir, 'sessions');
  if (!fs.existsSync(sessionsDir)) return { refreshed: 0, stale_marked: 0 };
  let entries;
  try {
    entries = fs.readdirSync(sessionsDir);
  } catch (_) {
    return { refreshed: 0, stale_marked: 0 };
  }
  const now = Date.now();
  let refreshed = 0;
  let staleMarked = 0;
  for (const f of entries) {
    if (!f.endsWith('.lock')) continue;
    const filePath = path.join(sessionsDir, f);
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      continue;
    }
    if (!lock || lock.status !== 'active') continue;
    if (typeof lock.session_id !== 'string' || !SESSION_ID_REGEX.test(lock.session_id)) {
      continue;
    }
    if (lock.session_id === currentSessionId) {
      lock.last_seen_at = now;
      try { writeLockAtomically(filePath, lock); refreshed++; } catch (_) { /* skip */ }
      continue;
    }
    // Foreign lock: only GC when we have a heartbeat field to reason about.
    // Pre-patch locks (no last_seen_at) are left alone so the existing
    // expires_at + Stop-hook contract continues to govern them.
    if (typeof lock.last_seen_at !== 'number') continue;
    if (now - lock.last_seen_at > STALE_HEARTBEAT_THRESHOLD_MS) {
      lock.status = 'completed';
      lock.completed_at = now;
      lock.completed_reason = 'stale_heartbeat';
      try { writeLockAtomically(filePath, lock); staleMarked++; } catch (_) { /* skip */ }
    }
  }
  return { refreshed, stale_marked: staleMarked };
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
  // Heartbeat + stale-GC runs on EVERY prompt (not just /pipeline invocations)
  // so a live session refreshes its lock and reaps abandoned foreign locks.
  // This is what makes the lock self-heal across Claude Code crashes.
  if (isValidSessionId(payload.session_id)) {
    try {
      refreshHeartbeatAndGC(path.join(payload.cwd, '.pipeline'), payload.session_id);
    } catch (err) {
      process.stderr.write(`session-lock-hook: refreshHeartbeatAndGC failed: ${err.message}\n`);
    }
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

module.exports = {
  detectPipelineInvocation,
  createLock,
  handleUserPromptSubmit,
  isValidSessionId,
  refreshHeartbeatAndGC,
  STALE_HEARTBEAT_THRESHOLD_MS,
  STALE_THRESHOLD_MS, // deprecated alias, removal scheduled for v5.4.0
};
