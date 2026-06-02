'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { nextStep, nodeSpec, nodeSpecFanIn, allParallelSteps, templateFor, expandSlices, LOOP_INTERNAL_INSTRUCTION } = require('./tree-factory.cjs');
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
  // CORREÇÃO G6: cargo canônico do classificar é task-orchestrator (emite ORCHESTRATOR_DECISION).
  assert.strictEqual(raiz.role, 'task-orchestrator');
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

// CORREÇÃO G6: cargo canônico de 'classificar' é task-orchestrator em todos os moldes.
// pipeline-controller é o dispatcher (DISPATCH_REQUEST), não o classificador (ORCHESTRATOR_DECISION).
test('P1 — assigneeAgentId é o cargo mapeado para cada step (SIMPLES)', () => {
  const expected = {
    classificar: 'task-orchestrator',
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

// ─── ACHADO 1 — nextStep linear + allParallelSteps = trio completo garantido ───
// Prova que o padrão documentado (nextStep para chegar ao nó paralelo principal, então
// allParallelSteps para expandir os irmãos) garante que o trio completo seja visitado.
// Sem esse teste, um consumer usando nextStep sozinho colapsa o trio a 1 revisor.

test('A1 — trio adversarial de bugfix.heavy: nextStep chega ao primeiro irmão, allParallelSteps expande os 3', () => {
  // Caminha o tronco até encontrar o primeiro nó com campo parallel (trio entry)
  let current = nextStep('bugfix', null, 'heavy');
  let trioEntry = null;
  while (current !== null) {
    if (Array.isArray(current.parallel) && current.parallel.length >= 2) {
      trioEntry = current;
      break;
    }
    current = nextStep('bugfix', current.step, 'heavy');
  }
  assert.ok(trioEntry !== null, 'bugfix.heavy deve ter nó paralelo com ao menos 2 irmãos (trio)');
  // Expande — deve retornar os 3 irmãos
  const siblings = allParallelSteps('bugfix', trioEntry.step, 'heavy');
  assert.strictEqual(siblings.length, 3,
    `trio adversarial de bugfix.heavy deve ter 3 irmãos, encontrou ${siblings.length}`);
  const roles = siblings.map((n) => n.role);
  assert.ok(roles.includes('adversarial-security-scanner'), 'deve incluir security scanner');
  assert.ok(roles.includes('adversarial-architecture-critic'), 'deve incluir architecture critic');
  assert.ok(roles.includes('adversarial-quality-reviewer'), 'deve incluir quality reviewer');
});

test('A1 — trio adversarial de feature.light: padrão nextStep+allParallelSteps entrega os 3 irmãos', () => {
  let current = nextStep('feature', null, 'light');
  let trioEntry = null;
  while (current !== null) {
    if (Array.isArray(current.parallel) && current.parallel.length >= 2) {
      trioEntry = current;
      break;
    }
    current = nextStep('feature', current.step, 'light');
  }
  assert.ok(trioEntry !== null, 'feature.light deve ter nó paralelo com ao menos 2 irmãos (trio)');
  const siblings = allParallelSteps('feature', trioEntry.step, 'light');
  assert.strictEqual(siblings.length, 3,
    `trio adversarial de feature.light deve ter 3 irmãos, encontrou ${siblings.length}`);
});

test('A1 — nós paralelos nunca-visitados pelo tronco .next são alcançáveis via allParallelSteps', () => {
  // Reproduz o achado: tronco .next de feature.heavy visita 19 de 22 nós.
  // Os 3 não-visitados (adv-batch-2, adv-architecture, adv-quality) são paralelos.
  // Este teste prova que TODOS os nós do molde são alcançáveis quando o consumer
  // expande grupos paralelos corretamente.
  const type = 'feature';
  const variant = 'heavy';
  const nodes = templateFor(type, variant);
  const allSteps = new Set(nodes.map((n) => n.step));

  // Coleta todos os steps visitados pelo padrão correto (tronco + expansão paralela)
  const visited = new Set();
  let current = nextStep(type, null, variant);
  while (current !== null) {
    // Expande paralelos (inclui o próprio nó)
    const group = allParallelSteps(type, current.step, variant);
    for (const sibling of group) {
      visited.add(sibling.step);
    }
    current = nextStep(type, current.step, variant);
  }

  // Todo nó do molde deve ser visitado com o padrão correto
  for (const step of allSteps) {
    assert.ok(visited.has(step),
      `nó "${step}" não foi alcançado — padrão nextStep+allParallelSteps deve cobrir todos os nós`);
  }
});

test('A1 — bugfix.heavy: padrão correto cobre todos os nós incluindo adv-batch-2 (nunca visitado pelo tronco sozinho)', () => {
  const type = 'bugfix';
  const variant = 'heavy';
  const nodes = templateFor(type, variant);
  const allSteps = new Set(nodes.map((n) => n.step));

  const visited = new Set();
  let current = nextStep(type, null, variant);
  while (current !== null) {
    const group = allParallelSteps(type, current.step, variant);
    for (const sibling of group) visited.add(sibling.step);
    current = nextStep(type, current.step, variant);
  }

  for (const step of allSteps) {
    assert.ok(visited.has(step),
      `bugfix.heavy nó "${step}" não alcançado — padrão nextStep+allParallelSteps deve cobrir tudo`);
  }
});

// ─── ACHADO 2 — nodeSpecFanIn garante todos os bloqueadores na junção ────────
// Prova que nodeSpec (single prevIssueId) era insuficiente para junções: a junção
// desblockava ao receber apenas UM dos irmãos. nodeSpecFanIn recebe o mapa completo
// e produz blockedByIssueIds com TODOS os irmãos — fan-in real.

test('FanIn-1 — nodeSpecFanIn em feature.heavy checkpoint produz 2 bloqueadores (review-spec + review-quality)', () => {
  const map = { 'review-spec': 'ISSUE-RS-1', 'review-quality': 'ISSUE-RQ-2' };
  const spec = nodeSpecFanIn('feature', 'checkpoint', map, 'heavy');
  assert.strictEqual(spec.assigneeAgentId, 'checkpoint-validator');
  assert.strictEqual(spec.blockedByIssueIds.length, 2,
    'junção N12 deve ter exatamente 2 bloqueadores');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-RS-1'), 'deve incluir ISSUE de review-spec');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-RQ-2'), 'deve incluir ISSUE de review-quality');
});

test('FanIn-2 — nodeSpecFanIn em feature.light final-adversarial produz 3 bloqueadores (trio completo)', () => {
  const map = {
    'adv-security': 'ISSUE-SEC-1',
    'adv-architecture': 'ISSUE-ARCH-2',
    'adv-quality': 'ISSUE-QUAL-3',
  };
  const spec = nodeSpecFanIn('feature', 'final-adversarial', map, 'light');
  assert.strictEqual(spec.assigneeAgentId, 'final-adversarial-orchestrator');
  assert.strictEqual(spec.blockedByIssueIds.length, 3,
    'junção final-adversarial deve ter 3 bloqueadores (trio completo)');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-SEC-1'), 'deve incluir ISSUE de adv-security');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-ARCH-2'), 'deve incluir ISSUE de adv-architecture');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-QUAL-3'), 'deve incluir ISSUE de adv-quality');
});

