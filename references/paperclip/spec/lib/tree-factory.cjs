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
// expandSlices(complexity, n, prevIssueId [, variant]) → { slices: SliceSpec[], junction: JunctionSpec }
//
// Dado n fatias vindas do plano, devolve n nodeSpecs irmãos de implementação
// (sem trava entre si, todos bloqueados por prevIssueId) e uma junção downstream.
//
// Invariantes:
//   INV-D6-1: as N fatias são irmãs — nenhuma trava outra (blockedByIssueIds = [prevIssueId]).
//   INV-D6-2: todas as N fatias bloqueiam a junção downstream (fan-in real).
//   INV-D6-3: n >= 1; n === 0 lança erro descritivo.
//   INV-D6-4: todas as fatias compartilham o mesmo prevIssueId.
//   INV-D6-5: a junção downstream existe no molde — expandSlices não inventa junções.
//
// Estratégia de auto-descoberta do nó de implementação e da junção:
//   1. Localizar o nó com role 'executor-fix' OU 'feature-implementer' (nó de implementação).
//   2. Localizar a junção: primeiro, procura nó com blockedBy array que inclua o step da
//      implementação; se não existir, usa o nó apontado por node.next (tronco linear).
//
// IDs das fatias na junção são placeholders sintéticos ('SLICE-1', 'SLICE-2', ...) porque
// expandSlices é pura (sem rede). O I/O real (tree-factory-io.cjs, Grupo B) substitui
// pelos IDs reais do Paperclip após criar as issues.
function expandSlices(complexity, n, prevIssueId, variant) {
  // Validação: n deve ser >= 1
  if (typeof n !== 'number' || n < 1) {
    throw new Error(
      `tree-factory/expandSlices: n inválido "${n}" — deve ser inteiro >= 1 (complexidade: ${complexity})`,
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

  // Auto-descoberta do nó de implementação (role executor-fix ou feature-implementer)
  const IMPL_ROLES = ['executor-fix', 'feature-implementer'];
  const implNode = nodes.find((node) => IMPL_ROLES.includes(node.role));
  if (!implNode) {
    throw new Error(
      `tree-factory/expandSlices: nó de implementação não encontrado em "${label}" ` +
      `(roles esperados: ${IMPL_ROLES.join(', ')})`,
    );
  }

  // Auto-descoberta da junção downstream:
  // Prioridade 1: nó com blockedBy array que inclua o step de implementação (fan-in declarado)
  // Prioridade 2: nó apontado por implNode.next (tronco linear — ex: bugfix.light)
  let junctionNode = nodes.find(
    (node) => Array.isArray(node.blockedBy) && node.blockedBy.includes(implNode.step),
  );
  if (!junctionNode && implNode.next) {
    junctionNode = nodes.find((node) => node.step === implNode.next);
  }
  if (!junctionNode) {
    throw new Error(
      `tree-factory/expandSlices: junção downstream não encontrada em "${label}" ` +
      `(após nó de implementação "${implNode.step}")`,
    );
  }

  // Gerar IDs placeholder para as N fatias
  const placeholderIds = Array.from({ length: n }, (_, i) => `SLICE-${i + 1}`);

  // Criar os N nodeSpecs irmãos de implementação
  const slices = placeholderIds.map((placeholderId, i) => ({
    title: `[${label}] ${implNode.step} #${i + 1}`,
    assigneeAgentId: implNode.role,
    blockedByIssueIds: [prevIssueId],
    body: buildBody(implNode),
  }));

  // Criar o nodeSpec da junção com fan-in de todas as N fatias
  const junction = {
    title: `[${label}] ${junctionNode.step}`,
    assigneeAgentId: junctionNode.role,
    blockedByIssueIds: placeholderIds,
    body: buildBody(junctionNode),
  };

  return { slices, junction };
}

module.exports = { nextStep, nodeSpec, nodeSpecFanIn, allParallelSteps, templateFor, expandSlices, LOOP_INTERNAL_INSTRUCTION };
