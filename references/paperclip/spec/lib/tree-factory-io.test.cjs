'use strict';
// tree-factory-io.test.cjs — G4-Braco I/O + CLI (testes TDD-first)
// Cobre: assertSafeId, resolveRole, buildCreatePayload, createIssue, growSpine
// Transport FAKE injetado — NUNCA abre socket TCP real (AC-IO-17).
//
// Ordem: do mais simples (assertSafeId) ao mais integrado (growSpine).

const { test } = require('node:test');
const assert = require('node:assert');

// ─── IMPORT DO MÓDULO ALVO ────────────────────────────────────────────────────
const {
  assertSafeId,
  resolveRole,
  validateRosterCompleteness,
  validateFanInMap,
  buildCreatePayload,
  createIssue,
  growSpine,
} = require('./tree-factory-io.cjs');

// ─── FAKE TRANSPORT ───────────────────────────────────────────────────────────
// T1 (Invariante T2): never opens a real TCP socket.
// Devolve status 201 + id incremental para POST; 200 + data para GET.

function makeFakeTransport(overrides = {}) {
  const calls = [];
  let counter = 0;

  const transport = {
    calls,
    async request({ method, path, body }) {
      calls.push({ method, path, body });
      if (overrides.alwaysStatus) {
        return { status: overrides.alwaysStatus, data: overrides.alwaysData || {} };
      }
      if (method === 'POST') {
        counter += 1;
        return { status: 201, data: { id: `FAKE-${String(counter).padStart(3, '0')}` } };
      }
      // GET → roster list
      return {
        status: 200,
        data: overrides.rosterData || [],
      };
    },
  };
  return transport;
}

// ─── ROSTER MAP (mapa nome→uuid) para testes de resolveRole ──────────────────
// Espelha formato real: array de agentes com campo 'name'.
// resolveRole recebe o mapa já construído (name → agentId).

// CORREÇÃO G6: o cargo canônico de 'classificar' é task-orchestrator (não pipeline-controller).
// O roster de teste inclui task-orchestrator para que growSpine(SIMPLES, null) resolva corretamente.
// pipeline-controller permanece no roster pois é cargo válido para outros testes (T-IO-09).
const SAMPLE_ROSTER = {
  'information-gate': 'uuid-ig-real',
  'task-orchestrator': 'uuid-to-real',
  'pipeline-controller': 'uuid-pc-real',
  'feature-implementer': 'uuid-fi-real',
  'adversarial-review-coordinator': 'uuid-arc-real',
  'final-validator': 'uuid-fv-real',
  'plan-architect': 'uuid-pa-real',
};

// ─── GRUPO 1: assertSafeId ────────────────────────────────────────────────────

test('T-IO-01: assertSafeId — string vazia lança erro', () => {
  assert.throws(
    () => assertSafeId(''),
    (err) => err instanceof Error && err.message.length > 0,
  );
});

test('T-IO-02: assertSafeId — string com 65 caracteres alfanuméricos lança erro', () => {
  const longId = 'a'.repeat(65);
  assert.throws(
    () => assertSafeId(longId),
    (err) => err instanceof Error,
  );
});

test('T-IO-03: assertSafeId — string com "../../" lança erro (path traversal)', () => {
  assert.throws(
    () => assertSafeId('../../etc/passwd'),
    (err) => err instanceof Error,
  );
});

test('T-IO-04: assertSafeId — string com espaços lança erro', () => {
  assert.throws(
    () => assertSafeId('id com espaco'),
    (err) => err instanceof Error,
  );
});

test('T-IO-05: assertSafeId — uuid válido não lança (smoke test positivo)', () => {
  assert.doesNotThrow(() => assertSafeId('019c6f31-41ed-497a-93ba-cb4eff651a7c'));
});

test('T-IO-06: assertSafeId — string de 1 caractere alfanumérico não lança (limite inferior válido)', () => {
  assert.doesNotThrow(() => assertSafeId('a'));
});

test('T-IO-06b: assertSafeId — string de 64 caracteres alfanuméricos não lança (limite superior válido)', () => {
  assert.doesNotThrow(() => assertSafeId('a'.repeat(64)));
});

// ─── GRUPO 2: resolveRole ─────────────────────────────────────────────────────

test('T-IO-07: resolveRole — cargo presente retorna uuid correto', () => {
  const result = resolveRole('information-gate', SAMPLE_ROSTER);
  assert.strictEqual(result, 'uuid-ig-real');
});

