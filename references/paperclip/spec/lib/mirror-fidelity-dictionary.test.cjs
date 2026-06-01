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

test('DISPATCH_REQUEST não mapeia para portão (informacional, mapeamento morto removido)', () => {
  // "DISPATCH" não está em nenhum conjunto esperado; mapeá-lo era enganoso (R-HIGH-3).
  assert.strictEqual(gateForBlock('DISPATCH_REQUEST'), null);
  assert.ok(!Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'DISPATCH_REQUEST'));
});

test('novos mapeamentos-inferência v1 do inventário real (30 tipos de bloco)', () => {
  // TDD (RED reforça GREEN)
  assert.strictEqual(gateForBlock('TDD_RED'), 'TDD_APPROVAL');
  // regressão/teste = portão de build/test
  assert.strictEqual(gateForBlock('REGRESSION_RESULT'), 'CHECKPOINT_FAIL');
  assert.strictEqual(gateForBlock('REGRESSION_CLOSEOUT'), 'CHECKPOINT_FAIL');
  // fix só ocorre após findings que bloquearam
  assert.strictEqual(gateForBlock('EXECUTOR_FIX_DONE'), 'ADVERSARIAL_BLOCK');
  assert.strictEqual(gateForBlock('FIX_COMPLETE'), 'ADVERSARIAL_BLOCK');
  assert.strictEqual(gateForBlock('FIX_APPLIED'), 'ADVERSARIAL_BLOCK');
  // veredicto final adversarial
  assert.strictEqual(gateForBlock('ADVERSARIAL_FINAL_VERDICT'), 'FINAL_ADVERSARIAL_GATE');
  // consolidação/findings do gate adversarial por lote
  assert.strictEqual(gateForBlock('ADVERSARIAL_CONSOLIDATED_CORRECTION'), 'ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('SECURITY_FINDINGS'), 'ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('QUALITY_FINDINGS'), 'ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('ARCHITECTURE_FINDINGS'), 'ADVERSARIAL_GATE');
  assert.strictEqual(gateForBlock('SECURITY_RERUN_FINDINGS'), 'ADVERSARIAL_GATE');
  // fechamento
  assert.strictEqual(gateForBlock('SPEC_CLOSER'), 'CLOSEOUT_CONFIRM');
  // triagem = decisão de complexidade
  assert.strictEqual(gateForBlock('TRIAGE_RESULT'), 'COMPLEXITY_GATE');
});

test('blocos informacionais NÃO mapeiam para portão (não são portões medidos)', () => {
  const informational = [
    'DISPATCH_REQUEST', 'DELEGATED_FOLLOWUP', 'RECOVERY_COMPLETE',
    'RECOVERY_DISPOSITION', 'RECOVERY_RESUME_ACK', 'DISPATCH_CORRECTION',
    'ROOT_CAUSE_RESULT', 'HANDOFF_FOR_REVIEW', 'IMPLEMENTER_RERUN_HANDOFF',
    'CANONICAL_FALLBACK_APPLIED',
  ];
  for (const b of informational) {
    assert.strictEqual(gateForBlock(b), null, `${b} deveria ser informacional (null)`);
    assert.ok(!Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, b), `${b} não deveria estar em BLOCK_TO_GATE`);
  }
});

test('conjunto de portões esperados por complexidade', () => {
  assert.strictEqual(expectedGates('SIMPLES').length, 5);
  assert.strictEqual(expectedGates('COMPLEXA').length, 16);
  assert.ok(expectedGates('COMPLEXA').includes('ADVERSARIAL_GATE_MANDATORY'));
  assert.deepStrictEqual(expectedGates('XPTO'), []); // complexidade desconhecida → vazio
});

test('A1 — CLARIFICATION_DONE mapeia para INFO_GATE_BLOCKED (fecha lacuna do portão de entrada)', () => {
  // Req 5.1/5.2: o nó "clarificar" da fábrica de árvore de tasks emite o bloco
  // CLARIFICATION_DONE ao concluir o ciclo de info-gate. Antes deste mapeamento,
  // INFO_GATE_BLOCKED estava em EXPECTED_GATES.SIMPLES mas não tinha NENHUM bloco-fonte
  // em BLOCK_TO_GATE — o teto de uma execução SIMPLES perfeita era 4/5 = 0.80 em vez de 1.0.
  // Este mapeamento FECHA essa lacuna: CLARIFICATION_DONE → INFO_GATE_BLOCKED.
  assert.strictEqual(gateForBlock('CLARIFICATION_DONE'), 'INFO_GATE_BLOCKED');
  assert.ok(Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'CLARIFICATION_DONE'));
});

// ─── G3-Régua: D7 (SANITY_RESULT) + D8 (REVIEW_ONLY) ─────────────────────────

test('T-G3-01 — SANITY_CHECK mapeia para CHECKPOINT_FAIL (D7)', () => {
  // Decisão D7: o nó de sanidade do tronco emite SANITY_CHECK ao concluir
  // (agents/core/sanity-checker.md:78 + agents/core/final-validator.md:56).
  // Sem mapeamento, esse bloco era invisível para a régua (gap G2/G-HF2).
  // Com o mapeamento, a sanidade aparece na nota como CHECKPOINT_FAIL.
  assert.strictEqual(gateForBlock('SANITY_CHECK'), 'CHECKPOINT_FAIL');
});

test('T-G3-02 — SANITY_CHECK é chave própria de BLOCK_TO_GATE (D7)', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'SANITY_CHECK'));
});

test('T-G3-03 — REVIEW_ONLY_SCORE é chave própria de BLOCK_TO_GATE (D8)', () => {
  // REVIEW_ONLY_SCORE é o marcador de modo emitido pelo RO-N0. Mapeia para COMPLEXITY_GATE
  // para que P6 (todo bloco emitido por nó → portão) passe.
  assert.strictEqual(gateForBlock('REVIEW_ONLY_SCORE'), 'COMPLEXITY_GATE');
  assert.ok(Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'REVIEW_ONLY_SCORE'));
});

test('T-G3-04 — expectedGates(REVIEW_ONLY) tem exatamente 2 portões (D8)', () => {
  // EXPECTED_GATES.REVIEW_ONLY: portões que o modo review-only realmente exercita
  // segundo _modos.md §2.4–2.5 (RO-N2 emite ADVERSARIAL_GATE; RO-N3 emite FINAL_ADVERSARIAL_GATE).
  assert.strictEqual(expectedGates('REVIEW_ONLY').length, 2);
});

test('T-G3-05 — expectedGates(REVIEW_ONLY) contém ADVERSARIAL_GATE e FINAL_ADVERSARIAL_GATE (D8)', () => {
  const gates = expectedGates('REVIEW_ONLY');
  assert.ok(gates.includes('ADVERSARIAL_GATE'), 'deve incluir ADVERSARIAL_GATE');
  assert.ok(gates.includes('FINAL_ADVERSARIAL_GATE'), 'deve incluir FINAL_ADVERSARIAL_GATE');
});

test('T-G3-06 — REVIEW_ONLY_MODE não está em BLOCK_TO_GATE (marcador de modo, não portão de fidelidade)', () => {
  assert.strictEqual(gateForBlock('REVIEW_ONLY_MODE'), null);
  assert.ok(!Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'REVIEW_ONLY_MODE'));
});

test('T-G3-07 — conjuntos existentes SIMPLES e COMPLEXA não regridem (D8 regressão)', () => {
  assert.strictEqual(expectedGates('SIMPLES').length, 5);
  assert.strictEqual(expectedGates('COMPLEXA').length, 16);
});
