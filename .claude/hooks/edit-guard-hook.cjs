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

module.exports = { shouldBlock, buildBlockMessage, handlePreToolUse };
