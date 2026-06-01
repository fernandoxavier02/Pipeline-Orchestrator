'use strict';
const { gateForBlock, expectedGates } = require('./mirror-fidelity-dictionary.cjs');

// Calcula a nota de UMA execução. complexity null → indeterminado (R1 do A5: não assumir).
function scoreExecution({ blocks, complexity }) {
  const expected = expectedGates(complexity);
  if (!complexity || expected.length === 0) {
    return { score: null, indeterminate: true, emitted: [], missing: [], expected };
  }
  const emitted = new Set();
  for (const b of blocks || []) {
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
