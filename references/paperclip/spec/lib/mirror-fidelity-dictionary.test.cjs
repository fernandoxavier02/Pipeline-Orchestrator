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