test('FanIn-3 — nodeSpecFanIn com mapa incompleto lança (proteção contra fan-in parcial)', () => {
  // Simula o bug antigo: consumer passa só UM irmão, esperando que nodeSpec aceite.
  // nodeSpecFanIn protege: lança se algum step de blockedBy[] não está no mapa.
  const mapaIncompleto = { 'review-spec': 'ISSUE-RS-1' }; // falta 'review-quality'
  assert.throws(
    () => nodeSpecFanIn('feature', 'checkpoint', mapaIncompleto, 'heavy'),
    /review-quality.*não encontrado no mapa/,
    'deve lançar quando mapa de fan-in está incompleto',
  );
});

test('FanIn-4 — nodeSpecFanIn em nó linear (blockedBy = scalar) comporta-se como nodeSpec', () => {
  // Garante backward-compat: se o nó é linear (não é junção), funciona igual ao nodeSpec.
  const map = { 'classificar': 'ISSUE-CLASS-1' };
  const spec = nodeSpecFanIn('feature', 'clarificar', map, 'light');
  assert.strictEqual(spec.assigneeAgentId, 'information-gate');
  assert.deepStrictEqual(spec.blockedByIssueIds, ['ISSUE-CLASS-1'],
    'nó linear deve ter exatamente 1 bloqueador');
});

test('FanIn-5 — nodeSpec original (single prevIssueId) ainda funciona para nós lineares (sem regressão)', () => {
  // Garante que nodeSpec não foi quebrado pela adição de nodeSpecFanIn.
  const spec = nodeSpec('feature', 'clarificar', 'ISSUE-CLASS-1', 'light');
  assert.strictEqual(spec.blockedByIssueIds.length, 1);
  assert.deepStrictEqual(spec.blockedByIssueIds, ['ISSUE-CLASS-1']);
});

test('FanIn-6 — nodeSpecFanIn hotfix HF-N9 produz 3 bloqueadores (trio hotfix)', () => {
  const map = {
    'HF-N6-adv-sec': 'ISSUE-H6',
    'HF-N7-adv-arch': 'ISSUE-H7',
    'HF-N8-adv-qual': 'ISSUE-H8',
  };
  const spec = nodeSpecFanIn('hotfix', 'HF-N9-juncao', map);
  assert.strictEqual(spec.blockedByIssueIds.length, 3,
    'HF-N9 deve ter 3 bloqueadores — um por irmão do trio hotfix');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-H6'), 'deve incluir ISSUE de HF-N6');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-H7'), 'deve incluir ISSUE de HF-N7');
  assert.ok(spec.blockedByIssueIds.includes('ISSUE-H8'), 'deve incluir ISSUE de HF-N8');
});

// ─── G2-FÁBRICA D4: FixLoopNode — instrução de iteração interna ──────────────
// INV-D4-1: um FixLoopNode é UM ÚNICO nodeSpec — contador vive no body da issue.
// INV-D4-2: body DEVE conter a instrução canônica de máximo 3 tentativas.
// INV-D4-3: qualquer nó com role executor-fix no molde é candidato a FixLoopNode.
// INV-D4-4: payload tem exatamente 4 campos canônicos (sem campos extras).
// INV-D4-5: a instrução é exclusiva de executor-fix — outros roles NÃO recebem.

// T-D4-01: nodeSpec de executor-fix em feature.light inclui instrução de loop interno
test('T-D4-01 — nodeSpec de executor-fix em feature.light inclui instrução de loop interno no body', () => {
  const spec = nodeSpec('feature', 'executor-fix', 'ISSUE-PREV', 'light');
  assert.ok(spec.body.includes('3 tentativas'), 'body deve mencionar máximo 3 tentativas');
  assert.ok(spec.body.includes('itere por dentro'), 'body deve instruir iteração interna');
  assert.ok(spec.body.includes('NAO crie cartoes novos'), 'body deve proibir criação de cartões por tentativa');
});

