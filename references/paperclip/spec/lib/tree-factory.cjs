'use strict';
// Lógica pura do gerador de árvore (sem rede, sem Paperclip). Lê o molde declarativo
// (tree-template.cjs) e decide (a) qual nó criar a seguir e (b) o payload da issue.
// O I/O real (criar a issue via API) e o CLI ficam em outros módulos (Grupo B) — aqui
// é tudo determinístico e testável com transport fake, como a régua.

const { TEMPLATES, getTemplate } = require('./tree-template.cjs');

// ─── D4: constante canônica da instrução de loop interno (FixLoopNode) ───────
// Exportada para que os testes referenciem a constante e não a string literal,
// evitando fragilidade de substring. Qualquer mudança de texto atualiza de forma
// centralizada.
const LOOP_INTERNAL_INSTRUCTION =
  'maximo 3 tentativas, itere por dentro deste cartao, NAO crie cartoes novos por tentativa';

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
// D4: se o nó tem role executor-fix, injeta a instrução de iteração interna ANTES do
// marcador NEXT_STEP — o agente lê a instrução antes de agir. O corpo segue sendo os
// mesmos 4 campos canônicos; a diferença está exclusivamente no texto do body.
function buildBody(node) {
  const lines = [];
  lines.push(`Etapa do pipeline: ${node.step} (cargo: ${node.role}).`);
  // D4 — FixLoopNode: instrução de iteração interna exclusiva de executor-fix
  if (node.role === 'executor-fix') {
    lines.push('');
    lines.push(LOOP_INTERNAL_INSTRUCTION);
  }
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

// ─── D6: expandSlices — fatias dinâmicas de implementação ────────────────────
// expandSlices(complexity, n, prevIssueId [, variant])
//   → { slices: SliceSpec[], intermediaries: IntermediarySpec[], junction: JunctionSpec }
//
// Dado n fatias vindas do plano, devolve n nodeSpecs irmãos de implementação
// (sem trava entre si, todos bloqueados por prevIssueId), os nós intermediários
// obrigatórios (par N12 review-spec ‖ review-quality em variantes heavy que os exigem,
// vazio em variantes light/lineares) e uma junção downstream.
//
// Invariantes:
//   INV-D6-1: as N fatias são irmãs — nenhuma trava outra (blockedByIssueIds = [prevIssueId]).
//   INV-D6-2: todas as N fatias bloqueiam a junção downstream (fan-in real).
//   INV-D6-3: n >= 1 e inteiro; n === 0, NaN ou fração lança erro descritivo.
//   INV-D6-4: todas as fatias compartilham o mesmo prevIssueId.
//   INV-D6-5: a junção downstream existe no molde — expandSlices não inventa junções.
//   INV-D6-6: modos especiais (hotfix, review-only) não são fatiáveis.
//   INV-D6-7: somente role 'feature-implementer' é fatiável — 'executor-fix' é fix-loop
//             que NÃO deve ser expandido em fatias paralelas (contradiz D4).
//   INV-D6-8: quando o molde exige revisores intermediários (N12) entre implementação e
//             junção (ex: feature.heavy, user-story.heavy), expandSlices produz esses nós
//             em `intermediaries` — a junção é bloqueada pelos intermediários, não pelas
//             fatias diretamente. `intermediaries` é [] quando o caminho é linear.
//
// Estratégia de auto-descoberta do nó de implementação e da junção:
//   1. Localizar o nó com role 'feature-implementer' (nó de implementação fatiável).
//      Roles de fix-loop (executor-fix) são explicitamente excluídos (INV-D6-7).
//   2. Localizar a junção downstream:
//      a. Se implNode.next aponta para um nó paralelo (tem campo 'parallel'), a junção
//         real é o nó cujo blockedBy[] inclui implNode.next (fan-in dos paralelos).
//         Nesse caso, o grupo paralelo (nextNode + seus irmãos) são os intermediários N12.
//      b. Senão, procura nó com blockedBy array que inclua o step de implementação.
//      c. Senão, usa implNode.next diretamente (tronco linear — ex: bugfix.light).
//
// IDs das fatias são placeholders sintéticos ('SLICE-1', 'SLICE-2', ...) porque
// expandSlices é pura (sem rede). Intermediários também recebem placeholders sintéticos
// ('REVIEW-1', 'REVIEW-2', ...). O I/O real (tree-factory-io.cjs, Grupo B) substitui
// pelos IDs reais do Paperclip após criar as issues.

// Modos especiais que NÃO devem ser fatiados (INV-D6-6):
const SPECIAL_MODES = new Set(['hotfix', 'review-only']);

function expandSlices(complexity, n, prevIssueId, variant) {
  // Validação: n deve ser número inteiro válido >= 1 (INV-D6-3).
  // Number.isInteger também rejeita frações (2.9, 3.5 etc.) que Array.from truncaria
  // silenciosamente, gerando menos fatias do que o pretendido (achado high #2).
  if (typeof n !== 'number' || Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(
      `tree-factory/expandSlices: n inválido "${n}" — deve ser inteiro >= 1 (complexidade: ${complexity})`,
    );
  }

  // Guarda: modos especiais não são fatiáveis (INV-D6-6)
  const normalizedComplexity = (complexity || '').toLowerCase().replace(/\s+/g, '-');
  if (SPECIAL_MODES.has(normalizedComplexity)) {
    throw new Error(
      `tree-factory/expandSlices: modo especial "${complexity}" não é fatiável — ` +
      `hotfix e review-only têm estrutura fixa e não admitem fatias dinâmicas`,
    );
  }

  // Carregar o molde
  const nodes = templateFor(complexity, variant);
  if (!nodes) {
    const label = variant ? `${complexity}.${variant}` : complexity;
    throw new Error(
      `tree-factory/expandSlices: molde não encontrado para "${label}" — complexidade ou variante desconhecida`,
    );
  }
  const label = variant ? `${complexity}.${variant}` : complexity;

  // Auto-descoberta do nó de implementação — somente 'feature-implementer' é fatiável.
  // 'executor-fix' é excluído: é um fix-loop que itera internamente (D4/INV-D6-7).
  // Slicear executor-fix contradiz o contrato D4 ('NAO crie cartoes novos por tentativa').
  const SLICEABLE_ROLES = ['feature-implementer'];
  const implNode = nodes.find((node) => SLICEABLE_ROLES.includes(node.role));
  if (!implNode) {
    throw new Error(
      `tree-factory/expandSlices: nó de implementação fatiável não encontrado em "${label}" ` +
      `(role esperado: ${SLICEABLE_ROLES.join(', ')}). ` +
      `Nota: executor-fix não é fatiável (D4/INV-D6-7).`,
    );
  }

  // Auto-descoberta da junção downstream — três estratégias em ordem de prioridade:
  //
  // Prioridade A: Se implNode.next aponta para um nó paralelo (campo 'parallel'), a junção
  //   real é o nó cujo blockedBy[] inclui implNode.next (ex: feature.heavy → checkpoint).
  //   Razão: em templates heavy, implementar → review-spec ‖ review-quality → checkpoint.
  //   O checkpoint tem blockedBy=['review-spec','review-quality']. review-spec não é a junção;
  //   é metade do par paralelo. A junção é checkpoint.
  //   Os nós paralelos (review-spec ‖ review-quality) são intermediários obrigatórios (N12)
  //   — devem ser produzidos em `intermediaries` (INV-D6-8).
  //
  // Prioridade B: Nó com blockedBy array que inclua diretamente o step de implementação.
  //   (Fan-in declarado que aponta para o step do implNode — caso futuro ou legado.)
  //
  // Prioridade C: Nó apontado por implNode.next diretamente (tronco linear sem paralelos).
  //   Ex: feature.light → implementar.next = 'checkpoint' (linear, sem intermediários).
  let junctionNode = null;
  // intermediaryNodes: grupo paralelo entre implementação e junção (vazio no caminho linear)
  let intermediaryNodes = [];

  const nextNode = implNode.next ? nodes.find((node) => node.step === implNode.next) : null;

  if (nextNode && Array.isArray(nextNode.parallel) && nextNode.parallel.length > 0) {
    // Prioridade A: implNode.next é paralelo → junção é o nó cujo blockedBy[] inclui implNode.next.
    // O grupo paralelo (nextNode + seus irmãos declarados em nextNode.parallel) são os intermediários N12.
    junctionNode = nodes.find(
      (node) => Array.isArray(node.blockedBy) && node.blockedBy.includes(implNode.next),
    );
    if (junctionNode) {
      // Coletar todos os nós do grupo paralelo (intermediários obrigatórios — INV-D6-8)
      const siblingSteps = nextNode.parallel || [];
      const siblingNodes = siblingSteps
        .map((s) => nodes.find((nd) => nd.step === s))
        .filter(Boolean);
      intermediaryNodes = [nextNode, ...siblingNodes];
    }
  }

  if (!junctionNode) {
    // Prioridade B: blockedBy[] inclui diretamente o step do implNode
    junctionNode = nodes.find(
      (node) => Array.isArray(node.blockedBy) && node.blockedBy.includes(implNode.step),
    );
  }

  if (!junctionNode && nextNode) {
    // Prioridade C: implNode.next direto (tronco linear)
    junctionNode = nextNode;
  }

  if (!junctionNode) {
    throw new Error(
      `tree-factory/expandSlices: junção downstream não encontrada em "${label}" ` +
      `(após nó de implementação "${implNode.step}")`,
    );
  }

  // Gerar IDs placeholder para as N fatias
  const placeholderIds = Array.from({ length: n }, (_, i) => `SLICE-${i + 1}`);

  // Criar os N nodeSpecs irmãos de implementação (cada um bloqueado por prevIssueId).
  // Guard: prevIssueId nulo/indefinido → [] (igual a nodeSpec e nodeSpecFanIn para raiz).
  // Sem esse guard, blockedByIssueIds:[null] chegaria à API do Paperclip como blocker inválido.
  const sliceBlockers = prevIssueId ? [prevIssueId] : [];
  const slices = placeholderIds.map((placeholderId, i) => ({
    title: `[${label}] ${implNode.step} #${i + 1}`,
    assigneeAgentId: implNode.role,
    blockedByIssueIds: sliceBlockers,
    body: buildBody(implNode),
  }));

  // Tratar intermediários (INV-D6-8):
  // Quando existe grupo paralelo entre implementação e junção (Prioridade A), cada intermediário
  // é bloqueado por TODAS as N fatias (fan-in real das fatias). A junção é então bloqueada
  // pelos intermediários (usando placeholders REVIEW-1, REVIEW-2, ...).
  let intermediaries = [];
  let junctionBlockers = placeholderIds; // padrão: junção bloqueada pelas fatias (Prioridades B/C)

  if (intermediaryNodes.length > 0) {
    // Gerar placeholders para os intermediários
    const reviewPlaceholders = intermediaryNodes.map((_, i) => `REVIEW-${i + 1}`);

    // Cada intermediário é bloqueado por todas as N fatias (fan-in das fatias → intermediário)
    intermediaries = intermediaryNodes.map((intNode, i) => ({
      title: `[${label}] ${intNode.step}`,
      assigneeAgentId: intNode.role,
      blockedByIssueIds: placeholderIds, // todas as N fatias devem concluir antes do intermediário
      body: buildBody(intNode),
    }));

    // A junção agora é bloqueada pelos intermediários, não pelas fatias diretamente
    junctionBlockers = reviewPlaceholders;
  }

  // Criar o nodeSpec da junção com fan-in correto
  const junction = {
    title: `[${label}] ${junctionNode.step}`,
    assigneeAgentId: junctionNode.role,
    blockedByIssueIds: junctionBlockers,
    body: buildBody(junctionNode),
  };

  return { slices, intermediaries, junction };
}

module.exports = { nextStep, nodeSpec, nodeSpecFanIn, allParallelSteps, templateFor, expandSlices, LOOP_INTERNAL_INSTRUCTION };
