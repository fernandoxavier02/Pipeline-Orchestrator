'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('./mirror-fidelity-report.cjs');

test('agrega nota média (ignorando indeterminados) e ranqueia portões mais ausentes', () => {
  const rows = [
    { identifier: 'PIP-1', complexity: 'SIMPLES', score: 0.4, missing: ['INFO_GATE_BLOCKED', 'CHECKPOINT_FAIL'], indeterminate: false },
    { identifier: 'PIP-2', complexity: 'SIMPLES', score: 0.6, missing: ['INFO_GATE_BLOCKED'], indeterminate: false },
    { identifier: 'PIP-3', complexity: null, score: null, missing: [], indeterminate: true },
  ];
  const md = buildReport(rows);
  assert.match(md, /Nota média: 0\.50/);          // (0.4+0.6)/2
  assert.match(md, /INFO_GATE_BLOCKED.*2/);        // portão mais ausente
  assert.match(md, /indeterminad/i);               // PIP-3 reportado, não contado
});

test('CORREÇÃO C: nenhuma execução pontuada → Nota média N/A, nunca 0.00', () => {
  const rows = [
    { identifier: 'PIP-1', complexity: null, score: null, missing: [], indeterminate: true },
    { identifier: 'PIP-2', complexity: null, score: null, missing: [], indeterminate: true },
  ];
  const md = buildReport(rows);
  assert.match(md, /Nota média: N\/A/);
  assert.doesNotMatch(md, /Nota média: 0\.00/);
});

test('CORREÇÃO D: row pontuada sem o campo missing não derruba o relatório', () => {
  const rows = [
    { identifier: 'PIP-1', complexity: 'SIMPLES', score: 0.4, indeterminate: false }, // sem missing
  ];
  let md;
  assert.doesNotThrow(() => { md = buildReport(rows); });
  assert.match(md, /PIP-1 \[SIMPLES\]: 0\.40/);
});

test('MUDANÇA 4: orphanCount passado como segundo parâmetro aparece no relatório', () => {
  const rows = [
    { identifier: 'PIP-1', complexity: 'SIMPLES', score: 0.4, missing: [], indeterminate: false },
  ];
  const md = buildReport(rows, { orphanCount: 3 });
  assert.match(md, /[Óó]rf[aã]/i, 'deve mencionar órfãs');
  assert.match(md, /3/, 'deve mostrar o número 3');
});

test('MUDANÇA 4: orphanCount ausente (chamada legada sem segundo parâmetro) não quebra', () => {
  const rows = [
    { identifier: 'PIP-1', complexity: 'SIMPLES', score: 0.6, missing: [], indeterminate: false },
  ];
  let md;
  assert.doesNotThrow(() => { md = buildReport(rows); });
  assert.match(md, /Nota média: 0\.60/);
});
