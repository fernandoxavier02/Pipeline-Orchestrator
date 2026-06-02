'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { TEMPLATES } = require('./tree-template.cjs');
const { gateForBlock, BLOCK_TO_GATE } = require('./mirror-fidelity-dictionary.cjs');

// GEN1 — molde declarativo (tree-template.cjs). Espelha a tabela do design §Molde Concreto.
// Cada nó = { step, role, blocks: [], blockedBy: <stepAnterior|null>, next: <step|null> }.

// ─── TESTES EXISTENTES (backward-compat — NÃO remover) ───────────────────────

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

  // CORREÇÃO G6: cargo canônico de classificar é task-orchestrator (emite ORCHESTRATOR_DECISION).
  // pipeline-controller é o dispatcher (emite DISPATCH_REQUEST), não o classificador.
  // Referência: paperclip-catalog.md linha 30, buildFeatureLight/buildFeatureHeavy role='task-orchestrator'.
  assert.deepStrictEqual(byStep.classificar, {
    step: 'classificar', role: 'task-orchestrator',
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
    if (!Array.isArray(nodes)) continue; // pula sub-objetos (feature.light etc.)
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

// ─── NOVOS TESTES G1-Moldes ───────────────────────────────────────────────────

// Conjunto de cargos conhecidos (AC-13)
const KNOWN_ROLES = new Set([
  'pipeline-controller', 'information-gate', 'task-orchestrator', 'sentinel',
  'plan-architect', 'quality-gate-router', 'pre-tester',
  'feature-implementer', 'feature-vertical-slice-planner', 'feature-integration-validator',
  'executor-controller', 'checkpoint-validator', 'review-orchestrator',
  'adversarial-batch', 'architecture-reviewer', 'diff-discipline-reviewer',
  'executor-fix', 'final-adversarial-orchestrator',
  'adversarial-security-scanner', 'adversarial-architecture-critic', 'adversarial-quality-reviewer',
  'final-validator', 'finishing-branch', 'sanity-checker',
  'design-interrogator',
  'bugfix-diagnostic-agent', 'bugfix-root-cause-analyzer', 'bugfix-regression-tester',
  'audit-intake', 'audit-domain-analyzer', 'audit-compliance-checker', 'audit-risk-matrix-generator',
  'ux-simulator', 'ux-accessibility-auditor', 'ux-qa-validator',
  'spec-format-gate', 'spec-content-reviewer', 'spec-post-impl-validator', 'spec-closer',
  'brainstorm-controller', 'general-purpose', 'adversarial-review-coordinator',
]);

// Helper: itera todos os FlowTemplates (arrays folha) do objeto TEMPLATES
function allTemplates() {
  const result = [];
  for (const [typeKey, val] of Object.entries(TEMPLATES)) {
    if (Array.isArray(val)) {
      // modo especial (hotfix, review-only) ou aliases (SIMPLES, COMPLEXA)
      result.push({ key: typeKey, nodes: val });
    } else if (val && typeof val === 'object') {
      for (const [varKey, nodes] of Object.entries(val)) {
        if (Array.isArray(nodes)) {
          result.push({ key: `${typeKey}.${varKey}`, nodes });
        }
      }
    }
  }
  return result;
}

// Helper: itera APENAS os 14 moldes canônicos (sem aliases SIMPLES/COMPLEXA)
function canonicalTemplates() {
  const types = ['bugfix', 'feature', 'user-story', 'audit', 'ux', 'spec'];
  const variants = ['light', 'heavy'];
  const specials = ['hotfix', 'review-only'];
  const result = [];
  for (const t of types) {
    for (const v of variants) {
      result.push({ key: `${t}.${v}`, nodes: TEMPLATES[t][v] });
    }
  }
  for (const s of specials) {
    result.push({ key: s, nodes: TEMPLATES[s] });
  }
  return result;
}

// T-01: módulo carrega sem erro
test('T-01 Módulo carrega sem erro — TEMPLATES definido e é objeto', () => {
  assert.ok(TEMPLATES !== undefined && TEMPLATES !== null, 'TEMPLATES deve existir');
  assert.strictEqual(typeof TEMPLATES, 'object');
});

// T-02: backward-compat SIMPLES acessível e referencia feature.light
// SIMPLES foi o molde original de Feature (5 nós); feature.light é a versão expandida.
// Backward-compat: TEMPLATES.SIMPLES ainda retorna array de nós com os 5 campos.
// Por design de migração, SIMPLES pode apontar para feature.light OU permanecer como
// o array original preservado — ambos são válidos; o invariante é que SIMPLES é array
// e tem os campos obrigatórios.
test('T-02 Backward-compat SIMPLES — acessível como array com campos obrigatórios', () => {
  assert.ok(Array.isArray(TEMPLATES.SIMPLES), 'SIMPLES deve ser array');
  assert.ok(TEMPLATES.SIMPLES.length > 0, 'SIMPLES não deve ser vazio');
  assert.ok(Array.isArray(TEMPLATES.feature.light), 'feature.light deve ser array');
  // Todo nó tem os 5 campos obrigatórios
  for (const node of TEMPLATES.SIMPLES) {
    assert.ok('step' in node && 'role' in node && 'blocks' in node && 'blockedBy' in node && 'next' in node,
      `nó ${node.step} de SIMPLES deve ter os 5 campos`);
  }
});

// T-03: backward-compat COMPLEXA — acessível e tem os 7 nós originais
// COMPLEXA foi o molde original com planejar+aprovar; feature.heavy é a versão expandida.
test('T-03 Backward-compat COMPLEXA — acessível como array com 7 nós originais', () => {
  assert.ok(Array.isArray(TEMPLATES.COMPLEXA), 'COMPLEXA deve ser array');
  assert.ok(TEMPLATES.COMPLEXA.length > 0, 'COMPLEXA não deve ser vazio');
  assert.ok(Array.isArray(TEMPLATES.feature.heavy), 'feature.heavy deve ser array');
  // Os 7 nós originais preservados como alias (pode ser o mesmo array ou deep-equal)
  const steps = TEMPLATES.COMPLEXA.map((n) => n.step);
  for (const s of ['classificar', 'clarificar', 'planejar', 'aprovar', 'implementar', 'revisar', 'fechar']) {
    assert.ok(steps.includes(s), `COMPLEXA deve conter step "${s}"`);
  }
});

// T-03b: MEDIA — alias adicionado em G6 adversarial review (complexidade intermediária).
// MEDIA tem 6 nós: classificar → clarificar → planejar → implementar → revisar → fechar.
// Sem etapa 'aprovar' (só COMPLEXA exige aprovação); com 'planejar' pois MEDIA auto-triggera plan-architect.
// Verifica: (a) é array acessível, (b) tem os 6 steps canônicos, (c) classificar usa task-orchestrator.
test('T-03b MEDIA — alias acessível com 6 nós e classificar atribuído a task-orchestrator', () => {
  assert.ok(Array.isArray(TEMPLATES.MEDIA), 'MEDIA deve ser array');
  assert.strictEqual(TEMPLATES.MEDIA.length, 6, 'MEDIA deve ter 6 nós');
  const steps = TEMPLATES.MEDIA.map((n) => n.step);
  for (const s of ['classificar', 'clarificar', 'planejar', 'implementar', 'revisar', 'fechar']) {
    assert.ok(steps.includes(s), `MEDIA deve conter step "${s}"`);
  }
  assert.ok(!steps.includes('aprovar'), 'MEDIA não deve conter step "aprovar" (só COMPLEXA exige aprovação)');
  const classificar = TEMPLATES.MEDIA.find((n) => n.step === 'classificar');
  assert.strictEqual(classificar.role, 'task-orchestrator',
    'classificar em MEDIA deve ser task-orchestrator (emite ORCHESTRATOR_DECISION)');
  // campos obrigatórios em todos os nós
  for (const node of TEMPLATES.MEDIA) {
    assert.ok('step' in node && 'role' in node && 'blocks' in node && 'blockedBy' in node && 'next' in node,
      `nó ${node.step} de MEDIA deve ter os 5 campos`);
  }
});

// T-04: completude de 14 chaves folha
test('T-04 Completude — 14 chaves folha presentes', () => {
  const leafKeys = [
    'bugfix.light', 'bugfix.heavy',
    'feature.light', 'feature.heavy',
    'user-story.light', 'user-story.heavy',
    'audit.light', 'audit.heavy',
    'ux.light', 'ux.heavy',
    'spec.light', 'spec.heavy',
    'hotfix', 'review-only',
  ];
  for (const k of leafKeys) {
    const parts = k.split('.');
    let val;
    if (parts.length === 1) {
      val = TEMPLATES[k];
    } else {
      val = TEMPLATES[parts[0]] && TEMPLATES[parts[0]][parts[1]];
    }
    assert.ok(Array.isArray(val) && val.length > 0, `chave "${k}" deve ser array não-vazio`);
  }
});

// T-05: estrutura mínima de nó
// blockedBy aceita: null (raiz), string (tronco linear), ou string[] (fan-in de paralelos)
test('T-05 Estrutura mínima de nó — campos obrigatórios em todos os moldes', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    for (const node of nodes) {
      assert.ok(typeof node.step === 'string' && node.step.length > 0,
        `[${key}] nó deve ter step string não-vazia`);
      assert.ok(typeof node.role === 'string' && node.role.length > 0,
        `[${key}/${node.step}] nó deve ter role string não-vazia`);
      assert.ok(Array.isArray(node.blocks),
        `[${key}/${node.step}] blocks deve ser array`);
      // blockedBy: null = raiz; string = predecessor único; string[] = fan-in (junção paralela)
      const isValidBlockedBy = node.blockedBy === null
        || typeof node.blockedBy === 'string'
        || (Array.isArray(node.blockedBy) && node.blockedBy.every((s) => typeof s === 'string'));
      assert.ok(isValidBlockedBy,
        `[${key}/${node.step}] blockedBy deve ser null, string ou string[]`);
      assert.ok(node.next === null || typeof node.next === 'string',
        `[${key}/${node.step}] next deve ser string ou null`);
    }
  }
});

