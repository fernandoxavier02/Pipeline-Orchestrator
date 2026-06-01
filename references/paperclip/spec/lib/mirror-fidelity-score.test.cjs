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