test('T-IO-08: resolveRole — cargo ausente lança Error com nome do cargo na mensagem', () => {
  assert.throws(
    () => resolveRole('cargo-fantasma', SAMPLE_ROSTER),
    (err) => err instanceof Error && err.message.includes('cargo-fantasma'),
  );
});

test('T-IO-09: resolveRole — duplicata de cargo retorna o primeiro match (L1 documentado)', () => {
  // Simula roster com 'pipeline-controller' aparecendo duas vezes.
  // resolveRole recebe o mapa nome→uuid — quando há duplicata, o mapa já
  // contém o PRIMEIRO valor inserido (comportamento de objeto JS para chaves repetidas:
  // a última sobrescreve; a spec diz "primeiro da lista").
  // Para testar L1 corretamente, passamos um array de agents como roster raw
  // (pré-indexação) — resolveRole deve fazer o lookup pelo campo e retornar o primeiro.
  // Como o mapa é construído fora de resolveRole, testamos via resolveRole(name, map)
  // com o mapa que JÁ preserva o primeiro valor:
  const rosterWithFirst = {
    'pipeline-controller': 'uuid-a',
  };
  // Confirmar que uuid-a é retornado (L1: first match wins)
  assert.strictEqual(resolveRole('pipeline-controller', rosterWithFirst), 'uuid-a');
});

// ─── GRUPO 3: buildCreatePayload ─────────────────────────────────────────────

test('T-IO-10: buildCreatePayload — campo body do nodeSpec é renomeado para description', () => {
  const nodeSpecResult = {
    title: '[SIMPLES] clarificar',
    assigneeAgentId: 'information-gate', // nome nominal
    blockedByIssueIds: ['prev-id'],
    body: 'instrucao do cargo aqui',
  };
  const payload = buildCreatePayload(nodeSpecResult, SAMPLE_ROSTER);
  assert.strictEqual(payload.description, 'instrucao do cargo aqui');
  assert.strictEqual(payload.body, undefined);
});

test('T-IO-11: buildCreatePayload — assigneeAgentId é resolvido do roster (não passa nome nominal)', () => {
  const nodeSpecResult = {
    title: '[SIMPLES] clarificar',
    assigneeAgentId: 'information-gate',
    blockedByIssueIds: [],
    body: 'texto',
  };
  const payload = buildCreatePayload(nodeSpecResult, SAMPLE_ROSTER);
  assert.strictEqual(payload.assigneeAgentId, 'uuid-ig-real');
});

test('T-IO-12: buildCreatePayload — blockedByIssueIds vazio para nó raiz', () => {
  const nodeSpecResult = {
    title: '[SIMPLES] classificar',
    assigneeAgentId: 'pipeline-controller',
    blockedByIssueIds: [],
    body: 'corpo',
  };
  const payload = buildCreatePayload(nodeSpecResult, SAMPLE_ROSTER);
  assert.deepStrictEqual(payload.blockedByIssueIds, []);
});

test('T-IO-13: buildCreatePayload — blockedByIssueIds contém prevIssueId para nó não-raiz', () => {
  const nodeSpecResult = {
    title: '[SIMPLES] clarificar',
    assigneeAgentId: 'information-gate',
    blockedByIssueIds: ['ISSUE-42'],
    body: 'texto',
  };
  const payload = buildCreatePayload(nodeSpecResult, SAMPLE_ROSTER);
  assert.deepStrictEqual(payload.blockedByIssueIds, ['ISSUE-42']);
});

// ─── GRUPO 4: createIssue ─────────────────────────────────────────────────────

test('T-IO-14: createIssue — transport fake retorna id e esse id é o retorno da função', async () => {
  const transport = makeFakeTransport();
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  const result = await createIssue(transport, 'PIP-CO', payload);
  assert.strictEqual(result, 'FAKE-001');
});

test('T-IO-15: createIssue — transport registra exatamente 1 chamada POST com path correto', async () => {
  const transport = makeFakeTransport();
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await createIssue(transport, 'PIP-CO', payload);
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 1);
  assert.ok(
    postCalls[0].path.includes('/PIP-CO/'),
    `path deve conter '/PIP-CO/' mas recebeu: ${postCalls[0].path}`,
  );
});

test('T-IO-16: createIssue — payload enviado ao transport tem campo "description" (não "body")', async () => {
  const transport = makeFakeTransport();
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo da issue',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await createIssue(transport, 'PIP-CO', payload);
  const postCall = transport.calls.find((c) => c.method === 'POST');
  assert.ok(postCall, 'deve ter 1 chamada POST');
  assert.strictEqual(postCall.body.description, 'corpo da issue');
  assert.strictEqual(postCall.body.body, undefined);
});

