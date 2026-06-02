'use strict';
// Molde declarativo da árvore de tarefas (dados puros) — G1-Moldes.
//
// Estrutura de indexação: TEMPLATES[type][variant] (Decisão D3).
// Exemplos: TEMPLATES.bugfix.heavy, TEMPLATES.feature.light.
// Modos especiais: TEMPLATES.hotfix, TEMPLATES['review-only'] (sem sub-objeto de variante).
// Aliases backward-compat: TEMPLATES.SIMPLES e TEMPLATES.COMPLEXA (arrays originais preservados
//   que representavam o tipo Feature antes da migração G1-Moldes).
//
// Cada TemplateNode: { step, role, blocks, blockedBy, next, [parallel], [suppressed] }
//   - step:       identificador único do passo dentro do molde
//   - role:       cargo existente no catálogo Paperclip (nunca inventado)
//   - blocks:     blocos canônicos a emitir ao concluir; todo bloco não-vazio DEVE
//                 existir em BLOCK_TO_GATE do dicionário, ou ser ORCHESTRATOR_DECISION
//                 (exceção documentada: só infere complexidade, não é portão medido)
//   - blockedBy:  step anterior que trava este nó (null = raiz)
//   - next:       próxima etapa ao concluir (null = fim do molde)
//   - parallel:   lista de steps-irmãos (opcional; todos convergem na issue-junção apontada por next)
//   - suppressed: quando true, o nó existe no molde mas NÃO gera issue (passo pulado por design)
//
// Lacunas de bloco documentadas:
//   PLAN_REJECTED não tem bloco-fonte no dicionário (Grupo D backlog, design.md §Molde).
//   Aprovação é trava estrutural + audit; não emite portão (Decisão D-F1).
//   PROPOSAL_CONFIRMED gap G1 do _tronco.md → blocks: [].
//   D4: nós de fix-loop são UM nó único; comentário instrui iteração interna.
// D7-fix: nodeSanityChecker declara blocks: [] (Gap G2 aberto — _fidelidade.md §5, _tronco.md §5).
//     O agente real emite "SANITY_CHECK:" como YAML, não como cabeçalho "### SANITY_CHECK v1".
//     O parser só reconhece cabeçalhos; declarar o bloco seria enganoso. Gap G2 permanece ABERTO.

// ─── BLOCOS CANÔNICOS REUTILIZADOS ──────────────────────────────────────────
const B_ORCHESTRATOR = 'ORCHESTRATOR_DECISION';
const B_CLARIFICATION = 'CLARIFICATION_DONE';
const B_TDD_GREEN = 'TDD_GREEN';
const B_REGRESSION = 'REGRESSION_RESULT';
const B_ADV_CONSOLIDATED = 'ADVERSARIAL_CONSOLIDATED';
const B_SEC_FINDINGS = 'SECURITY_FINDINGS';
const B_ARCH_FINDINGS = 'ARCHITECTURE_FINDINGS';
const B_QUAL_FINDINGS = 'QUALITY_FINDINGS';
const B_FIX_COMPLETE = 'FIX_COMPLETE';
const B_PA_DE_CAL = 'PA_DE_CAL';
const B_SLICE_CLOSEOUT = 'SLICE_CLOSEOUT';
const B_ADV_FINAL = 'ADVERSARIAL_FINAL_VERDICT';

// ─── HELPERS DE NÓ ──────────────────────────────────────────────────────────

function nodeSentinel(step, blockedBy, nextStep) {
  return { step, role: 'sentinel', blocks: [], blockedBy, next: nextStep };
}

function nodePlanArquiteto(blockedBy, nextStep) {
  return {
    step: 'planejar', role: 'plan-architect',
    // blocks vazio: PLAN_REJECTED sem bloco-fonte no dicionário (Grupo D backlog)
    blocks: [], blockedBy, next: nextStep,
  };
}

// nodeAprovar — aprovação de plano (trava estrutural, sem bloco de saída medido — Decisão D-F1)
// Usado em feature/bugfix/user-story para gate de aprovação do plano (não é PA_DE_CAL).
function nodeAprovar(step, blockedBy, nextStep) {
  return {
    step, role: 'final-validator',
    // blocks vazio: aprovação é trava estrutural (Decisão D-F1)
    blocks: [], blockedBy, next: nextStep,
  };
}

// nodeAprovarFinal — aprovação final com PA_DE_CAL (audit/ux: cargo "final-validator" canonical)
// Diferente de nodeAprovar (plan gate): este emite PA_DE_CAL e SLICE_CLOSEOUT não se aplica aqui.
// Canônico: PAPERCLIP-AUDIT-WORKFLOW.md §2 cargo 7 + PAPERCLIP-UX-WORKFLOW.md §2 cargo final.
function nodeAprovarFinal(step, blockedBy, nextStep) {
  return {
    step, role: 'final-validator',
    blocks: [B_PA_DE_CAL], blockedBy, next: nextStep,
  };
}

function nodeDesignInterrogator(blockedBy, nextStep) {
  return {
    step: 'design-interrogar', role: 'design-interrogator',
    blocks: [], blockedBy, next: nextStep,
  };
}

function nodeQualityGateRouter(blockedBy, nextStep) {
  return {
    step: 'gerar-cenarios', role: 'quality-gate-router',
    blocks: [], blockedBy, next: nextStep,
  };
}

function nodePreTester(blockedBy, nextStep) {
  return {
    step: 'pre-tester', role: 'pre-tester',
    blocks: [], blockedBy, next: nextStep,
  };
}

function nodeExecutorFix(step, blockedBy, nextStep) {
  return {
    step, role: 'executor-fix',
    // D4: max 3 tentativas, itere por dentro; FIX_COMPLETE cobre ADVERSARIAL_BLOCK no dicionário
    blocks: [B_FIX_COMPLETE], blockedBy, next: nextStep,
  };
}

function nodeReviewOrchestrator(step, blockedBy, nextStep) {
  return {
    step, role: 'review-orchestrator',
    blocks: [], blockedBy, next: nextStep,
  };
}

