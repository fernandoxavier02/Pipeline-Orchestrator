'use strict';
// Molde declarativo da árvore de tarefas (dados puros). Espelha a tabela do
// design.md §"Molde Concreto da Árvore". Cada complexidade é uma sequência ordenada
// de nós; cada nó é a receita de uma issue do Paperclip:
//
//   { step, role, blocks: [...], blockedBy: <stepAnterior|null>, next: <step|null> }
//
//   - step:      identidade da etapa no pipeline.
//   - role:      cargo (assigneeAgentId) que executa a etapa — cargo EXISTENTE, nunca novo.
//   - blocks:    blocos que o nó instrui o cargo a emitir ao concluir; a régua os lê para
//                medir fidelidade. Vazio = nó sem portão medido (trava estrutural pura).
//   - blockedBy: etapa anterior cujo nó trava este (vira blockedByIssueIds na fábrica).
//   - next:      próxima etapa a criar ao concluir (montagem progressiva), ou null no fim.
//
// O molde é DADO: o mesmo que Claude segue no piloto e que o robô-recepção segue depois.
// NÃO contém lógica nem I/O — a fábrica (tree-factory.cjs) é quem lê este molde.

// SIMPLES (5 nós): classificar → clarificar → implementar → revisar → fechar.
const SIMPLES = [
  {
    step: 'classificar', role: 'pipeline-controller',
    blocks: ['ORCHESTRATOR_DECISION'], blockedBy: null, next: 'clarificar',
  },
  {
    step: 'clarificar', role: 'information-gate',
    blocks: ['CLARIFICATION_DONE'], blockedBy: 'classificar', next: 'implementar',
  },
  {
    step: 'implementar', role: 'feature-implementer',
    blocks: ['TDD_GREEN', 'REGRESSION_RESULT'], blockedBy: 'clarificar', next: 'revisar',
  },
  {
    step: 'revisar', role: 'adversarial-review-coordinator',
    blocks: ['ADVERSARIAL_CONSOLIDATED'], blockedBy: 'implementar', next: 'fechar',
  },
  {
    step: 'fechar', role: 'final-validator',
    blocks: ['SLICE_CLOSEOUT', 'PA_DE_CAL'], blockedBy: 'revisar', next: null,
  },
];

// COMPLEXA (7 nós): igual à SIMPLES, mas insere planejar + aprovar entre clarificar
// e implementar. clarificar.next passa a planejar; implementar.blockedBy passa a aprovar;
// revisar usa o trio reforçado de findings.
const COMPLEXA = [
  {
    step: 'classificar', role: 'pipeline-controller',
    blocks: ['ORCHESTRATOR_DECISION'], blockedBy: null, next: 'clarificar',
  },
  {
    step: 'clarificar', role: 'information-gate',
    blocks: ['CLARIFICATION_DONE'], blockedBy: 'classificar', next: 'planejar',
  },
  {
    // blocks vazio de propósito — o portão de plano (PLAN_REJECTED) não tem bloco-fonte
    // no dicionário da régua; fechar essa lacuna é Grupo D (backlog), ver design.md §Molde.
    step: 'planejar', role: 'plan-architect',
    blocks: [], blockedBy: 'clarificar', next: 'aprovar',
  },
  {
    // blocks vazio de propósito — aprovação é trava estrutural + registro de auditoria,
    // NÃO emite portão de fidelidade (Decisão D-F1, ver design.md).
    step: 'aprovar', role: 'final-validator',
    blocks: [], blockedBy: 'planejar', next: 'implementar',
  },
  {
    step: 'implementar', role: 'feature-implementer',
    blocks: ['TDD_GREEN', 'REGRESSION_RESULT'], blockedBy: 'aprovar', next: 'revisar',
  },
  {
    step: 'revisar', role: 'adversarial-review-coordinator',
    blocks: ['SECURITY_FINDINGS', 'ARCHITECTURE_FINDINGS', 'QUALITY_FINDINGS'],
    blockedBy: 'implementar', next: 'fechar',
  },
  {
    step: 'fechar', role: 'final-validator',
    blocks: ['SLICE_CLOSEOUT', 'PA_DE_CAL'], blockedBy: 'revisar', next: null,
  },
];

const TEMPLATES = { SIMPLES, COMPLEXA };

module.exports = { TEMPLATES };