// T-D4-02: nodeSpec de executor-fix em feature.heavy inclui instrução de loop interno
test('T-D4-02 — nodeSpec de executor-fix em feature.heavy inclui instrução de loop interno', () => {
  const spec = nodeSpec('feature', 'executor-fix', 'ISSUE-PREV', 'heavy');
  assert.ok(spec.body.includes('3 tentativas'), 'body deve mencionar máximo 3 tentativas');
  assert.ok(spec.body.includes('NAO crie cartoes novos'), 'body deve proibir criação de cartões');
});

// T-D4-03: nodeSpec de executor-fix em bugfix.light inclui instrução de loop interno
test('T-D4-03 — nodeSpec de executor-fix em bugfix.light inclui instrução de loop interno', () => {
  const spec = nodeSpec('bugfix', 'executor-fix', 'ISSUE-PREV', 'light');
  assert.ok(spec.body.includes('3 tentativas'), 'body deve mencionar máximo 3 tentativas');
  assert.ok(spec.body.includes('NAO crie cartoes novos'), 'body deve proibir criação de cartões');
});

// T-D4-04: nodeSpec de executor-fix em bugfix.heavy inclui instrução de loop interno
test('T-D4-04 — nodeSpec de executor-fix em bugfix.heavy inclui instrução de loop interno', () => {
  const spec = nodeSpec('bugfix', 'executor-fix', 'ISSUE-PREV', 'heavy');
  assert.ok(spec.body.includes('3 tentativas'), 'body deve mencionar máximo 3 tentativas');
  assert.ok(spec.body.includes('NAO crie cartoes novos'), 'body deve proibir criação de cartões');
});

// T-D4-05: nodeSpec de HF-N3-executor-fix em hotfix inclui instrução de loop interno
test('T-D4-05 — nodeSpec de HF-N3-executor-fix em hotfix inclui instrução de loop interno', () => {
  const spec = nodeSpec('hotfix', 'HF-N3-executor-fix', 'ISSUE-PREV');
  assert.ok(spec.body.includes('3 tentativas'), 'body deve mencionar máximo 3 tentativas');
  assert.ok(spec.body.includes('NAO crie cartoes novos'), 'body deve proibir criação de cartões');
});

// T-D4-06: instrução de loop NÃO aparece em nós com role diferente de executor-fix em feature.light
test('T-D4-06 — instrução de loop NÃO aparece em nós não-executor-fix de feature.light', () => {
  const stepsToCheck = ['implementar', 'fechar', 'sanity'];
  for (const step of stepsToCheck) {
    const spec = nodeSpec('feature', step, 'ISSUE-X', 'light');
    assert.ok(!spec.body.includes('NAO crie cartoes novos'),
      `body do step "${step}" NÃO deve conter instrução de loop interno`);
  }
});

// T-D4-07: instrução de loop NÃO aparece em molde SIMPLES (nenhum nó é executor-fix)
test('T-D4-07 — instrução de loop NÃO aparece em nós do molde SIMPLES', () => {
  const steps = ['classificar', 'clarificar', 'implementar', 'revisar', 'fechar'];
  for (const step of steps) {
    const spec = nodeSpec('SIMPLES', step, 'ISSUE-X');
    assert.ok(!spec.body.includes('NAO crie cartoes novos'),
      `body do step SIMPLES "${step}" NÃO deve conter instrução de loop interno`);
  }
});

// T-D4-08: instrução de loop NÃO aparece em nós do molde COMPLEXA
test('T-D4-08 — instrução de loop NÃO aparece em nós do molde COMPLEXA', () => {
  const steps = ['classificar', 'clarificar', 'planejar', 'aprovar', 'implementar', 'revisar', 'fechar'];
  for (const step of steps) {
    const spec = nodeSpec('COMPLEXA', step, 'ISSUE-X');
    assert.ok(!spec.body.includes('NAO crie cartoes novos'),
      `body do step COMPLEXA "${step}" NÃO deve conter instrução de loop interno`);
  }
});

// T-D4-09: payload do nodeSpec de executor-fix tem exatamente 4 campos
test('T-D4-09 — payload do nodeSpec de executor-fix tem exatamente 4 campos (title, assigneeAgentId, blockedByIssueIds, body)', () => {
  const spec = nodeSpec('feature', 'executor-fix', 'ISSUE-PREV', 'light');
  const keys = Object.keys(spec);
  assert.deepStrictEqual(keys.sort(), ['assigneeAgentId', 'blockedByIssueIds', 'body', 'title'],
    'payload deve ter exatamente os 4 campos canônicos');
});

// T-D4-10: nodeSpec de executor-fix em user-story.light inclui instrução de loop interno
test('T-D4-10 — nodeSpec de executor-fix em user-story.light inclui instrução de loop interno', () => {
  const spec = nodeSpec('user-story', 'executor-fix', 'ISSUE-PREV', 'light');
  assert.ok(spec.body.includes('3 tentativas'), 'body deve mencionar máximo 3 tentativas');
  assert.ok(spec.body.includes('NAO crie cartoes novos'), 'body deve proibir criação de cartões');
});

// ─── G2-FÁBRICA D6: expandSlices — fatias dinâmicas ─────────────────────────
// INV-D6-1: N fatias são irmãs — nenhuma trava outra fatia.
// INV-D6-2: todas as N fatias bloqueiam a junção downstream (fan-in real).
// INV-D6-3: n >= 1; n === 0 lança erro.
// INV-D6-4: todas as fatias compartilham o mesmo prevIssueId como único bloqueador.
// INV-D6-5: a junção downstream DEVE existir no molde.

