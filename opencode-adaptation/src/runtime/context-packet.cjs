'use strict';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseContext(input, kind) {
  return {
    kind,
    runId: input.runId,
    batchId: input.batchId,
    sliceId: input.sliceId,
    scope: clone(input.scope || {}),
    gates: clone(input.gates || []),
    evidence: clone(input.evidence || []),
  };
}

function buildImplementerContext(input) {
  return {
    ...baseContext(input, 'implementer'),
    implementerRationale: input.implementerRationale || '',
  };
}

function buildAdversarialContext(input) {
  return baseContext(input, 'adversarial');
}

function validateAdversarialContextIsolation({ implementerContext, adversarialContext }) {
  if (adversarialContext === implementerContext
    || Object.prototype.hasOwnProperty.call(adversarialContext, 'implementerRationale')) {
    return { ok: false, code: 'ADVERSARIAL_CONTEXT_NOT_ISOLATED' };
  }
  return { ok: true };
}

module.exports = {
  buildImplementerContext,
  buildAdversarialContext,
  validateAdversarialContextIsolation,
};
