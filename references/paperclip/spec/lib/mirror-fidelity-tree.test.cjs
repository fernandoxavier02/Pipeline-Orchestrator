'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scoreTrees } = require('./mirror-fidelity-tree.cjs');

// Helpers para construir comentários de bloco no formato aceito pelo parser
function commentOD(complexity) {
  return { body: `### ORCHESTRATOR_DECISION v1\ncomplexity: ${complexity}` };
}
function commentBlock(name) {
  return { body: `### ${name} v1\ndetalhe: qualquer` };
}

// CASO 1 — Raiz + dois filhos: nota da árvore > nota isolada da raiz
test('caso 1: raiz + filho F1(TDD_GREEN) + filho F2(PA_DE_CAL) — nota árvore > nota isolada', () => {
  const executions = [
    { id: 'R',  parentId: null, identifier: 'PIP-1', title: 'raiz',  comments: [commentOD('COMPLEXA')] },
    { id: 'F1', parentId: 'R',  identifier: 'PIP-2', title: 'filho1', comments: [commentBlock('TDD_GREEN')] },
    { id: 'F2', parentId: 'R',  identifier: 'PIP-3', title: 'filho2', comments: [commentBlock('PA_DE_CAL')] },
  ];
  const result = scoreTrees(executions);
  assert.strictEqual(result.trees.length, 1, 'deve haver exatamente 1 árvore');
  assert.strictEqual(result.orphanCount, 0);

  const tree = result.trees[0];
  assert.strictEqual(tree.identifier, 'PIP-1');
  assert.strictEqual(tree.complexity, 'COMPLEXA');
  assert.strictEqual(tree.memberCount, 3);

  // Nota isolada da raiz (só ORCHESTRATOR_DECISION → COMPLEXITY_GATE)
  const { scoreExecution } = require('./mirror-fidelity-score.cjs');
  const { parseBlocks, parseComplexity } = require('./mirror-fidelity-parser.cjs');
  const rootBlocks = parseBlocks(executions[0].comments);
  const rootComplexity = parseComplexity(executions[0].comments);
  const isolated = scoreExecution({ blocks: rootBlocks, complexity: rootComplexity });

  assert.ok(!tree.indeterminate, 'árvore deve ter nota determinada');
  assert.ok(typeof tree.score === 'number', 'score deve ser número');
  assert.ok(tree.score > isolated.score,
    `nota árvore (${tree.score}) deve ser > nota isolada (${isolated.score}) pois filhos trazem TDD_APPROVAL e FINAL_ADVERSARIAL_GATE`);
});

// CASO 2 — Execução sem complexity e sem ancestral → órfã
test('caso 2: execução sem complexity e sem ancestral com complexity → orphanCount=1, trees vazio', () => {
  const executions = [
    { id: 'X', parentId: null, identifier: 'PIP-99', title: 'sem pai nem complexity', comments: [commentBlock('TDD_GREEN')] },
  ];
  const result = scoreTrees(executions);
  assert.strictEqual(result.trees.length, 0, 'sem árvore');
  assert.strictEqual(result.orphanCount, 1);
  assert.deepStrictEqual(result.orphanIdentifiers, ['PIP-99']);
});

// CASO 3 — Neto sobe 2 níveis até raiz; blocks de R incluem TDD_APPROVAL
test('caso 3: neto G sobe 2 níveis até raiz R; blocks da árvore incluem TDD_APPROVAL', () => {
  const executions = [
    { id: 'R', parentId: null, identifier: 'PIP-10', title: 'raiz', comments: [commentOD('COMPLEXA')] },
    { id: 'F', parentId: 'R',  identifier: 'PIP-11', title: 'filho', comments: [] },
    { id: 'G', parentId: 'F',  identifier: 'PIP-12', title: 'neto',  comments: [commentBlock('TDD_GREEN')] },
  ];
  const result = scoreTrees(executions);
  assert.strictEqual(result.trees.length, 1);
  assert.strictEqual(result.orphanCount, 0);

  const tree = result.trees[0];
  assert.strictEqual(tree.memberCount, 3);
  // TDD_GREEN → TDD_APPROVAL; deve estar nos emitidos da árvore
  assert.ok(tree.emitted && tree.emitted.includes('TDD_APPROVAL'),
    `TDD_APPROVAL deve estar nos emitidos da árvore; emitidos = ${JSON.stringify(tree.emitted)}`);
});

// CASO 4 — Sub-pipeline aninhado: R(COMPLEXA) → S(SIMPLES) → filho de S → 2 árvores
test('caso 4: sub-pipeline aninhado — R e S são raízes próprias, filhos vão à raiz correta', () => {
  const executions = [
    { id: 'R',  parentId: null, identifier: 'PIP-20', title: 'raiz',       comments: [commentOD('COMPLEXA')] },
    { id: 'S',  parentId: 'R',  identifier: 'PIP-21', title: 'sub-raiz',   comments: [commentOD('SIMPLES')] },
    { id: 'FS', parentId: 'S',  identifier: 'PIP-22', title: 'filho de S', comments: [commentBlock('TDD_GREEN')] },
  ];
  const result = scoreTrees(executions);
  assert.strictEqual(result.trees.length, 2, 'deve haver 2 árvores');
  assert.strictEqual(result.orphanCount, 0);

  const byId = Object.fromEntries(result.trees.map((t) => [t.identifier, t]));
  assert.ok(byId['PIP-20'], 'R deve ser raiz');
  assert.ok(byId['PIP-21'], 'S deve ser raiz própria');

  // S tem 2 membros (S + FS), R tem apenas 1 membro (só ele, S virou raiz própria)
  assert.strictEqual(byId['PIP-21'].memberCount, 2, 'S + FS = 2 membros sob S');
  assert.strictEqual(byId['PIP-20'].memberCount, 1, 'R sozinho (S é sub-raiz)');
});

// CASO 5 — Ciclo: A.parentId=B, B.parentId=A, nenhum tem complexity → não trava, ambos órfãos
test('caso 5: ciclo A→B→A sem complexity → não trava, orphanCount=2', () => {
  const executions = [
    { id: 'A', parentId: 'B', identifier: 'PIP-30', title: 'a', comments: [] },
    { id: 'B', parentId: 'A', identifier: 'PIP-31', title: 'b', comments: [] },
  ];
  let result;
  assert.doesNotThrow(() => { result = scoreTrees(executions); }, 'não deve lançar erro com ciclo');
  assert.strictEqual(result.orphanCount, 2, 'ambos devem ser órfãos');
  assert.strictEqual(result.trees.length, 0);
});