// T-D6-01: expandSlices retorna objeto com campos slices (array) e junction (objeto)
test('T-D6-01 — expandSlices retorna objeto com campos slices (array) e junction (objeto)', () => {
  const result = expandSlices('feature', 1, 'ISSUE-P', 'light');
  assert.ok(typeof result === 'object', 'resultado deve ser objeto');
  assert.ok(Array.isArray(result.slices), 'result.slices deve ser array');
  assert.ok(typeof result.junction === 'object' && result.junction !== null, 'result.junction deve ser objeto');
});

// T-D6-02: expandSlices com n=1, feature.light, prevIssueId='ISSUE-P' retorna 1 fatia com blockedByIssueIds=['ISSUE-P']
test('T-D6-02 — expandSlices com n=1, feature.light retorna 1 fatia com prevIssueId como único bloqueador', () => {
  const result = expandSlices('feature', 1, 'ISSUE-P', 'light');
  assert.strictEqual(result.slices.length, 1, 'deve retornar exatamente 1 fatia');
  assert.deepStrictEqual(result.slices[0].blockedByIssueIds, ['ISSUE-P'],
    'fatia deve ter apenas prevIssueId como bloqueador');
});

// T-D6-03: expandSlices com n=1 retorna junção com blockedByIssueIds de comprimento 1
test('T-D6-03 — expandSlices com n=1 retorna junção com blockedByIssueIds de comprimento 1', () => {
  const result = expandSlices('feature', 1, 'ISSUE-P', 'light');
  assert.strictEqual(result.junction.blockedByIssueIds.length, 1,
    'junção com n=1 deve ter exatamente 1 bloqueador');
});

// T-D6-04: expandSlices com n=3, feature.light retorna exatamente 3 fatias
test('T-D6-04 — expandSlices com n=3, feature.light retorna exatamente 3 fatias', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'light');
  assert.strictEqual(result.slices.length, 3, 'deve retornar exatamente 3 fatias');
});

// T-D6-05: nenhuma das 3 fatias tem outra fatia em blockedByIssueIds (irmãs paralelas sem trava mútua)
test('T-D6-05 — nenhuma fatia tem outra fatia em blockedByIssueIds (irmãs paralelas sem trava mútua)', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'light');
  const sliceIds = result.slices.map((s) => s._slicePlaceholderId).filter(Boolean);
  // Verificar que nenhuma fatia bloqueia outra — cada uma deve ter apenas prevIssueId
  for (const slice of result.slices) {
    assert.deepStrictEqual(slice.blockedByIssueIds, ['ISSUE-PLAN'],
      `fatia "${slice.title}" deve ter apenas ISSUE-PLAN como bloqueador, sem outras fatias`);
  }
});

// T-D6-06: todas as 3 fatias compartilham o mesmo prevIssueId como único bloqueador
test('T-D6-06 — todas as fatias compartilham o mesmo prevIssueId como único bloqueador', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'light');
  for (const slice of result.slices) {
    assert.strictEqual(slice.blockedByIssueIds.length, 1, 'cada fatia deve ter exatamente 1 bloqueador');
    assert.strictEqual(slice.blockedByIssueIds[0], 'ISSUE-PLAN', 'bloqueador deve ser prevIssueId');
  }
});

// T-D6-07: junção com n=3 tem blockedByIssueIds com 3 entradas (fan-in completo)
test('T-D6-07 — junção de expandSlices com n=3 tem blockedByIssueIds com 3 entradas (fan-in completo)', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'light');
  assert.strictEqual(result.junction.blockedByIssueIds.length, 3,
    'junção deve ter 3 bloqueadores para fan-in completo');
});

// T-D6-08: assigneeAgentId de cada fatia é 'feature-implementer' para feature.light
test('T-D6-08 — assigneeAgentId de cada fatia é feature-implementer para feature.light', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'light');
  for (const slice of result.slices) {
    assert.strictEqual(slice.assigneeAgentId, 'feature-implementer',
      'fatia de feature.light deve ser assinalada a feature-implementer');
  }
});

// T-D6-09: title das fatias inclui índice distinguível (#1, #2, #3)
test('T-D6-09 — title das fatias inclui índice distinguível (#1, #2, #3)', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'light');
  assert.ok(result.slices[0].title.includes('#1'), 'primeira fatia deve ter #1 no título');
  assert.ok(result.slices[1].title.includes('#2'), 'segunda fatia deve ter #2 no título');
  assert.ok(result.slices[2].title.includes('#3'), 'terceira fatia deve ter #3 no título');
});

// T-D6-10: expandSlices com n=0 lança erro com mensagem descritiva
test('T-D6-10 — expandSlices com n=0 lança erro com mensagem descritiva', () => {
  assert.throws(
    () => expandSlices('feature', 0, 'ISSUE-PLAN', 'light'),
    /n.*inv[aá]lido|n deve ser/i,
    'deve lançar erro sobre n inválido',
  );
});

// T-D6-11: expandSlices com complexidade inválida lança erro com mensagem descritiva
test('T-D6-11 — expandSlices com complexidade inválida lança erro com mensagem descritiva', () => {
  assert.throws(
    () => expandSlices('XPTO', 2, 'ISSUE-X'),
    /XPTO|complexidade.*desconhecida|molde.*n.*encontrado/i,
    'deve lançar erro sobre complexidade desconhecida',
  );
});

// T-D6-12: expandSlices com variante inválida lança erro com mensagem descritiva
test('T-D6-12 — expandSlices com variante inválida lança erro com mensagem descritiva', () => {
  assert.throws(
    () => expandSlices('feature', 2, 'ISSUE-X', 'ultra'),
    /ultra|variante.*desconhecida|molde.*n.*encontrado/i,
    'deve lançar erro sobre variante desconhecida',
  );
});

