'use strict';

const path = require('node:path');

const PHASE_ORDER = Object.freeze(['planned', 'red', 'green', 'prompt', 'review', 'verdict']);
const WRITE_TOOLS = Object.freeze(new Set(['edit', 'write']));
const BEFORE_HOOK_MARKER = Symbol.for('pipeline-orchestrator.guard.tool.execute.before.processed');
const AFTER_HOOK_MARKER = Symbol.for('pipeline-orchestrator.guard.tool.execute.after.processed');

function isInsideAllowedSurface(filePath, allowedSurfaces) {
  const attempted = path.resolve(filePath);
  return allowedSurfaces.some((surface) => {
    const relative = path.relative(path.resolve(surface), attempted);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

function block(code, extra) {
  return { ok: false, code, ...extra };
}

function guardToolExecution({ activeRun, toolName, args }) {
  if (!activeRun) return { ok: true };

  if (WRITE_TOOLS.has(toolName)) {
    const attemptedScope = args && (args.filePath || args.path);
    if (!attemptedScope || !isInsideAllowedSurface(attemptedScope, activeRun.allowedSurfaces || [])) {
      return block('WRITE_OUTSIDE_ALLOWED_SCOPE', {
        allowedScope: activeRun.allowedSurfaces || [],
        attemptedScope,
      });
    }
  }

  if (toolName === 'phase.transition') {
    const fromIndex = PHASE_ORDER.indexOf(args.from);
    const toIndex = PHASE_ORDER.indexOf(args.to);
    if (fromIndex === -1 || toIndex !== fromIndex + 1) {
      return block('INVALID_PHASE_TRANSITION', { from: args.from, to: args.to });
    }
  }

  if (toolName === 'task' && (!args || !args.contextPacket)) {
    return block('DISPATCH_CONTEXT_REQUIRED', { agentName: args && args.agentName });
  }

  return { ok: true };
}

function markOnce(target, marker) {
  if (target[marker]) return false;
  Object.defineProperty(target, marker, { value: true, enumerable: false, configurable: false });
  return true;
}

function createPipelineGuardHooks({ getActiveRun, audit }) {
  return {
    'tool.execute.before': (input, output = {}) => {
      const activeRun = getActiveRun();
      if (!activeRun) return;
      if (!markOnce(output, BEFORE_HOOK_MARKER)) return;
      const result = guardToolExecution({
        activeRun,
        toolName: input.tool,
        args: input.args || {},
      });
      if (!result.ok) {
        output.error = result;
        audit({ type: 'tool.blocked', result });
        return;
      }
      audit({ type: 'tool.allowed', toolName: input.tool });
    },
    'tool.execute.after': (input) => {
      if (!markOnce(input, AFTER_HOOK_MARKER)) return;
      audit({ type: 'tool.completed', toolName: input.tool });
    },
  };
}

module.exports = {
  PHASE_ORDER,
  guardToolExecution,
  createPipelineGuardHooks,
  isInsideAllowedSurface,
  BEFORE_HOOK_MARKER,
  AFTER_HOOK_MARKER,
};