// T-06: raiz única por molde
test('T-06 Raiz única — exatamente um nó com blockedBy === null em cada molde', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    const roots = nodes.filter((n) => n.blockedBy === null);
    assert.strictEqual(roots.length, 1,
      `[${key}] deve ter exatamente 1 raiz, encontrou ${roots.length}`);
  }
});

// T-07: terminal único por molde
test('T-07 Terminal único — exatamente um nó com next === null em cada molde', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    const terminals = nodes.filter((n) => n.next === null);
    assert.strictEqual(terminals.length, 1,
      `[${key}] deve ter exatamente 1 terminal, encontrou ${terminals.length}`);
  }
});

// T-08: ponteiros blockedBy válidos (aceita string scalar ou string[] para fan-in)
test('T-08 Ponteiros blockedBy válidos em todos os moldes', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    const stepSet = new Set(nodes.map((n) => n.step));
    for (const node of nodes) {
      if (node.blockedBy === null) continue; // raiz — ok
      const refs = Array.isArray(node.blockedBy) ? node.blockedBy : [node.blockedBy];
      for (const ref of refs) {
        assert.ok(stepSet.has(ref),
          `[${key}/${node.step}] blockedBy="${ref}" não existe no molde`);
      }
    }
  }
});

// T-09: ponteiros next válidos
test('T-09 Ponteiros next válidos em todos os moldes', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    const stepSet = new Set(nodes.map((n) => n.step));
    for (const node of nodes) {
      if (node.next !== null) {
        assert.ok(stepSet.has(node.next),
          `[${key}/${node.step}] next="${node.next}" não existe no molde`);
      }
    }
  }
});

