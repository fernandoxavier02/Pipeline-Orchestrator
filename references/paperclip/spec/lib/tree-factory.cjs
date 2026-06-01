'use strict';
// Lógica pura do gerador de árvore (sem rede, sem Paperclip). Lê o molde declarativo
// (tree-template.cjs) e decide (a) qual nó criar a seguir e (b) o payload da issue.
// O I/O real (criar a issue via API) e o CLI ficam em outros módulos (Grupo B) — aqui
// é tudo determinístico e testável com transport fake, como a régua.

const { TEMPLATES, getTemplate } = require('./tree-template.cjs');

// Devolve o array de nós do template.
//   - Aceita complexidade legada (SIMPLES, COMPLEXA, hotfix, review-only) → array direto.
//   - Aceita tipo hierárquico com variante (ex.: 'feature', 'light') → getTemplate(type, variant).
//   - Aceita apenas complexidade legada sem variante → TEMPLATES[complexity] se for array.
//   - Retorna null se não encontrado.
function templateFor(complexity, variant) {
  if (variant !== undefined && variant !== null) {
    // Forma hierárquica: templateFor('feature', 'light')
    try {
      return getTemplate(complexity, variant);
    } catch (_) {
      return null;
    }
  }
  // Forma legada: templateFor('SIMPLES') ou templateFor('hotfix')
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, complexity)) return null;
  const val = TEMPLATES[complexity];
  return Array.isArray(val) ? val : null;
}

// Acha o nó de uma etapa; lança se a etapa não pertence ao template (molde inconsistente).
function nodeForStep(nodes, label, step) {
  const node = nodes.find((n) => n.step === step);
  if (!node) {
    throw new Error(`tree-factory: etapa "${step}" não existe no template ${label}`);
  }
  return node;
}

// nextStep(complexity, currentStep [, variant]) → o objeto-nó seguinte, ou null no fim.
//   - Para tipos hierárquicos: nextStep('feature', null, 'light') ou nextStep('feature', 'classificar', 'light')
//   - Para tipos legados:      nextStep('SIMPLES', null) ou nextStep('SIMPLES', 'classificar')
//   - currentStep === null → a raiz (primeiro nó do template = nó com blockedBy === null).
//   - currentStep === última etapa (next: null) → null.
//   - complexidade/variante desconhecida → null.
//   CONTRATO DE USO OBRIGATÓRIO (Axioma 2 — trio roda SEMPRE):
//     nextStep segue SOMENTE a cadeia .next (walker linear do tronco principal).
//     Quando o nó retornado tem campo `parallel`, TODOS os irmãos paralelos devem
//     ser disparados simultaneamente — chame allParallelSteps(complexity, node.step, variant)
//     para obter o conjunto completo. Usar nextStep sozinho em grupos paralelos colapsa
//     o trio adversarial a um único revisor, violando a garantia de revisão zero-contexto.
function nextStep(complexity, currentStep, variant) {
  const nodes = templateFor(complexity, variant);
  if (!nodes) return null;
  const label = variant ? `${complexity}.${variant}` : complexity;
  if (currentStep === null || currentStep === undefined) {
    // raiz = nó com blockedBy === null
    const root = nodes.find((n) => n.blockedBy === null);
    return root || null;
  }
  const current = nodeForStep(nodes, label, currentStep);
  if (current.next === null) return null; // fim da cadeia
  return nodeForStep(nodes, label, current.next);
}

// allParallelSteps(complexity, currentStep [, variant]) → array de nós-irmãos paralelos
// que devem ser disparados simultaneamente junto com o nó atual.
//   - Se o nó atual tem campo `parallel`, retorna os nós-irmãos (inclusive o próprio nó atual).
//   - Se o nó não tem paralelos, retorna array com só o nó atual.
//   - Útil para builders progressivos que precisam expandir grupos paralelos.
function allParallelSteps(complexity, currentStep, variant) {
  const nodes = templateFor(complexity, variant);
  if (!nodes) return [];
  const label = variant ? `${complexity}.${variant}` : complexity;
  const current = nodeForStep(nodes, label, currentStep);
  if (!Array.isArray(current.parallel) || current.parallel.length === 0) {
    return [current];
  }
  // Inclui o nó atual + todos os irmãos paralelos declarados
  const siblings = current.parallel
    .map((sibStep) => nodes.find((n) => n.step === sibStep))
    .filter(Boolean);
  return [current, ...siblings];
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
  if (Array.isArray(node.parallel) && node.parallel.length > 0) {
    lines.push(`PARALLEL_SIBLINGS: ${node.parallel.join(', ')}`);
  }
  return lines.join('\n');
}

