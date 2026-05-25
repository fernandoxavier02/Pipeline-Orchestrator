'use strict';

const DEFAULT_GLOBAL_PREFIX = 'pipeline-';
const SHORT_GLOBAL_DECISION = 'ALLOW_SHORT_GLOBAL_COMMAND';

function isExplicitShortGlobalDecision(decision) {
  return Boolean(
    decision &&
      decision.decision === SHORT_GLOBAL_DECISION &&
      decision.decidedBy &&
      decision.gateDecisionId &&
      decision.reason
  );
}

function hasGlobalPrefix(name, prefix = DEFAULT_GLOBAL_PREFIX) {
  return typeof name === 'string' && name.startsWith(prefix);
}

function isShortCommandName(name, prefix = DEFAULT_GLOBAL_PREFIX) {
  return typeof name === 'string' && name.length > 0 && !hasGlobalPrefix(name, prefix);
}

function decideCommandRegistration({
  name,
  scope,
  existingGlobalCommands = [],
  explicitDecision = null,
  prefix = DEFAULT_GLOBAL_PREFIX,
}) {
  if (!name || typeof name !== 'string') {
    return block(name, 'COMMAND_NAME_INVALID');
  }

  if (scope === 'local') {
    return {
      name,
      scope,
      allowed: true,
      selectedName: name,
      reason: isShortCommandName(name, prefix)
        ? 'LOCAL_SHORT_COMMAND_ALLOWED'
        : 'LOCAL_COMMAND_ALLOWED',
      decisionRecorded: false,
    };
  }

  if (scope !== 'global') {
    return block(name, 'COMMAND_SCOPE_INVALID');
  }

  const collidesGlobally = existingGlobalCommands.includes(name);
  if (collidesGlobally) {
    if (hasGlobalPrefix(name, prefix)) {
      return block(name, 'GLOBAL_PREFIXED_COLLISION_BLOCKED');
    }

    const selectedName = `${prefix}${name}`;
    if (existingGlobalCommands.includes(selectedName)) {
      return block(name, 'GLOBAL_PREFIXED_COLLISION_BLOCKED');
    }

    return {
      name,
      scope,
      allowed: true,
      selectedName,
      reason: 'GLOBAL_COLLISION_PREFIXED',
      decisionRecorded: false,
    };
  }

  if (isShortCommandName(name, prefix)) {
    if (isExplicitShortGlobalDecision(explicitDecision)) {
      return {
        name,
        scope,
        allowed: true,
        selectedName: name,
        reason: 'GLOBAL_SHORT_COMMAND_EXPLICITLY_APPROVED',
        decisionRecorded: true,
        explicitDecision,
      };
    }

    return {
      name,
      scope,
      allowed: false,
      selectedName: null,
      reason: 'GLOBAL_SHORT_COMMAND_REQUIRES_EXPLICIT_DECISION',
      requiredDecision: SHORT_GLOBAL_DECISION,
      decisionRecorded: false,
    };
  }

  if (existingGlobalCommands.includes(name)) {
    return block(name, 'GLOBAL_PREFIXED_COLLISION_BLOCKED');
  }

  return {
    name,
    scope,
    allowed: true,
    selectedName: name,
    reason: 'GLOBAL_PREFIXED_COMMAND_ALLOWED',
    decisionRecorded: false,
  };
}

function evaluateCommandPolicy({ commands, existingGlobalCommands = [], prefix = DEFAULT_GLOBAL_PREFIX }) {
  const registrations = commands.map((command) =>
    decideCommandRegistration({
      ...command,
      existingGlobalCommands,
      prefix,
    })
  );
  const blocked = registrations.filter((registration) => !registration.allowed);
  return {
    ok: blocked.length === 0,
    registrations,
    blocked,
  };
}

function block(name, reason) {
  return {
    name,
    allowed: false,
    selectedName: null,
    reason,
    decisionRecorded: false,
  };
}

module.exports = {
  DEFAULT_GLOBAL_PREFIX,
  SHORT_GLOBAL_DECISION,
  decideCommandRegistration,
  evaluateCommandPolicy,
  hasGlobalPrefix,
  isShortCommandName,
};
