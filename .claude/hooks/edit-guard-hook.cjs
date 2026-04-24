// .claude/hooks/edit-guard-hook.cjs
const fs = require('node:fs');
const path = require('node:path');

function getActiveLock(pipelineDir) {
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.lock'));
  for (const f of files) {
    try {
      const lock = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
      if (lock.expires_at > Date.now() && lock.status === 'active') {
        return lock;
      }
    } catch (_) { /* skip malformed */ }
  }
  return null;
}

function shouldBlock(filePath, pipelineDir) {
  const lock = getActiveLock(pipelineDir);
  if (!lock) return { block: false };

  const normalizedFile = path.resolve(filePath);
  const pipelinePath = path.resolve(path.join(pipelineDir, '.pipeline'));
  const isInsidePipeline = normalizedFile.startsWith(pipelinePath + path.sep) || normalizedFile === pipelinePath;

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
    `To work outside the pipeline, delete .pipeline/sessions/${sessionId}.lock or wait for TTL (2h) to expire.`
  );
}

function handlePreToolUse(payload) {
  if (!['Edit', 'Write', 'NotebookEdit'].includes(payload.tool_name)) {
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
      process.exit(0); // fail-safe
    }
  });
}

module.exports = { shouldBlock, buildBlockMessage, handlePreToolUse };
