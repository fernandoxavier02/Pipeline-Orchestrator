'use strict';
const { gateForBlock, expectedGates } = require('./mirror-fidelity-dictionary.cjs');

// Calcula a nota de UMA execução. complexity null → indeterminado (R1 do A5: não assumir).
//
// CONTRATO: o chamador DEVE checar `indeterminate` ANTES de usar `score`. Quando
// indeterminate=true, score é null = "não-avaliável" (complexidade não detectada),
// que é DIFERENTE de score 0 = "avaliado e zerou". Tratar null como 0 distorce a
// média agregada para baixo.
//
// D8: Se REVIEW_ONLY_MODE estiver nos blocos, usa EXPECTED_GATES.REVIEW_ONLY em vez de
// inferir a complexidade. Isso evita execução órfã no modo review-only e sobrepõe qualquer
// complexity declarada (inclusive null). O campo `mode: 'REVIEW_ONLY'` é conveniente para
// depuração mas não é contrato crítico.
function scoreExecution({ blocks, complexity }) {
  const blockList = blocks || [];

  // D8: detecção de modo REVIEW_ONLY — sobrepõe complexity
  if (blockList.includes('REVIEW_ONLY_MODE')) {
    const expected = expectedGates('REVIEW_ONLY');
    const emitted = new Set();
    for (const b of blockList) {
      const g = gateForBlock(b);
      if (g) emitted.add(g);
    }
    const expectedSet = new Set(expected);
    const hit = [...emitted].filter((g) => expectedSet.has(g));
    const missing = expected.filter((g) => !emitted.has(g));
    const score = expected.length === 0 ? 0 : Math.round((hit.length / expected.length) * 100) / 100;
    return { score, indeterminate: false, mode: 'REVIEW_ONLY', emitted: [...emitted], hit, missing, expected };
  }

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
