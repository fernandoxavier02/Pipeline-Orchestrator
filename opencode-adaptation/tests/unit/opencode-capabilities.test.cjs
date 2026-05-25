'use strict';

const assert = require('node:assert/strict');
const {
  CRITICAL_DEGRADATION_AREAS,
  getCapability,
  listCapabilities,
  evaluateCapability,
} = require('../../src/config/opencode-capabilities.cjs');

assert.ok(CRITICAL_DEGRADATION_AREAS.includes('security'));
assert.ok(CRITICAL_DEGRADATION_AREAS.includes('original-plugin-protection'));

const capabilities = listCapabilities();
assert.ok(capabilities.length >= 6);
assert.equal(getCapability('subagent-dispatch').opencodeSurface, 'task');
assert.equal(getCapability('structured-question').opencodeSurface, 'question');
assert.equal(getCapability('official-plugin-guard').opencodeSurface, 'plugin');
assert.equal(getCapability('skill-loading').opencodeSurface, 'skill');
assert.equal(getCapability('custom-tool-entrypoint').opencodeSurface, 'custom-tool');
assert.equal(
  getCapability('compatibility-hooks').opencodeSurface,
  'observed-hook-compatibility'
);

const safeMissing = evaluateCapability({
  capabilityId: 'compatibility-hooks',
  supported: false,
  affectedAreas: ['operator-convenience'],
});
assert.equal(safeMissing.status, 'degraded');
assert.equal(safeMissing.requiresApproval, false);

const criticalMissing = evaluateCapability({
  capabilityId: 'official-plugin-guard',
  supported: false,
  affectedAreas: ['scope-lock', 'gate-enforcement'],
});
assert.equal(criticalMissing.status, 'blocked');
assert.equal(criticalMissing.requiresApproval, true);
assert.match(criticalMissing.reason, /critical/i);

assert.throws(
  () => evaluateCapability({
    capabilityId: 'unknown-surface',
    supported: true,
    affectedAreas: [],
  }),
  /Unknown OpenCode capability/
);

console.log('opencode capabilities OK');
