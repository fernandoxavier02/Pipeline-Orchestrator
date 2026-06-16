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

// ─── VALIDATE ROSTER COMPLETENESS (ROOT CAUSE #2) ────────────────────────────

/**
 * validateRosterCompleteness(nodes, agentsById) — pré-flight do roster.
 *
 * Confirma que TODO cargo (role) declarado pelos nós a criar resolve para um uuid
 * não-vazio no roster fornecido. Roda ANTES de qualquer createIssue, de modo que um
 * roster incompleto falha cedo (fail-fast) em vez de só estourar quando a API tenta
 * atribuir a issue — tarde demais para recuperar a cadeia (raiz #2: phantom UUID /
 * roster incompleto).
 *
 * @param {Array<{role: string}>} nodes Nós cujos roles serão criados nesta chamada
 * @param {Object<string, string>} agentsById Mapa nome→uuid (roster indexado)
 * @throws {Error} listando TODOS os roles ausentes (não só o primeiro)
 */
function validateRosterCompleteness(nodes, agentsById) {
  const map = agentsById || {};
  const missing = [];
  const seen = new Set();
  for (const node of nodes || []) {
    const role = node && node.role;
    if (!role || seen.has(role)) continue;
    seen.add(role);
    const uuid = map[role];
    if (typeof uuid !== 'string' || uuid.length === 0) {
      missing.push(role);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `tree-factory-io/validateRosterCompleteness: roster incompleto — ` +
      `cargo(s) sem uuid válido: [${missing.join(', ')}]. ` +
      `Pré-flight (Invariante AC-IO-27): todos os roles do molde devem resolver ANTES de criar qualquer issue.`,
    );
  }
}

// ─── VALIDATE FAN-IN MAP (ROOT CAUSE #6) ─────────────────────────────────────

/**
 * validateFanInMap(junctionNode, stepToIssueIdMap) — pré-flight de junção.
 *
 * Para um nó de junção (blockedBy = array), confirma que o stepToIssueIdMap contém
 * uma entrada válida (não-vazia) para CADA step irmão declarado em blockedBy[].
 * Roda ANTES de nodeSpecFanIn, transformando o throw tardio de nodeSpecFanIn num
 * erro de pré-flight com mensagem acionável (raiz #6: stepmap incompleto → junção
 * nunca criada → cadeia morre em silêncio).
 *
 * @param {{step: string, blockedBy: string[]}} junctionNode Nó de junção
 * @param {Object<string, string>|undefined} stepToIssueIdMap Mapa step→issueId
 * @throws {Error} listando os steps ausentes do mapa
 */
