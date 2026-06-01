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

// ─── G3-Régua: D7 (SANITY_CHECK) + D8-fix (REVIEW_ONLY = N/A por design) ─────

test('T-G3-01 — SANITY_CHECK NÃO está em BLOCK_TO_GATE (Gap G2 aberto — alinhado com SSOT _fidelidade.md §5)', () => {
  // Achado adversarial D7 (G3-Régua): o código tinha SANITY_CHECK mapeado (22 entradas),
  // mas _fidelidade.md §5 linha 118 declara explicitamente "sem mapeamento atual (ver Gap G2)"
  // e §2 linha 65 calcula tetos assumindo "21 mapeamentos" com SANITY_CHECK FORA.
  // Motivo técnico: agente real emite "SANITY_CHECK:" como YAML, não "### SANITY_CHECK v1".
  // O parser só reconhece cabeçalhos — o mapeamento seria inerte de qualquer forma.
  // Gap G2 permanece ABERTO por decisão do usuário (_tronco.md §5, _modos.md §1.5 G-HF2).
  assert.strictEqual(gateForBlock('SANITY_CHECK'), null);
});

test('T-G3-02 — SANITY_CHECK não é chave de BLOCK_TO_GATE (divergência com SSOT corrigida — D7)', () => {
  // Complemento do T-G3-01: verifica ausência na estrutura interna, não apenas no lookup.
  assert.ok(!Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'SANITY_CHECK'));
});

test('T-G3-03 — REVIEW_ONLY_SCORE NÃO está em BLOCK_TO_GATE (bloco inventado removido — G-RO2)', () => {
  // REVIEW_ONLY_SCORE foi removido porque nenhum agente real o emite.
  // pipeline-controller.md:207-215 não emite marcador; execuções review-only ficam
  // com complexity=null (indeterminate=true). Decisão G-RO2 opção 2: score = N/A.
  assert.strictEqual(gateForBlock('REVIEW_ONLY_SCORE'), null);
  assert.ok(!Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'REVIEW_ONLY_SCORE'));
});

test('T-G3-04 — expectedGates(REVIEW_ONLY) retorna [] (REVIEW-ONLY excluído da régua — G-RO2)', () => {
  // Não há entrada REVIEW_ONLY em EXPECTED_GATES. expectedGates de complexidade
  // desconhecida retorna [], o que faz scoreExecution retornar indeterminate=true.
  assert.strictEqual(expectedGates('REVIEW_ONLY').length, 0);
});

test('T-G3-05 — REVIEW_ONLY_MODE não está em BLOCK_TO_GATE (nunca foi emitido por agente real)', () => {
  // Nem REVIEW_ONLY_MODE (nome proposto na spec) nem REVIEW_ONLY_SCORE (nome implementado)
  // são emitidos por agentes reais. Ambos devem retornar null.
  assert.strictEqual(gateForBlock('REVIEW_ONLY_MODE'), null);
  assert.ok(!Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, 'REVIEW_ONLY_MODE'));
});

test('T-G3-06 — execução review-only real resulta em indeterminate=true (G-RO2 opção 2)', () => {
  // Uma execução real review-only tem PA_DE_CAL + ADVERSARIAL blocos mas sem ORCHESTRATOR_DECISION.
  // Resultado esperado: complexity=null → scoreExecution retorna indeterminate=true.
  const { scoreExecution } = require('./mirror-fidelity-score.cjs');
  const r = scoreExecution({
    blocks: ['PA_DE_CAL', 'ADVERSARIAL_CONSOLIDATED', 'ADVERSARIAL_FINAL_VERDICT'],
    complexity: null,
  });
  assert.strictEqual(r.indeterminate, true, 'execução review-only sem complexity deve ser indeterminate');
  assert.strictEqual(r.score, null, 'score deve ser null (N/A), não 0');
});

test('T-G3-07 — conjuntos existentes SIMPLES e COMPLEXA não regridem (regressão)', () => {
  assert.strictEqual(expectedGates('SIMPLES').length, 5);
  assert.strictEqual(expectedGates('COMPLEXA').length, 16);
});
