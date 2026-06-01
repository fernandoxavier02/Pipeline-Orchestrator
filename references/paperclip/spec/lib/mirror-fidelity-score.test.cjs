'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scoreExecution } = require('./mirror-fidelity-score.cjs');

test('nota = emitidos∩esperados / esperados, com faltantes listados', () => {
  // blocos detectados: TDD_GREEN→TDD_APPROVAL, PA_DE_CAL→FINAL_ADVERSARIAL_GATE, ORCHESTRATOR_DECISION→COMPLEXITY_GATE
  const r = scoreExecution({ blocks: ['TDD_GREEN', 'PA_DE_CAL', 'ORCHESTRATOR_DECISION'], complexity: 'SIMPLES' });
  // esperados SIMPLES (5): INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM
  // emitidos que são esperados: TDD_APPROVAL, COMPLEXITY_GATE = 2/5
  assert.strictEqual(r.score, 0.4);
  assert.deepStrictEqual(r.missing.sort(), ['CHECKPOINT_FAIL', 'CLOSEOUT_CONFIRM', 'INFO_GATE_BLOCKED']);
});

test('complexidade desconhecida → score null (indeterminado, não 0)', () => {
  const r = scoreExecution({ blocks: ['TDD_GREEN'], complexity: null });
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.indeterminate, true);
});

test('A2 — teto SIMPLES: execução com blocos que cobrem os 5 portões esperados pontua 1.0', () => {
  // Montagem dos blocos que mapeiam a cada um dos 5 portões de EXPECTED_GATES.SIMPLES:
  //   CLARIFICATION_DONE  → INFO_GATE_BLOCKED  (via mapeamento A1)
  //   TDD_GREEN           → TDD_APPROVAL
  //   REGRESSION_RESULT   → CHECKPOINT_FAIL
  //   ORCHESTRATOR_DECISION → COMPLEXITY_GATE
  //   SLICE_CLOSEOUT      → CLOSEOUT_CONFIRM
  // Antes do A1, o teto era 0.80 (INFO_GATE_BLOCKED jamais coberto). Agora deve ser 1.0.
  const r = scoreExecution({
    blocks: ['CLARIFICATION_DONE', 'TDD_GREEN', 'REGRESSION_RESULT', 'ORCHESTRATOR_DECISION', 'SLICE_CLOSEOUT'],
    complexity: 'SIMPLES',
  });
  assert.strictEqual(r.score, 1, `score SIMPLES com cobertura total deveria ser 1.0, obteve ${r.score}; portões ausentes: ${JSON.stringify(r.missing)}`);
  assert.deepStrictEqual(r.missing, []);
});

// ─── G3-D8-fix: REVIEW-ONLY = indeterminate por design (G-RO2 opção 2) ────────

test('T-G3-08 — execução review-only real (sem ORCHESTRATOR_DECISION): indeterminate=true, score=null', () => {
  // Blocos reais de uma execução review-only: adversarial + final adversarial + pa de cal.
  // Sem ORCHESTRATOR_DECISION, complexity=null → scoreExecution retorna indeterminate=true.
  // Isso é por design (G-RO2): a régua não avalia o que não tem bloco-fonte de complexidade.
  const r = scoreExecution({
    blocks: ['ADVERSARIAL_CONSOLIDATED', 'ADVERSARIAL_FINAL_VERDICT', 'PA_DE_CAL', 'SLICE_CLOSEOUT'],
    complexity: null,
  });
  assert.strictEqual(r.indeterminate, true, 'execução review-only deve ser indeterminate');
  assert.strictEqual(r.score, null, 'score deve ser null (N/A)');
});

test('T-G3-09 — complexity=REVIEW_ONLY retorna indeterminate=true (expectedGates vazio)', () => {
  // Não há entrada REVIEW_ONLY em EXPECTED_GATES; expectedGates('REVIEW_ONLY') = [].
  // scoreExecution com expected.length=0 retorna indeterminate=true.
  const r = scoreExecution({
    blocks: ['ADVERSARIAL_CONSOLIDATED'],
    complexity: 'REVIEW_ONLY',
  });
  assert.strictEqual(r.indeterminate, true, 'REVIEW_ONLY não é complexidade avaliável');
  assert.strictEqual(r.score, null);
});

test('T-G3-10 — execução SIMPLES não regride após remoção de REVIEW_ONLY_SCORE', () => {
  // Garante que a remoção do REVIEW_ONLY_SCORE não afetou o caminho SIMPLES.
  const r = scoreExecution({
    blocks: ['CLARIFICATION_DONE', 'TDD_GREEN', 'REGRESSION_RESULT', 'ORCHESTRATOR_DECISION', 'SLICE_CLOSEOUT'],
    complexity: 'SIMPLES',
  });
  assert.strictEqual(r.indeterminate, false);
  assert.strictEqual(r.score, 1.0);
});

test('T-G3-11 — execução sem complexity e sem blocos adversariais: indeterminate=true (regressão)', () => {
  // Caso base: sem complexidade, qualquer execução é indeterminate.
  const r = scoreExecution({ blocks: ['TDD_GREEN'], complexity: null });
  assert.strictEqual(r.indeterminate, true);
  assert.strictEqual(r.score, null);
});

test('T-G3-12 — complexity=null com blocos review-only reais: indeterminate=true (prova do D8-fix)', () => {
  // Prova que uma execução review-only realista (PA_DE_CAL + ADVERSARIAL sem ORCHESTRATOR_DECISION)
  // retorna indeterminate, não score 1.0 como o D8 original prometia.
  const r = scoreExecution({
    blocks: ['PA_DE_CAL', 'ADVERSARIAL_FINAL_VERDICT', 'ADVERSARIAL_CONSOLIDATED'],
    complexity: null,
  });
  assert.strictEqual(r.indeterminate, true, 'review-only real deve ser indeterminate (não score 1.0)');
  assert.strictEqual(r.score, null);
});

test('T-G3-13 — D7-fix: SANITY_CHECK não mapeia (Gap G2 aberto); REGRESSION_RESULT ainda cobre CHECKPOINT_FAIL em SIMPLES (score 1.0)', () => {
  // Achado adversarial D7 (G3-Régua): SANITY_CHECK foi removido de BLOCK_TO_GATE para alinhar
  // com _fidelidade.md §5 ("sem mapeamento atual — Gap G2 aberto") e §2 ("21 mapeamentos").
  // REGRESSION_RESULT (e REGRESSION_CLOSEOUT) continuam sendo o bloco-fonte canônico para
  // CHECKPOINT_FAIL. O teto SIMPLES = 1.0 é atingível via REGRESSION_RESULT, não SANITY_CHECK.
  // Blocos: CLARIFICATION_DONE→INFO_GATE_BLOCKED, TDD_GREEN→TDD_APPROVAL,
  //         REGRESSION_RESULT→CHECKPOINT_FAIL, ORCHESTRATOR_DECISION→COMPLEXITY_GATE, SLICE_CLOSEOUT→CLOSEOUT_CONFIRM.
  const r = scoreExecution({
    blocks: ['CLARIFICATION_DONE', 'TDD_GREEN', 'REGRESSION_RESULT', 'ORCHESTRATOR_DECISION', 'SLICE_CLOSEOUT'],
    complexity: 'SIMPLES',
  });
  assert.strictEqual(r.score, 1.0, `score deve ser 1.0; ausentes: ${JSON.stringify(r.missing)}`);
  assert.deepStrictEqual(r.missing, []);
  assert.ok(r.emitted.includes('CHECKPOINT_FAIL'), 'CHECKPOINT_FAIL deve estar em emitted via REGRESSION_RESULT');
});
