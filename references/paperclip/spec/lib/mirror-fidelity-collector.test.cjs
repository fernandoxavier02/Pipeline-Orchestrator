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

test('CORREÇÃO B: getComments que falha para UMA issue não derruba a coleta das demais', async () => {
  const transport = {
    async listIssues() {
      return [
        { id: 'i1', identifier: 'PIP-1', title: 'a' },
        { id: 'i2', identifier: 'PIP-2', title: 'b' },
        { id: 'i3', identifier: 'PIP-3', title: 'c' },
      ];
    },
    async getComments(id) {
      if (id === 'i2') throw new Error('JSON inválido / rede caiu');
      return [{ body: '### TDD_GREEN v1' }];
    },
  };
  const out = await collectExecutions({ companyId: 'co', transport });
  assert.strictEqual(out.length, 3, 'todas as 3 issues são coletadas');
  assert.strictEqual(out[0].comments.length, 1);
  assert.strictEqual(out[1].identifier, 'PIP-2');
  assert.deepStrictEqual(out[1].comments, [], 'a issue problemática volta com comments vazio');
  assert.strictEqual(out[2].comments.length, 1);
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

test('MUDANÇA 1: parentId exposto no objeto de saída (null quando ausente)', async () => {
  const transport = {
    async listIssues() {
      return [
        { id: 'i1', identifier: 'PIP-1', title: 'raiz', parentId: null },
        { id: 'i2', identifier: 'PIP-2', title: 'filho', parentId: 'i1' },
      ];
    },
    async getComments() { return []; },
  };
  const out = await collectExecutions({ companyId: 'co', transport });
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].parentId, null);
  assert.strictEqual(out[1].parentId, 'i1');
});