// T-10: blocos no dicionário (P6) — para todos os 14 moldes canônicos
test('T-10 Blocos no dicionário (P6) — todos os moldes canônicos', () => {
  const dictKeysBeforeCount = Object.keys(BLOCK_TO_GATE).length;
  for (const { key, nodes } of canonicalTemplates()) {
    for (const node of nodes) {
      for (const block of node.blocks) {
        if (block === 'ORCHESTRATOR_DECISION') continue; // exceção documentada
        const gate = gateForBlock(block);
        assert.notStrictEqual(gate, null,
          `[${key}/${node.step}] bloco "${block}" não tem mapeamento em BLOCK_TO_GATE`);
      }
    }
  }
  // Dicionário não foi modificado como efeito colateral
  assert.strictEqual(Object.keys(BLOCK_TO_GATE).length, dictKeysBeforeCount,
    'BLOCK_TO_GATE não deve ser modificado como efeito colateral');
});

// T-11: tamanho mínimo — variante light
// (limites revisados pós-correção G1-Moldes: bugfix.light removeu plan-architect+aprovar;
//  audit.light e ux.light removeram executor-fix+review-orchestrator+sanity per Iron Law)
test('T-11 Tamanho mínimo dos moldes — light', () => {
  assert.ok(TEMPLATES.bugfix.light.length >= 14,
    `bugfix.light tem ${TEMPLATES.bugfix.light.length} nós, esperado >= 14`);
  assert.ok(TEMPLATES.feature.light.length >= 18,
    `feature.light tem ${TEMPLATES.feature.light.length} nós, esperado >= 18`);
  assert.ok(TEMPLATES['user-story'].light.length >= 20,
    `user-story.light tem ${TEMPLATES['user-story'].light.length} nós, esperado >= 20`);
  assert.ok(TEMPLATES.audit.light.length >= 11,
    `audit.light tem ${TEMPLATES.audit.light.length} nós, esperado >= 11`);
  assert.ok(TEMPLATES.ux.light.length >= 9,
    `ux.light tem ${TEMPLATES.ux.light.length} nós, esperado >= 9`);
  assert.ok(TEMPLATES.spec.light.length >= 11,
    `spec.light tem ${TEMPLATES.spec.light.length} nós, esperado >= 11`);
});

