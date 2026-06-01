'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseBlocks, parseComplexity } = require('./mirror-fidelity-parser.cjs');

const comments = [
  { body: '### ORCHESTRATOR_DECISION v1\n```yaml\ntask_type: Feature\ncomplexity: COMPLEXA\n```' },
  { body: '### TDD_GREEN v1\nissue: PIP-44' },
  { body: 'texto solto sem bloco' },
  { body: '### PA_DE_CAL v1\nverdict: GO' },
];

test('extrai nomes de bloco (### NOME vN), deduplicado', () => {
  assert.deepStrictEqual(parseBlocks(comments).sort(), ['ORCHESTRATOR_DECISION', 'PA_DE_CAL', 'TDD_GREEN']);
});

test('extrai complexidade do bloco ORCHESTRATOR_DECISION', () => {
  assert.strictEqual(parseComplexity(comments), 'COMPLEXA');
});

test('complexidade ausente → null', () => {
  assert.strictEqual(parseComplexity([{ body: 'nada aqui' }]), null);
});

test('ignora "complexity:" de comentário humano; só lê do bloco ORCHESTRATOR_DECISION', () => {
  const poisoned = [
    { body: 'Revisei. Acho complexity: SIMPLES.' },
    { body: '### ORCHESTRATOR_DECISION v1\ncomplexity: COMPLEXA' },
  ];
  assert.strictEqual(parseComplexity(poisoned), 'COMPLEXA');
});

test('sem bloco ORCHESTRATOR_DECISION → null mesmo que prosa cite complexity', () => {
  assert.strictEqual(parseComplexity([{ body: 'complexity: COMPLEXA citada em prosa' }]), null);
});
