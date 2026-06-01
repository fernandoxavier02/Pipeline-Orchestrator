'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { nextStep, nodeSpec, allParallelSteps, templateFor } = require('./tree-factory.cjs');
const { TEMPLATES } = require('./tree-template.cjs');

// GEN2 — nextStep(complexity, currentStep): decide o próximo nó (lê `next` do nó atual).
// currentStep === null retorna a raiz; fim retorna null.

test('P5 — SIMPLES: cadeia nextStep da raiz ao fim', () => {
  assert.strictEqual(nextStep('SIMPLES', null).step, 'classificar'); // raiz
  assert.strictEqual(nextStep('SIMPLES', 'classificar').step, 'clarificar');
  assert.strictEqual(nextStep('SIMPLES', 'clarificar').step, 'implementar');
  assert.strictEqual(nextStep('SIMPLES', 'implementar').step, 'revisar');
  assert.strictEqual(nextStep('SIMPLES', 'revisar').step, 'fechar');
  assert.strictEqual(nextStep('SIMPLES', 'fechar'), null); // fim
});

test('nextStep retorna o objeto-nó inteiro do template (não só o step)', () => {
  const raiz = nextStep('SIMPLES', null);
  assert.strictEqual(raiz, TEMPLATES.SIMPLES[0]); // mesma referência do molde
  assert.strictEqual(raiz.role, 'pipeline-controller');
});

test('nextStep — COMPLEXA atravessa planejar e aprovar', () => {
  assert.strictEqual(nextStep('COMPLEXA', 'clarificar').step, 'planejar');
  assert.strictEqual(nextStep('COMPLEXA', 'planejar').step, 'aprovar');
  assert.strictEqual(nextStep('COMPLEXA', 'aprovar').step, 'implementar');
});

test('nextStep — complexidade desconhecida → null', () => {
  assert.strictEqual(nextStep('XPTO', null), null);
});

test('nextStep — step inexistente no template lança erro (molde inconsistente)', () => {
  assert.throws(() => nextStep('SIMPLES', 'inexistente'), /inexistente/);
});

// GEN3 — nodeSpec(complexity, step, prevIssueId): payload puro da issue.
// { title, assigneeAgentId, blockedByIssueIds, body }.

test('P1 — assigneeAgentId é o cargo mapeado para cada step (SIMPLES)', () => {
  const expected = {
    classificar: 'pipeline-controller',
    clarificar: 'information-gate',
    implementar: 'feature-implementer',
    revisar: 'adversarial-review-coordinator',
    fechar: 'final-validator',
  };
  for (const [step, role] of Object.entries(expected)) {
    assert.strictEqual(nodeSpec('SIMPLES', step, null).assigneeAgentId, role);
  }
});

test('P1 — assigneeAgentId mapeado para os nós extras da COMPLEXA', () => {
  assert.strictEqual(nodeSpec('COMPLEXA', 'planejar', 'X').assigneeAgentId, 'plan-architect');
  assert.strictEqual(nodeSpec('COMPLEXA', 'aprovar', 'X').assigneeAgentId, 'final-validator');
});

test('P2 — nó de implementação com prevIssueId tem exatamente 1 blocker', () => {
  const impl = nodeSpec('SIMPLES', 'implementar', 'ISSUE-42');
  assert.strictEqual(impl.blockedByIssueIds.length, 1);
  assert.deepStrictEqual(impl.blockedByIssueIds, ['ISSUE-42']);

  const rev = nodeSpec('SIMPLES', 'revisar', 'ISSUE-99');
  assert.strictEqual(rev.blockedByIssueIds.length, 1);
  const fec = nodeSpec('SIMPLES', 'fechar', 'ISSUE-7');
  assert.strictEqual(fec.blockedByIssueIds.length, 1);
});

test('P2 — raiz sem prevIssueId tem blockedByIssueIds vazio', () => {
  const root = nodeSpec('SIMPLES', 'classificar', null);
  assert.deepStrictEqual(root.blockedByIssueIds, []);
});

test('nodeSpec — title menciona o step', () => {
  const spec = nodeSpec('SIMPLES', 'implementar', 'X');
  assert.match(spec.title, /implementar/);
});

test('body menciona cada bloco do nó e o NEXT_STEP correto (implementar→revisar)', () => {
  const spec = nodeSpec('SIMPLES', 'implementar', 'ISSUE-42');
  assert.match(spec.body, /TDD_GREEN/);
  assert.match(spec.body, /REGRESSION_RESULT/);
  assert.match(spec.body, /NEXT_STEP:\s*revisar/);
});

test('body do nó final marca NEXT_STEP: FIM', () => {
  const spec = nodeSpec('SIMPLES', 'fechar', 'ISSUE-9');
  assert.match(spec.body, /SLICE_CLOSEOUT/);
  assert.match(spec.body, /PA_DE_CAL/);
  assert.match(spec.body, /NEXT_STEP:\s*FIM/);
});

test('body de nó sem blocks (aprovar) não inventa bloco e ainda traz NEXT_STEP', () => {
  const spec = nodeSpec('COMPLEXA', 'aprovar', 'ISSUE-3');
  assert.match(spec.body, /NEXT_STEP:\s*implementar/);
});

test('nodeSpec — step inexistente lança erro', () => {
  assert.throws(() => nodeSpec('SIMPLES', 'planejar', 'X'), /planejar/); // planejar não existe em SIMPLES
});

// ─── NOVOS TESTES — ACHADOS CRÍTICOS/HIGH G1-Moldes ──────────────────────────