function nodeSanityChecker(step, blockedBy, nextStep) {
  return {
    step, role: 'sanity-checker',
    // D7-fix (achado adversarial G3-Régua): SANITY_CHECK removido de blocks[].
    // Razão: _fidelidade.md §5 (gerada 2026-06-01) lista SANITY_CHECK como "sem mapeamento
    // atual (ver Gap G2)". O agente real (sanity-checker.md:78) emite o bloco como YAML
    // ("SANITY_CHECK:"), NÃO como cabeçalho "### SANITY_CHECK v1". O parser de fidelidade
    // só reconhece cabeçalhos — declarar o bloco aqui seria enganoso (o score nunca o
    // contabilizaria). Gap G2 permanece ABERTO (_tronco.md §5, _modos.md §1.5 G-HF2).
    // Quando/se o Gap G2 for resolvido (parser estendido OU agente adota formato de cabeçalho),
    // restaurar: blocks: ['SANITY_CHECK'] e adicionar entrada ao dicionário.
    blocks: [], blockedBy, next: nextStep,
  };
}

// nodeFinalAdversarial — a junção recebe blockedBy como ARRAY de todos os irmãos
// do trio (fan-in real: todos devem concluir antes da junção desbloquear).
// Uso: nodeFinalAdversarial(step, [sib1, sib2, sib3], nextStep)
function nodeFinalAdversarial(step, blockedBy, nextStep) {
  // blockedBy deve ser array (fan-in de todos os irmãos paralelos)
  const blockedByArr = Array.isArray(blockedBy) ? blockedBy : [blockedBy];
  return {
    step, role: 'final-adversarial-orchestrator',
    blocks: [B_ADV_FINAL], blockedBy: blockedByArr, next: nextStep,
  };
}

// Trio adversarial paralelo (N17) — 3 irmãos nomeados + junção
// A junção (junctionStep) deve usar blockedBy=[adv-security, adv-architecture, adv-quality]
// para expressar fan-in real (todos 3 devem concluir antes de desbloquear).
function nodeTrio(blockedBy, junctionStep, prefix) {
  const p = prefix || '';
  return [
    {
      step: `${p}adv-security`, role: 'adversarial-security-scanner',
      blocks: [B_SEC_FINDINGS],
      blockedBy, next: junctionStep,
      parallel: [`${p}adv-architecture`, `${p}adv-quality`],
    },
    {
      step: `${p}adv-architecture`, role: 'adversarial-architecture-critic',
      blocks: [B_ARCH_FINDINGS],
      blockedBy, next: junctionStep,
      parallel: [`${p}adv-security`, `${p}adv-quality`],
    },
    {
      step: `${p}adv-quality`, role: 'adversarial-quality-reviewer',
      blocks: [B_QUAL_FINDINGS],
      blockedBy, next: junctionStep,
      parallel: [`${p}adv-security`, `${p}adv-architecture`],
    },
  ];
}

// ─── ALIASES ORIGINAIS (backward-compat) ─────────────────────────────────────
// Esses arrays preservam EXATAMENTE os moldes originais de SIMPLES e COMPLEXA
// (5 e 7 nós respectivamente) que existiam antes da migração G1-Moldes.
// Os testes existentes verificam esses arrays por nome de step e por conteúdo exato.
// CORREÇÃO G6 (adversarial review): o cargo canônico de 'classificar' é task-orchestrator
// em TODOS os moldes (ver tree-template.cjs buildFeatureLight, buildFeaturHeavy, etc.).
// pipeline-controller é o N1 dispatcher, não o classificador — ele emite DISPATCH_REQUEST,
// não ORCHESTRATOR_DECISION. Referência: paperclip-catalog.md linha 30 + task-orchestrator.md §Output.
const SIMPLES_ORIGINAL = [
  {
    step: 'classificar', role: 'task-orchestrator',
    blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar',
  },
  {
    step: 'clarificar', role: 'information-gate',
    blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'implementar',
  },
  {
    step: 'implementar', role: 'feature-implementer',
    blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'clarificar', next: 'revisar',
  },
  {
    step: 'revisar', role: 'adversarial-review-coordinator',
    blocks: [B_ADV_CONSOLIDATED], blockedBy: 'implementar', next: 'fechar',
  },
  {
    step: 'fechar', role: 'final-validator',
    blocks: [B_SLICE_CLOSEOUT, B_PA_DE_CAL], blockedBy: 'revisar', next: null,
  },
];

// MEDIA_ORIGINAL: molde de complexidade intermediária.
// 6 nós — como SIMPLES mas com etapa 'planejar' entre clarificar e implementar,
// espelhando a regra do pipeline (MEDIA auto-triggers plan-architect).
// task-orchestrator classifica; plan-architect planeja; sem etapa 'aprovar' (só COMPLEXA exige aprovação).
const MEDIA_ORIGINAL = [
  {
    step: 'classificar', role: 'task-orchestrator',
    blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar',
  },
  {
    step: 'clarificar', role: 'information-gate',
    blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'planejar',
  },
  {
    // blocks vazio de propósito — PLAN_REJECTED sem bloco-fonte no dicionário (Grupo D)
    step: 'planejar', role: 'plan-architect',
    blocks: [], blockedBy: 'clarificar', next: 'implementar',
  },
  {
    step: 'implementar', role: 'feature-implementer',
    blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'planejar', next: 'revisar',
  },
  {
    step: 'revisar', role: 'adversarial-review-coordinator',
    blocks: [B_ADV_CONSOLIDATED], blockedBy: 'implementar', next: 'fechar',
  },
  {
    step: 'fechar', role: 'final-validator',
    blocks: [B_SLICE_CLOSEOUT, B_PA_DE_CAL], blockedBy: 'revisar', next: null,
  },
];

const COMPLEXA_ORIGINAL = [
  {
    step: 'classificar', role: 'task-orchestrator',
    blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar',
  },
  {
    step: 'clarificar', role: 'information-gate',
    blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'planejar',
  },
  {
    // blocks vazio de propósito — PLAN_REJECTED sem bloco-fonte no dicionário (Grupo D)
    step: 'planejar', role: 'plan-architect',
    blocks: [], blockedBy: 'clarificar', next: 'aprovar',
  },
  {
    // blocks vazio de propósito — aprovação é trava estrutural (Decisão D-F1)
    step: 'aprovar', role: 'final-validator',
    blocks: [], blockedBy: 'planejar', next: 'implementar',
  },
  {
    step: 'implementar', role: 'feature-implementer',
    blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'aprovar', next: 'revisar',
  },
  {
    step: 'revisar', role: 'adversarial-review-coordinator',
    blocks: [B_SEC_FINDINGS, B_ARCH_FINDINGS, B_QUAL_FINDINGS],
    blockedBy: 'implementar', next: 'fechar',
  },
  {
    step: 'fechar', role: 'final-validator',
    blocks: [B_SLICE_CLOSEOUT, B_PA_DE_CAL], blockedBy: 'revisar', next: null,
  },
];

