'use strict';

const KIRO_PATH_RE = /\.kiro\/specs\/[<{][a-z_-]+[>}]\//g;
const KIRO_TEMPLATE_RE = /\.kiro\/settings\/templates\/specs\//g;
const KIRO_CMD_RE = /\/kiro-(spec-init|spec-requirements|spec-design|spec-tasks|validate-gap|validate-design|review|verify-completion)(?![\w-])/g;

class PathRewriter {
  constructor(runId) {
    if (!runId || typeof runId !== 'string') {
      throw new Error('run_id required');
    }
    this._runId = runId;
  }

  rewrite(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(KIRO_PATH_RE, `pipeline-runs/${this._runId}/01-spec/`)
      .replace(KIRO_TEMPLATE_RE, 'references/spec-templates/')
      .replace(KIRO_CMD_RE, '/pipeline-orchestrator:$1');
  }
}

module.exports = { PathRewriter };
