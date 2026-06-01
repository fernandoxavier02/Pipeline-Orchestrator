'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { collectExecutions } = require('./mirror-fidelity-collector.cjs');

function fakeTransport() {
  return {
    async listIssues() { return [{ id: 'i1', identifier: 'PIP-1', title: '[FEATURE] x' }]; },
    async getComments(id) {
      assert.strictEqual(id, 'i1');
      return [{ body: '### ORCHESTRATOR_DECISION v1\ncomplexity: COMPLEXA' }, { body: '### PA_DE_CAL v1\nverdict: GO' }];
    },
  };
}

test('coleta issues + comentários e devolve estrutura por execução', async () => {
  const out = await collectExecutions({ companyId: 'co', transport: fakeTransport() });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].identifier, 'PIP-1');
  assert.strictEqual(out[0].comments.length, 2);
});

test('CORREÇÃO A: companyId com injeção de comando LANÇA antes de montar a URL', async () => {
  let listIssuesCalled = false;
  const guardTransport = {
    async listIssues() { listIssuesCalled = true; return []; },
    async getComments() { return []; },
  };
  await assert.rejects(
    () => collectExecutions({ companyId: 'co; reboot', transport: guardTransport }),
    /companyId/,
  );
  assert.strictEqual(listIssuesCalled, false, 'não deve nem chamar listIssues com id malicioso');
});