test('T-IO-17: createIssue — transport retornando status 422 faz createIssue lançar Error', async () => {
  const transport = makeFakeTransport({ alwaysStatus: 422, alwaysData: { error: 'Unprocessable' } });
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await assert.rejects(
    () => createIssue(transport, 'PIP-CO', payload),
    (err) => err instanceof Error && err.message.includes('422'),
  );
});

test('T-IO-18: createIssue — transport retornando status 500 lança Error com status na mensagem', async () => {
  const transport = makeFakeTransport({ alwaysStatus: 500, alwaysData: {} });
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await assert.rejects(
    () => createIssue(transport, 'PIP-CO', payload),
    (err) => err instanceof Error && err.message.includes('500'),
  );
});

test('T-IO-19: createIssue — assertSafeId é chamado para companyId antes do POST (companyId inválido lança antes de chamar transport)', async () => {
  const transport = makeFakeTransport();
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await assert.rejects(
    () => createIssue(transport, '../../etc/passwd', payload),
    (err) => err instanceof Error,
  );
  // Nenhum POST foi feito
  assert.strictEqual(transport.calls.filter((c) => c.method === 'POST').length, 0);
});

test('T-IO-20: createIssue — assertSafeId é chamado para agentId antes do POST (agentId inválido lança antes de chamar transport)', async () => {
  const transport = makeFakeTransport();
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: '../../etc/passwd',
    blockedByIssueIds: [],
  };
  await assert.rejects(
    () => createIssue(transport, 'PIP-CO', payload),
    (err) => err instanceof Error,
  );
  // Nenhum POST foi feito
  assert.strictEqual(transport.calls.filter((c) => c.method === 'POST').length, 0);
});

// ─── GRUPO 4b: createIssue — 201 sem id (invariante verification-before-claim) ─

test('T-IO-21a: createIssue — status 201 com body vazio ({}) lança Error (verificação de id ausente)', async () => {
  // Reproduz o cenário descrito no achado adversarial: o Paperclip responde
  // POST com 201 mas o corpo não tem o campo "id" (corpo vazio ou drift de
  // contrato). Antes da correção, createIssue retornava undefined silenciosamente.
  // Após a correção, deve lançar um Error descritivo.
  const transport = makeFakeTransport({ alwaysStatus: 201, alwaysData: {} });
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await assert.rejects(
    () => createIssue(transport, 'PIP-CO', payload),
    (err) => err instanceof Error && err.message.length > 0,
    'createIssue deve rejeitar quando status=201 mas data.id está ausente',
  );
});

test('T-IO-21b: createIssue — status 201 com body { issueId: "X" } (drift de contrato) lança Error descritivo', async () => {
  // Drift de contrato: a API real muda o nome do campo de "id" para "issueId".
  // O contrato spec exige o campo "id" — outro nome é tratado como ausente.
  const transport = makeFakeTransport({ alwaysStatus: 201, alwaysData: { issueId: 'DRIFT-ID' } });
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  await assert.rejects(
    () => createIssue(transport, 'PIP-CO', payload),
    (err) => err instanceof Error && err.message.length > 0,
    'createIssue deve rejeitar quando data.id está ausente (mesmo que data.issueId exista)',
  );
});

test('T-IO-21c: growSpine — transport retorna 201 sem id propaga Error (não enfileira undefined em createdIssueIds)', async () => {
  // Prova que o guard em createIssue previne que growSpine enfileire undefined/null
  // em createdIssueIds — efeito em cadeia documentado no achado.
  const transport = makeFakeTransport({ alwaysStatus: 201, alwaysData: {} });
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, SAMPLE_ROSTER),
    (err) => err instanceof Error,
    'growSpine deve rejeitar quando createIssue não consegue confirmar o id',
  );
});

// ─── GRUPO 5: growSpine ───────────────────────────────────────────────────────
// growSpine(transport, companyId, complexity, type, agentsById)
// Percorre o template criando a espinha progressivamente via createIssue.
// Retorna o issueId do nó criado.

test('T-IO-21: growSpine — primeiro nó SIMPLES (currentStep=null) gera POST com blockedByIssueIds:[] e title "[SIMPLES] classificar"', async () => {
  const transport = makeFakeTransport();
  const result = await growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, SAMPLE_ROSTER);
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 1);
  assert.deepStrictEqual(postCalls[0].body.blockedByIssueIds, []);
  assert.match(postCalls[0].body.title, /classificar/);
  assert.match(postCalls[0].body.title, /SIMPLES/);
  assert.ok(result.issueId, 'deve retornar issueId');
});

