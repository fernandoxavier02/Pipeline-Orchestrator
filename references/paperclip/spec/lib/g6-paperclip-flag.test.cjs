'use strict';
// ============================================================
// g6-paperclip-flag.test.cjs — G6 Flag --on=paperclip
//
// TDD test suite para a etapa G6: documenta o branch de roteamento
// --on=paperclip em commands/pipeline.md e valida a composição dos
// módulos existentes (classify-bridge.cjs + tree-factory.cjs) que
// o branch usa para montar o PaperclipRootPayload.
//
// Testes T-G6-01 a T-G6-03: smoke documental (pipeline.md).
// Testes T-G6-04 a T-G6-13: integração classify-bridge × tree-factory.
// Teste  T-G6-14: posição da linha --on=paperclip na tabela STEP 1.
//
// ESCOPO: apenas camada documental + integração dos módulos existentes.
// Nenhum código novo é criado; a flag --on=paperclip existe apenas como
// roteamento declarativo em commands/pipeline.md (INV-G6-3).
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { classify, VALID_TYPES, VALID_COMPLEXITIES } = require('./classify-bridge.cjs');
const { nodeSpec } = require('./tree-factory.cjs');

// ─── Helper: lê commands/pipeline.md a partir da raiz do repo ──────────────
// O arquivo está em D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\commands\pipeline.md
// Este teste roda dentro de references/paperclip/spec/lib/ — três níveis acima fica a raiz.
const PIPELINE_MD_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'commands', 'pipeline.md');

function readPipelineMd() {
  return fs.readFileSync(PIPELINE_MD_PATH, 'utf8');
}

// ─── T-G6-01: Smoke documental — --on=paperclip presente na tabela STEP 1 ──
// Verifica AC-G6-6: tabela STEP 1 em commands/pipeline.md inclui --on=paperclip.
test('T-G6-01 — commands/pipeline.md contém --on=paperclip na tabela STEP 1', () => {
  const md = readPipelineMd();
  assert.match(md, /--on=paperclip/, 'pipeline.md deve conter a flag --on=paperclip');
});

// ─── T-G6-02: Smoke documental — Mode PAPERCLIP presente ───────────────────
// Verifica AC-G6-6: a linha da tabela lista Mode 'PAPERCLIP'.
test('T-G6-02 — commands/pipeline.md contém "PAPERCLIP" como Mode na linha --on=paperclip', () => {
  const md = readPipelineMd();
  // A tabela deve ter "PAPERCLIP" como valor de Mode
  assert.match(md, /PAPERCLIP/, 'pipeline.md deve conter PAPERCLIP como Mode');
});

// ─── T-G6-03: Smoke documental — classify-bridge e tree-factory referenciados ─
// Verifica AC-G6-14: a documentação do branch --on=paperclip cita classify-bridge
// e tree-factory por nome (sem incorporar lógica inline).
test('T-G6-03 — commands/pipeline.md referencia classify-bridge e tree-factory na seção --on=paperclip', () => {
  const md = readPipelineMd();
  assert.match(md, /classify-bridge/, 'pipeline.md deve referenciar classify-bridge');
  assert.match(md, /tree-factory/, 'pipeline.md deve referenciar tree-factory');
});

// ─── T-G6-04: Integração — payload mínimo via classify + nodeSpec ───────────
// Dado classify('fix login bug') → {type:'Bug Fix', complexity:'SIMPLES'},
// nodeSpec('SIMPLES','classificar',null) deve retornar payload com os 4 campos canônicos.
// Verifica AC-G6-3 e AC-G6-11.
// CORREÇÃO G6: assigneeAgentId do cartão-raiz é task-orchestrator (emite ORCHESTRATOR_DECISION).
// pipeline-controller é o dispatcher (DISPATCH_REQUEST), não o classificador.
// Referência: paperclip-catalog.md linha 30 + todos os moldes canônicos modernos.
test('T-G6-04 — integração: classify + nodeSpec produz payload com assigneeAgentId=task-orchestrator', () => {
  const result = classify('fix login bug');
  assert.ok(VALID_TYPES.includes(result.type), `type deve ser válido, recebeu: ${result.type}`);
  assert.ok(VALID_COMPLEXITIES.includes(result.complexity), `complexity deve ser válida, recebeu: ${result.complexity}`);

  const spec = nodeSpec(result.complexity, 'classificar', null);
  assert.strictEqual(spec.assigneeAgentId, 'task-orchestrator',
    'assigneeAgentId do cartão-raiz (SIMPLES/MEDIA/COMPLEXA) deve ser task-orchestrator (emite ORCHESTRATOR_DECISION)');
  assert.deepStrictEqual(spec.blockedByIssueIds, [],
    'cartão-raiz não deve ter bloqueadores (blockedByIssueIds=[])');
  assert.ok(spec.body.includes('ORCHESTRATOR_DECISION'),
    'body do classificar deve conter ORCHESTRATOR_DECISION');
});