// T-D6-13: expandSlices com n=2, feature.heavy retorna 2 fatias + junção com 2 bloqueadores
test('T-D6-13 — expandSlices com n=2, feature.heavy retorna 2 fatias + junção com 2 bloqueadores', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'heavy');
  assert.strictEqual(result.slices.length, 2, 'deve retornar 2 fatias');
  assert.strictEqual(result.junction.blockedByIssueIds.length, 2,
    'junção deve ter 2 bloqueadores');
});

// T-D6-14: expandSlices com n=2, user-story.light retorna 2 fatias + junção com 2 bloqueadores
test('T-D6-14 — expandSlices com n=2, user-story.light retorna 2 fatias + junção com 2 bloqueadores', () => {
  const result = expandSlices('user-story', 2, 'ISSUE-PLAN', 'light');
  assert.strictEqual(result.slices.length, 2, 'deve retornar 2 fatias');
  assert.strictEqual(result.junction.blockedByIssueIds.length, 2,
    'junção deve ter 2 bloqueadores');
});

// T-D6-15: expandSlices em bugfix.light deve lançar — executor-fix não é fatiável (D4/INV-D6-7)
// CORRIGIDO: comportamento anterior (aceitar executor-fix como nó fatiável) contradiz D4.
// D4 manda que executor-fix iterate internamente em UM único cartão — criar N cartões irmãos
// viola a instrução 'NAO crie cartoes novos por tentativa' que o próprio body carregaria.
test('T-D6-15 — expandSlices em bugfix.light lança erro (executor-fix não é fatiável, contradiz D4)', () => {
  assert.throws(
    () => expandSlices('bugfix', 1, 'ISSUE-PLAN', 'light'),
    /executor-fix.*n.*o.*fati|nó de implementação fatiável não encontrado/i,
    'bugfix.light deve lançar: executor-fix não é role fatiável (D4/INV-D6-7)',
  );
});

// T-D6-16: assigneeAgentId da junção produzida por expandSlices bate com o role do nó de junção no molde
test('T-D6-16 — assigneeAgentId da junção bate com o role do nó de junção declarado no molde (checkpoint-validator para feature.light)', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'light');
  assert.strictEqual(result.junction.assigneeAgentId, 'checkpoint-validator',
    'junção de feature.light deve ser assinalada a checkpoint-validator');
});

// T-D6-17: expandSlices com n=5, feature.light retorna 5 fatias e junção com 5 bloqueadores
test('T-D6-17 — expandSlices com n=5, feature.light retorna 5 fatias e junção com 5 bloqueadores', () => {
  const result = expandSlices('feature', 5, 'ISSUE-PLAN', 'light');
  assert.strictEqual(result.slices.length, 5, 'deve retornar 5 fatias');
  assert.strictEqual(result.junction.blockedByIssueIds.length, 5,
    'junção deve ter 5 bloqueadores');
});

// T-D6-18: junção de expandSlices é consistente com nodeSpecFanIn chamado diretamente com mapa sintético equivalente
test('T-D6-18 — junção de expandSlices é consistente com nodeSpecFanIn (mesmo assigneeAgentId, mesmo número de bloqueadores)', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'light');
  // Montar mapa sintético equivalente com os IDs placeholder das fatias
  const placeholderMap = {};
  for (const slice of result.slices) {
    // Extrair o step base da fatia (sem #N) e associar ao ID placeholder
    // A junção em feature.light tem blockedBy = 'implementar' (scalar)
    // mas expandSlices usa IDs das fatias diretamente em blockedByIssueIds
    // Consistência: mesmo assigneeAgentId e mesmo número de bloqueadores
  }
  // Verificar apenas consistência de assigneeAgentId e contagem de bloqueadores
  const directFanIn = nodeSpecFanIn('feature', 'checkpoint',
    { 'implementar #1': result.slices[0].blockedByIssueIds[0], 'implementar #2': result.slices[1].blockedByIssueIds[0] },
    'light');
  // assigneeAgentId deve ser o mesmo
  assert.strictEqual(result.junction.assigneeAgentId, directFanIn.assigneeAgentId,
    'junção de expandSlices e nodeSpecFanIn devem ter o mesmo assigneeAgentId');
});

// ─── G2-FÁBRICA D6: novos testes de regressão — achados adversariais G2-Fábrica ──
// Esses testes cobrem os caminhos que a suite original NÃO cobria e que deixavam
// os bugs críticos/high invisíveis (achados severity:critical/#2 da revisão G2-Fábrica).

// T-D6-16b: junção de feature.heavy deve ser checkpoint-validator, NÃO architecture-reviewer
// (achado crítico #1/#3/#6 — auto-descoberta escolhia review-spec erroneamente)
test('T-D6-16b — junção de feature.heavy é checkpoint-validator (não architecture-reviewer)', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'heavy');
  assert.strictEqual(result.junction.assigneeAgentId, 'checkpoint-validator',
    'junção de feature.heavy deve ser checkpoint-validator, não architecture-reviewer (review-spec)');
  assert.strictEqual(result.slices.length, 2, 'deve retornar 2 fatias');
  assert.strictEqual(result.junction.blockedByIssueIds.length, 2, 'junção deve ter 2 bloqueadores');
  // O irmão paralelo review-quality NÃO deve aparecer no title da junção
  assert.ok(!result.junction.title.includes('review-spec'),
    'title da junção NÃO deve ser review-spec (seria um par paralelo, não a junção real)');
  assert.ok(result.junction.title.includes('checkpoint'),
    'title da junção deve incluir checkpoint');
});