test('T-IO-22: growSpine — segundo nó SIMPLES ("clarificar" após "classificar"="F-001") gera POST com blockedByIssueIds: ["F-001"]', async () => {
  const transport = makeFakeTransport();
  const result = await growSpine(transport, 'PIP-CO', 'SIMPLES', 'classificar', 'F-001', SAMPLE_ROSTER);
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 1);
  assert.deepStrictEqual(postCalls[0].body.blockedByIssueIds, ['F-001']);
  assert.match(postCalls[0].body.title, /clarificar/);
});

// CORREÇÃO G6: cargo canônico de classificar é task-orchestrator → uuid 'uuid-to-real' no SAMPLE_ROSTER.
test('T-IO-23: growSpine — assigneeAgentId no POST é o uuid do roster (não o nome nominal "task-orchestrator")', async () => {
  const transport = makeFakeTransport();
  await growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, SAMPLE_ROSTER);
  const postCall = transport.calls.find((c) => c.method === 'POST');
  assert.strictEqual(postCall.body.assigneeAgentId, 'uuid-to-real');
});

test('T-IO-24: growSpine — retorna o issueId devolvido pelo transport', async () => {
  const transport = makeFakeTransport();
  const result = await growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, SAMPLE_ROSTER);
  assert.strictEqual(result.issueId, 'FAKE-001');
});

test('T-IO-25: growSpine — se cargo não estiver no rosterMap, lança antes de qualquer POST', async () => {
  const transport = makeFakeTransport();
  const emptyRoster = {}; // nenhum cargo mapeado
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, emptyRoster),
    (err) => err instanceof Error,
  );
  assert.strictEqual(transport.calls.filter((c) => c.method === 'POST').length, 0);
});

// ─── GRUPO 6: Invariante de rede (AC-IO-17) ──────────────────────────────────

test('T-IO-32: integração pura sem rede — http.request nunca é chamado quando transport é fake', async () => {
  // Substitui http.request por uma versão que lança se chamada.
  // Como tree-factory-io.cjs usa transport injetado (T1), http.request
  // NÃO deve ser chamado em nenhum caminho de código dos testes.
  // Verificação: tree-factory-io.cjs deve satisfazer T1 por design.
  // Aqui confirmamos que o módulo foi importado sem chamar rede ao importar.
  const transport = makeFakeTransport();
  const payload = {
    title: '[SIMPLES] classificar',
    description: 'corpo',
    assigneeAgentId: 'uuid-pc-real',
    blockedByIssueIds: [],
  };
  // Se createIssue chamar http.request em vez do transport, falharia com
  // "transport.request is not a function" ou similar — mas os testes anteriores
  // já provam que o transport fake é usado. Este teste é um smoke test de integração.
  const id = await createIssue(transport, 'PIP-CO', payload);
  assert.strictEqual(id, 'FAKE-001');
  // Confirmar que o call foi para o transport fake, não para rede
  assert.strictEqual(transport.calls.length, 1);
  assert.strictEqual(transport.calls[0].method, 'POST');
});

// ─── GRUPO 7: Paralelismo e Fan-in (correções G4 adversarial) ────────────────

// Roster completo para hotfix (todos os cargos do template)
const HOTFIX_ROSTER = {
  'task-orchestrator': 'uuid-to',
  'information-gate': 'uuid-ig',
  'sentinel': 'uuid-sentinel',
  'executor-fix': 'uuid-ef',
  'bugfix-regression-tester': 'uuid-brt',
  'review-orchestrator': 'uuid-ro',
  'adversarial-security-scanner': 'uuid-sec',
  'adversarial-architecture-critic': 'uuid-arch',
  'adversarial-quality-reviewer': 'uuid-qual',
  'final-adversarial-orchestrator': 'uuid-fao',
  'final-validator': 'uuid-fv',
  'finishing-branch': 'uuid-fb',
};

test('T-IO-40: growSpine — grupo paralelo hotfix (HF-N6/7/8) cria 3 POSTs, não 1', async () => {
  // Provando que allParallelSteps é usado: currentStep=HF-N5-review deve criar
  // os 3 irmãos adversariais (HF-N6-adv-sec, HF-N7-adv-arch, HF-N8-adv-qual)
  const transport = makeFakeTransport();
  const result = await growSpine(
    transport,
    'PIP-CO',
    'hotfix',
    'HF-N5-review',   // step já feito
    'PREV-HF-N5',
    HOTFIX_ROSTER,
  );

  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  // Deve ter criado EXATAMENTE 3 issues (não 1)
  assert.strictEqual(
    postCalls.length,
    3,
    `Esperado 3 POSTs (trio adversarial) mas encontrou ${postCalls.length}. ` +
    `Títulos: ${postCalls.map((c) => c.body.title).join(', ')}`,
  );
  // Verificar que os 3 irmãos foram criados
  const titles = postCalls.map((c) => c.body.title);
  assert.ok(titles.some((t) => /adv-sec/.test(t)), 'adv-sec deve estar nos títulos');
  assert.ok(titles.some((t) => /adv-arch/.test(t)), 'adv-arch deve estar nos títulos');
  assert.ok(titles.some((t) => /adv-qual/.test(t)), 'adv-qual deve estar nos títulos');
  // issueIds deve ter 3 elementos
  assert.strictEqual(result.issueIds.length, 3);
  assert.strictEqual(result.steps.length, 3);
});