// T-12: tamanho mínimo — variante heavy
// (limites revisados pós-correção G1-Moldes: bugfix.heavy removeu plan-architect+aprovar+
//  quality-gate-router+pre-tester; audit.heavy e ux.heavy removeram executor-fix etc.)
test('T-12 Tamanho mínimo dos moldes — heavy', () => {
  assert.ok(TEMPLATES.bugfix.heavy.length >= 20,
    `bugfix.heavy tem ${TEMPLATES.bugfix.heavy.length} nós, esperado >= 20`);
  assert.ok(TEMPLATES.feature.heavy.length >= 20,
    `feature.heavy tem ${TEMPLATES.feature.heavy.length} nós, esperado >= 20`);
  assert.ok(TEMPLATES['user-story'].heavy.length >= 25,
    `user-story.heavy tem ${TEMPLATES['user-story'].heavy.length} nós, esperado >= 25`);
  assert.ok(TEMPLATES.audit.heavy.length >= 14,
    `audit.heavy tem ${TEMPLATES.audit.heavy.length} nós, esperado >= 14`);
  assert.ok(TEMPLATES.ux.heavy.length >= 10,
    `ux.heavy tem ${TEMPLATES.ux.heavy.length} nós, esperado >= 10`);
  assert.ok(TEMPLATES.spec.heavy.length >= 16,
    `spec.heavy tem ${TEMPLATES.spec.heavy.length} nós, esperado >= 16`);
});

// T-13: hotfix=12 nós; review-only=4 nós
test('T-13 Hotfix=12 nós; review-only=4 nós', () => {
  assert.strictEqual(TEMPLATES.hotfix.length, 12,
    `hotfix deve ter exatamente 12 nós, tem ${TEMPLATES.hotfix.length}`);
  assert.strictEqual(TEMPLATES['review-only'].length, 4,
    `review-only deve ter exatamente 4 nós, tem ${TEMPLATES['review-only'].length}`);
});

// T-14: hotfix não contém plan-architect
test('T-14 Hotfix não contém plan-architect', () => {
  const found = TEMPLATES.hotfix.find((n) => n.role === 'plan-architect');
  assert.ok(!found, 'hotfix não deve conter nó com role plan-architect');
});

// T-15: review-only não contém task-orchestrator, information-gate, plan-architect, pre-tester
test('T-15 Review-only não contém task-orchestrator nem information-gate', () => {
  const forbidden = new Set(['task-orchestrator', 'information-gate', 'plan-architect', 'pre-tester']);
  for (const node of TEMPLATES['review-only']) {
    assert.ok(!forbidden.has(node.role),
      `review-only não deve conter role "${node.role}"`);
  }
});

// T-16: audit sem TDD ativo (quality-gate-router, pre-tester)
test('T-16 Audit sem TDD ativo — quality-gate-router e pre-tester ausentes', () => {
  const tddRoles = new Set(['quality-gate-router', 'pre-tester']);
  for (const variant of ['light', 'heavy']) {
    const nodes = TEMPLATES.audit[variant];
    for (const node of nodes) {
      if (node.suppressed) continue;
      assert.ok(!tddRoles.has(node.role),
        `audit.${variant} não deve ter nó ativo com role "${node.role}"`);
    }
  }
});

// T-17: audit sem final-adversarial-orchestrator ativo
test('T-17 Audit sem final-adversarial-orchestrator ativo', () => {
  for (const variant of ['light', 'heavy']) {
    const nodes = TEMPLATES.audit[variant];
    const found = nodes.find((n) => n.role === 'final-adversarial-orchestrator' && !n.suppressed);
    assert.ok(!found,
      `audit.${variant} não deve ter nó ativo com role final-adversarial-orchestrator`);
  }
});

// T-18: UX light sem accessibility-auditor; contém ux-simulator e ux-qa-validator
test('T-18 UX light sem ux-accessibility-auditor; tem ux-simulator e ux-qa-validator', () => {
  const nodes = TEMPLATES.ux.light;
  const activeNodes = nodes.filter((n) => !n.suppressed);
  const a11y = activeNodes.find((n) => n.role === 'ux-accessibility-auditor');
  assert.ok(!a11y, 'ux.light não deve conter nó com role ux-accessibility-auditor');
  const simCount = activeNodes.filter((n) => n.role === 'ux-simulator').length;
  assert.strictEqual(simCount, 1, 'ux.light deve conter exatamente 1 ux-simulator');
  const qaCount = activeNodes.filter((n) => n.role === 'ux-qa-validator').length;
  assert.strictEqual(qaCount, 1, 'ux.light deve conter exatamente 1 ux-qa-validator');
});

