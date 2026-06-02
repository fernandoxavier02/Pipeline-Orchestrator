'use strict';
// tree-factory-io.cjs — G4-Braco I/O
//
// Camada de I/O do gerador de árvore: resolve cargos, monta payloads,
// cria issues via transport injetável e percorre a espinha progressivamente.
//
// Dependências (sem ciclos):
//   tree-template.cjs ← tree-factory.cjs ← tree-factory-io.cjs ← grow-tree.cjs
//
// Invariantes (ver domain_model da spec G4):
//   T1: nunca instancia transport diretamente — recebe por parâmetro.
//   T2: os testes NUNCA fazem chamadas de rede reais.
//   S1: assertSafeId valida /^[A-Za-z0-9_-]{1,64}$/ antes de qualquer chamada de rede.
//   P1: assigneeAgentId no payload é SEMPRE o uuid real, nunca o nome nominal.
//   P2: body do nodeSpec é traduzido para description no payload REST.
//   PAR: quando o nó tem campo `parallel`, TODOS os irmãos são criados via allParallelSteps.
//   FAN: nó de junção (blockedBy array) usa nodeSpecFanIn com mapa step→issueId.

const { nextStep, allParallelSteps, nodeSpec, nodeSpecFanIn } = require('./tree-factory.cjs');

// ─── SAFE ID VALIDATION (S1) ─────────────────────────────────────────────────
// Regex conforme spec: /^[A-Za-z0-9_-]{1,64}$/
// Protege contra path traversal e injection em companyId e agentId.

const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * assertSafeId(id) — lança Error se id não satisfaz /^[A-Za-z0-9_-]{1,64}$/.
 * Invariante S1: chamado para companyId e agentId antes de qualquer chamada de rede.
 *
 * @param {string} id
 * @throws {Error} se id inválido
 */
function assertSafeId(id) {
  if (typeof id !== 'string' || !SAFE_ID_REGEX.test(id)) {
    throw new Error(
      `tree-factory-io/assertSafeId: id inválido "${id}" — deve satisfazer /^[A-Za-z0-9_-]{1,64}$/. ` +
      `Comprimento recebido: ${typeof id === 'string' ? id.length : 'N/A'}. ` +
      `Possível injection ou formato incorreto.`,
    );
  }
}

// ─── RESOLVE ROLE (AC-IO-01..03) ─────────────────────────────────────────────

/**
 * resolveRole(name, agentsById) → uuid do agente.
 *
 * Invariante R1: busca pelo campo 'name' (igual ao identificador curto do molde).
 * Invariante R3 (L1): duplicatas → primeiro match (determinístico, sem erro de ambiguidade).
 *
 * @param {string} name Nome do cargo (ex: 'information-gate')
 * @param {Object<string, string>} agentsById Mapa nome→uuid (já indexado)
 * @returns {string} uuid do agente
 * @throws {Error} se cargo não encontrado
 */
function resolveRole(name, agentsById) {
  const uuid = agentsById[name];
  if (!uuid) {
    throw new Error(
      `tree-factory-io/resolveRole: cargo "${name}" não encontrado no AgentRoster. ` +
      `Verifique se o agente existe na empresa Paperclip e se o nome está correto.`,
    );
  }
  return uuid;
}

// ─── BUILD CREATE PAYLOAD (AC-IO-04) ─────────────────────────────────────────

/**
 * buildCreatePayload(nodeSpecResult, agentsById) → IssuePayload REST.
 *
 * Tradução de campos (P2):
 *   nodeSpec.body → payload.description (campo REST confirmado em api-and-payloads.md linha 31)
 *   nodeSpec.assigneeAgentId (nome nominal) → payload.assigneeAgentId (uuid real via resolveRole)
 *
 * @param {{ title: string, assigneeAgentId: string, blockedByIssueIds: string[], body: string }} nodeSpecResult
 * @param {Object<string, string>} agentsById Mapa nome→uuid
 * @returns {{ title: string, description: string, assigneeAgentId: string, blockedByIssueIds: string[] }}
 */
