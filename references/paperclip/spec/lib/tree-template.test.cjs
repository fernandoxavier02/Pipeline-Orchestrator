'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { TEMPLATES } = require('./tree-template.cjs');
const { gateForBlock } = require('./mirror-fidelity-dictionary.cjs');

// GEN1 — molde declarativo (tree-template.cjs). Espelha a tabela do design §Molde Concreto.
// Cada nó = { step, role, blocks: [], blockedBy: <stepAnterior|null>, next: <step|null> }.

test('TEMPLATES expõe SIMPLES e COMPLEXA como arrays de nós', () => {
  assert.ok(Array.isArray(TEMPLATES.SIMPLES), 'SIMPLES deve ser array');
  assert.ok(Array.isArray(TEMPLATES.COMPLEXA), 'COMPLEXA deve ser array');
});

test('SIMPLES tem 5 nós na ordem certa', () => {
  const steps = TEMPLATES.SIMPLES.map((n) => n.step);
  assert.deepStrictEqual(steps, ['classificar', 'clarificar', 'implementar', 'revisar', 'fechar']);
});

test('SIMPLES — cada nó declara role + blocks + next; receita exata do design', () => {
  const byStep = Object.fromEntries(TEMPLATES.SIMPLES.map((n) => [n.step, n]));

  assert.deepStrictEqual(byStep.classificar, {
    step: 'classificar', role: 'pipeline-controller',
    blocks: ['ORCHESTRATOR_DECISION'], blockedBy: null, next: 'clarificar',
  });
  assert.deepStrictEqual(byStep.clarificar, {
    step: 'clarificar', role: 'information-gate',
    blocks: ['CLARIFICATION_DONE'], blockedBy: 'classificar', next: 'implementar',
  });
  assert.deepStrictEqual(byStep.implementar, {
    step: 'implementar', role: 'feature-implementer',
    blocks: ['TDD_GREEN', 'REGRESSION_RESULT'], blockedBy: 'clarificar', next: 'revisar',
  });
  assert.deepStrictEqual(byStep.revisar, {
    step: 'revisar', role: 'adversarial-review-coordinator',
    blocks: ['ADVERSARIAL_CONSOLIDATED'], blockedBy: 'implementar', next: 'fechar',
  });
  assert.deepStrictEqual(byStep.fechar, {
    step: 'fechar', role: 'final-validator',
    blocks: ['SLICE_CLOSEOUT', 'PA_DE_CAL'], blockedBy: 'revisar', next: null,
  });
});

test('COMPLEXA tem 7 nós: insere planejar + aprovar entre clarificar e implementar', () => {
  const steps = TEMPLATES.COMPLEXA.map((n) => n.step);
  assert.deepStrictEqual(steps, [
    'classificar', 'clarificar', 'planejar', 'aprovar', 'implementar', 'revisar', 'fechar',
  ]);
});

test('COMPLEXA — nós inseridos e religados conforme o design', () => {
  const byStep = Object.fromEntries(TEMPLATES.COMPLEXA.map((n) => [n.step, n]));

  // clarificar agora aponta para planejar
  assert.strictEqual(byStep.clarificar.next, 'planejar');
  // planejar: plan-architect, blocks vazio de propósito (PLAN_REJECTED sem bloco-fonte — Grupo D)
  assert.deepStrictEqual(byStep.planejar, {
    step: 'planejar', role: 'plan-architect',
    blocks: [], blockedBy: 'clarificar', next: 'aprovar',
  });
  // aprovar: trava estrutural, blocks vazio (D-F1)
  assert.deepStrictEqual(byStep.aprovar, {
    step: 'aprovar', role: 'final-validator',
    blocks: [], blockedBy: 'planejar', next: 'implementar',
  });
  // implementar agora travado por aprovar
  assert.strictEqual(byStep.implementar.blockedBy, 'aprovar');
  // revisar usa o trio reforçado
  assert.deepStrictEqual(byStep.revisar.blocks, [
    'SECURITY_FINDINGS', 'ARCHITECTURE_FINDINGS', 'QUALITY_FINDINGS',
  ]);
});

test('P6 (consistência) — todo bloco não-vazio de todo nó (exceto ORCHESTRATOR_DECISION) mapeia para um portão não-nulo', () => {
  for (const [complexity, nodes] of Object.entries(TEMPLATES)) {
    for (const node of nodes) {
      for (const block of node.blocks) {
        if (block === 'ORCHESTRATOR_DECISION') continue; // só infere complexidade, não é portão medido
        const gate = gateForBlock(block);
        assert.notStrictEqual(
          gate, null,
          `[${complexity}/${node.step}] bloco "${block}" não tem mapeamento em BLOCK_TO_GATE`,
        );
      }
    }
  }
});