// T-19: UX heavy com paralelo ux-simulator ‖ ux-accessibility-auditor
test('T-19 UX heavy — paralelo ux-simulator ‖ ux-accessibility-auditor', () => {
  const nodes = TEMPLATES.ux.heavy;
  const sim = nodes.find((n) => n.role === 'ux-simulator');
  const a11y = nodes.find((n) => n.role === 'ux-accessibility-auditor');
  assert.ok(sim, 'ux.heavy deve ter ux-simulator');
  assert.ok(a11y, 'ux.heavy deve ter ux-accessibility-auditor');
  // Ambos têm o mesmo next (junção)
  assert.strictEqual(sim.next, a11y.next,
    'ux-simulator e ux-accessibility-auditor devem ter o mesmo next (junção)');
  // Nenhum bloqueia o outro
  assert.notStrictEqual(sim.blockedBy, a11y.step,
    'ux-simulator não deve ser bloqueado por ux-accessibility-auditor');
  assert.notStrictEqual(a11y.blockedBy, sim.step,
    'ux-accessibility-auditor não deve ser bloqueado por ux-simulator');
});

// T-20: feature.heavy paralelo N12 revisão por lote (≥2 irmãos com mesmo next)
test('T-20 Feature.heavy — paralelo N12 revisão por lote', () => {
  const nodes = TEMPLATES.feature.heavy;
  // Achar grupos paralelos: nós com parallel definido
  const parallelNodes = nodes.filter((n) => Array.isArray(n.parallel) && n.parallel.length > 0);
  // Deve existir pelo menos um grupo
  assert.ok(parallelNodes.length >= 1, 'feature.heavy deve ter pelo menos 1 grupo paralelo');
  // O grupo com irmãos: verificar que todos têm o mesmo next e nenhum bloqueia o outro
  // Agrupa por next
  const byNext = {};
  for (const n of parallelNodes) {
    const key = n.next;
    if (!byNext[key]) byNext[key] = [];
    byNext[key].push(n);
  }
  const groups = Object.values(byNext).filter((g) => g.length >= 2);
  assert.ok(groups.length >= 1, 'feature.heavy deve ter ao menos 1 grupo paralelo com 2+ irmãos');
  for (const group of groups) {
    const stepSet = new Set(group.map((n) => n.step));
    for (const sibling of group) {
      assert.ok(!stepSet.has(sibling.blockedBy),
        `[feature.heavy] irmão "${sibling.step}" não deve ser bloqueado por outro irmão do mesmo grupo`);
    }
  }
});

// T-21: feature.heavy paralelo N17 revisão final — 3 irmãos adversariais
test('T-21 Feature.heavy — paralelo N17 revisão final com 3 adversariais', () => {
  const nodes = TEMPLATES.feature.heavy;
  const secScanner = nodes.find((n) => n.role === 'adversarial-security-scanner');
  const archCritic = nodes.find((n) => n.role === 'adversarial-architecture-critic');
  const qualReviewer = nodes.find((n) => n.role === 'adversarial-quality-reviewer');
  assert.ok(secScanner, 'feature.heavy deve ter adversarial-security-scanner');
  assert.ok(archCritic, 'feature.heavy deve ter adversarial-architecture-critic');
  assert.ok(qualReviewer, 'feature.heavy deve ter adversarial-quality-reviewer');
  // Todos têm o mesmo next
  assert.strictEqual(secScanner.next, archCritic.next,
    'security-scanner e architecture-critic devem ter mesmo next');
  assert.strictEqual(archCritic.next, qualReviewer.next,
    'architecture-critic e quality-reviewer devem ter mesmo next');
  // Nenhum bloqueia os outros
  const siblingSteps = new Set([secScanner.step, archCritic.step, qualReviewer.step]);
  for (const sibling of [secScanner, archCritic, qualReviewer]) {
    assert.ok(!siblingSteps.has(sibling.blockedBy),
      `adversarial sibling "${sibling.step}" não deve ser bloqueado por outro sibling adversarial`);
  }
});

// T-22: fix-loop como nó único (D4)
test('T-22 Fix-loop como nó único (D4) — executor-fix aparece exatamente 1 vez por molde', () => {
  const validFixBlocks = new Set(['FIX_COMPLETE', 'EXECUTOR_FIX_DONE', 'FIX_APPLIED']);
  for (const { key, nodes } of canonicalTemplates()) {
    const fixNodes = nodes.filter((n) => n.role === 'executor-fix');
    if (fixNodes.length === 0) continue; // moldes sem fix loop (audit, ux, spec)
    assert.strictEqual(fixNodes.length, 1,
      `[${key}] deve ter exatamente 1 nó executor-fix, encontrou ${fixNodes.length}`);
    // blocks contém pelo menos um bloco de fix
    const hasFixBlock = fixNodes[0].blocks.some((b) => validFixBlocks.has(b));
    assert.ok(hasFixBlock,
      `[${key}/executor-fix] blocks deve incluir pelo menos um de ${[...validFixBlocks].join(', ')}`);
  }
});

