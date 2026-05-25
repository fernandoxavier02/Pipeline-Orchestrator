'use strict';

function buildSupportedSurface(toolName) {
  return {
    hook: 'tool.execute.before',
    status: 'supported',
    toolName,
  };
}

function buildEmpiricalOpenCodeReport({ versionOutput, helpOutput }) {
  const version = String(versionOutput || '').trim();
  const help = String(helpOutput || '');
  if (!version) {
    return {
      ok: false,
      version,
      supported: {},
      degraded: {},
      blocked: [{ code: 'OPENCODE_CLI_EVIDENCE_MISSING' }],
      gates: [],
    };
  }
  const discoveryMarkers = ['opencode run', 'opencode plugin', '--agent'];
  const missingDiscovery = discoveryMarkers.filter((marker) => !help.includes(marker));
  if (missingDiscovery.length > 0) {
    return {
      ok: false,
      version,
      supported: {},
      degraded: {},
      blocked: [{ code: 'OPENCODE_DISCOVERY_INCOMPLETE', missing: missingDiscovery }],
      gates: [],
    };
  }

  const degraded = {
    write: {
      status: 'degraded',
      reason: 'OpenCode exposes edit permission/tooling instead of a separate write command.',
    },
    compatibilityHooks: {
      status: 'degraded',
      reason: 'Observed compatibility hooks are not a replacement for official plugin hooks.',
    },
  };

  return {
    ok: true,
    version,
    supported: {
      edit: buildSupportedSurface('edit'),
      bash: buildSupportedSurface('bash'),
      task: buildSupportedSurface('task'),
      skill: buildSupportedSurface('skill'),
      customTool: buildSupportedSurface('custom-tool'),
    },
    degraded,
    blocked: [],
    gates: Object.keys(degraded).map((name) => ({
      name,
      safetyCritical: true,
      reason: degraded[name].reason,
    })),
  };
}

module.exports = { buildEmpiricalOpenCodeReport };
