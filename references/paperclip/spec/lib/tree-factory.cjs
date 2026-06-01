'use strict';
// Lógica pura do gerador de árvore (sem rede, sem Paperclip). Lê o molde declarativo
// (tree-template.cjs) e decide (a) qual nó criar a seguir e (b) o payload da issue.
// O I/O real (criar a issue via API) e o CLI ficam em outros módulos (Grupo B) — aqui
// é tudo determinístico e testável com transport fake, como a régua.

const { TEMPLATES } = require('./tree-template.cjs');

// Devolve o array de nós do template ou null se a complexidade não existir.
function templateFor(complexity) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, complexity) ? TEMPLATES[complexity] : null;
}

// Acha o nó de uma etapa; lança se a etapa não pertence ao template (molde inconsistente).
function nodeForStep(nodes, complexity, step) {
  const node = nodes.find((n) => n.step === step);
  if (!node) {
    throw new Error(`tree-factory: etapa "${step}" não existe no template ${complexity}`);
  }
  return node;
}

// nextStep(complexity, currentStep) → o objeto-nó seguinte, ou null no fim.
//   - currentStep === null → a raiz (primeiro nó do template).
//   - currentStep === última etapa (next: null) → null.
//   - complexidade desconhecida → null.
function nextStep(complexity, currentStep) {
  const nodes = templateFor(complexity);
  if (!nodes) return null;
  if (currentStep === null || currentStep === undefined) {
    return nodes[0]; // raiz
  }
  const current = nodeForStep(nodes, complexity, currentStep);
  if (current.next === null) return null; // fim da cadeia
  return nodeForStep(nodes, complexity, current.next);
}

// Monta o corpo da issue: instrui o cargo a emitir o(s) bloco(s) do nó ao concluir e
// declara o próximo passo (NEXT_STEP) — base da montagem progressiva.
function buildBody(node) {
  const lines = [];
  lines.push(`Etapa do pipeline: ${node.step} (cargo: ${node.role}).`);
  if (node.blocks.length > 0) {
    lines.push('');
    lines.push('Ao concluir, emita o(s) bloco(s) abaixo para a régua de fidelidade ler:');
    for (const block of node.blocks) {
      lines.push(`- ${block}`);
    }
  } else {
    lines.push('');
    lines.push('Este nó não emite bloco de fidelidade (trava estrutural). Conclua e siga.');
  }
  lines.push('');
  lines.push(`NEXT_STEP: ${node.next === null ? 'FIM' : node.next}`);
  return lines.join('\n');
}

// nodeSpec(complexity, step, prevIssueId) → payload puro da issue.
//   { title, assigneeAgentId, blockedByIssueIds, body }
//   - assigneeAgentId = role do molde (P1).
//   - blockedByIssueIds = prevIssueId ? [prevIssueId] : [] (P2).
//   - body = instrução de emitir o(s) bloco(s) + linha NEXT_STEP.
function nodeSpec(complexity, step, prevIssueId) {
  const nodes = templateFor(complexity);
  if (!nodes) {
    throw new Error(`tree-factory: complexidade "${complexity}" desconhecida`);
  }
  const node = nodeForStep(nodes, complexity, step);
  return {
    title: `[${complexity}] ${node.step}`,
    assigneeAgentId: node.role,
    blockedByIssueIds: prevIssueId ? [prevIssueId] : [],
    body: buildBody(node),
  };
}

module.exports = { nextStep, nodeSpec };