function validateFanInMap(junctionNode, stepToIssueIdMap) {
  if (!junctionNode || !Array.isArray(junctionNode.blockedBy)) return;
  const map = stepToIssueIdMap || {};
  const missing = junctionNode.blockedBy.filter((sib) => {
    const id = map[sib];
    return id === undefined || id === null || id === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `tree-factory-io/validateFanInMap: junção "${junctionNode.step}" — ` +
      `stepToIssueIdMap incompleto: faltam [${missing.join(', ')}] ` +
      `(esperado todos de [${junctionNode.blockedBy.join(', ')}], recebido [${Object.keys(map).join(', ') || 'vazio'}]). ` +
      `Pré-flight de fan-in (Invariante AC-IO-28): a junção só é criada quando TODOS os irmãos têm issueId.`,
    );
  }
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

// ─── COMPENSATE CREATED ISSUES (best-effort, FIX 3 — mid-sequence partials) ──
//
// Pré-flight (validateRosterCompleteness/validateFanInMap/prevIssueId) elimina os
// parciais da CLASSE de validação: nada é criado se algum role/blocker/mapa é inválido.
// Mas dentro de um grupo paralelo/fan-in com >1 nó, o primeiro POST pode ter sucesso e
// um POST seguinte falhar por TRANSPORTE/REDE — deixando irmãos órfãos e a junção sem
// nascer (a atomicidade verdadeira exigiria transação server-side, que a API REST não
// oferece). Esta função faz a COMPENSAÇÃO best-effort: tenta apagar os irmãos já criados
// para que o grupo volte ao estado "nada criado". Se um DELETE também falha (rede ainda
// instável), os IDs ficam REGISTRADOS para limpeza manual — nunca silenciados.
//
// Retorna { deleted: string[], undeletable: string[] } para o chamador decidir o que
// reportar. NÃO relança: a propagação do erro ORIGINAL é responsabilidade de quem chamou.
async function compensateCreatedIssues(transport, companyId, createdIssueIds) {
  const deleted = [];
  const undeletable = [];
  for (const issueId of createdIssueIds || []) {
    try {
      assertSafeId(issueId); // S1: nunca montar path com id não-validado
      const { status } = await transport.request({
        method: 'DELETE',
        path: `/api/companies/${companyId}/issues/${issueId}`,
      });
      // 200/204 = apagado; qualquer outro status conta como não-apagado (registrar).
      if (status === 200 || status === 204) {
        deleted.push(issueId);
      } else {
        undeletable.push(issueId);
      }
    } catch (e) {
      // Best-effort: a falha de compensação NÃO mascara o erro original. Só registra.
      undeletable.push(issueId);
    }
  }
  return { deleted, undeletable };
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

  // ── PRÉ-FLIGHT ATÔMICO (raízes #1, #2, #5, #6) ─────────────────────────────
  // Toda validação acontece ANTES do primeiro POST. Se qualquer checagem falhar,
  // lançamos sem ter criado nenhuma issue — um fan-in/paralelo ou cria TODOS os nós
  // ou nenhum (atomicidade do ponto de vista do chamador, sem transação de DB).
  // Sem esta fase, o nó #1 era criado e o nó #2 falhava deixando issues órfãs e a
  // junção nunca nascia (raiz #5).
  const specs = [];
  for (const parallelNode of parallelNodes) {
    // Detectar junção (blockedBy = array no molde) — Invariante FAN
    const isJunction = Array.isArray(parallelNode.blockedBy);

    if (isJunction) {
      // ROOT CAUSE #6: validar completude do stepToIssueIdMap ANTES de nodeSpecFanIn.
      validateFanInMap(parallelNode, stepToIssueIdMap);
      const fanInMap = stepToIssueIdMap || {};
      specs.push(nodeSpecFanIn(complexity, parallelNode.step, fanInMap, variant || undefined));
    } else {
      // ROOT CAUSE #1: nó não-raiz exige prevIssueId não-nulo/não-vazio. Um nó linear
      // com prevIssueId ausente nasceria com blockedByIssueIds=[] → issue DESBLOQUEADA,
      // capturada prematuramente ou órfã (5/54 runs auditados travaram por isso).
      // Raiz = root do template (blockedBy === null no molde) → prevIssueId pode ser null.
      const isRoot = parallelNode.blockedBy === null;
      if (!isRoot && (prevIssueId === null || prevIssueId === undefined || prevIssueId === '')) {
        throw new Error(
          `tree-factory-io/growSpine: prevIssueId inválido ("${prevIssueId}") para o nó não-raiz ` +
          `"${parallelNode.step}". Invariante AC-IO-26: cadeia linear exige prevIssueId não-nulo ` +
          `para nós não-raiz, senão a issue nasce sem blocker e é capturada prematuramente.`,
        );
      }
      specs.push(nodeSpec(complexity, parallelNode.step, prevIssueId, variant || undefined));
    }
  }

  // ROOT CAUSE #2: resolver TODOS os roles contra o roster ANTES de qualquer POST.
  validateRosterCompleteness(specs.map((s) => ({ role: s.assigneeAgentId })), agentsById);

  // ── FASE DE CRIAÇÃO (pós pré-flight) ───────────────────────────────────────
  // Tudo já foi validado; agora os POSTs em sequência. O pré-flight garantiu
  // roles + blockers, então a falha de VALIDAÇÃO está descartada. Resta a falha de
  // TRANSPORTE/REDE no meio da sequência: num grupo com >1 nó (paralelo/fan-in), o
  // POST #1 pode ter sucesso e o POST #2 falhar — deixando irmãos órfãos. Não há
  // transação server-side; então fazemos COMPENSAÇÃO best-effort (apagar os irmãos já
  // criados) antes de propagar o erro. Para um único nó (grupo de 1) não há parcial
  // possível, então o caminho continua simples.
  const createdIssueIds = [];
  const createdSteps = [];
  const isMultiIssueGroup = specs.length > 1;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const assigneeUuid = resolveRole(spec.assigneeAgentId, agentsById);

    // Montar payload REST (P1 + P2)
    const payload = {
      title: spec.title,
      description: spec.body,       // P2: body → description
      assigneeAgentId: assigneeUuid, // P1: uuid real
      blockedByIssueIds: spec.blockedByIssueIds,
    };

    // Criar a issue via transport injetado
    let issueId;
    try {
      issueId = await createIssue(transport, companyId, payload);
    } catch (err) {
      // Falha MID-sequence num grupo multi-issue → compensar os irmãos já criados.
      if (isMultiIssueGroup && createdIssueIds.length > 0) {
        const { deleted, undeletable } =
          await compensateCreatedIssues(transport, companyId, createdIssueIds);
        // Enriquecer o erro original com o resultado da compensação (sem mascará-lo).
        err.partialGroupCompensation = {
          step: parallelNodes[i].step,
          createdBeforeFailure: createdIssueIds.slice(),
          deleted,
          undeletable, // ← se não-vazio, EXIGE limpeza/escalação manual
        };
        err.message +=
          ` | grupo paralelo/fan-in parcial: ${createdIssueIds.length} irmão(s) criado(s) antes da falha; ` +
          `compensação best-effort apagou [${deleted.join(', ') || '∅'}]` +
          (undeletable.length
            ? `, NÃO apagou [${undeletable.join(', ')}] (registrados para limpeza manual — escalar)`
            : ' (grupo revertido ao estado vazio)') + '.';
      }
      throw err;
    }
    createdIssueIds.push(issueId);
    createdSteps.push(parallelNodes[i].step);
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
  validateRosterCompleteness,
  validateFanInMap,
  buildCreatePayload,
  createIssue,
  compensateCreatedIssues,
  growSpine,
};