// ─── FEATURE.LIGHT ───────────────────────────────────────────────────────────
// Fluxo expandido Feature light (18+ nós):
// classificar → clarificar → sentinel-1 → quality-gate-router → pre-tester
// → planejar → aprovar-plan → sentinel-2 → implementar → checkpoint
// → review-orchestrator → executor-fix → sentinel-3 → sanity
// → adv-security ‖ adv-architecture ‖ adv-quality (N17) → final-adversarial
// → spec-closer (cargo 18: close out + reports) → fechar (PA_DE_CAL)
// (design-interrogator ausente em light por definição)
function buildFeatureLight() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'sentinel-1' },
    nodeSentinel('sentinel-1', 'clarificar', 'gerar-cenarios'),
    nodeQualityGateRouter('sentinel-1', 'pre-tester'),
    nodePreTester('gerar-cenarios', 'planejar'),
    nodePlanArquiteto('pre-tester', 'aprovar-plan'),
    nodeAprovar('aprovar-plan', 'planejar', 'sentinel-2'),
    nodeSentinel('sentinel-2', 'aprovar-plan', 'implementar'),
    { step: 'implementar', role: 'feature-implementer', blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'sentinel-2', next: 'checkpoint' },
    { step: 'checkpoint', role: 'checkpoint-validator', blocks: [], blockedBy: 'implementar', next: 'review-orchestrator' },
    nodeReviewOrchestrator('review-orchestrator', 'checkpoint', 'executor-fix'),
    nodeExecutorFix('executor-fix', 'review-orchestrator', 'sentinel-3'),
    nodeSentinel('sentinel-3', 'executor-fix', 'sanity'),
    nodeSanityChecker('sanity', 'sentinel-3', 'adv-security'),
    ...nodeTrio('sanity', 'final-adversarial'),
    nodeFinalAdversarial('final-adversarial', ['adv-security', 'adv-architecture', 'adv-quality'], 'fechar'),
    // cargo 17 (PAPERCLIP-FEATURE-WORKFLOW.md §3): final-validator emite PA_DE_CAL ANTES do closeout
    // cargo 18 (PAPERCLIP-FEATURE-WORKFLOW.md §3.15): finishing-branch fecha com SLICE_CLOSEOUT
    // Ordem canônica: final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT) per _tronco.md N18/N19
    { step: 'fechar', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'final-adversarial', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── FEATURE.HEAVY ───────────────────────────────────────────────────────────
// Como light + design-interrogator (N4) + feature-vertical-slice-planner
// + N12 paralelo (architecture-reviewer ‖ diff-discipline-reviewer → checkpoint)
// + feature-integration-validator
// + spec-closer (cargo 18) + fechar
function buildFeatureHeavy() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'design-interrogar' },
    nodeDesignInterrogator('clarificar', 'sentinel-1'),
    nodeSentinel('sentinel-1', 'design-interrogar', 'gerar-cenarios'),
    nodeQualityGateRouter('sentinel-1', 'pre-tester'),
    nodePreTester('gerar-cenarios', 'planejar'),
    nodePlanArquiteto('pre-tester', 'aprovar-plan'),
    nodeAprovar('aprovar-plan', 'planejar', 'sentinel-2'),
    nodeSentinel('sentinel-2', 'aprovar-plan', 'vsa-planner'),
    { step: 'vsa-planner', role: 'feature-vertical-slice-planner', blocks: [], blockedBy: 'sentinel-2', next: 'implementar' },
    { step: 'implementar', role: 'feature-implementer', blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'vsa-planner', next: 'review-spec' },
    // N12: revisão por lote em paralelo
    {
      step: 'review-spec', role: 'architecture-reviewer',
      blocks: [B_ARCH_FINDINGS], blockedBy: 'implementar', next: 'checkpoint',
      parallel: ['review-quality'],
    },
    {
      step: 'review-quality', role: 'diff-discipline-reviewer',
      blocks: [B_QUAL_FINDINGS], blockedBy: 'implementar', next: 'checkpoint',
      parallel: ['review-spec'],
    },
    // junção N12: fan-in real — checkpoint só abre quando AMBOS os irmãos concluem
    { step: 'checkpoint', role: 'checkpoint-validator', blocks: [], blockedBy: ['review-spec', 'review-quality'], next: 'review-orchestrator' },
    nodeReviewOrchestrator('review-orchestrator', 'checkpoint', 'executor-fix'),
    nodeExecutorFix('executor-fix', 'review-orchestrator', 'feature-integration-validator'),
    { step: 'feature-integration-validator', role: 'feature-integration-validator', blocks: [], blockedBy: 'executor-fix', next: 'sanity' },
    nodeSanityChecker('sanity', 'feature-integration-validator', 'adv-security'),
    // N17: trio adversarial paralelo
    ...nodeTrio('sanity', 'final-adversarial'),
    nodeFinalAdversarial('final-adversarial', ['adv-security', 'adv-architecture', 'adv-quality'], 'fechar'),
    // cargo 17 (PAPERCLIP-FEATURE-WORKFLOW.md §3): final-validator emite PA_DE_CAL ANTES do closeout
    // cargo 18 (PAPERCLIP-FEATURE-WORKFLOW.md §3.15): finishing-branch fecha com SLICE_CLOSEOUT
    // Ordem canônica: final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT) per _tronco.md N18/N19
    { step: 'fechar', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'final-adversarial', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── BUGFIX.LIGHT ────────────────────────────────────────────────────────────
// Fluxo canônico (PAPERCLIP-BUGFIX-WORKFLOW.md §2, sem plan-architect):
// classificar → clarificar → sentinel-1 → diagnostic → sentinel-2 → executor-fix
// → regression-tester → sentinel-3 → review-orchestrator → sentinel-4 → sanity
// → adv-security ‖ adv-architecture ‖ adv-quality → final-adversarial
// → spec-closer (cargo 11: close out + reports) → fechar (cargo 10: PA_DE_CAL)
// Sem design-interrogator, sem root-cause-analyzer, sem plan-architect (light)
function buildBugfixLight() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'sentinel-1' },
    nodeSentinel('sentinel-1', 'clarificar', 'diagnostic'),
    { step: 'diagnostic', role: 'bugfix-diagnostic-agent', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    // diagnostic entrega fix_guidance diretamente ao executor-fix (sem plan-architect em light)
    nodeSentinel('sentinel-2', 'diagnostic', 'executor-fix'),
    nodeExecutorFix('executor-fix', 'sentinel-2', 'regression-tester'),
    { step: 'regression-tester', role: 'bugfix-regression-tester', blocks: [B_REGRESSION], blockedBy: 'executor-fix', next: 'sentinel-3' },
    nodeSentinel('sentinel-3', 'regression-tester', 'review-orchestrator'),
    nodeReviewOrchestrator('review-orchestrator', 'sentinel-3', 'sentinel-4'),
    nodeSentinel('sentinel-4', 'review-orchestrator', 'sanity'),
    nodeSanityChecker('sanity', 'sentinel-4', 'adv-security'),
    ...nodeTrio('sanity', 'final-adversarial'),
    nodeFinalAdversarial('final-adversarial', ['adv-security', 'adv-architecture', 'adv-quality'], 'fechar'),
    // cargo 10 (PAPERCLIP-BUGFIX-WORKFLOW.md §2): final-validator emite PA_DE_CAL ANTES do closeout
    // cargo 11 (PAPERCLIP-BUGFIX-WORKFLOW.md §2): finishing-branch fecha com SLICE_CLOSEOUT
    // Ordem canônica: final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT) per _tronco.md N18/N19
    { step: 'fechar', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'final-adversarial', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── BUGFIX.HEAVY ────────────────────────────────────────────────────────────
// Fluxo canônico (PAPERCLIP-BUGFIX-WORKFLOW.md §2):
// design-interrogator + diagnostic + root-cause + executor-fix (sem plan-architect,
// sem quality-gate-router, sem pre-tester — TDD do bug fix é o test_to_confirm
// da fase diagnostic, não um ciclo quality-gate-router separado)
// + regression-tester + review-orchestrator + N12 paralelo + checkpoint
// + sanity + sentinels intercalados + N17 trio adversarial + final-adversarial
// + spec-closer (cargo 11) + fechar
function buildBugfixHeavy() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'design-interrogar' },
    nodeDesignInterrogator('clarificar', 'sentinel-1'),
    nodeSentinel('sentinel-1', 'design-interrogar', 'diagnostic'),
    { step: 'diagnostic', role: 'bugfix-diagnostic-agent', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'diagnostic', 'root-cause'),
    { step: 'root-cause', role: 'bugfix-root-cause-analyzer', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-3' },
    // root-cause entrega fix_guidance; executor-fix aplica TDD usando test_to_confirm do diagnostic
    nodeSentinel('sentinel-3', 'root-cause', 'executor-fix'),
    nodeExecutorFix('executor-fix', 'sentinel-3', 'regression-tester'),
    { step: 'regression-tester', role: 'bugfix-regression-tester', blocks: [B_REGRESSION], blockedBy: 'executor-fix', next: 'sentinel-4' },
    nodeSentinel('sentinel-4', 'regression-tester', 'review-orchestrator'),
    nodeReviewOrchestrator('review-orchestrator', 'sentinel-4', 'adv-batch-1'),
    // N12: paralelo de revisão por lote
    {
      step: 'adv-batch-1', role: 'adversarial-security-scanner',
      blocks: [B_SEC_FINDINGS], blockedBy: 'review-orchestrator', next: 'checkpoint',
      parallel: ['adv-batch-2'],
    },
    {
      step: 'adv-batch-2', role: 'adversarial-quality-reviewer',
      blocks: [B_QUAL_FINDINGS], blockedBy: 'review-orchestrator', next: 'checkpoint',
      parallel: ['adv-batch-1'],
    },
    // junção N12: fan-in real — checkpoint só abre quando AMBOS os lotes concluem
    { step: 'checkpoint', role: 'checkpoint-validator', blocks: [], blockedBy: ['adv-batch-1', 'adv-batch-2'], next: 'sentinel-5' },
    nodeSentinel('sentinel-5', 'checkpoint', 'sanity'),
    nodeSanityChecker('sanity', 'sentinel-5', 'adv-security'),
    // N17: trio adversarial final
    ...nodeTrio('sanity', 'final-adversarial'),
    nodeFinalAdversarial('final-adversarial', ['adv-security', 'adv-architecture', 'adv-quality'], 'fechar'),
    // cargo 10 (PAPERCLIP-BUGFIX-WORKFLOW.md §2): final-validator emite PA_DE_CAL ANTES do closeout
    // cargo 11 (PAPERCLIP-BUGFIX-WORKFLOW.md §2): finishing-branch fecha com SLICE_CLOSEOUT
    // Ordem canônica: final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT) per _tronco.md N18/N19
    { step: 'fechar', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'final-adversarial', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── USER-STORY.LIGHT ───────────────────────────────────────────────────────
// User Story = subset menor de Feature (1-3 slices). Sem design-interrogator.
// Inclui feature-vertical-slice-planner e feature-implementer (reutilização documentada).
// Terminal único: fechar com next:null; spec-closer é o passo anterior
function buildUserStoryLight() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'sentinel-1' },
    nodeSentinel('sentinel-1', 'clarificar', 'gerar-cenarios'),
    nodeQualityGateRouter('sentinel-1', 'pre-tester'),
    nodePreTester('gerar-cenarios', 'planejar'),
    nodePlanArquiteto('pre-tester', 'aprovar-plan'),
    nodeAprovar('aprovar-plan', 'planejar', 'sentinel-2'),
    nodeSentinel('sentinel-2', 'aprovar-plan', 'vsa-planner'),
    { step: 'vsa-planner', role: 'feature-vertical-slice-planner', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-3' },
    nodeSentinel('sentinel-3', 'vsa-planner', 'implementar'),
    { step: 'implementar', role: 'feature-implementer', blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'sentinel-3', next: 'checkpoint' },
    { step: 'checkpoint', role: 'checkpoint-validator', blocks: [], blockedBy: 'implementar', next: 'review-orchestrator' },
    nodeReviewOrchestrator('review-orchestrator', 'checkpoint', 'executor-fix'),
    nodeExecutorFix('executor-fix', 'review-orchestrator', 'sentinel-4'),
    nodeSentinel('sentinel-4', 'executor-fix', 'sanity'),
    nodeSanityChecker('sanity', 'sentinel-4', 'adv-security'),
    ...nodeTrio('sanity', 'final-adversarial'),
    nodeFinalAdversarial('final-adversarial', ['adv-security', 'adv-architecture', 'adv-quality'], 'fechar'),
    // Ordem canônica: final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT) per _tronco.md N18/N19
    { step: 'fechar', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'final-adversarial', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── USER-STORY.HEAVY ───────────────────────────────────────────────────────
// Como user-story.light + design-interrogator + feature-integration-validator + mais sentinels
function buildUserStoryHeavy() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'design-interrogar' },
    nodeDesignInterrogator('clarificar', 'sentinel-1'),
    nodeSentinel('sentinel-1', 'design-interrogar', 'gerar-cenarios'),
    nodeQualityGateRouter('sentinel-1', 'pre-tester'),
    nodePreTester('gerar-cenarios', 'planejar'),
    nodePlanArquiteto('pre-tester', 'aprovar-plan'),
    nodeAprovar('aprovar-plan', 'planejar', 'sentinel-2'),
    nodeSentinel('sentinel-2', 'aprovar-plan', 'vsa-planner'),
    { step: 'vsa-planner', role: 'feature-vertical-slice-planner', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-3' },
    nodeSentinel('sentinel-3', 'vsa-planner', 'implementar'),
    { step: 'implementar', role: 'feature-implementer', blocks: [B_TDD_GREEN, B_REGRESSION], blockedBy: 'sentinel-3', next: 'review-spec' },
    // N12: paralelo de revisão por lote
    {
      step: 'review-spec', role: 'architecture-reviewer',
      blocks: [B_ARCH_FINDINGS], blockedBy: 'implementar', next: 'checkpoint',
      parallel: ['review-quality'],
    },
    {
      step: 'review-quality', role: 'diff-discipline-reviewer',
      blocks: [B_QUAL_FINDINGS], blockedBy: 'implementar', next: 'checkpoint',
      parallel: ['review-spec'],
    },
    // junção N12: fan-in real — checkpoint só abre quando AMBOS os irmãos concluem
    { step: 'checkpoint', role: 'checkpoint-validator', blocks: [], blockedBy: ['review-spec', 'review-quality'], next: 'review-orchestrator' },
    nodeReviewOrchestrator('review-orchestrator', 'checkpoint', 'executor-fix'),
    nodeExecutorFix('executor-fix', 'review-orchestrator', 'feature-integration-validator'),
    { step: 'feature-integration-validator', role: 'feature-integration-validator', blocks: [], blockedBy: 'executor-fix', next: 'sentinel-4' },
    nodeSentinel('sentinel-4', 'feature-integration-validator', 'sanity'),
    nodeSanityChecker('sanity', 'sentinel-4', 'adv-security'),
    ...nodeTrio('sanity', 'final-adversarial'),
    nodeFinalAdversarial('final-adversarial', ['adv-security', 'adv-architecture', 'adv-quality'], 'fechar'),
    // Ordem canônica: final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT) per _tronco.md N18/N19
    { step: 'fechar', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'final-adversarial', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── AUDIT.LIGHT ─────────────────────────────────────────────────────────────
// Read-only (PAPERCLIP-AUDIT-WORKFLOW.md §2 Iron Law). Sem TDD, sem executor-fix,
// sem review-orchestrator, sem sanity-checker, sem adversarial trio.
// Fluxo canônico: classificar → clarificar → sentinel-1 → audit-intake → sentinel-2
//       → audit-compliance → sentinel-3 → audit-risk → sentinel-4
//       → aprovar → sentinel-5 → spec-closer → fechar
// aprovar = final-validator emite PA_DE_CAL (item 7 do workflow)
// spec-closer entrega 2 relatórios; fechar = terminal
function buildAuditLight() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'sentinel-1' },
    nodeSentinel('sentinel-1', 'clarificar', 'audit-intake'),
    { step: 'audit-intake', role: 'audit-intake', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'audit-intake', 'audit-compliance'),
    { step: 'audit-compliance', role: 'audit-compliance-checker', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-3' },
    nodeSentinel('sentinel-3', 'audit-compliance', 'audit-risk'),
    { step: 'audit-risk', role: 'audit-risk-matrix-generator', blocks: [], blockedBy: 'sentinel-3', next: 'sentinel-4' },
    nodeSentinel('sentinel-4', 'audit-risk', 'aprovar'),
    // cargo 7 (PAPERCLIP-AUDIT-WORKFLOW.md §2): final-validator emite PA_DE_CAL (ordem canônica)
    nodeAprovarFinal('aprovar', 'sentinel-4', 'sentinel-5'),
    nodeSentinel('sentinel-5', 'aprovar', 'spec-closer'),
    // cargo 8 (PAPERCLIP-AUDIT-WORKFLOW.md §2): spec-closer entrega 2 relatórios (technical + executive)
    // finishing-branch executa o closeout final com SLICE_CLOSEOUT (_tronco.md N19)
    { step: 'spec-closer', role: 'spec-closer', blocks: [], blockedBy: 'sentinel-5', next: 'fechar' },
    { step: 'fechar', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'spec-closer', next: null },
  ];
}

// ─── AUDIT.HEAVY ─────────────────────────────────────────────────────────────
// Como audit.light + design-interrogator + audit-domain-analyzer entre intake e compliance
// Read-only (PAPERCLIP-AUDIT-WORKFLOW.md §2 Iron Law). Sem executor-fix, sem review-orchestrator,
// sem sanity-checker, sem adversarial trio.
function buildAuditHeavy() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'design-interrogar' },
    nodeDesignInterrogator('clarificar', 'sentinel-1'),
    nodeSentinel('sentinel-1', 'design-interrogar', 'audit-intake'),
    { step: 'audit-intake', role: 'audit-intake', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'audit-intake', 'audit-domain'),
    { step: 'audit-domain', role: 'audit-domain-analyzer', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-3' },
    nodeSentinel('sentinel-3', 'audit-domain', 'audit-compliance'),
    { step: 'audit-compliance', role: 'audit-compliance-checker', blocks: [], blockedBy: 'sentinel-3', next: 'sentinel-4' },
    nodeSentinel('sentinel-4', 'audit-compliance', 'audit-risk'),
    { step: 'audit-risk', role: 'audit-risk-matrix-generator', blocks: [], blockedBy: 'sentinel-4', next: 'sentinel-5' },
    nodeSentinel('sentinel-5', 'audit-risk', 'aprovar'),
    // cargo 7 (PAPERCLIP-AUDIT-WORKFLOW.md §2): final-validator emite PA_DE_CAL (ordem canônica)
    nodeAprovarFinal('aprovar', 'sentinel-5', 'sentinel-6'),
    nodeSentinel('sentinel-6', 'aprovar', 'spec-closer'),
    // cargo 8 (PAPERCLIP-AUDIT-WORKFLOW.md §2): spec-closer entrega 2 relatórios (technical + executive)
    // finishing-branch executa o closeout final com SLICE_CLOSEOUT (_tronco.md N19)
    { step: 'spec-closer', role: 'spec-closer', blocks: [], blockedBy: 'sentinel-6', next: 'fechar' },
    { step: 'fechar', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'spec-closer', next: null },
  ];
}

// ─── UX.LIGHT ────────────────────────────────────────────────────────────────
// Read-only (PAPERCLIP-UX-WORKFLOW.md §2 Iron Law). Sem TDD, sem adversarial trio,
// sem review-orchestrator, sem sanity-checker, sem executor-fix.
// ux-simulator roda sozinho (sem ux-accessibility-auditor em light).
// Fluxo canônico: classificar → clarificar → sentinel-1 → ux-simulator → sentinel-2
//       → ux-qa-validator → sentinel-3 → aprovar → sentinel-4 → spec-closer → fechar
function buildUxLight() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'sentinel-1' },
    nodeSentinel('sentinel-1', 'clarificar', 'ux-simulator'),
    { step: 'ux-simulator', role: 'ux-simulator', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'ux-simulator', 'ux-qa-validator'),
    { step: 'ux-qa-validator', role: 'ux-qa-validator', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-3' },
    nodeSentinel('sentinel-3', 'ux-qa-validator', 'aprovar'),
    // PA_DE_CAL canônico: final-validator emite PA_DE_CAL ANTES do closeout (PAPERCLIP-UX-WORKFLOW.md §2)
    nodeAprovarFinal('aprovar', 'sentinel-3', 'sentinel-4'),
    nodeSentinel('sentinel-4', 'aprovar', 'spec-closer'),
    // spec-closer entrega 2 relatórios UX (technical + executive)
    // finishing-branch executa o closeout final com SLICE_CLOSEOUT (_tronco.md N19)
    { step: 'spec-closer', role: 'spec-closer', blocks: [], blockedBy: 'sentinel-4', next: 'fechar' },
    { step: 'fechar', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'spec-closer', next: null },
  ];
}

