// .claude/hooks/session-lock-hook.cjs
module.exports = {
  detectPipelineInvocation: (text) => { throw new Error('not implemented'); },
  createLock: (dir, sessionId, opts) => { throw new Error('not implemented'); },
};
