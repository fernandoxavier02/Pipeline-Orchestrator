// .claude/hooks/edit-guard-hook.cjs
const fs = require('node:fs');
const path = require('node:path');

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function getActiveLock(pipelineDir) {
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.lock'));
  const now = Date.now();
  const candidates = [];
  for (const f of files) {
    try {
      const lock = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
      if (
        typeof lock.session_id === 'string' &&
        SESSION_ID_RE.test(lock.session_id) &&
        typeof lock.expires_at === 'number' &&
        lock.expires_at > now &&
        lock.status === 'active'
      ) {
        candidates.push(lock);
      }
    } catch (_) { /* skip malformed */ }
  }
  if (candidates.length === 0) return null;
  // Pick newest by created_at DESC; locks without created_at sort as 0 (oldest).
  candidates.sort((a, b) => {
    const aC = typeof a.created_at === 'number' ? a.created_at : 0;
    const bC = typeof b.created_at === 'number' ? b.created_at : 0;
    return bC - aC;
  });
  return candidates[0];
}

function getActiveExecWindow(pipelineDir, lockSessionId) {
  // Cooperative authorization: when a pipeline-controller spawns N2 executor agents,
  // it writes .pipeline/sessions/{session_id}.exec-window to temporarily authorize
  // Edit/Write outside .pipeline/. This is NOT cryptographic protection — see
  // CHANGELOG/MIGRATION security disclaimer.
  if (typeof lockSessionId !== 'string' || !SESSION_ID_RE.test(lockSessionId)) return null;
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.exec-window'));
  const now = Date.now();
  for (const f of files) {
    try {
      const win = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
      if (
        typeof win.session_id === 'string' &&
        SESSION_ID_RE.test(win.session_id) &&
        win.session_id === lockSessionId &&
        typeof win.expires_at === 'number' &&
        win.expires_at > now
      ) {
        return win;
      }
    } catch (_) { /* skip malformed */ }
  }
  return null;
}

function shouldBlock(filePath, pipelineDir) {
  if (typeof filePath !== 'string' || typeof pipelineDir !== 'string') {
    return { block: true, reason: 'PIPELINE_LOCK_ACTIVE: invalid payload (failing closed)' };
  }
  const lock = getActiveLock(pipelineDir);
  if (!lock) return { block: false };

  const normalizedFile = path.resolve(pipelineDir, filePath);
  const pipelinePath = path.resolve(path.join(pipelineDir, '.pipeline'));
  const norm = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const nf = norm(normalizedFile);
  const np = norm(pipelinePath);
  const isInsidePipeline = nf === np || nf.startsWith(np + path.sep);

  if (isInsidePipeline) return { block: false };

  // F-001: exec-window cooperative authorization for N2 executor agents.
  // When an active, non-expired exec-window exists for the locked session_id,
  // allow Edit/Write outside .pipeline/. Controller is responsible for
  // opening/closing the window around N2 spawns.
  const execWindow = getActiveExecWindow(pipelineDir, lock.session_id);
  if (execWindow) {
    return { block: false, reason: 'exec_window_active', execWindow, lock };
  }

  return {
    block: true,
    reason: `PIPELINE_LOCK_ACTIVE: ${buildBlockMessage(filePath, lock.session_id)}`,
    lock,
  };
}

function buildBlockMessage(filePath, sessionId) {
  return (
    `Pipeline session ${sessionId} is active. Direct edits to ${filePath} are blocked. ` +
    `Spawn Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", ...) to orchestrate changes. ` +
    `If this edit is being performed by a pipeline-controller-spawned executor agent, ensure the controller ` +
    `opened an exec-window via Write to .pipeline/sessions/${sessionId}.exec-window before the edit. ` +
    `To resume this session, run /pipeline-orchestrator:pipeline continue. ` +
    `The lock is released automatically when Claude Code stops (Stop hook cleanup). ` +
    `As a last resort only, you may manually delete .pipeline/sessions/${sessionId}.lock.`
  );
}

function handlePreToolUse(payload) {
  if (!['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(payload.tool_name)) {
    return { decision: 'allow' };
  }
  const filePath = payload.tool_input?.file_path;
  if (!filePath) return { decision: 'allow' };

  const result = shouldBlock(filePath, payload.cwd);
  if (result.block) {
    return {
      decision: 'block',
      reason: result.reason,
    };
  }
  return { decision: 'allow' };
}

// CLI entry point
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const result = handlePreToolUse(payload);
      if (result.decision === 'block') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.reason },
        }));
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`edit-guard-hook error: ${err.message}\n`);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'edit-guard-hook internal error — failing closed',
        },
      }));
      process.exit(0);
    }
  });
}

module.exports = { shouldBlock, buildBlockMessage, handlePreToolUse, getActiveExecWindow };
