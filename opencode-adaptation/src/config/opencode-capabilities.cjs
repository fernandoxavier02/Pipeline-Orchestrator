'use strict';

const CRITICAL_DEGRADATION_AREAS = Object.freeze([
  'security',
  'scope-lock',
  'gate-enforcement',
  'adversarial-review',
  'tdd-order',
  'prompt-evidence',
  'original-plugin-protection',
  'data-consent',
]);

const CAPABILITIES = Object.freeze([
  {
    id: 'subagent-dispatch',
    claudeSurface: 'Agent',
    opencodeSurface: 'task',
    expectedBehavior: 'Dispatch subagents with explicit context packets.',
  },
  {
    id: 'structured-question',
    claudeSurface: 'AskUserQuestion',
    opencodeSurface: 'question',
    expectedBehavior: 'Present two to four structured user choices.',
  },
  {
    id: 'official-plugin-guard',
    claudeSurface: 'PreToolUse and PostToolUse hooks',
    opencodeSurface: 'plugin',
    expectedBehavior: 'Intercept protected tool calls before and after execution.',
  },
  {
    id: 'skill-loading',
    claudeSurface: 'Skill',
    opencodeSurface: 'skill',
    expectedBehavior: 'Load reusable SKILL.md instructions on demand.',
  },
  {
    id: 'custom-tool-entrypoint',
    claudeSurface: 'Slash command',
    opencodeSurface: 'custom-tool',
    expectedBehavior: 'Start the adaptation without Claude plugin manifest discovery.',
  },
  {
    id: 'compatibility-hooks',
    claudeSurface: 'Claude Code hook scripts',
    opencodeSurface: 'observed-hook-compatibility',
    expectedBehavior: 'Use local hook compatibility only after empirical validation.',
  },
]);

function listCapabilities() {
  return CAPABILITIES.map((capability) => ({ ...capability }));
}

function getCapability(capabilityId) {
  const capability = CAPABILITIES.find((item) => item.id === capabilityId);
  if (!capability) {
    throw new Error(`Unknown OpenCode capability: ${capabilityId}`);
  }
  return { ...capability };
}

function hasCriticalArea(affectedAreas) {
  return affectedAreas.some((area) => CRITICAL_DEGRADATION_AREAS.includes(area));
}

function evaluateCapability({ capabilityId, supported, affectedAreas }) {
  const capability = getCapability(capabilityId);
  const areas = Array.isArray(affectedAreas) ? affectedAreas : [];
  if (supported === true) {
    return {
      capability,
      status: 'supported',
      requiresApproval: false,
      affectedAreas: areas,
    };
  }

  const critical = hasCriticalArea(areas);
  return {
    capability,
    status: critical ? 'blocked' : 'degraded',
    requiresApproval: critical,
    affectedAreas: areas,
    reason: critical
      ? 'Missing OpenCode capability affects critical governance behavior.'
      : 'Missing OpenCode capability affects non-critical behavior.',
  };
}

module.exports = {
  CRITICAL_DEGRADATION_AREAS,
  listCapabilities,
  getCapability,
  evaluateCapability,
};