function buildCreatePayload(nodeSpecResult, agentsById) {
  const assigneeUuid = resolveRole(nodeSpecResult.assigneeAgentId, agentsById);
  return {
    title: nodeSpecResult.title,
    description: nodeSpecResult.body,           // P2: body → description
    assigneeAgentId: assigneeUuid,               // P1: nome nominal → uuid real
    blockedByIssueIds: nodeSpecResult.blockedByIssueIds,
  };
}

// ─── CREATE ISSUE (AC-IO-05..06) ─────────────────────────────────────────────

/**
 * createIssue(transport, companyId, payload) → Promise<issueId: string>
 *
 * Envia o payload via transport injetado.
 * assertSafeId é chamado para companyId e payload.assigneeAgentId antes do POST (S1).
 *
 * @param {{ request: Function }} transport Transport injetável (fake em testes, http em prod)
 * @param {string} companyId ID seguro da empresa
 * @param {{ title, description, assigneeAgentId, blockedByIssueIds }} payload Payload REST
 * @returns {Promise<string>} issueId retornado pelo Paperclip (campo "id" do corpo 201)
 * @throws {Error} se status != 201 ou se ids inválidos
 */
async function createIssue(transport, companyId, payload) {
  // S1: validar ids antes de qualquer chamada de rede
  assertSafeId(companyId);
  assertSafeId(payload.assigneeAgentId);

  const path = `/api/companies/${companyId}/issues`;
  const { status, data } = await transport.request({
    method: 'POST',
    path,
    body: payload,
  });

  if (status !== 201) {
    throw new Error(
      `tree-factory-io/createIssue: API retornou status ${status} (esperado 201). ` +
      `Path: ${path}. Resposta: ${JSON.stringify(data)}`,
    );
  }

  // Invariante verification-before-claim (invariante 11 do projeto):
  // Nunca declarar sucesso sem confirmar que o id foi retornado.
  // Se a API responde 201 mas o corpo não tem "id" (corpo vazio, drift de contrato
  // onde o id vem sob outra chave como "issueId"), lançar explicitamente.
  // Isso previne que undefined/null seja enfileirado em createdIssueIds e propagado
  // como blocker corrompido para chamadas subsequentes.
  if (!data || data.id === undefined || data.id === null) {
    throw new Error(
      `tree-factory-io/createIssue: API retornou 201 mas o campo "id" está ausente no corpo. ` +
      `Path: ${path}. Resposta: ${JSON.stringify(data)}. ` +
      `Possível drift de contrato — verifique se a API mudou o nome do campo.`,
    );
  }

  return data.id;
}

// ─── GROW SPINE (AC-IO-10..11) ───────────────────────────────────────────────

/**
 * growSpine(transport, companyId, complexity, currentStep, prevIssueId, agentsById [, variant])
 *   → Promise<{ issueIds: string[], steps: string[], nextStepNode: object|null }>
 *
 * Percorre a fábrica criando o(s) próximo(s) nó(s) da espinha.
 *
 * Semântica de currentStep:
 *   - currentStep === null → cria a raiz (primeiro nó do template).
 *   - currentStep = 'classificar' → cria o nó APÓS 'classificar'.
 *
 * Paralelismo (Invariante PAR):
 *   - Quando o próximo nó tem campo `parallel`, TODOS os irmãos são criados
 *     simultaneamente — chama allParallelSteps e cria cada um.
 *   - Retorna issueIds[] e steps[] com todos os nós criados nesta chamada.
 *
 * Fan-in (Invariante FAN):
 *   - Para nós de junção (blockedBy = string[] no molde), usa nodeSpecFanIn
 *     com o mapa step→issueId fornecido em stepToIssueIdMap.
 *   - prevIssueId é ignorado para nós de junção — usar stepToIssueIdMap.
 *
 * Compatibilidade reversa:
 *   - Para nós simples sem paralelo, retorna issueIds=[id], steps=[step]
 *     e o campo legado issueId=id é mantido para compatibilidade.
 *
 * @param {object} transport Transport injetável
 * @param {string} companyId ID da empresa
 * @param {string} complexity Ex: 'SIMPLES', 'COMPLEXA', 'feature'
 * @param {string|null} currentStep Step atual (null = criar raiz)
 * @param {string|null} prevIssueId ID da issue anterior (null = raiz)
 * @param {Object<string, string>} agentsById Mapa nome→uuid
 * @param {string|null} [variant] Variante hierárquica (ex: 'light', 'heavy') — null para legados
 * @param {Object<string, string>} [stepToIssueIdMap] Mapa step→issueId para fan-in de junções
 * @returns {Promise<{ issueId: string, issueIds: string[], steps: string[], nextStepNode: object|null }>}
 */