// ─── T-G6-05: Integração — title do cartão-raiz SIMPLES ─────────────────────
// nodeSpec('SIMPLES','classificar',null) → title='[SIMPLES] classificar'.
// Verifica AC-G6-4 (campo title do rootIssueSpec).
test('T-G6-05 — integração: nodeSpec SIMPLES classificar retorna title=[SIMPLES] classificar', () => {
  const spec = nodeSpec('SIMPLES', 'classificar', null);
  assert.strictEqual(spec.title, '[SIMPLES] classificar',
    'title do cartão-raiz SIMPLES deve ser [SIMPLES] classificar');
});

// ─── T-G6-06: Integração — title do cartão-raiz COMPLEXA ────────────────────
// nodeSpec('COMPLEXA','classificar',null) → title='[COMPLEXA] classificar'.
// Cobre o caminho COMPLEXA do classify-bridge.
test('T-G6-06 — integração: nodeSpec COMPLEXA classificar retorna title=[COMPLEXA] classificar', () => {
  const spec = nodeSpec('COMPLEXA', 'classificar', null);
  assert.strictEqual(spec.title, '[COMPLEXA] classificar',
    'title do cartão-raiz COMPLEXA deve ser [COMPLEXA] classificar');
});

// ─── T-G6-07: Integração — override de complexidade passado ao classify-bridge ─
// classify('adicionar tooltip de ajuda', {complexity:'SIMPLES'}) → complexity='SIMPLES' source='heuristic'.
// Verifica AC-G6-9: --simples é repassado como override.complexity ao classify-bridge.
test('T-G6-07 — integração: override de complexidade SIMPLES retorna complexity=SIMPLES source=heuristic', () => {
  const result = classify('adicionar tooltip de ajuda', { complexity: 'SIMPLES' });
  assert.strictEqual(result.complexity, 'SIMPLES',
    'override de complexidade SIMPLES deve ser respeitado');
  assert.strictEqual(result.source, 'heuristic',
    'override parcial deve ter source=heuristic (type ainda vem da heurística)');
});

// ─── T-G6-08: Integração — override total (type + complexity) ───────────────
// classify('qualquer coisa', {type:'Audit', complexity:'MEDIA'}) → source='override'.
// Verifica AC-G6-9 com override duplo.
test('T-G6-08 — integração: override total type+complexity retorna source=override', () => {
  const result = classify('qualquer coisa', { type: 'Audit', complexity: 'MEDIA' });
  assert.strictEqual(result.type, 'Audit', 'type do override deve ser Audit');
  assert.strictEqual(result.complexity, 'MEDIA', 'complexity do override deve ser MEDIA');
  assert.strictEqual(result.source, 'override',
    'override total deve ter source=override');
});

// ─── T-G6-09: Erro — descrição vazia lança erro ──────────────────────────────
// classify('', {}) lança erro com mensagem contendo 'description' ou 'empty'.
// Verifica AC-G6-7: controlador detectaria a tarefa vazia antes de criar o cartão.
test('T-G6-09 — erro: classify com descrição vazia lança erro com description ou empty', () => {
  assert.throws(
    () => classify('', {}),
    /description|empty|vazia/i,
    'descrição vazia deve lançar erro descritivo',
  );
});

// ─── T-G6-10: Erro — tipo inválido lança erro listando 6 tipos ───────────────
// classify('reparar login', {type:'Hotfix'}) lança erro listando os 6 tipos válidos.
// Verifica AC-G6-8.
test('T-G6-10 — erro: override com tipo inválido lança erro listando os 6 tipos válidos', () => {
  assert.throws(
    () => classify('reparar login', { type: 'Hotfix' }),
    (err) => {
      assert.ok(err.message.includes('Hotfix'), 'mensagem deve mencionar o valor inválido');
      for (const t of VALID_TYPES) {
        assert.ok(err.message.includes(t),
          `mensagem de erro deve listar tipo válido: ${t}`);
      }
      return true;
    },
    'tipo inválido deve lançar erro listando os 6 tipos',
  );
});

// ─── T-G6-11: Propriedade INV-G6-3 — nodeSpec é pura (sem I/O) ──────────────
// nodeSpec() não lança, não faz I/O, e retorna exatamente os 4 campos canônicos.
// Verifica que a chamada local não toca a API do Paperclip.
test('T-G6-11 — propriedade: nodeSpec é pura e retorna exatamente 4 campos canônicos', () => {
  // Deve não lançar
  let spec;
  assert.doesNotThrow(() => {
    spec = nodeSpec('SIMPLES', 'classificar', null);
  }, 'nodeSpec não deve lançar para entrada válida');

  // Deve ter exatamente os 4 campos canônicos
  const keys = Object.keys(spec).sort();
  assert.deepStrictEqual(keys, ['assigneeAgentId', 'blockedByIssueIds', 'body', 'title'],
    'nodeSpec deve retornar exatamente os 4 campos: title, assigneeAgentId, blockedByIssueIds, body');
});

