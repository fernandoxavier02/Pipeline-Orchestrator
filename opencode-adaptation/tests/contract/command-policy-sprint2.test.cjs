'use strict';

const assert = require('node:assert/strict');
const {
  decideCommandRegistration,
  evaluateCommandPolicy,
} = require('../../src/opencode/command-policy.cjs');

const collision = decideCommandRegistration({
  name: 'bugfix',
  scope: 'global',
  existingGlobalCommands: ['bugfix'],
});

assert.equal(collision.allowed, true);
assert.equal(collision.selectedName, 'pipeline-bugfix');
assert.equal(collision.reason, 'GLOBAL_COLLISION_PREFIXED');

const doubleCollision = decideCommandRegistration({
  name: 'bugfix',
  scope: 'global',
  existingGlobalCommands: ['bugfix', 'pipeline-bugfix'],
});

assert.equal(doubleCollision.allowed, false);
assert.equal(doubleCollision.selectedName, null);
assert.equal(doubleCollision.reason, 'GLOBAL_PREFIXED_COLLISION_BLOCKED');


const prefixedAlreadyExists = decideCommandRegistration({
  name: 'pipeline-audit',
  scope: 'global',
  existingGlobalCommands: ['pipeline-audit'],
});

assert.equal(prefixedAlreadyExists.allowed, false);
assert.equal(prefixedAlreadyExists.selectedName, null);
assert.equal(prefixedAlreadyExists.reason, 'GLOBAL_PREFIXED_COLLISION_BLOCKED');
const blockedShortGlobal = decideCommandRegistration({
  name: 'audit',
  scope: 'global',
  existingGlobalCommands: [],
});

assert.equal(blockedShortGlobal.allowed, false);
assert.equal(blockedShortGlobal.selectedName, null);
assert.equal(blockedShortGlobal.reason, 'GLOBAL_SHORT_COMMAND_REQUIRES_EXPLICIT_DECISION');
assert.equal(blockedShortGlobal.requiredDecision, 'ALLOW_SHORT_GLOBAL_COMMAND');

const localShort = decideCommandRegistration({
  name: 'audit',
  scope: 'local',
  existingGlobalCommands: ['audit'],
});

assert.equal(localShort.allowed, true);
assert.equal(localShort.selectedName, 'audit');
assert.equal(localShort.reason, 'LOCAL_SHORT_COMMAND_ALLOWED');

const fabricatedShortGlobalDecision = decideCommandRegistration({
  name: 'ux',
  scope: 'global',
  explicitDecision: {
    decision: 'ALLOW_SHORT_GLOBAL_COMMAND',
    decidedBy: 'future-user-gate',
    reason: 'missing gate evidence',
  },
});

assert.equal(fabricatedShortGlobalDecision.allowed, false);
assert.equal(fabricatedShortGlobalDecision.reason, 'GLOBAL_SHORT_COMMAND_REQUIRES_EXPLICIT_DECISION');

const explicitlyApprovedShortGlobal = decideCommandRegistration({
  name: 'ux',
  scope: 'global',
  explicitDecision: {
    decision: 'ALLOW_SHORT_GLOBAL_COMMAND',
    decidedBy: 'future-user-gate',
    gateDecisionId: 'gate-decision-allow-ux-global',
    reason: 'documented future exception',
  },
});

assert.equal(explicitlyApprovedShortGlobal.allowed, true);
assert.equal(explicitlyApprovedShortGlobal.selectedName, 'ux');
assert.equal(explicitlyApprovedShortGlobal.reason, 'GLOBAL_SHORT_COMMAND_EXPLICITLY_APPROVED');
assert.equal(explicitlyApprovedShortGlobal.decisionRecorded, true);

const policy = evaluateCommandPolicy({
  commands: [
    { name: 'bugfix', scope: 'global' },
    { name: 'audit', scope: 'global' },
    { name: 'spec', scope: 'local' },
  ],
  existingGlobalCommands: ['bugfix'],
});

assert.equal(policy.ok, false);
assert.deepEqual(
  policy.registrations.map((entry) => entry.selectedName),
  ['pipeline-bugfix', null, 'spec']
);
assert.deepEqual(
  policy.blocked.map((entry) => entry.name),
  ['audit']
);

console.log('command policy sprint2 OK');
