'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { nextStep, nodeSpec } = require('./tree-factory.cjs');
const { TEMPLATES } = require('./tree-template.cjs');

// GEN2 — nextStep(complexity, currentStep): decide o próximo nó (lê `next` do nó atual).
// currentStep === null retorna a raiz; fim retorna null.

test('P5 — SIMPLES: cadeia nextStep da raiz ao fim', () => {
  assert.strictEqual(nextStep('SIMPLES', null).step, 'classificar'); // raiz
  assert.strictEqual(nextStep('SIMPLES', 'classificar').step, 'clarificar');
  assert.strictEqual(nextStep('SIMPLES', 'clarificar').step, 'implementar');
  assert.strictEqual(nextStep('SIMPLES', 'implementar').step, 'revisar');
  assert.strictEqual(nextStep('SIMPLES', 'revisar').step, 'fechar');
  assert.strictEqual(nextStep('SIMPLES', 'fechar'), null); // fim
});

test('nextStep retorna o objeto-nó inteiro do template (não só o step)', () => {
  const raiz = nextStep('SIMPLES', null);
  assert.strictEqual(raiz, TEMPLATES.SIMPLES[0]); // mesma referência do molde
  assert.strictEqual(raiz.role, 'pipeline-controller');
});

test('nextStep — COMPLEXA atravessa planejar e aprovar', () => {
  assert.strictEqual(nextStep('COMPLEXA', 'clarificar').step, 'planejar');
  assert.strictEqual(nextStep('COMPLEXA', 'planejar').step, 'aprovar');
  assert.strictEqual(nextStep('COMPLEXA', 'aprovar').step, 'implementar');
});

test('nextStep — complexidade desconhecida → null', () => {
  assert.strictEqual(nextStep('XPTO', null), null);
});

test('nextStep — step inexistente no template lança erro (molde inconsistente)', () => {
  assert.throws(() => nextStep('SIMPLES', 'inexistente'), /inexistente/);
});

// GEN3 — nodeSpec(complexity, step, prevIssueId): payload puro da issue.
// { title, assigneeAgentId, blockedByIssueIds, body }.

test('P1 — assigneeAgentId é o cargo mapeado para cada step (SIMPLES)', () => {
  const expected = {
    classificar: 'pipeline-controller',
    clarificar: 'information-gate',
    implementar: 'feature-implementer',
    revisar: 'adversarial-review-coordinator',
    fechar: 'final-validator',
  };
  for (const [step, role] of Object.entries(expected)) {
    assert.strictEqual(nodeSpec('SIMPLES', step, null).assigneeAgentId, role);
  }
});

test('P1 — assigneeAgentId mapeado para os nós extras da COMPLEXA', () => {
  assert.strictEqual(nodeSpec('COMPLEXA', 'planejar', 'X').assigneeAgentId, 'plan-architect');
  assert.strictEqual(nodeSpec('COMPLEXA', 'aprovar', 'X').assigneeAgentId, 'final-validator');
});

test('P2 — nó de implementação com prevIssueId tem exatamente 1 blocker', () => {
  const impl = nodeSpec('SIMPLES', 'implementar', 'ISSUE-42');
  assert.strictEqual(impl.blockedByIssueIds.length, 1);
  assert.deepStrictEqual(impl.blockedByIssueIds, ['ISSUE-42']);

  const rev = nodeSpec('SIMPLES', 'revisar', 'ISSUE-99');
  assert.strictEqual(rev.blockedByIssueIds.length, 1);
  const fec = nodeSpec('SIMPLES', 'fechar', 'ISSUE-7');
  assert.strictEqual(fec.blockedByIssueIds.length, 1);
});

test('P2 — raiz sem prevIssueId tem blockedByIssueIds vazio', () => {
  const root = nodeSpec('SIMPLES', 'classificar', null);
  assert.deepStrictEqual(root.blockedByIssueIds, []);
});

test('nodeSpec — title menciona o step', () => {
  const spec = nodeSpec('SIMPLES', 'implementar', 'X');
  assert.match(spec.title, /implementar/);
});

test('body menciona cada bloco do nó e o NEXT_STEP correto (implementar→revisar)', () => {
  const spec = nodeSpec('SIMPLES', 'implementar', 'ISSUE-42');
  assert.match(spec.body, /TDD_GREEN/);
  assert.match(spec.body, /REGRESSION_RESULT/);
  assert.match(spec.body, /NEXT_STEP:\s*revisar/);
});

test('body do nó final marca NEXT_STEP: FIM', () => {
  const spec = nodeSpec('SIMPLES', 'fechar', 'ISSUE-9');
  assert.match(spec.body, /SLICE_CLOSEOUT/);
  assert.match(spec.body, /PA_DE_CAL/);
  assert.match(spec.body, /NEXT_STEP:\s*FIM/);
});

test('body de nó sem blocks (aprovar) não inventa bloco e ainda traz NEXT_STEP', () => {
  const spec = nodeSpec('COMPLEXA', 'aprovar', 'ISSUE-3');
  assert.match(spec.body, /NEXT_STEP:\s*implementar/);
});

test('nodeSpec — step inexistente lança erro', () => {
  assert.throws(() => nodeSpec('SIMPLES', 'planejar', 'X'), /planejar/); // planejar não existe em SIMPLES
});