// T-23: cargos conhecidos em todos os nós de todos os moldes
test('T-23 Cargos conhecidos — role de cada nó pertence ao conjunto documentado', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    for (const node of nodes) {
      assert.ok(KNOWN_ROLES.has(node.role),
        `[${key}/${node.step}] role "${node.role}" não está no conjunto de cargos conhecidos`);
    }
  }
});

// T-24: bugfix.heavy contém bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester
test('T-24 Bugfix.heavy contém nós de miolo específico', () => {
  const nodes = TEMPLATES.bugfix.heavy;
  const roles = new Set(nodes.map((n) => n.role));
  assert.ok(roles.has('bugfix-diagnostic-agent'), 'bugfix.heavy deve ter bugfix-diagnostic-agent');
  assert.ok(roles.has('bugfix-root-cause-analyzer'), 'bugfix.heavy deve ter bugfix-root-cause-analyzer');
  assert.ok(roles.has('bugfix-regression-tester'), 'bugfix.heavy deve ter bugfix-regression-tester');
});

// T-25: bugfix.light contém diagnostic mas não root-cause-analyzer
test('T-25 Bugfix.light contém diagnostic, não root-cause-analyzer', () => {
  const nodes = TEMPLATES.bugfix.light;
  const roles = new Set(nodes.map((n) => n.role));
  assert.ok(roles.has('bugfix-diagnostic-agent'),
    'bugfix.light deve ter bugfix-diagnostic-agent');
  assert.ok(!roles.has('bugfix-root-cause-analyzer'),
    'bugfix.light não deve ter bugfix-root-cause-analyzer');
});

// T-26: feature.heavy contém feature-integration-validator; feature.light não contém
test('T-26 Feature.heavy contém feature-integration-validator; feature.light não', () => {
  const heavyRoles = new Set(TEMPLATES.feature.heavy.map((n) => n.role));
  const lightRoles = new Set(TEMPLATES.feature.light.map((n) => n.role));
  assert.ok(heavyRoles.has('feature-integration-validator'),
    'feature.heavy deve ter feature-integration-validator');
  assert.ok(!lightRoles.has('feature-integration-validator'),
    'feature.light não deve ter feature-integration-validator');
});

// T-27: user-story: ambas variantes contêm feature-vertical-slice-planner e feature-implementer
test('T-27 User-story: ambas variantes contêm feature-vertical-slice-planner e feature-implementer', () => {
  for (const variant of ['light', 'heavy']) {
    const roles = new Set(TEMPLATES['user-story'][variant].map((n) => n.role));
    assert.ok(roles.has('feature-vertical-slice-planner'),
      `user-story.${variant} deve ter feature-vertical-slice-planner`);
    assert.ok(roles.has('feature-implementer'),
      `user-story.${variant} deve ter feature-implementer`);
  }
});

// T-28: audit.heavy contém audit-domain-analyzer; audit.light não contém
test('T-28 Audit.heavy contém audit-domain-analyzer; audit.light não', () => {
  const heavyRoles = new Set(TEMPLATES.audit.heavy.map((n) => n.role));
  const lightRoles = new Set(TEMPLATES.audit.light.map((n) => n.role));
  assert.ok(heavyRoles.has('audit-domain-analyzer'),
    'audit.heavy deve ter audit-domain-analyzer');
  assert.ok(!lightRoles.has('audit-domain-analyzer'),
    'audit.light não deve ter audit-domain-analyzer');
});

// T-29: spec.light contém spec-format-gate, spec-post-impl-validator, spec-closer;
//        spec.heavy contém adicionalmente spec-content-reviewer
test('T-29 Spec.light tem spec-format-gate, spec-post-impl-validator, spec-closer; spec.heavy tem spec-content-reviewer', () => {
  const lightRoles = new Set(TEMPLATES.spec.light.map((n) => n.role));
  const heavyRoles = new Set(TEMPLATES.spec.heavy.map((n) => n.role));
  for (const role of ['spec-format-gate', 'spec-post-impl-validator', 'spec-closer']) {
    assert.ok(lightRoles.has(role), `spec.light deve ter ${role}`);
    assert.ok(heavyRoles.has(role), `spec.heavy deve ter ${role}`);
  }
  assert.ok(heavyRoles.has('spec-content-reviewer'),
    'spec.heavy deve ter spec-content-reviewer');
});

// T-30: spec.heavy contém sentinels intermediários (ao menos 4 nós com role 'sentinel')
test('T-30 Spec.heavy contém sentinels intermediários (>= 4 nós sentinel)', () => {
  const sentinelCount = TEMPLATES.spec.heavy.filter((n) => n.role === 'sentinel').length;
  assert.ok(sentinelCount >= 4,
    `spec.heavy deve ter >= 4 nós sentinel, tem ${sentinelCount}`);
});

