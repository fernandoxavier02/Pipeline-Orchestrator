// .claude/hooks/edit-guard-hook.cjs
module.exports = {
  shouldBlock: (filePath, pipelineDir) => { throw new Error('not implemented'); },
  buildBlockMessage: (filePath, sessionId) => { throw new Error('not implemented'); },
};