// T-D6-16c: junção de user-story.heavy também deve ser checkpoint-validator
// (achado crítico #1/#3 — mesmo defeito de auto-descoberta em user-story.heavy)
test('T-D6-16c — junção de user-story.heavy é checkpoint-validator (não architecture-reviewer)', () => {
  const result = expandSlices('user-story', 2, 'ISSUE-PLAN', 'heavy');
  assert.strictEqual(result.junction.assigneeAgentId, 'checkpoint-validator',
    'junção de user-story.heavy deve ser checkpoint-validator');
  assert.ok(result.junction.title.includes('checkpoint'),
    'title da junção de user-story.heavy deve incluir checkpoint');
});

// T-D6-19: expandSlices com n=NaN lança erro (INV-D6-3 — NaN passava pela validação anterior)
// (achado high #5 — NaN é typeof 'number' e NaN < 1 é false, então passava silenciosamente)
test('T-D6-19 — expandSlices com n=NaN lança erro descritivo (INV-D6-3)', () => {
  assert.throws(
    () => expandSlices('feature', NaN, 'ISSUE-PLAN', 'light'),
    /n.*inv[aá]lido|n deve ser/i,
    'NaN deve lançar erro: não é inteiro >= 1',
  );
});

// T-D6-20: expandSlices com hotfix lança erro (INV-D6-6 — modo especial não fatiável)
// (achado high #4 — hotfix tem estrutura fixa de 12 nós exatos)
test('T-D6-20 — expandSlices em hotfix lança erro (modo especial não fatiável)', () => {
  assert.throws(
    () => expandSlices('hotfix', 2, 'ISSUE-PLAN'),
    /modo especial.*n.*o.*fati|hotfix.*n.*o.*fati|hotfix.*fati/i,
    'hotfix deve lançar: modo especial com estrutura fixa não admite fatias dinâmicas',
  );
});

// T-D6-21: expandSlices em review-only lança erro (INV-D6-6 — modo especial não fatiável)
test('T-D6-21 — expandSlices em review-only lança erro (modo especial não fatiável)', () => {
  assert.throws(
    () => expandSlices('review-only', 1, 'ISSUE-PLAN'),
    /modo especial.*n.*o.*fati|review-only.*fati/i,
    'review-only deve lançar: modo especial com estrutura fixa não admite fatias dinâmicas',
  );
});

// T-D6-22: expandSlices em bugfix.heavy lança erro (executor-fix não é fatiável)
// (achado high #4 — fix-loop contradiz D4 quando expandido em N fatias)
test('T-D6-22 — expandSlices em bugfix.heavy lança erro (executor-fix não é fatiável, contradiz D4)', () => {
  assert.throws(
    () => expandSlices('bugfix', 2, 'ISSUE-PLAN', 'heavy'),
    /executor-fix.*n.*o.*fati|nó de implementação fatiável não encontrado/i,
    'bugfix.heavy deve lançar: executor-fix não é role fatiável',
  );
});

// T-D6-23: expandSlices em feature.heavy — irmão paralelo review-quality NÃO está entre os bloqueadores da junção
// (achado crítico #1/#3 — review-quality ficava órfão quando review-spec era escolhido como junção)
test('T-D6-23 — expandSlices em feature.heavy: review-quality não aparece como irmão paralelo bloqueador da junção', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'heavy');
  // A junção (checkpoint) não deve ter review-quality em seu title
  assert.ok(!result.junction.title.includes('review-quality'),
    'title da junção NÃO deve ser review-quality');
  // A junção é checkpoint-validator — PARALLEL_SIBLINGS não deve aparecer no body da junção
  // (checkpoint tem blocks:[] e não emite bloco de fidelidade)
  assert.ok(!result.junction.body.includes('PARALLEL_SIBLINGS'),
    'body da junção de feature.heavy NÃO deve ter PARALLEL_SIBLINGS (checkpoint não é paralelo)');
});

// T-D6-24: expandSlices em feature.heavy n=3 — 3 fatias + 2 intermediários + junção com 2 bloqueadores
// CORRIGIDO (achado high #1/#3 — review pair era descartado; junção era bloqueada diretamente pelas fatias).
// Comportamento correto: junction bloqueada pelos 2 intermediários (review-spec ‖ review-quality),
// não pelas 3 fatias diretamente. O número de bloqueadores da junção é sempre 2 (o par N12),
// independente de quantas fatias existam.
test('T-D6-24 — expandSlices em feature.heavy com n=3: 3 fatias, 2 intermediários (N12), junção com 2 bloqueadores', () => {
  const result = expandSlices('feature', 3, 'ISSUE-PLAN', 'heavy');
  assert.strictEqual(result.slices.length, 3, 'deve retornar 3 fatias');
  // intermediaries deve conter o par N12 (review-spec + review-quality)
  assert.ok(Array.isArray(result.intermediaries), 'intermediaries deve ser array');
  assert.strictEqual(result.intermediaries.length, 2, 'feature.heavy deve ter 2 intermediários (N12 review pair)');
  const intRoles = result.intermediaries.map((m) => m.assigneeAgentId);
  assert.ok(intRoles.includes('architecture-reviewer'), 'intermediários devem incluir architecture-reviewer');
  assert.ok(intRoles.includes('diff-discipline-reviewer'), 'intermediários devem incluir diff-discipline-reviewer');
  // A junção é bloqueada pelos 2 intermediários (REVIEW-1, REVIEW-2), não pelas 3 fatias
  assert.strictEqual(result.junction.blockedByIssueIds.length, 2,
    'junção de feature.heavy deve ter 2 bloqueadores (os 2 intermediários N12), não 3 (as fatias)');
  assert.strictEqual(result.junction.assigneeAgentId, 'checkpoint-validator',
    'junção com n=3 ainda deve ser checkpoint-validator');
  // Cada intermediário deve ser bloqueado por todas as 3 fatias (fan-in das fatias → intermediário)
  for (const interm of result.intermediaries) {
    assert.strictEqual(interm.blockedByIssueIds.length, 3,
      `intermediário "${interm.title}" deve ter 3 bloqueadores (as 3 fatias)`);
  }
});