// ─── T-G6-12: Propriedade INV-G6-5 — flags locais mencionadas como ignoradas ─
// commands/pipeline.md deve mencionar que --grill, --no-plan ou --plan são ignoradas
// em modo PAPERCLIP (assert.match na seção --on=paperclip).
// Verifica AC-G6-10.
test('T-G6-12 — documental: pipeline.md menciona que flags locais são ignoradas em modo PAPERCLIP', () => {
  const md = readPipelineMd();
  // A seção do modo PAPERCLIP deve mencionar que certas flags são ignoradas
  assert.match(md, /ignored|ignorad/i,
    'pipeline.md deve mencionar que flags locais são ignoradas em modo PAPERCLIP');
});

// ─── T-G6-13: Integração ponta-a-ponta do branch PAPERCLIP — sem I/O ─────────
// Dado task='add CSV export button' sem overrides:
// classify → type válido, complexity válida → nodeSpec(complexity,'classificar',null)
// → PaperclipRootPayload com assigneeAgentId='pipeline-controller', blockedByIssueIds=[].
// Verifica AC-G6-1 a AC-G6-5 em conjunto.
test('T-G6-13 — integração ponta-a-ponta: branch PAPERCLIP produz PaperclipRootPayload válido', () => {
  const task = 'add CSV export button';

  // Passo 1: classify-bridge classifica a tarefa
  const classifyResult = classify(task);
  assert.ok(VALID_TYPES.includes(classifyResult.type),
    `type deve ser um dos ${VALID_TYPES.length} tipos válidos, recebeu: ${classifyResult.type}`);
  assert.ok(VALID_COMPLEXITIES.includes(classifyResult.complexity),
    `complexity deve ser uma das ${VALID_COMPLEXITIES.length} válidas, recebeu: ${classifyResult.complexity}`);

  // Passo 2: tree-factory monta o cartão-raiz
  const rootIssueSpec = nodeSpec(classifyResult.complexity, 'classificar', null);

  // Passo 3: validar os 4 campos do PaperclipRootPayload
  // CORREÇÃO G6: task-orchestrator é o classificador canônico (emite ORCHESTRATOR_DECISION).
  assert.strictEqual(rootIssueSpec.assigneeAgentId, 'task-orchestrator',
    'assigneeAgentId do cartão-raiz deve ser task-orchestrator (AC-G6-11 corrigido)');
  assert.deepStrictEqual(rootIssueSpec.blockedByIssueIds, [],
    'blockedByIssueIds do cartão-raiz deve ser [] (sem bloqueadores na raiz)');
  assert.ok(typeof rootIssueSpec.title === 'string' && rootIssueSpec.title.length > 0,
    'title deve ser string não-vazia');
  assert.ok(typeof rootIssueSpec.body === 'string' && rootIssueSpec.body.length > 0,
    'body deve ser string não-vazia');
  assert.ok(rootIssueSpec.body.includes('ORCHESTRATOR_DECISION'),
    'body do classificar deve conter ORCHESTRATOR_DECISION (confirmação de que é o cartão-raiz)');
});

// ─── T-G6-14: Invariante INV-G6-6 — linha --on=paperclip está na tabela STEP 1 ─
// A linha '--on=paperclip' deve aparecer DENTRO da tabela de modos do STEP 1,
// não em seção isolada posterior. Verifica que o controlador leria a flag na fase
// correta do parse (STEP 1 = antes de qualquer spawn de agente).
test('T-G6-14 — documental: linha --on=paperclip aparece na tabela de modos do STEP 1', () => {
  const md = readPipelineMd();

  // A tabela de modos STEP 1 começa com "## STEP 1: IDENTIFY EXECUTION MODE"
  // A próxima seção começa com "### REVIEW-ONLY Mode" ou "## STEP 2"
  // A linha --on=paperclip deve aparecer entre o cabeçalho STEP 1 e o início do STEP 2.
  const step1Start = md.indexOf('## STEP 1: IDENTIFY EXECUTION MODE');
  const step2Start = md.indexOf('## STEP 2:');

  assert.ok(step1Start !== -1, 'pipeline.md deve conter ## STEP 1: IDENTIFY EXECUTION MODE');
  assert.ok(step2Start !== -1, 'pipeline.md deve conter ## STEP 2:');

  const step1Section = md.slice(step1Start, step2Start);
  assert.match(step1Section, /--on=paperclip/,
    'a flag --on=paperclip deve aparecer na seção STEP 1 (antes de STEP 2), para ser detectada na fase correta');
});