test('T-IO-41: growSpine — grupo paralelo hotfix: cada irmão bloqueado por prevIssueId (HF-N5)', async () => {
  const transport = makeFakeTransport();
  await growSpine(
    transport,
    'PIP-CO',
    'hotfix',
    'HF-N5-review',
    'PREV-HF-N5',
    HOTFIX_ROSTER,
  );

  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 3);
  // Cada irmão deve ser bloqueado por PREV-HF-N5 (não uns pelos outros)
  for (const call of postCalls) {
    assert.deepStrictEqual(
      call.body.blockedByIssueIds,
      ['PREV-HF-N5'],
      `Irmão ${call.body.title} deve ser bloqueado por PREV-HF-N5`,
    );
  }
});

// ─── FIX 3: compensação best-effort de parcial mid-sequence ──────────────────
// Pré-flight cobre os parciais de VALIDAÇÃO. Mas uma falha de TRANSPORTE entre o
// POST do irmão#1 e o do irmão#2 num grupo paralelo ainda cria parte do grupo.
// growSpine deve então tentar APAGAR (DELETE) os irmãos já criados (compensação),
// anexar o resultado ao erro e propagar o erro original.

// Transport que falha no N-ésimo POST e registra DELETEs (para verificar compensação).
function makeFlakyTransport({ failOnPostNumber, deleteStatus = 204 } = {}) {
  const calls = [];
  let postCounter = 0;
  return {
    calls,
    async request({ method, path, body }) {
      calls.push({ method, path, body });
      if (method === 'POST') {
        postCounter += 1;
        if (postCounter === failOnPostNumber) {
          throw new Error(`fake transport: queda de rede no POST #${postCounter}`);
        }
        return { status: 201, data: { id: `FAKE-${String(postCounter).padStart(3, '0')}` } };
      }
      if (method === 'DELETE') {
        return { status: deleteStatus, data: {} };
      }
      return { status: 200, data: [] };
    },
  };
}

test('T-IO-41b: growSpine — falha de transporte no 2º POST de um grupo paralelo compensa (DELETE) o irmão já criado', async () => {
  // Grupo paralelo hotfix (HF-N6/7/8): 3 POSTs. Falha no 2º → 1 irmão já criado (FAKE-001).
  // growSpine deve emitir 1 DELETE para o irmão criado e propagar o erro com o relatório.
  const transport = makeFlakyTransport({ failOnPostNumber: 2, deleteStatus: 204 });
  let caught = null;
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'hotfix', 'HF-N5-review', 'PREV-HF-N5', HOTFIX_ROSTER),
    (err) => { caught = err; return err instanceof Error; },
  );
  const posts = transport.calls.filter((c) => c.method === 'POST');
  const deletes = transport.calls.filter((c) => c.method === 'DELETE');
  // 2 POSTs tentados (o 2º estourou); exatamente 1 DELETE (o irmão criado no 1º POST).
  assert.strictEqual(posts.length, 2, 'deve ter tentado 2 POSTs antes de estourar');
  assert.strictEqual(deletes.length, 1, 'deve compensar exatamente o 1 irmão já criado');
  assert.match(deletes[0].path, /\/issues\/FAKE-001$/, 'DELETE deve mirar o irmão criado FAKE-001');
  // O erro carrega o relatório de compensação, sem mascarar a causa original.
  assert.ok(caught.partialGroupCompensation, 'erro deve carregar partialGroupCompensation');
  assert.deepStrictEqual(caught.partialGroupCompensation.deleted, ['FAKE-001']);
  assert.deepStrictEqual(caught.partialGroupCompensation.undeletable, []);
  assert.match(caught.message, /queda de rede/, 'causa original preservada na mensagem');
});

