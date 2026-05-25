'use strict';

const assert = require('node:assert/strict');
const {
  buildImplementerContext,
  buildAdversarialContext,
  validateAdversarialContextIsolation,
} = require('../../src/runtime/context-packet.cjs');

const base = {
  runId: 'run-001',
  batchId: 'batch-001',
  sliceId: 'slice-001',
  scope: { allowedSurfaces: ['../opencode-adaptation/src/runtime/**'] },
  gates: [{ gateName: 'continue', decision: 'approved' }],
  evidence: [{ type: 'test.green', eventId: 'green-1' }],
  implementerRationale: 'I chose this implementation because it is simple.',
};

const implementer = buildImplementerContext(base);
assert.equal(implementer.kind, 'implementer');
assert.equal(implementer.runId, 'run-001');
assert.deepEqual(implementer.scope.allowedSurfaces, base.scope.allowedSurfaces);
assert.equal(implementer.implementerRationale, base.implementerRationale);

const adversarial = buildAdversarialContext(base);
assert.equal(adversarial.kind, 'adversarial');
assert.equal(adversarial.runId, 'run-001');
assert.equal(Object.prototype.hasOwnProperty.call(adversarial, 'implementerRationale'), false);
assert.deepEqual(adversarial.evidence, base.evidence);

let result = validateAdversarialContextIsolation({ implementerContext: implementer, adversarialContext: adversarial });
assert.equal(result.ok, true);

result = validateAdversarialContextIsolation({ implementerContext: implementer, adversarialContext: implementer });
assert.equal(result.ok, false);
assert.equal(result.code, 'ADVERSARIAL_CONTEXT_NOT_ISOLATED');

console.log('context packet OK');