// ─── UX.HEAVY ────────────────────────────────────────────────────────────────
// Read-only (PAPERCLIP-UX-WORKFLOW.md §2 Iron Law). Sem executor-fix, sem review-orchestrator,
// sem sanity-checker, sem adversarial trio (G-UX-03: zero code review surface).
// Como ux.light + design-interrogator + ux-accessibility-auditor em paralelo com ux-simulator.
// Fluxo canônico: classificar → clarificar → design-interrogar → sentinel-1
//       → ux-simulator ‖ ux-accessibility-auditor (paralelo) → ux-qa-validator
//       → sentinel-2 → aprovar → sentinel-3 → spec-closer → fechar
function buildUxHeavy() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'design-interrogar' },
    nodeDesignInterrogator('clarificar', 'sentinel-1'),
    nodeSentinel('sentinel-1', 'design-interrogar', 'ux-simulator'),
    // N12: paralelo ux-simulator ‖ ux-accessibility-auditor; junção = ux-qa-validator
    {
      step: 'ux-simulator', role: 'ux-simulator',
      blocks: [], blockedBy: 'sentinel-1', next: 'ux-qa-validator',
      parallel: ['ux-accessibility-auditor'],
    },
    {
      step: 'ux-accessibility-auditor', role: 'ux-accessibility-auditor',
      blocks: [], blockedBy: 'sentinel-1', next: 'ux-qa-validator',
      parallel: ['ux-simulator'],
    },
    // junção: fan-in real — ux-qa-validator só abre quando AMBOS os irmãos concluem
    { step: 'ux-qa-validator', role: 'ux-qa-validator', blocks: [], blockedBy: ['ux-simulator', 'ux-accessibility-auditor'], next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'ux-qa-validator', 'aprovar'),
    // PA_DE_CAL canônico: final-validator emite PA_DE_CAL ANTES do closeout (PAPERCLIP-UX-WORKFLOW.md §2)
    nodeAprovarFinal('aprovar', 'sentinel-2', 'sentinel-3'),
    nodeSentinel('sentinel-3', 'aprovar', 'spec-closer'),
    // spec-closer entrega 2 relatórios UX (technical + executive)
    // finishing-branch executa o closeout final com SLICE_CLOSEOUT (_tronco.md N19)
    { step: 'spec-closer', role: 'spec-closer', blocks: [], blockedBy: 'sentinel-3', next: 'fechar' },
    { step: 'fechar', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'spec-closer', next: null },
  ];
}