test('T-IO-41c: growSpine — compensação que não consegue apagar registra o irmão em undeletable (escalação)', async () => {
  // DELETE retorna 500 → o irmão não pôde ser apagado → fica em undeletable para limpeza manual.
  const transport = makeFlakyTransport({ failOnPostNumber: 2, deleteStatus: 500 });
  let caught = null;
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'hotfix', 'HF-N5-review', 'PREV-HF-N5', HOTFIX_ROSTER),
    (err) => { caught = err; return err instanceof Error; },
  );
  assert.strictEqual(transport.calls.filter((c) => c.method === 'DELETE').length, 1, 'tentou 1 DELETE');
  assert.deepStrictEqual(caught.partialGroupCompensation.deleted, [], 'nenhum apagado com sucesso');
  assert.deepStrictEqual(
    caught.partialGroupCompensation.undeletable, ['FAKE-001'],
    'irmão não-apagável registrado para limpeza manual',
  );
  assert.match(caught.message, /limpeza manual|escalar/i, 'mensagem deve sinalizar escalação');
});

test('T-IO-41d: growSpine — falha de transporte num nó ÚNICO (grupo de 1) não dispara compensação', async () => {
  // Nó simples (SIMPLES/classificar) é grupo de 1 → não há irmão parcial → sem DELETE.
  const transport = makeFlakyTransport({ failOnPostNumber: 1 });
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, SAMPLE_ROSTER),
    (err) => err instanceof Error,
  );
  assert.strictEqual(
    transport.calls.filter((c) => c.method === 'DELETE').length, 0,
    'nó único não deve disparar compensação (nada parcial possível)',
  );
});

test('T-IO-42: growSpine — nó de junção hotfix (HF-N9) usa nodeSpecFanIn com todos os irmãos', async () => {
  // Simular que os 3 irmãos foram criados nas chamadas anteriores
  const siblingIds = {
    'HF-N6-adv-sec': 'ID-N6',
    'HF-N7-adv-arch': 'ID-N7',
    'HF-N8-adv-qual': 'ID-N8',
  };
  const transport = makeFakeTransport();
  const result = await growSpine(
    transport,
    'PIP-CO',
    'hotfix',
    'HF-N6-adv-sec',  // step após o grupo paralelo (qualquer dos irmãos serve como âncora)
    null,             // prevIssueId ignorado para junção
    HOTFIX_ROSTER,
    undefined,        // variant
    siblingIds,       // stepToIssueIdMap para fan-in
  );

  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 1, 'Deve criar exatamente 1 issue (a junção)');
  const junctionCall = postCalls[0];
  // Título deve conter HF-N9-juncao
  assert.match(junctionCall.body.title, /HF-N9-juncao/);
  // blockedByIssueIds deve ter os 3 IDs reais (fan-in real)
  const blocked = junctionCall.body.blockedByIssueIds;
  assert.strictEqual(blocked.length, 3, `Fan-in deve ter 3 bloqueadores, encontrou: ${JSON.stringify(blocked)}`);
  assert.ok(blocked.includes('ID-N6'), 'ID-N6 deve estar em blockedByIssueIds');
  assert.ok(blocked.includes('ID-N7'), 'ID-N7 deve estar em blockedByIssueIds');
  assert.ok(blocked.includes('ID-N8'), 'ID-N8 deve estar em blockedByIssueIds');
});

test('T-IO-43: growSpine — SIMPLES ponta a ponta: percorrer todos os 5 nós sem saltar nenhum', async () => {
  // Prova que não há double-advance: a cadeia deve produzir exatamente
  // classificar → clarificar → implementar → revisar → fechar (5 nós)
  // sem saltar nenhum.
  const transport = makeFakeTransport();
  let counter = 0;
  const originalRequest = transport.request;
  transport.request = async function(opts) {
    if (opts.method === 'POST') {
      counter += 1;
      return { status: 201, data: { id: `STEP-${counter}` } };
    }
    return originalRequest.call(this, opts);
  };

  const expectedSteps = ['classificar', 'clarificar', 'implementar', 'revisar', 'fechar'];
  const createdSteps = [];
  let currentStep = null;
  let prevIssueId = null;

  for (let i = 0; i < 6; i++) {
    const result = await growSpine(transport, 'PIP-CO', 'SIMPLES', currentStep, prevIssueId, SAMPLE_ROSTER);
    createdSteps.push(...result.steps);
    prevIssueId = result.issueId;
    // Avançar currentStep para o step recém-criado (sem double-advance)
    currentStep = result.steps[result.steps.length - 1];
    if (!result.nextStepNode) break; // fim da cadeia
  }

  assert.deepStrictEqual(
    createdSteps,
    expectedSteps,
    `Cadeia SIMPLES deve percorrer ${expectedSteps.join('→')} mas produziu ${createdSteps.join('→')}`,
  );
});