// T-31: light não contém design-interrogator ativo
test('T-31 Variante light não contém design-interrogator ativo', () => {
  const lightTypes = ['bugfix', 'feature', 'user-story', 'audit', 'ux', 'spec'];
  for (const t of lightTypes) {
    const nodes = TEMPLATES[t].light;
    const found = nodes.find((n) => n.role === 'design-interrogator' && !n.suppressed);
    assert.ok(!found,
      `${t}.light não deve conter nó ativo com role design-interrogator`);
  }
});

// T-32: heavy contém design-interrogator (exatamente 1 por molde)
test('T-32 Variante heavy contém exatamente 1 design-interrogator', () => {
  const heavyTypes = ['bugfix', 'feature', 'user-story', 'audit', 'ux', 'spec'];
  for (const t of heavyTypes) {
    const nodes = TEMPLATES[t].heavy;
    const count = nodes.filter((n) => n.role === 'design-interrogator').length;
    assert.strictEqual(count, 1,
      `${t}.heavy deve ter exatamente 1 design-interrogator, tem ${count}`);
  }
});

// T-35: finishing-branch presente e é o terminal em TODOS os 14 moldes canônicos
// Prova Finding 3: cargo finishing-branch (N19 FECHAR) estava ausente — substituído
// erroneamente por final-validator. O terminal de cada molde deve usar finishing-branch.
test('T-35 finishing-branch presente como terminal em todos os 14 moldes canônicos', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    const terminal = nodes.find((n) => n.next === null);
    assert.ok(terminal, `[${key}] deve ter um nó terminal`);
    assert.strictEqual(
      terminal.role, 'finishing-branch',
      `[${key}] nó terminal ("${terminal.step}") deve ter role finishing-branch, encontrou "${terminal.role}"`,
    );
  }
});

// T-36: PA_DE_CAL emitido ANTES de SLICE_CLOSEOUT em todos os moldes canônicos
// Prova Finding 4: a ordem estava INVERTIDA (spec-closer/SLICE_CLOSEOUT → fechar/PA_DE_CAL).
// Canônico (_tronco.md N18/N19): final-validator(PA_DE_CAL) precede finishing-branch(SLICE_CLOSEOUT).
// Exceção documentada: review-only (4 nós exatos por invariante T-13) comprime N18+N19 em 1 nó;
// finishing-branch emite ambos os blocos — PA_DE_CAL ainda é listado ANTES de SLICE_CLOSEOUT no array blocks[].
test('T-36 PA_DE_CAL emitido antes de SLICE_CLOSEOUT em todos os moldes canônicos', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    const paDeCalNode = nodes.find((n) => n.blocks.includes('PA_DE_CAL'));
    const sliceCloseoutNode = nodes.find((n) => n.blocks.includes('SLICE_CLOSEOUT'));
    assert.ok(paDeCalNode,
      `[${key}] deve ter nó que emite PA_DE_CAL`);
    assert.ok(sliceCloseoutNode,
      `[${key}] deve ter nó que emite SLICE_CLOSEOUT`);
    // PA_DE_CAL deve vir antes de SLICE_CLOSEOUT na ordem do array (tronco)
    const paIdx = nodes.indexOf(paDeCalNode);
    const scIdx = nodes.indexOf(sliceCloseoutNode);
    assert.ok(paIdx <= scIdx,
      `[${key}] PA_DE_CAL (índice ${paIdx}/"${paDeCalNode.step}") deve preceder ou co-ocorrer com SLICE_CLOSEOUT (índice ${scIdx}/"${sliceCloseoutNode.step}")`);
    // finishing-branch emite SLICE_CLOSEOUT (terminal)
    assert.strictEqual(sliceCloseoutNode.role, 'finishing-branch',
      `[${key}] nó que emite SLICE_CLOSEOUT deve ter role finishing-branch`);
    // Se forem nós distintos: PA_DE_CAL deve ser emitido por nó que NÃO é finishing-branch
    if (paDeCalNode !== sliceCloseoutNode) {
      assert.notStrictEqual(paDeCalNode.role, 'finishing-branch',
        `[${key}] nó que emite PA_DE_CAL NÃO deve ser finishing-branch (ordem canônica N18 antes N19)`);
    }
    // Se forem o mesmo nó (modo ultra-compacto como review-only): PA_DE_CAL listado antes de SLICE_CLOSEOUT em blocks[]
    if (paDeCalNode === sliceCloseoutNode) {
      const paBlockIdx = paDeCalNode.blocks.indexOf('PA_DE_CAL');
      const scBlockIdx = paDeCalNode.blocks.indexOf('SLICE_CLOSEOUT');
      assert.ok(paBlockIdx < scBlockIdx,
        `[${key}] modo compacto: PA_DE_CAL deve vir antes de SLICE_CLOSEOUT no array blocks[] do nó "${paDeCalNode.step}"`);
    }
  }
});

