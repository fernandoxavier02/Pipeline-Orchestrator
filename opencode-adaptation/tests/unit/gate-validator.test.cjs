'use strict';

const assert = require('node:assert/strict');
const { validateGate } = require('../../src/validators/gate-validator.cjs');

let result = validateGate({
  question: 'Como seguir?',
  options: [
    { label: 'Seguir seguro (Recomendado)', description: 'Preserva TDD e escopo.' },
    { label: 'Seguir rapido', description: 'Aceita mais risco.' },
  ],
  safetyCritical: true,
});
assert.equal(result.ok, true);

result = validateGate({
  question: 'Escolha',
  options: [{ label: 'Unica', description: 'Opcao insuficiente.' }],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'INVALID_OPTION_COUNT');

result = validateGate({
  question: 'Escolha',
  options: [
    { label: 'A', description: 'Primeira.' },
    { label: 'B', description: 'Segunda.' },
    { label: 'C', description: 'Terceira.' },
    { label: 'D', description: 'Quarta.' },
    { label: 'E', description: 'Quinta.' },
  ],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'INVALID_OPTION_COUNT');

result = validateGate({
  question: 'Como seguir?',
  options: [
    { label: 'Mais rapido', description: 'Ignora parte da revisao.' },
    { label: 'Seguro (Recomendado)', description: 'Preserva protecao original.' },
  ],
  safetyCritical: true,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'RECOMMENDED_OPTION_NOT_FIRST');

result = validateGate({
  question: 'Como seguir?',
  options: [
    { label: 'Mais rapido', description: 'Ignora parte da revisao.' },
    { label: 'Seguro', description: 'Preserva protecao original.' },
  ],
  safetyCritical: true,
});
assert.equal(result.ok, false);
assert.equal(result.code, 'RECOMMENDED_OPTION_MISSING');

result = validateGate({
  question: 'Como seguir com TDD?',
  options: [
    { label: 'Mais rapido', description: 'Ignora parte da revisao.' },
    { label: 'Seguro', description: 'Preserva protecao original.' },
  ],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'RECOMMENDED_OPTION_MISSING');

result = validateGate({
  question: 'Como seguir?',
  options: [
    { label: 'A', description: 'Primeira.' },
    { label: 'B' },
  ],
});
assert.equal(result.ok, false);
assert.equal(result.code, 'OPTION_DESCRIPTION_MISSING');

console.log('gate validator OK');