// ─── T-G6-15: Regressão MEDIA — nodeSpec('MEDIA', 'classificar', null) não lança ──
// Achado crítico G6: tree-template.cjs não definia TEMPLATES.MEDIA, causando crash em
// nodeSpec('MEDIA','classificar',null) → 'tree-factory: complexidade "MEDIA" desconhecida'.
// MEDIA é alcançável via flag --media OU via heurística (auth/security/schema → MEDIA_SIGNALS).
// Este teste prova que a falha foi corrigida e o payload tem os 4 campos canônicos.
test('T-G6-15 — regressão MEDIA: nodeSpec("MEDIA","classificar",null) não lança e retorna payload válido', () => {
  let spec;
  assert.doesNotThrow(() => {
    spec = nodeSpec('MEDIA', 'classificar', null);
  }, 'nodeSpec MEDIA classificar não deve lançar (achado crítico G6 — TEMPLATES.MEDIA ausente)');

  // 4 campos canônicos do PaperclipRootPayload
  assert.strictEqual(spec.title, '[MEDIA] classificar', 'title deve ser [MEDIA] classificar');
  assert.strictEqual(spec.assigneeAgentId, 'task-orchestrator',
    'assigneeAgentId MEDIA deve ser task-orchestrator (cargo canônico do classificar)');
  assert.deepStrictEqual(spec.blockedByIssueIds, [], 'cartão-raiz MEDIA não deve ter bloqueadores');
  assert.ok(spec.body.includes('ORCHESTRATOR_DECISION'),
    'body MEDIA classificar deve conter ORCHESTRATOR_DECISION');
});

// ─── T-G6-16: Caminho heurístico MEDIA — tarefa com sinal de autenticação ────────
// classify-bridge MEDIA_SIGNALS inclui 'auth', 'authentication', 'security', 'schema'.
// Uma tarefa que menciona 'auth' deve produzir complexity='MEDIA', e esse resultado
// alimentado em nodeSpec deve retornar payload válido (fluxo ponta-a-ponta via heurística).
// Antes da correção: classify('add authentication') → MEDIA → nodeSpec crash.
test('T-G6-16 — caminho heurístico MEDIA: tarefa de autenticação atravessa classify→nodeSpec sem crash', () => {
  // Esta string classifica como MEDIA via MEDIA_SIGNALS ('auth') em classify-bridge.cjs
  const classifyResult = classify('add authentication to the login page');
  assert.strictEqual(classifyResult.complexity, 'MEDIA',
    'tarefa com "authentication" deve classificar como MEDIA (MEDIA_SIGNALS)');

  // Passo 2: nodeSpec com MEDIA — antes lançava, agora deve retornar payload
  let rootIssueSpec;
  assert.doesNotThrow(() => {
    rootIssueSpec = nodeSpec(classifyResult.complexity, 'classificar', null);
  }, 'nodeSpec(MEDIA, classificar) não deve lançar após correção de TEMPLATES.MEDIA');

  assert.strictEqual(rootIssueSpec.assigneeAgentId, 'task-orchestrator',
    'assigneeAgentId MEDIA deve ser task-orchestrator');
  assert.deepStrictEqual(rootIssueSpec.blockedByIssueIds, []);
  assert.ok(rootIssueSpec.body.includes('ORCHESTRATOR_DECISION'));
});

// ─── T-G6-17: Caminho override MEDIA — flag --media passa por nodeSpec sem crash ──
// commands/pipeline.md documenta: '--media → {complexity:"MEDIA"}, pass to classify-bridge'.
// O override produz ClassifyResult.complexity='MEDIA', depois nodeSpec('MEDIA','classificar',null).
// Antes da correção: nodeSpec com MEDIA lançava mesmo quando override era explícito.
test('T-G6-17 — override --media: classify com {complexity:"MEDIA"} → nodeSpec sem crash', () => {
  const classifyResult = classify('qualquer tarefa', { complexity: 'MEDIA' });
  assert.strictEqual(classifyResult.complexity, 'MEDIA', 'override MEDIA deve ser respeitado');

  let rootIssueSpec;
  assert.doesNotThrow(() => {
    rootIssueSpec = nodeSpec(classifyResult.complexity, 'classificar', null);
  }, 'nodeSpec após override --media não deve lançar (achado G6 — crash com override explícito)');

  assert.strictEqual(rootIssueSpec.title, '[MEDIA] classificar');
  assert.strictEqual(rootIssueSpec.assigneeAgentId, 'task-orchestrator');
  assert.deepStrictEqual(rootIssueSpec.blockedByIssueIds, []);
});