// F1/F3 — templateFor com tipo hierárquico retorna array (não TypeError)
test('F1/F3 — templateFor(feature, light) retorna array de nós', () => {
  const nodes = templateFor('feature', 'light');
  assert.ok(Array.isArray(nodes), 'feature.light deve ser array');
  assert.ok(nodes.length > 0, 'feature.light não deve ser vazio');
});

test('F1/F3 — templateFor(bugfix, heavy) retorna array de nós', () => {
  const nodes = templateFor('bugfix', 'heavy');
  assert.ok(Array.isArray(nodes), 'bugfix.heavy deve ser array');
});

test('F1/F3 — templateFor com variante desconhecida retorna null (sem lançar)', () => {
  const nodes = templateFor('feature', 'desconhecida');
  assert.strictEqual(nodes, null, 'variante desconhecida deve retornar null');
});

// F1/F3 — nextStep com tipo hierárquico caminha sem TypeError
test('F1/F3 — nextStep(feature, null, light) retorna a raiz sem TypeError', () => {
  const root = nextStep('feature', null, 'light');
  assert.ok(root !== null, 'raiz de feature.light não deve ser null');
  assert.strictEqual(typeof root.step, 'string', 'raiz deve ter step string');
  assert.strictEqual(root.role, 'task-orchestrator', 'raiz de feature.light deve ser task-orchestrator');
});

test('F1/F3 — nextStep(feature, classificar, light) avança sem TypeError', () => {
  const next = nextStep('feature', 'classificar', 'light');
  assert.ok(next !== null, 'nextStep após classificar não deve ser null');
  assert.strictEqual(next.step, 'clarificar');
});

test('F1/F3 — nextStep(user-story, null, heavy) retorna raiz sem TypeError', () => {
  const root = nextStep('user-story', null, 'heavy');
  assert.ok(root !== null, 'raiz de user-story.heavy não deve ser null');
});

// F1/F3 — cadeia nextStep caminha todo feature.light sem TypeError ou nodes.find error
test('F1/F3 — cadeia nextStep percorre feature.light inteiro via tronco .next sem erro', () => {
  const nodes = templateFor('feature', 'light');
  const trunkSteps = [];
  let current = nextStep('feature', null, 'light');
  while (current !== null) {
    trunkSteps.push(current.step);
    current = nextStep('feature', current.step, 'light');
  }
  // Tronco deve incluir pelo menos classificar e fechar
  assert.ok(trunkSteps.includes('classificar'), 'tronco deve incluir classificar');
  assert.ok(trunkSteps.includes('fechar'), 'tronco deve incluir fechar');
  // Todos os passos do tronco existem no molde
  const stepSet = new Set(nodes.map((n) => n.step));
  for (const s of trunkSteps) {
    assert.ok(stepSet.has(s), `passo do tronco "${s}" deve existir no molde`);
  }
});

// F1/F3 — nodeSpec com tipo hierárquico funciona sem TypeError
test('F1/F3 — nodeSpec(feature, classificar, null, light) retorna payload correto', () => {
  const spec = nodeSpec('feature', 'classificar', null, 'light');
  assert.strictEqual(spec.assigneeAgentId, 'task-orchestrator');
  assert.deepStrictEqual(spec.blockedByIssueIds, []);
  assert.match(spec.body, /NEXT_STEP/);
});

test('F1/F3 — nodeSpec(bugfix, executor-fix, ISSUE-1, light) retorna payload correto', () => {
  const spec = nodeSpec('bugfix', 'executor-fix', 'ISSUE-1', 'light');
  assert.strictEqual(spec.assigneeAgentId, 'executor-fix');
  assert.deepStrictEqual(spec.blockedByIssueIds, ['ISSUE-1']);
  assert.match(spec.body, /FIX_COMPLETE/);
});

// F2/F4 — allParallelSteps expande irmãos paralelos do trio adversarial
test('F2/F4 — allParallelSteps em hotfix HF-N6 retorna os 3 irmãos adversariais', () => {
  const siblings = allParallelSteps('hotfix', 'HF-N6-adv-sec');
  const steps = siblings.map((n) => n.step);
  assert.ok(steps.includes('HF-N6-adv-sec'), 'deve incluir adv-sec');
  assert.ok(steps.includes('HF-N7-adv-arch'), 'deve incluir adv-arch');
  assert.ok(steps.includes('HF-N8-adv-qual'), 'deve incluir adv-qual');
  assert.strictEqual(siblings.length, 3, 'trio deve ter exatamente 3 irmãos');
});

test('F2/F4 — allParallelSteps em nó sem paralelo retorna só o próprio nó', () => {
  const result = allParallelSteps('SIMPLES', 'classificar');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].step, 'classificar');
});

test('F2/F4 — allParallelSteps em feature.light adv-security retorna 3 irmãos', () => {
  const siblings = allParallelSteps('feature', 'adv-security', 'light');
  const steps = siblings.map((n) => n.step);
  assert.ok(steps.includes('adv-security'), 'deve incluir adv-security');
  assert.ok(steps.includes('adv-architecture'), 'deve incluir adv-architecture');
  assert.ok(steps.includes('adv-quality'), 'deve incluir adv-quality');
  assert.strictEqual(siblings.length, 3, 'trio adversarial deve ter 3 irmãos');
});

test('F2/F4 — allParallelSteps em feature.heavy review-spec retorna 2 irmãos (N12)', () => {
  const siblings = allParallelSteps('feature', 'review-spec', 'heavy');
  const steps = siblings.map((n) => n.step);
  assert.ok(steps.includes('review-spec'), 'deve incluir review-spec');
  assert.ok(steps.includes('review-quality'), 'deve incluir review-quality');
  assert.strictEqual(siblings.length, 2, 'N12 deve ter 2 irmãos');
});