// ─── SPEC.LIGHT ──────────────────────────────────────────────────────────────
// Spec light (11 nós): brainstorm-controller → spec-format-gate → sentinel-pre-5
//             → spec-post-impl-validator → sentinel-pre-9 → spec-closer → fechar
function buildSpecLight() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'sentinel-1' },
    nodeSentinel('sentinel-1', 'clarificar', 'brainstorm'),
    { step: 'brainstorm', role: 'brainstorm-controller', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'brainstorm', 'spec-format-gate'),
    { step: 'spec-format-gate', role: 'spec-format-gate', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-pre-5' },
    // sem spec-content-reviewer em light
    // pré-step-5 sentinel (antes de post-impl-validator — G5 spec.md)
    nodeSentinel('sentinel-pre-5', 'spec-format-gate', 'spec-post-impl-validator'),
    { step: 'spec-post-impl-validator', role: 'spec-post-impl-validator', blocks: [], blockedBy: 'sentinel-pre-5', next: 'sentinel-pre-9' },
    // pré-step-9 sentinel (antes do fechamento)
    nodeSentinel('sentinel-pre-9', 'spec-post-impl-validator', 'fechar'),
    // cargo 8 (PAPERCLIP-SPEC-WORKFLOW.md §2): spec-closer é a PA_DE_CAL + reports + spec.json closed
    // Ordem canônica: spec-closer/final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT)
    { step: 'fechar', role: 'spec-closer', blocks: [B_PA_DE_CAL], blockedBy: 'sentinel-pre-9', next: 'spec-closer' },
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'fechar', next: null },
  ];
}

