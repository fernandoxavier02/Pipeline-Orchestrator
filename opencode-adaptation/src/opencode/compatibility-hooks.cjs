'use strict';

function planCompatibilityHooks({ empiricalValidation, officialPluginGuardEnabled, criticalCheck, userApprovedCriticalFallback }) {
  if (!empiricalValidation || empiricalValidation.stdinSupported !== true) {
    return {
      ok: false,
      code: 'COMPATIBILITY_HOOKS_UNSUPPORTED',
      limitations: ['Observed stdin compatibility hook pattern is not empirically supported.'],
    };
  }

  if (criticalCheck && !officialPluginGuardEnabled && !userApprovedCriticalFallback) {
    return {
      ok: false,
      code: 'CRITICAL_CHECK_REQUIRES_OFFICIAL_PLUGIN_OR_APPROVAL',
      limitations: ['Compatibility hooks cannot replace official plugin checks for critical enforcement without approval.'],
    };
  }

  return {
    ok: true,
    mode: 'compatibility',
    requiresGate: Boolean(criticalCheck && !officialPluginGuardEnabled),
    limitations: ['Compatibility hooks are degraded support and do not replace official plugin enforcement.'],
  };
}

module.exports = { planCompatibilityHooks };
