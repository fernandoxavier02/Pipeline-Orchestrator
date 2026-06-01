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

// ─── G3-Régua: D8 score — modo REVIEW_ONLY ────────────────────────────────────

test('T-G3-08 — REVIEW_ONLY cobertura total: score 1.0, indeterminate false (D8 caminho feliz)', () => {
  // SECURITY_FINDINGS → ADVERSARIAL_GATE; ADVERSARIAL_FINAL_VERDICT → FINAL_ADVERSARIAL_GATE.
  // complexity: null seria órfã sem REVIEW_ONLY_MODE — com o marcador, não é.
  const r = scoreExecution({
    blocks: ['REVIEW_ONLY_MODE', 'SECURITY_FINDINGS', 'ADVERSARIAL_FINAL_VERDICT'],
    complexity: null,
  });
  assert.strictEqual(r.indeterminate, false);
  assert.strictEqual(r.score, 1.0);
  assert.deepStrictEqual(r.missing, []);
});

test('T-G3-09 — REVIEW_ONLY cobertura parcial: score 0.5, FINAL_ADVERSARIAL_GATE ausente (D8)', () => {
  // Apenas SECURITY_FINDINGS → ADVERSARIAL_GATE; FINAL_ADVERSARIAL_GATE falta.
  const r = scoreExecution({
    blocks: ['REVIEW_ONLY_MODE', 'SECURITY_FINDINGS'],
    complexity: null,
  });
  assert.strictEqual(r.indeterminate, false);
  assert.strictEqual(r.score, 0.5);
  assert.ok(r.missing.includes('FINAL_ADVERSARIAL_GATE'), 'FINAL_ADVERSARIAL_GATE deve estar em missing');
});

test('T-G3-10 — REVIEW_ONLY sobrepõe complexidade declarada COMPLEXA (D8 modo > complexity)', () => {
  // Com REVIEW_ONLY_MODE, usa lista de 2 portões, não a lista COMPLEXA de 16.
  const r = scoreExecution({
    blocks: ['REVIEW_ONLY_MODE'],
    complexity: 'COMPLEXA',
  });
  // expected deve ser a lista REVIEW_ONLY (2 portões), não COMPLEXA (16 portões)
  assert.strictEqual(r.indeterminate, false, 'modo REVIEW_ONLY nunca produz execução órfã');
  assert.strictEqual(r.expected.length, 2, `esperado 2 portões (REVIEW_ONLY), obteve ${r.expected.length}`);
});

test('T-G3-11 — REVIEW_ONLY sem blocos de portão: score 0, ambos os portões ausentes, não-órfã (D8)', () => {
  // REVIEW_ONLY_MODE sozinho — sem nenhum bloco de portão coberto.
  const r = scoreExecution({
    blocks: ['REVIEW_ONLY_MODE'],
    complexity: null,
  });
  assert.strictEqual(r.indeterminate, false);
  assert.strictEqual(r.score, 0);
  assert.ok(r.missing.includes('ADVERSARIAL_GATE'), 'ADVERSARIAL_GATE deve estar em missing');
  assert.ok(r.missing.includes('FINAL_ADVERSARIAL_GATE'), 'FINAL_ADVERSARIAL_GATE deve estar em missing');
});

test('T-G3-12 — sem REVIEW_ONLY_MODE e sem complexity: continua órfã (regressão D8)', () => {
  // Garante que o comportamento existente de indeterminate não regride.
  const r = scoreExecution({ blocks: ['TDD_GREEN'], complexity: null });
  assert.strictEqual(r.indeterminate, true);
  assert.strictEqual(r.score, null);
});

test('T-G3-13 — D7+D8 combinados: SANITY_RESULT cobre CHECKPOINT_FAIL em execução SIMPLES (score 1.0)', () => {
  // SANITY_RESULT (D7) é alternativa a REGRESSION_RESULT para cobrir CHECKPOINT_FAIL.
  // Blocos: CLARIFICATION_DONE→INFO_GATE_BLOCKED, TDD_GREEN→TDD_APPROVAL,
  //         SANITY_RESULT→CHECKPOINT_FAIL, ORCHESTRATOR_DECISION→COMPLEXITY_GATE, SLICE_CLOSEOUT→CLOSEOUT_CONFIRM.
  const r = scoreExecution({
    blocks: ['CLARIFICATION_DONE', 'TDD_GREEN', 'SANITY_RESULT', 'ORCHESTRATOR_DECISION', 'SLICE_CLOSEOUT'],
    complexity: 'SIMPLES',
  });
  assert.strictEqual(r.score, 1.0, `score deve ser 1.0; ausentes: ${JSON.stringify(r.missing)}`);
  assert.deepStrictEqual(r.missing, []);
  assert.ok(r.emitted.includes('CHECKPOINT_FAIL'), 'CHECKPOINT_FAIL deve estar em emitted via SANITY_RESULT');
});
