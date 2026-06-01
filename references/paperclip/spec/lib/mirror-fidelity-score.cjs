'use strict';
const { gateForBlock, expectedGates } = require('./mirror-fidelity-dictionary.cjs');

// Calcula a nota de UMA execução. complexity null → indeterminado (R1 do A5: não assumir).
//
// CONTRATO: o chamador DEVE checar `indeterminate` ANTES de usar `score`. Quando
// indeterminate=true, score é null = "não-avaliável" (complexidade não detectada),
// que é DIFERENTE de score 0 = "avaliado e zerou". Tratar null como 0 distorce a
// média agregada para baixo.
//
// Nota sobre REVIEW-ONLY (G-RO2): execuções review-only não emitem ORCHESTRATOR_DECISION,
// portanto parseComplexity retorna null → complexity=null → indeterminate=true (score=N/A).
// Essa é a saída correta por design: a régua é excluída do modo review-only.
// Ver mirror-fidelity-dictionary.cjs §REVIEW-ONLY para detalhes da decisão.
function scoreExecution({ blocks, complexity }) {
  const blockList = blocks || [];

  const expected = expectedGates(complexity);
  if (!complexity || expected.length === 0) {
    return { score: null, indeterminate: true, emitted: [], missing: [], expected };
  }
  const emitted = new Set();
  for (const b of blockList) {
    const g = gateForBlock(b);
    if (g) emitted.add(g);
  }
  const expectedSet = new Set(expected);
  const hit = [...emitted].filter((g) => expectedSet.has(g));
  const missing = expected.filter((g) => !emitted.has(g));
  const score = Math.round((hit.length / expected.length) * 100) / 100;
  return { score, indeterminate: false, emitted: [...emitted], hit, missing, expected };
}

module.exports = { scoreExecution };
