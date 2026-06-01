'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { BLOCK_TO_GATE, EXPECTED_GATES, gateForBlock, expectedGates } = require('./mirror-fidelity-dictionary.cjs');

test('mapeia bloco observado para portão canônico', () => {
  assert.strictEqual(gateForBlock('TDD_GREEN'), 'TDD_APPROVAL');
  assert.strictEqual(gateForBlock('ADVERSARIAL_CONSOLIDATED'), 'ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('PA_DE_CAL'), 'FINAL_ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('BLOCO_DESCONHECIDO'), null);
});

test('conjunto de portões esperados por complexidade', () => {
  assert.strictEqual(expectedGates('SIMPLES').length, 5);
  assert.strictEqual(expectedGates('COMPLEXA').length, 16);
  assert.ok(expectedGates('COMPLEXA').includes('ADVERSARIAL_GATE_MANDATORY'));
  assert.deepStrictEqual(expectedGates('XPTO'), []); // complexidade desconhecida → vazio
});