// nodeSpec(complexity, step, prevIssueId [, variant]) → payload puro da issue.
//   { title, assigneeAgentId, blockedByIssueIds, body }
//   - assigneeAgentId = role do molde (P1).
//   - blockedByIssueIds = prevIssueId ? [prevIssueId] : [] (P2).
//   - body = instrução de emitir o(s) bloco(s) + linha NEXT_STEP.
//   Para tipos hierárquicos: nodeSpec('feature', 'classificar', null, 'light')
//   Para tipos legados:      nodeSpec('SIMPLES', 'classificar', null)
//   AVISO: para nós de junção (blockedBy = string[] no molde), use nodeSpecFanIn.
//   nodeSpec sempre produz UM único bloqueador — correto para nós do tronco linear.
function nodeSpec(complexity, step, prevIssueId, variant) {
  const nodes = templateFor(complexity, variant);
  if (!nodes) {
    const label = variant ? `${complexity}.${variant}` : complexity;
    throw new Error(`tree-factory: complexidade "${label}" desconhecida`);
  }
  const label = variant ? `${complexity}.${variant}` : complexity;
  const node = nodeForStep(nodes, label, step);
  return {
    title: `[${label}] ${node.step}`,
    assigneeAgentId: node.role,
    blockedByIssueIds: prevIssueId ? [prevIssueId] : [],
    body: buildBody(node),
  };
}

// nodeSpecFanIn(complexity, step, stepToIssueIdMap [, variant]) → payload de junção.
//   Idêntico a nodeSpec mas resolve blockedByIssueIds para TODOS os irmãos declarados
//   em node.blockedBy[] do molde, usando o mapa step→issueId fornecido.
//   Garante fan-in real: a junção só desbloqueia quando TODOS os irmãos concluíram.
//
//   - stepToIssueIdMap: { [stepName]: issueId } — contém o ID da issue criada para
//     cada irmão paralelo que converge nesta junção.
//   - Se node.blockedBy for scalar (nó linear comum), comporta-se como nodeSpec
//     com prevIssueId = stepToIssueIdMap[node.blockedBy].
//   - Lança se um step em blockedBy[] não estiver no mapa (proteção contra fan-in parcial).
//
//   Uso: nodeSpecFanIn('feature', 'checkpoint', {'review-spec':'I-1','review-quality':'I-2'}, 'heavy')
function nodeSpecFanIn(complexity, step, stepToIssueIdMap, variant) {
  const nodes = templateFor(complexity, variant);
  if (!nodes) {
    const label = variant ? `${complexity}.${variant}` : complexity;
    throw new Error(`tree-factory: complexidade "${label}" desconhecida`);
  }
  const label = variant ? `${complexity}.${variant}` : complexity;
  const node = nodeForStep(nodes, label, step);

  let blockedByIssueIds;
  if (Array.isArray(node.blockedBy)) {
    // Junção real: resolve TODOS os irmãos paralelos
    blockedByIssueIds = node.blockedBy.map((sibStep) => {
      const issueId = stepToIssueIdMap[sibStep];
      if (issueId === undefined || issueId === null) {
        throw new Error(
          `tree-factory/nodeSpecFanIn: step "${sibStep}" de blockedBy não encontrado no mapa` +
          ` (junção "${step}" em ${label}). Fan-in incompleto bloqueado.`,
        );
      }
      return issueId;
    });
  } else {
    // Nó linear — comporta-se como nodeSpec
    const prevId = node.blockedBy ? stepToIssueIdMap[node.blockedBy] : null;
    blockedByIssueIds = prevId ? [prevId] : [];
  }

  return {
    title: `[${label}] ${node.step}`,
    assigneeAgentId: node.role,
    blockedByIssueIds,
    body: buildBody(node),
  };
}

module.exports = { nextStep, nodeSpec, nodeSpecFanIn, allParallelSteps, templateFor };
