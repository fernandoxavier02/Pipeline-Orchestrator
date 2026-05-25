'use strict';

const assert = require('node:assert/strict');
const { planCompatibilityHooks } = require('../../src/opencode/compatibility-hooks.cjs');

let result = planCompatibilityHooks({
  empiricalValidation: { stdinSupported: true },
  officialPluginGuardEnabled: true,
  criticalCheck: false,
  userApprovedCriticalFallback: false,
});
assert.equal(result.ok, true);
assert.equal(result.mode, 'compatibility');
assert.equal(result.limitations.length, 1);

result = planCompatibilityHooks({
  empiricalValidation: { stdinSupported: false },
  officialPluginGuardEnabled: true,
  criticalCheck: false,
  userApprovedCriticalFallback: false,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'COMPATIBILITY_HOOKS_UNSUPPORTED');

result = planCompatibilityHooks({
  empiricalValidation: { stdinSupported: true },
  officialPluginGuardEnabled: false,
  criticalCheck: true,
  userApprovedCriticalFallback: false,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'CRITICAL_CHECK_REQUIRES_OFFICIAL_PLUGIN_OR_APPROVAL');

result = planCompatibilityHooks({
  empiricalValidation: { stdinSupported: true },
  officialPluginGuardEnabled: false,
  criticalCheck: true,
  userApprovedCriticalFallback: true,
});
assert.equal(result.ok, true);
assert.equal(result.requiresGate, true);

console.log('compatibility hooks OK');