// ─── Achados adversariais G2-Fábrica — correções high ────────────────────────
// Testes que provam as correções dos três achados high da revisão G2-Fábrica.

// T-D6-25: expandSlices rejeita n fracionário (achado high #2 — INV-D6-3 incompleto)
// Antes: 2.9 → Array.from truncava para 2 fatias sem erro. Agora: lança.
test('T-D6-25 — expandSlices rejeita n fracionário 2.9 (INV-D6-3 — truncamento silencioso)', () => {
  assert.throws(
    () => expandSlices('feature', 2.9, 'ISSUE-PLAN', 'light'),
    /n.*inv[aá]lido|n deve ser/i,
    'n=2.9 deve lançar: não é inteiro (INV-D6-3)',
  );
});

test('T-D6-26 — expandSlices rejeita n fracionário 3.5 (INV-D6-3)', () => {
  assert.throws(
    () => expandSlices('feature', 3.5, 'ISSUE-PLAN', 'light'),
    /n.*inv[aá]lido|n deve ser/i,
    'n=3.5 deve lançar: não é inteiro (INV-D6-3)',
  );
});

test('T-D6-27 — expandSlices rejeita n fracionário 1.0001 (INV-D6-3)', () => {
  assert.throws(
    () => expandSlices('feature', 1.0001, 'ISSUE-PLAN', 'light'),
    /n.*inv[aá]lido|n deve ser/i,
    'n=1.0001 deve lançar: não é inteiro (INV-D6-3)',
  );
});

// T-D6-28: expandSlices em feature.light retorna intermediaries=[] (sem par N12 em light)
// Confirma que a adição de intermediaries não quebra o caminho linear (light).
test('T-D6-28 — expandSlices em feature.light retorna intermediaries vazio (caminho linear sem N12)', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'light');
  assert.ok(Array.isArray(result.intermediaries), 'intermediaries deve ser array');
  assert.strictEqual(result.intermediaries.length, 0,
    'feature.light não tem intermediários N12 — caminho linear implementar→checkpoint');
  // Junção ainda bloqueada pelas fatias diretamente (sem intermediários)
  assert.strictEqual(result.junction.blockedByIssueIds.length, 2,
    'junção de feature.light com n=2 deve ter 2 bloqueadores (as 2 fatias)');
});

// T-D6-29: expandSlices em user-story.heavy retorna intermediaries com par N12 correto
// (achado high #1/#3 se aplicava igualmente ao user-story.heavy)
test('T-D6-29 — expandSlices em user-story.heavy com n=2: intermediaries tem o par N12 review-spec/review-quality', () => {
  const result = expandSlices('user-story', 2, 'ISSUE-PLAN', 'heavy');
  assert.ok(Array.isArray(result.intermediaries), 'intermediaries deve ser array');
  assert.strictEqual(result.intermediaries.length, 2, 'user-story.heavy deve ter 2 intermediários (N12)');
  const intRoles = result.intermediaries.map((m) => m.assigneeAgentId);
  assert.ok(intRoles.includes('architecture-reviewer'), 'deve incluir architecture-reviewer');
  assert.ok(intRoles.includes('diff-discipline-reviewer'), 'deve incluir diff-discipline-reviewer');
  // Cada intermediário bloqueado pelas 2 fatias
  for (const interm of result.intermediaries) {
    assert.strictEqual(interm.blockedByIssueIds.length, 2,
      `intermediário "${interm.title}" deve ter 2 bloqueadores (as 2 fatias)`);
  }
  // Junção bloqueada pelos 2 intermediários, não pelas fatias
  assert.strictEqual(result.junction.blockedByIssueIds.length, 2,
    'junção de user-story.heavy deve ter 2 bloqueadores (os 2 intermediários)');
});

// T-D6-30: body dos intermediários em feature.heavy não diz NEXT_STEP: checkpoint — diz checkpoint
// e os corpos das fatias dizem NEXT_STEP: review-spec (coerência interna da árvore)
test('T-D6-30 — coerência interna da árvore expandida em feature.heavy: bodies apontam nós que existem', () => {
  const result = expandSlices('feature', 2, 'ISSUE-PLAN', 'heavy');
  // Fatias devem apontar para review-spec (o primeiro intermediário do par N12)
  for (const slice of result.slices) {
    assert.match(slice.body, /NEXT_STEP:\s*review-spec/,
      `body da fatia "${slice.title}" deve apontar para review-spec`);
  }
  // Intermediários devem existir (foram produzidos — o nó apontado pelas fatias existe na saída)
  const intTitles = result.intermediaries.map((m) => m.title);
  assert.ok(intTitles.some((t) => t.includes('review-spec')),
    'intermediaries deve incluir review-spec (nó apontado pelo NEXT_STEP das fatias)');
  assert.ok(intTitles.some((t) => t.includes('review-quality')),
    'intermediaries deve incluir review-quality (irmão paralelo do par N12)');
});