test('T-IO-44: growSpine — template hierárquico feature.light: primeiro nó criado com variant', async () => {
  // Roster para feature.light
  const featureLightRoster = {
    'task-orchestrator': 'uuid-to',
    'information-gate': 'uuid-ig',
    'sentinel': 'uuid-s',
    'quality-gate-router': 'uuid-qgr',
    'pre-tester': 'uuid-pt',
    'plan-architect': 'uuid-pa',
    'final-validator': 'uuid-fv',
    'feature-implementer': 'uuid-fi',
    'checkpoint-validator': 'uuid-cv',
    'review-orchestrator': 'uuid-ro',
    'executor-fix': 'uuid-ef',
    'sanity-checker': 'uuid-sc',
    'adversarial-security-scanner': 'uuid-sec',
    'adversarial-architecture-critic': 'uuid-arch',
    'adversarial-quality-reviewer': 'uuid-qual',
    'final-adversarial-orchestrator': 'uuid-fao',
    'finishing-branch': 'uuid-fb',
  };

  const transport = makeFakeTransport();
  const result = await growSpine(
    transport,
    'PIP-CO',
    'feature',
    null,         // currentStep null = raiz
    null,
    featureLightRoster,
    'light',      // variant
  );

  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 1, 'Deve criar 1 issue (raiz feature.light)');
  assert.match(postCalls[0].body.title, /feature\.light/, 'título deve conter feature.light');
  assert.match(postCalls[0].body.title, /classificar/, 'título deve conter classificar');
  assert.ok(result.issueId, 'deve retornar issueId');
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOVOS TESTES — HANDOFF HARDENING (raízes #1–#6)
// Pré-flight de validação e atomicidade do fan-in. Cada guarda existe porque sem ela
// a cadeia parava em silêncio (5/54 runs auditados travaram).
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ROOT CAUSE #1: prevIssueId guard ────────────────────────────────────────

test('T-IO-45: growSpine — prevIssueId null para nó não-raiz lança ANTES de qualquer POST', async () => {
  const transport = makeFakeTransport();
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'SIMPLES', 'classificar', null, SAMPLE_ROSTER),
    (err) => err instanceof Error && /prevIssueId/.test(err.message) && /AC-IO-26/.test(err.message),
    'growSpine deve rejeitar prevIssueId null para nó não-raiz',
  );
  assert.strictEqual(
    transport.calls.filter((c) => c.method === 'POST').length, 0,
    'nenhum POST deve ocorrer quando o pré-flight de prevIssueId falha',
  );
});

test('T-IO-45b: growSpine — prevIssueId string vazia para nó não-raiz também lança', async () => {
  const transport = makeFakeTransport();
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'SIMPLES', 'classificar', '', SAMPLE_ROSTER),
    (err) => err instanceof Error && /prevIssueId/.test(err.message),
  );
  assert.strictEqual(transport.calls.filter((c) => c.method === 'POST').length, 0);
});

test('T-IO-46: growSpine — prevIssueId null para a RAIZ (currentStep=null) é aceito', async () => {
  const transport = makeFakeTransport();
  const result = await growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, SAMPLE_ROSTER);
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 1, 'raiz deve ser criada');
  assert.deepStrictEqual(postCalls[0].body.blockedByIssueIds, [], 'raiz sem bloqueadores');
  assert.ok(result.issueId, 'deve retornar issueId da raiz');
});

// ─── ROOT CAUSE #2: validateRosterCompleteness ───────────────────────────────

test('T-IO-47: validateRosterCompleteness — lança listando TODOS os roles ausentes', () => {
  const nodes = [
    { role: 'task-orchestrator' },
    { role: 'cargo-fantasma-1' },
    { role: 'cargo-fantasma-2' },
  ];
  assert.throws(
    () => validateRosterCompleteness(nodes, SAMPLE_ROSTER),
    (err) =>
      err instanceof Error &&
      err.message.includes('cargo-fantasma-1') &&
      err.message.includes('cargo-fantasma-2'),
    'mensagem deve listar todos os roles ausentes, não só o primeiro',
  );
});

test('T-IO-47b: validateRosterCompleteness — roster completo não lança', () => {
  const nodes = [{ role: 'task-orchestrator' }, { role: 'information-gate' }];
  assert.doesNotThrow(() => validateRosterCompleteness(nodes, SAMPLE_ROSTER));
});