async function growSpine(
  transport,
  companyId,
  complexity,
  currentStep,
  prevIssueId,
  agentsById,
  variant,
  stepToIssueIdMap,
) {
  // Descobrir qual nó criar a seguir (walker linear do tronco)
  const nodeToCreate = nextStep(complexity, currentStep, variant || undefined);
  if (!nodeToCreate) {
    throw new Error(
      `tree-factory-io/growSpine: nenhum nó a criar. ` +
      `complexity="${complexity}"${variant ? `, variant="${variant}"` : ''}, ` +
      `currentStep="${currentStep}" — fim de cadeia ou complexidade inválida.`,
    );
  }

  // Verificar se este nó tem irmãos paralelos (Invariante PAR)
  const parallelNodes = allParallelSteps(complexity, nodeToCreate.step, variant || undefined);
  // parallelNodes sempre inclui o nó atual + quaisquer irmãos paralelos

  const createdIssueIds = [];
  const createdSteps = [];

  for (const parallelNode of parallelNodes) {
    let spec;

    // Verificar se é nó de junção (blockedBy = array no molde) — Invariante FAN
    // A junção é detectada verificando se blockedBy no molde é um array.
    // Isso requer olhar o template diretamente ou usar nodeSpecFanIn com mapa.
    const isJunction = Array.isArray(parallelNode.blockedBy);

    if (isJunction) {
      // Fan-in real: usa nodeSpecFanIn com mapa step→issueId
      const fanInMap = stepToIssueIdMap || {};
      spec = nodeSpecFanIn(complexity, parallelNode.step, fanInMap, variant || undefined);
    } else {
      // Nó linear ou nó paralelo simples: usa nodeSpec com prevIssueId
      spec = nodeSpec(complexity, parallelNode.step, prevIssueId, variant || undefined);
    }

    // Resolver o cargo para uuid (lança se cargo ausente — AC-IO-25)
    const assigneeUuid = resolveRole(spec.assigneeAgentId, agentsById);

    // Montar payload REST (P1 + P2)
    const payload = {
      title: spec.title,
      description: spec.body,       // P2: body → description
      assigneeAgentId: assigneeUuid, // P1: uuid real
      blockedByIssueIds: spec.blockedByIssueIds,
    };

    // Criar a issue via transport injetado
    const issueId = await createIssue(transport, companyId, payload);
    createdIssueIds.push(issueId);
    createdSteps.push(parallelNode.step);
  }

  // Descobrir o próximo nó a partir do step recém-criado (tronco linear)
  // Se há irmãos paralelos, o próximo nó no tronco é o mesmo para todos
  // (todos convergem na mesma junção via next).
  const nextNode = nextStep(complexity, nodeToCreate.step, variant || undefined);

  return {
    // Compatibilidade reversa: issueId = primeiro ID criado
    issueId: createdIssueIds[0],
    // Novos campos para suporte a paralelo e fan-in
    issueIds: createdIssueIds,
    steps: createdSteps,
    nextStepNode: nextNode,
  };
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  assertSafeId,
  resolveRole,
  buildCreatePayload,
  createIssue,
  growSpine,
};