// ─── SPEC.HEAVY ──────────────────────────────────────────────────────────────
// Como spec.light + design-interrogator + spec-content-reviewer + mais sentinels intermediários
// Spec.heavy: ≥4 nós com role 'sentinel' (T-30), 16 nós total
function buildSpecHeavy() {
  return [
    { step: 'classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'clarificar' },
    { step: 'clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'classificar', next: 'design-interrogar' },
    nodeDesignInterrogator('clarificar', 'sentinel-1'),
    nodeSentinel('sentinel-1', 'design-interrogar', 'brainstorm'),
    { step: 'brainstorm', role: 'brainstorm-controller', blocks: [], blockedBy: 'sentinel-1', next: 'sentinel-2' },
    nodeSentinel('sentinel-2', 'brainstorm', 'spec-format-gate'),
    { step: 'spec-format-gate', role: 'spec-format-gate', blocks: [], blockedBy: 'sentinel-2', next: 'sentinel-pre-3' },
    // sentinel intermediário pré-3 (validação de formato antes de content review)
    nodeSentinel('sentinel-pre-3', 'spec-format-gate', 'spec-content-reviewer'),
    { step: 'spec-content-reviewer', role: 'spec-content-reviewer', blocks: [], blockedBy: 'sentinel-pre-3', next: 'sentinel-4' },
    nodeSentinel('sentinel-4', 'spec-content-reviewer', 'sentinel-pre-5'),
    // pré-step-5 sentinel (antes de post-impl-validator)
    nodeSentinel('sentinel-pre-5', 'sentinel-4', 'spec-post-impl-validator'),
    { step: 'spec-post-impl-validator', role: 'spec-post-impl-validator', blocks: [], blockedBy: 'sentinel-pre-5', next: 'sentinel-pre-9' },
    // pré-step-9 sentinel (antes do fechamento)
    nodeSentinel('sentinel-pre-9', 'spec-post-impl-validator', 'fechar'),
    // cargo 8 (PAPERCLIP-SPEC-WORKFLOW.md §2): spec-closer é a PA_DE_CAL + reports + spec.json closed
    // Ordem canônica: spec-closer/final-validator(PA_DE_CAL) → finishing-branch(SLICE_CLOSEOUT)
    { step: 'fechar', role: 'spec-closer', blocks: [B_PA_DE_CAL], blockedBy: 'sentinel-pre-9', next: 'sentinel-final' },
    // sentinel final antes do closeout (ponto de verificação de integridade da spec)
    nodeSentinel('sentinel-final', 'fechar', 'spec-closer'),
    { step: 'spec-closer', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'sentinel-final', next: null },
  ];
}

// ─── HOTFIX (12 nós exatos) ──────────────────────────────────────────────────
// Modo especial: classificação forçada, sem planejar (plan-architect ausente).
// Fluxo: HF-N0..HF-N11 = 12 nós exatos.
const HOTFIX = [
  // HF-N0
  { step: 'HF-N0-classificar', role: 'task-orchestrator', blocks: [B_ORCHESTRATOR], blockedBy: null, next: 'HF-N1-clarificar' },
  // HF-N1
  { step: 'HF-N1-clarificar', role: 'information-gate', blocks: [B_CLARIFICATION], blockedBy: 'HF-N0-classificar', next: 'HF-N2-sentinel' },
  // HF-N2
  { step: 'HF-N2-sentinel', role: 'sentinel', blocks: [], blockedBy: 'HF-N1-clarificar', next: 'HF-N3-executor-fix' },
  // HF-N3
  { step: 'HF-N3-executor-fix', role: 'executor-fix', blocks: [B_FIX_COMPLETE], blockedBy: 'HF-N2-sentinel', next: 'HF-N4-regression' },
  // HF-N4
  { step: 'HF-N4-regression', role: 'bugfix-regression-tester', blocks: [B_REGRESSION], blockedBy: 'HF-N3-executor-fix', next: 'HF-N5-review' },
  // HF-N5
  { step: 'HF-N5-review', role: 'review-orchestrator', blocks: [], blockedBy: 'HF-N4-regression', next: 'HF-N6-adv-sec' },
  // HF-N6 (início do trio paralelo)
  {
    step: 'HF-N6-adv-sec', role: 'adversarial-security-scanner',
    blocks: [B_SEC_FINDINGS], blockedBy: 'HF-N5-review', next: 'HF-N9-juncao',
    parallel: ['HF-N7-adv-arch', 'HF-N8-adv-qual'],
  },
  // HF-N7
  {
    step: 'HF-N7-adv-arch', role: 'adversarial-architecture-critic',
    blocks: [B_ARCH_FINDINGS], blockedBy: 'HF-N5-review', next: 'HF-N9-juncao',
    parallel: ['HF-N6-adv-sec', 'HF-N8-adv-qual'],
  },
  // HF-N8
  {
    step: 'HF-N8-adv-qual', role: 'adversarial-quality-reviewer',
    blocks: [B_QUAL_FINDINGS], blockedBy: 'HF-N5-review', next: 'HF-N9-juncao',
    parallel: ['HF-N6-adv-sec', 'HF-N7-adv-arch'],
  },
  // HF-N9 (junção): fan-in real — abre quando TODOS os 3 irmãos do trio concluem
  { step: 'HF-N9-juncao', role: 'final-adversarial-orchestrator', blocks: [B_ADV_FINAL], blockedBy: ['HF-N6-adv-sec', 'HF-N7-adv-arch', 'HF-N8-adv-qual'], next: 'HF-N10-sanity' },
  // HF-N10: sanity-checker emite PA_DE_CAL (final-validator neste contexto compacto — hotfix de 12 nós exatos)
  // Ordem canônica preservada em fluxo comprimido: PA_DE_CAL precede SLICE_CLOSEOUT (_tronco.md N18/N19)
  { step: 'HF-N10-sanity', role: 'final-validator', blocks: [B_PA_DE_CAL], blockedBy: 'HF-N9-juncao', next: 'HF-N11-fechar' },
  // HF-N11: finishing-branch fecha com SLICE_CLOSEOUT (N19 canônico)
  { step: 'HF-N11-fechar', role: 'finishing-branch', blocks: [B_SLICE_CLOSEOUT], blockedBy: 'HF-N10-sanity', next: null },
];

// ─── REVIEW-ONLY (4 nós exatos) ─────────────────────────────────────────────
// Modo especial: revisão standalone de código já escrito.
// Sem task-orchestrator, sem information-gate, sem plan-architect, sem pre-tester.
// Fluxo: RO-N0..RO-N3 = 4 nós exatos (_modos.md §2.2–2.3).
//
// NOTA DE FIDELIDADE (G-RO2, _modos.md §2.6): execuções review-only não emitem
// ORCHESTRATOR_DECISION (Phase 0 é pulada). O medidor de fidelidade retorna
// complexity=null → indeterminate=true para essas execuções. Isso é por design:
// a régua não mede o que não tem bloco-fonte real. Score = N/A.
const REVIEW_ONLY = [
  // RO-N0: detectar diff (pipeline-controller lê o diff e prepara escopo).
  // blocks: [] — passo de coleta de dados; sem portão de fidelidade (_modos.md §2.3 linha 230).
  { step: 'RO-N0-detectar-diff', role: 'pipeline-controller', blocks: [], blockedBy: null, next: 'RO-N1-adv-coord' },
  // RO-N1: coordinator adversarial
  { step: 'RO-N1-adv-coord', role: 'adversarial-review-coordinator', blocks: [B_ADV_CONSOLIDATED], blockedBy: 'RO-N0-detectar-diff', next: 'RO-N2-final-adv' },
  // RO-N2: final adversarial orchestrator
  { step: 'RO-N2-final-adv', role: 'final-adversarial-orchestrator', blocks: [B_ADV_FINAL], blockedBy: 'RO-N1-adv-coord', next: 'RO-N3-fechar' },
  // RO-N3: modo ultra-compacto (4 nós exatos) — finishing-branch emite PA_DE_CAL + SLICE_CLOSEOUT juntos
  // Não é possível separar em dois nós sem quebrar o invariante T-13 (review-only=4 nós exatos).
  // Canônico _tronco.md N18/N19 está comprimido em RO-N3 por design do modo review-only.
  { step: 'RO-N3-fechar', role: 'finishing-branch', blocks: [B_PA_DE_CAL, B_SLICE_CLOSEOUT], blockedBy: 'RO-N2-final-adv', next: null },
];

// ─── MONTAGEM DOS TEMPLATES ──────────────────────────────────────────────────

const TEMPLATES = {
  bugfix: {
    light: buildBugfixLight(),
    heavy: buildBugfixHeavy(),
  },
  feature: {
    light: buildFeatureLight(),
    heavy: buildFeatureHeavy(),
  },
  'user-story': {
    light: buildUserStoryLight(),
    heavy: buildUserStoryHeavy(),
  },
  audit: {
    light: buildAuditLight(),
    heavy: buildAuditHeavy(),
  },
  ux: {
    light: buildUxLight(),
    heavy: buildUxHeavy(),
  },
  spec: {
    light: buildSpecLight(),
    heavy: buildSpecHeavy(),
  },
  hotfix: HOTFIX,
  'review-only': REVIEW_ONLY,
};

// ─── ALIASES BACKWARD-COMPAT (I8) ────────────────────────────────────────────
// SIMPLES e COMPLEXA eram os moldes originais de Feature (pre-migração G1-Moldes).
// Os arrays originais são preservados para que os testes existentes passem sem modificação.
// Esses arrays representam o tipo Feature nas variantes light e heavy do pipeline original,
// mapeando conceptualmente para feature.light e feature.heavy na nova estrutura.
// MEDIA: adicionado em G6 adversarial review — complexidade intermediária (com planejar,
// sem aprovar). classify-bridge.cjs emite MEDIA como complexidade válida (VALID_COMPLEXITIES),
// mas tree-factory.cjs só resolvia SIMPLES e COMPLEXA — crash documentado no achado crítico G6.
TEMPLATES.SIMPLES = SIMPLES_ORIGINAL;
TEMPLATES.MEDIA = MEDIA_ORIGINAL;
TEMPLATES.COMPLEXA = COMPLEXA_ORIGINAL;

// ─── ALIAS getTemplate ───────────────────────────────────────────────────────
// Aceita tipo com espaço/capitalização e devolve o FlowTemplate correto (AC-15).
function getTemplate(type, variant) {
  const normalizedType = (type || '').toLowerCase().replace(/\s+/g, '-');
  const normalizedVariant = (variant || '').toLowerCase();

  const typeObj = TEMPLATES[normalizedType];
  if (!typeObj) {
    throw new Error(`getTemplate: tipo "${type}" não encontrado em TEMPLATES`);
  }
  if (Array.isArray(typeObj)) {
    // modo especial (hotfix, review-only) sem variante
    return typeObj;
  }
  const template = typeObj[normalizedVariant];
  if (!template) {
    throw new Error(`getTemplate: variante "${variant}" não encontrada em TEMPLATES.${normalizedType}`);
  }
  return template;
}

module.exports = { TEMPLATES, getTemplate };