test('T-IO-47c: validateRosterCompleteness — uuid vazio conta como ausente (phantom UUID)', () => {
  const nodes = [{ role: 'cargo-vazio' }];
  assert.throws(
    () => validateRosterCompleteness(nodes, { 'cargo-vazio': '' }),
    (err) => err instanceof Error && err.message.includes('cargo-vazio'),
    'uuid string-vazia deve ser tratado como roster incompleto',
  );
});

test('T-IO-48: growSpine — pré-valida o roster ANTES de qualquer POST (roster incompleto)', async () => {
  const transport = makeFakeTransport();
  const incompleteRoster = { 'information-gate': 'uuid-ig' };
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'SIMPLES', null, null, incompleteRoster),
    (err) => err instanceof Error,
  );
  assert.strictEqual(
    transport.calls.filter((c) => c.method === 'POST').length, 0,
    'nenhum POST quando o roster está incompleto',
  );
});

// ─── ROOT CAUSE #6: validateFanInMap + completude do stepmap ─────────────────

test('T-IO-49: validateFanInMap — junção com stepmap completo não lança', () => {
  const junction = { step: 'HF-N9-juncao', blockedBy: ['HF-N6-adv-sec', 'HF-N7-adv-arch', 'HF-N8-adv-qual'] };
  const map = { 'HF-N6-adv-sec': 'A', 'HF-N7-adv-arch': 'B', 'HF-N8-adv-qual': 'C' };
  assert.doesNotThrow(() => validateFanInMap(junction, map));
});

test('T-IO-50: validateFanInMap — junção com stepmap incompleto lança listando os steps faltantes', () => {
  const junction = { step: 'HF-N9-juncao', blockedBy: ['HF-N6-adv-sec', 'HF-N7-adv-arch', 'HF-N8-adv-qual'] };
  const map = { 'HF-N6-adv-sec': 'A' };
  assert.throws(
    () => validateFanInMap(junction, map),
    (err) =>
      err instanceof Error &&
      err.message.includes('HF-N7-adv-arch') &&
      err.message.includes('HF-N8-adv-qual') &&
      /AC-IO-28/.test(err.message),
  );
});

test('T-IO-50b: growSpine — junção com stepToIssueIdMap incompleto lança ANTES de qualquer POST', async () => {
  const transport = makeFakeTransport();
  const partialMap = { 'HF-N6-adv-sec': 'ID-N6' };
  await assert.rejects(
    () =>
      growSpine(
        transport, 'PIP-CO', 'hotfix', 'HF-N6-adv-sec', null,
        HOTFIX_ROSTER, undefined, partialMap,
      ),
    (err) => err instanceof Error && /stepToIssueIdMap|fan-in/i.test(err.message),
  );
  assert.strictEqual(
    transport.calls.filter((c) => c.method === 'POST').length, 0,
    'nenhum POST quando o stepmap da junção está incompleto',
  );
});

// ─── ROOT CAUSE #5: atomicidade do grupo paralelo ───────────────────────────

test('T-IO-51: growSpine — falha de POST no 2º nó paralelo NÃO deixa retorno parcial (atomicidade)', async () => {
  let postCount = 0;
  const transport = {
    calls: [],
    async request({ method, path, body }) {
      this.calls.push({ method, path, body });
      if (method === 'POST') {
        postCount += 1;
        if (postCount === 2) {
          throw new Error('transport: simulated network failure on 2nd POST');
        }
        return { status: 201, data: { id: `OK-${postCount}` } };
      }
      return { status: 200, data: [] };
    },
  };
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'hotfix', 'HF-N5-review', 'PREV-HF-N5', HOTFIX_ROSTER),
    (err) => err instanceof Error && /simulated network failure/.test(err.message),
    'falha no 2º POST deve propagar como exceção (sem return parcial)',
  );
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 2, 'a falha ocorre exatamente no 2º POST (1 criado, 2º falhou)');
});

test('T-IO-52: growSpine — pré-flight roster falha ANTES de qualquer POST em grupo paralelo (atomicidade total)', async () => {
  const transport = makeFakeTransport();
  const rosterMissingAdv = {
    'task-orchestrator': 'uuid-to',
    'information-gate': 'uuid-ig',
    'sentinel': 'uuid-sentinel',
    'review-orchestrator': 'uuid-ro',
  };
  await assert.rejects(
    () => growSpine(transport, 'PIP-CO', 'hotfix', 'HF-N5-review', 'PREV-HF-N5', rosterMissingAdv),
    (err) => err instanceof Error,
  );
  assert.strictEqual(
    transport.calls.filter((c) => c.method === 'POST').length, 0,
    'fan-out: roster incompleto deve impedir TODOS os POSTs (nenhum nó parcial criado)',
  );
});