// T-34: Fan-in completeness — junção lista TODOS os irmãos do grupo paralelo em blockedBy
// Prova que a regressão de Finding 2 (race onde junção desbloqueava com 1 de 3 irmãos)
// não pode ser reintroduzida sem quebrar este teste.
test('T-34 Fan-in completeness — toda junção lista TODOS os irmãos paralelos em blockedBy[]', () => {
  for (const { key, nodes } of canonicalTemplates()) {
    for (const node of nodes) {
      // Nó é junção se blockedBy é array (fan-in de paralelos)
      if (!Array.isArray(node.blockedBy)) continue;
      const junctionBlockedBy = new Set(node.blockedBy);
      // Acha todos os nós que têm next === este nó (irmãos que convergem aqui)
      const siblings = nodes.filter((n) => n.next === node.step && n.step !== node.step);
      const siblingSteps = new Set(siblings.map((n) => n.step));
      // Cada irmão que aponta para esta junção deve estar em blockedBy[]
      for (const sibStep of siblingSteps) {
        assert.ok(
          junctionBlockedBy.has(sibStep),
          `[${key}/${node.step}] junção deve ter "${sibStep}" em blockedBy[] (fan-in incompleto = race condition)`,
        );
      }
      // blockedBy[] não deve ter entradas que não existam no molde como irmãos reais
      const stepSet = new Set(nodes.map((n) => n.step));
      for (const blocked of node.blockedBy) {
        assert.ok(stepSet.has(blocked),
          `[${key}/${node.step}] blockedBy contém "${blocked}" que não é step do molde`);
        assert.ok(siblingSteps.has(blocked),
          `[${key}/${node.step}] blockedBy contém "${blocked}" que NÃO aponta para esta junção (fan-in fantasma)`);
      }
    }
  }
});

// T-33: BLOCK_TO_GATE não cresce após require de tree-template.cjs
test('T-33 Módulo não modifica BLOCK_TO_GATE — nenhum bloco inventado inserido como efeito colateral', () => {
  // O dicionário foi importado antes dos templates; se um bloco inventado tivesse sido
  // inserido, ele estaria aqui. Verificamos que as chaves são exatamente o conjunto canônico.
  // Achado adversarial D7 (G3-Régua): SANITY_CHECK foi REMOVIDO de BLOCK_TO_GATE.
  // _fidelidade.md §5 (gerada 2026-06-01, linha 118) declara "sem mapeamento atual (ver Gap G2)".
  // _fidelidade.md §2 (linha 65) calcula tetos assumindo "21 mapeamentos" com SANITY_CHECK fora.
  // Gap G2 permanece ABERTO (_tronco.md §5, _modos.md §1.5 G-HF2 — decisão pendente do usuário).
  // G3-D8-fix: REVIEW_ONLY_SCORE também não está (bloco inventado; nenhum agente real o emite).
  const knownGateBlocks = [
    'CLARIFICATION_DONE', 'ORCHESTRATOR_DECISION', 'TRIAGE_RESULT',
    'TDD_GREEN', 'TDD_RED', 'REGRESSION_RESULT', 'REGRESSION_CLOSEOUT',
    // SANITY_CHECK removido (D7-fix): Gap G2 aberto, mapeamento divergia da SSOT _fidelidade.md.
    // REVIEW_ONLY_SCORE também não está (D8-fix): bloco inventado, nenhum agente real o emite.
    'ADVERSARIAL_CONSOLIDATED', 'ADVERSARIAL_CONSOLIDATED_CORRECTION',
    'SECURITY_FINDINGS', 'QUALITY_FINDINGS', 'ARCHITECTURE_FINDINGS', 'SECURITY_RERUN_FINDINGS',
    'EXECUTOR_FIX_DONE', 'FIX_COMPLETE', 'FIX_APPLIED',
    'PA_DE_CAL', 'ADVERSARIAL_FINAL_VERDICT',
    'SLICE_CLOSEOUT', 'HANDOFF_STATUS', 'SPEC_CLOSER',
  ];
  for (const k of knownGateBlocks) {
    assert.ok(Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, k),
      `chave esperada "${k}" deve existir em BLOCK_TO_GATE`);
  }
  // Número total bate com o conjunto canônico (21 após remoção de SANITY_CHECK + REVIEW_ONLY_SCORE)
  assert.strictEqual(Object.keys(BLOCK_TO_GATE).length, knownGateBlocks.length,
    'BLOCK_TO_GATE deve ter exatamente as chaves canônicas');
});