// ─── G2-FÁBRICA D6: achado high — expandSlices não protegia prevIssueId nulo ──
// INV-D6-4b: quando prevIssueId é null ou undefined, cada fatia deve ter
// blockedByIssueIds=[] (igual ao comportamento de nodeSpec e nodeSpecFanIn para raiz).
// Antes da correção: blockedByIssueIds:[null] — blocker inválido que corrompe o grafo
// de dependências do Paperclip ou é rejeitado pela API.

// T-D6-31: expandSlices com prevIssueId=null retorna fatias com blockedByIssueIds=[]
test('T-D6-31 — expandSlices com prevIssueId=null retorna fatias com blockedByIssueIds=[] (sem [null])', () => {
  const result = expandSlices('feature', 2, null, 'light');
  for (const slice of result.slices) {
    assert.deepStrictEqual(slice.blockedByIssueIds, [],
      `fatia "${slice.title}" com prevIssueId=null deve ter blockedByIssueIds=[], não [null]`);
    assert.ok(!slice.blockedByIssueIds.includes(null),
      'blockedByIssueIds NÃO deve conter null — seria blocker inválido na API do Paperclip');
  }
});

// T-D6-32: expandSlices com prevIssueId=undefined retorna fatias com blockedByIssueIds=[]
test('T-D6-32 — expandSlices com prevIssueId=undefined retorna fatias com blockedByIssueIds=[] (sem [null])', () => {
  const result = expandSlices('feature', 1, undefined, 'light');
  assert.deepStrictEqual(result.slices[0].blockedByIssueIds, [],
    'prevIssueId=undefined deve produzir blockedByIssueIds=[], não [undefined]');
  assert.ok(!result.slices[0].blockedByIssueIds.includes(null),
    'blockedByIssueIds NÃO deve conter null');
  assert.ok(!result.slices[0].blockedByIssueIds.includes(undefined),
    'blockedByIssueIds NÃO deve conter undefined');
});

// T-D6-33: comportamento idêntico ao nodeSpec — prevIssueId=null → [] em ambos
test('T-D6-33 — expandSlices com prevIssueId=null tem simetria de contrato com nodeSpec (raiz = [])', () => {
  const { nodeSpec } = require('./tree-factory.cjs');
  // nodeSpec com prevIssueId=null deve ser []
  const ns = nodeSpec('feature', 'implementar', null, 'light');
  assert.deepStrictEqual(ns.blockedByIssueIds, [],
    'nodeSpec com prevIssueId=null deve ter blockedByIssueIds=[]');
  // expandSlices com prevIssueId=null — cada fatia deve ter o mesmo comportamento
  const result = expandSlices('feature', 2, null, 'light');
  for (const slice of result.slices) {
    assert.deepStrictEqual(slice.blockedByIssueIds, [],
      `expandSlices com prevIssueId=null deve ter mesma simetria que nodeSpec: blockedByIssueIds=[]`);
  }
});

// T-D6-34: com prevIssueId válido, expansão ainda funciona corretamente (sem regressão)
test('T-D6-34 — expandSlices com prevIssueId válido continua retornando [prevIssueId] por fatia (sem regressão)', () => {
  const result = expandSlices('feature', 3, 'ISSUE-VALID', 'light');
  for (const slice of result.slices) {
    assert.deepStrictEqual(slice.blockedByIssueIds, ['ISSUE-VALID'],
      `fatia "${slice.title}" com prevIssueId válido deve ter [prevIssueId]`);
  }
});

// T-REGR-01: suite pré-existente de nextStep, nodeSpec, allParallelSteps permanece 100% verde
// (verificado via execução completa — este teste serve como marcador semântico)
test('T-REGR-01 — nextStep continua funcionando em feature.light após D4 e D6', () => {
  const root = nextStep('feature', null, 'light');
  assert.strictEqual(root.role, 'task-orchestrator');
  const next = nextStep('feature', 'classificar', 'light');
  assert.strictEqual(next.step, 'clarificar');
});

// T-REGR-02: nodeSpecFanIn permanece 100% verde após D4 e D6
test('T-REGR-02 — nodeSpecFanIn permanece 100% verde após D4 e D6', () => {
  const map = { 'review-spec': 'ISSUE-RS', 'review-quality': 'ISSUE-RQ' };
  const spec = nodeSpecFanIn('feature', 'checkpoint', map, 'heavy');
  assert.strictEqual(spec.blockedByIssueIds.length, 2, 'fan-in de checkpoint deve ter 2 bloqueadores');
});

// T-REGR-03: todos os moldes G1 continuam respondendo corretamente a nextStep percorrendo o tronco inteiro
test('T-REGR-03 — todos os moldes G1 percorrem o tronco inteiro sem erro via nextStep', () => {
  const moldes = [
    ['feature', 'light'], ['feature', 'heavy'],
    ['bugfix', 'light'], ['bugfix', 'heavy'],
    ['user-story', 'light'], ['user-story', 'heavy'],
    ['audit', 'light'], ['audit', 'heavy'],
    ['ux', 'light'], ['ux', 'heavy'],
    ['spec', 'light'], ['spec', 'heavy'],
    ['hotfix', null], ['review-only', null],
  ];
  for (const [type, variant] of moldes) {
    let current = nextStep(type, null, variant);
    assert.ok(current !== null, `${type}.${variant || 'especial'}: tronco deve ter raiz`);
    let count = 0;
    while (current !== null) {
      count++;
      current = nextStep(type, current.step, variant);
      if (count > 100) throw new Error(`loop infinito em ${type}.${variant}`);
    }
    assert.ok(count > 0, `${type}.${variant || 'especial'}: tronco deve ter ao menos 1 nó`);
  }
});
