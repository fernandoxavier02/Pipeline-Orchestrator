'use strict';
// grow-tree.test.cjs — G4-Braco CLI (testes TDD-first)
// Cobre: grow-tree.cjs CLI com transport injetado via env/require.
//
// Estratégia de teste CLI:
// grow-tree.cjs exporta uma função runCli(args, transport, rosterOverride)
// que pode ser chamada diretamente nos testes sem spawn de processo.
// Os testes de exit code verificam o valor retornado pela função ou
// a exceção lançada (com código associado).
//
// AC-IO-17: nenhum teste abre socket TCP real.

const { test } = require('node:test');
const assert = require('node:assert');

// Import do CLI como módulo testável
const { runCli } = require('./grow-tree.cjs');

// ─── FAKE TRANSPORT ───────────────────────────────────────────────────────────

function makeFakeTransport({ rosterAgents, postId = 'FAKE-001', alwaysStatus } = {}) {
  const calls = [];
  // Roster padrão: agentes SIMPLES
  const defaultRoster = [
    { id: 'uuid-pc', name: 'pipeline-controller' },
    { id: 'uuid-ig', name: 'information-gate' },
    { id: 'uuid-fi', name: 'feature-implementer' },
    { id: 'uuid-arc', name: 'adversarial-review-coordinator' },
    { id: 'uuid-fv', name: 'final-validator' },
  ];
  const roster = rosterAgents || defaultRoster;

  const transport = {
    calls,
    async request({ method, path, body }) {
      calls.push({ method, path, body });
      if (alwaysStatus && alwaysStatus !== 200 && alwaysStatus !== 201) {
        return { status: alwaysStatus, data: { error: 'forced error' } };
      }
      if (method === 'GET') {
        return { status: 200, data: roster };
      }
      if (method === 'POST') {
        return { status: 201, data: { id: postId } };
      }
      return { status: 404, data: {} };
    },
  };
  return transport;
}

// ─── HELPER: parsear stdout ───────────────────────────────────────────────────

function parseJson(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    throw new Error(`stdout não é JSON válido: "${str}" — erro: ${e.message}`);
  }
}

// ─── T-IO-26: dry-run (sem --confirm) ────────────────────────────────────────

test('T-IO-26: grow-tree CLI — sem --confirm, nenhum POST é registrado e stdout é JSON com step e title', async () => {
  const transport = makeFakeTransport();
  const output = await runCli({
    args: ['PIP-CO', 'SIMPLES'],
    transport,
    confirm: false,
  });

  // Nenhum POST deve ter ocorrido
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 0);

  // stdout deve ser JSON com step e title
  const parsed = parseJson(output.stdout);
  assert.ok(parsed.step, 'deve ter campo step');
  assert.ok(parsed.title, 'deve ter campo title');
  assert.strictEqual(output.exitCode, 0);
});

// ─── T-IO-27: --confirm cria a issue ─────────────────────────────────────────

test('T-IO-27: grow-tree CLI — com --confirm, transport registra 1 GET (roster) e 1 POST (issue), stdout é JSON com issueId', async () => {
  const transport = makeFakeTransport({ postId: 'FAKE-001' });
  const output = await runCli({
    args: ['PIP-CO', 'SIMPLES'],
    transport,
    confirm: true,
  });

  const getCalls = transport.calls.filter((c) => c.method === 'GET');
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(getCalls.length, 1, 'deve ter 1 GET para o roster');
  assert.strictEqual(postCalls.length, 1, 'deve ter 1 POST para criar a issue');

  const parsed = parseJson(output.stdout);
  assert.strictEqual(parsed.issueId, 'FAKE-001');
  assert.strictEqual(output.exitCode, 0);
});

// ─── T-IO-28: complexidade inválida → exit code 1 ────────────────────────────

test('T-IO-28: grow-tree CLI — com --confirm e complexidade inválida, exit code = 1', async () => {
  const transport = makeFakeTransport();
  const output = await runCli({
    args: ['PIP-CO', 'INVALIDA'],
    transport,
    confirm: true,
  });
  assert.strictEqual(output.exitCode, 1);
  assert.ok(output.stderr.length > 0, 'stderr deve ter mensagem de erro');
});

// ─── T-IO-29: cargo ausente → exit code 1, stderr não vazio ─────────────────

test('T-IO-29: grow-tree CLI — com --confirm e cargo ausente no roster, exit code = 1 e stderr não vazio', async () => {
  // Roster sem o cargo 'pipeline-controller' que o passo 'classificar' exige
  const transport = makeFakeTransport({
    rosterAgents: [
      { id: 'uuid-other', name: 'some-other-agent' },
    ],
  });
  const output = await runCli({
    args: ['PIP-CO', 'SIMPLES'],
    transport,
    confirm: true,
  });
  assert.strictEqual(output.exitCode, 1);
  assert.ok(output.stderr.length > 0, 'stderr deve descrever o cargo ausente');
});

// ─── T-IO-30: último nó do molde → nextStep=null, exit code 0, zero POSTs ───

test('T-IO-30: grow-tree CLI — currentStep é o último nó do molde SIMPLES ("fechar"), nextStep=null no stdout, exit code 0, zero POSTs', async () => {
  const transport = makeFakeTransport();
  // 'fechar' é o último step de SIMPLES (next: null)
  const output = await runCli({
    args: ['PIP-CO', 'SIMPLES', 'fechar', 'PREV-ID'],
    transport,
    confirm: true,
  });

  // Nenhuma issue deve ser criada (fim de cadeia)
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 0);

  const parsed = parseJson(output.stdout);
  assert.strictEqual(parsed.nextStep, null);
  assert.strictEqual(output.exitCode, 0);
});

// ─── T-IO-31: stdout é JSON válido em todos os cenários de sucesso ────────────

test('T-IO-31: grow-tree CLI — saída stdout é JSON válido parseable por JSON.parse em todos os cenários de sucesso', async () => {
  const transport = makeFakeTransport();

  // Cenário 1: dry-run raiz
  const output1 = await runCli({ args: ['PIP-CO', 'SIMPLES'], transport, confirm: false });
  assert.doesNotThrow(() => parseJson(output1.stdout), 'dry-run raiz deve ser JSON válido');

  // Cenário 2: --confirm raiz
  const transport2 = makeFakeTransport({ postId: 'FAKE-001' });
  const output2 = await runCli({ args: ['PIP-CO', 'SIMPLES'], transport: transport2, confirm: true });
  assert.doesNotThrow(() => parseJson(output2.stdout), '--confirm raiz deve ser JSON válido');

  // Cenário 3: fim de cadeia
  const transport3 = makeFakeTransport();
  const output3 = await runCli({ args: ['PIP-CO', 'SIMPLES', 'fechar', 'PREV'], transport: transport3, confirm: true });
  assert.doesNotThrow(() => parseJson(output3.stdout), 'fim de cadeia deve ser JSON válido');

  // Verificar campos obrigatórios no cenário --confirm
  const json2 = parseJson(output2.stdout);
  assert.ok('step' in json2, 'deve ter campo step');
  assert.ok('issueId' in json2, 'deve ter campo issueId');
  assert.ok('title' in json2, 'deve ter campo title');
  assert.ok('nextStep' in json2, 'deve ter campo nextStep');
});

// ─── T-IO-27b: dry-run campos corretos ───────────────────────────────────────

test('T-IO-27b: grow-tree CLI — dry-run: campos step e title presentes, issueId ausente ou null', async () => {
  const transport = makeFakeTransport();
  const output = await runCli({
    args: ['PIP-CO', 'SIMPLES'],
    transport,
    confirm: false,
  });

  const parsed = parseJson(output.stdout);
  assert.ok(parsed.step, 'campo step presente no dry-run');
  assert.ok(parsed.title, 'campo title presente no dry-run');
  // issueId deve estar ausente ou ser null no dry-run (não criamos issue)
  const hasIssueId = 'issueId' in parsed && parsed.issueId !== null && parsed.issueId !== undefined;
  assert.ok(!hasIssueId, 'issueId não deve estar presente ou deve ser null no dry-run');
});

// ─── G4 Adversarial fixes: sem double-advance, variant, paralelo ─────────────

// Roster completo para hotfix (todos os cargos)
const HOTFIX_FULL_ROSTER = [
  { id: 'uuid-to', name: 'task-orchestrator' },
  { id: 'uuid-ig', name: 'information-gate' },
  { id: 'uuid-sentinel', name: 'sentinel' },
  { id: 'uuid-ef', name: 'executor-fix' },
  { id: 'uuid-brt', name: 'bugfix-regression-tester' },
  { id: 'uuid-ro', name: 'review-orchestrator' },
  { id: 'uuid-sec', name: 'adversarial-security-scanner' },
  { id: 'uuid-arch', name: 'adversarial-architecture-critic' },
  { id: 'uuid-qual', name: 'adversarial-quality-reviewer' },
  { id: 'uuid-fao', name: 'final-adversarial-orchestrator' },
  { id: 'uuid-fv', name: 'final-validator' },
  { id: 'uuid-fb', name: 'finishing-branch' },
];

test('T-CLI-50: grow-tree CLI — SIMPLES ponta a ponta: percorrer todos os 5 nós sem saltar nenhum (sem double-advance)', async () => {
  // Prova que o contrato de continuação está correto: a cadeia deve percorrer
  // classificar → clarificar → implementar → revisar → fechar (5 nós)
  // sem saltar nenhum.
  const roster = [
    { id: 'uuid-pc', name: 'pipeline-controller' },
    { id: 'uuid-ig', name: 'information-gate' },
    { id: 'uuid-fi', name: 'feature-implementer' },
    { id: 'uuid-arc', name: 'adversarial-review-coordinator' },
    { id: 'uuid-fv', name: 'final-validator' },
  ];

  let idCounter = 0;
  const transport = {
    calls: [],
    async request({ method, path, body }) {
      this.calls.push({ method, path, body });
      if (method === 'GET') return { status: 200, data: roster };
      idCounter += 1;
      return { status: 201, data: { id: `STEP-${idCounter}` } };
    },
  };

  const expectedSteps = ['classificar', 'clarificar', 'implementar', 'revisar', 'fechar'];
  const createdSteps = [];
  let currentStepArg = null;  // null = começa da raiz
  let prevIssueIdArg = null;

  for (let i = 0; i < 6; i++) {
    const args = ['PIP-CO', 'SIMPLES'];
    if (currentStepArg) args.push(currentStepArg);
    if (prevIssueIdArg) args.push(prevIssueIdArg);

    const output = await runCli({ args, transport, confirm: true });
    assert.strictEqual(output.exitCode, 0, `Step ${i}: exitCode deve ser 0. stderr: ${output.stderr}`);

    const parsed = parseJson(output.stdout);

    // Fim de cadeia: nextStep é null e não há issueId
    if (parsed.nextStep === null && !parsed.issueId) break;
    if (!parsed.issueId) break;  // fim sem mais nós

    const stepCreated = Array.isArray(parsed.step) ? parsed.step[0] : parsed.step;
    createdSteps.push(stepCreated);
    prevIssueIdArg = parsed.issueId;
    // Contrato sem double-advance: o próximo currentStep é o step CRIADO nesta chamada
    currentStepArg = parsed.nextStep;

    if (!parsed.nextStep) break;
  }

  assert.deepStrictEqual(
    createdSteps,
    expectedSteps,
    `Cadeia SIMPLES deve percorrer ${expectedSteps.join('→')} mas produziu ${createdSteps.join('→')}`,
  );
});

test('T-CLI-51: grow-tree CLI — hotfix: complexidade aceita e primeiro nó criado corretamente', async () => {
  const transport = makeFakeTransport({ rosterAgents: HOTFIX_FULL_ROSTER });
  const output = await runCli({
    args: ['PIP-CO', 'hotfix'],
    transport,
    confirm: true,
  });

  assert.strictEqual(output.exitCode, 0, `exitCode deve ser 0. stderr: ${output.stderr}`);
  const parsed = parseJson(output.stdout);
  const step = Array.isArray(parsed.step) ? parsed.step[0] : parsed.step;
  assert.match(step, /HF-N0-classificar/, 'primeiro step de hotfix deve ser HF-N0-classificar');
  assert.ok(parsed.issueId, 'deve retornar issueId');
});

test('T-CLI-52: grow-tree CLI — hotfix grupo paralelo: avançar até HF-N5-review e verificar que cria 3 issues no passo seguinte', async () => {
  let idCounter = 0;
  const transport = {
    calls: [],
    async request({ method, path, body }) {
      this.calls.push({ method, path, body });
      if (method === 'GET') return { status: 200, data: HOTFIX_FULL_ROSTER };
      idCounter += 1;
      return { status: 201, data: { id: `HF-${String(idCounter).padStart(3, '0')}` } };
    },
  };

  // Percorrer até HF-N5-review
  let currentStepArg = null;
  let prevIssueIdArg = null;
  let lastOutput = null;

  for (let i = 0; i < 10; i++) {
    const args = ['PIP-CO', 'hotfix'];
    if (currentStepArg) args.push(currentStepArg);
    if (prevIssueIdArg) args.push(prevIssueIdArg);

    const output = await runCli({ args, transport, confirm: true });
    assert.strictEqual(output.exitCode, 0, `Step ${i}: exitCode deve ser 0. stderr: ${output.stderr}`);
    const parsed = parseJson(output.stdout);

    const stepCreated = Array.isArray(parsed.step) ? parsed.step[0] : parsed.step;
    prevIssueIdArg = Array.isArray(parsed.issueIds) ? parsed.issueIds[0] : parsed.issueId;
    currentStepArg = parsed.nextStep;
    lastOutput = parsed;

    // Parar quando chegarmos ao grupo paralelo (step criado = HF-N5-review)
    if (stepCreated === 'HF-N5-review') {
      // Fazer mais uma chamada: deve criar os 3 irmãos adversariais
      const transport_calls_before = transport.calls.filter((c) => c.method === 'POST').length;
      const args2 = ['PIP-CO', 'hotfix', currentStepArg, prevIssueIdArg];
      const output2 = await runCli({ args: args2, transport, confirm: true });
      assert.strictEqual(output2.exitCode, 0, `Grupo paralelo: exitCode deve ser 0. stderr: ${output2.stderr}`);
      const parsed2 = parseJson(output2.stdout);
      const transport_calls_after = transport.calls.filter((c) => c.method === 'POST').length;
      const newPosts = transport_calls_after - transport_calls_before;

      assert.strictEqual(
        newPosts,
        3,
        `Grupo adversarial deve criar 3 issues, criou ${newPosts}. step: ${JSON.stringify(parsed2.step)}`,
      );
      break;
    }

    if (!parsed.nextStep) break;
  }
});

test('T-CLI-53: grow-tree CLI — feature.light aceita e cria primeiro nó corretamente', async () => {
  const featureLightRoster = [
    { id: 'uuid-to', name: 'task-orchestrator' },
    { id: 'uuid-ig', name: 'information-gate' },
    { id: 'uuid-s', name: 'sentinel' },
    { id: 'uuid-qgr', name: 'quality-gate-router' },
    { id: 'uuid-pt', name: 'pre-tester' },
    { id: 'uuid-pa', name: 'plan-architect' },
    { id: 'uuid-fv', name: 'final-validator' },
    { id: 'uuid-fi', name: 'feature-implementer' },
    { id: 'uuid-cv', name: 'checkpoint-validator' },
    { id: 'uuid-ro', name: 'review-orchestrator' },
    { id: 'uuid-ef', name: 'executor-fix' },
    { id: 'uuid-sc', name: 'sanity-checker' },
    { id: 'uuid-sec', name: 'adversarial-security-scanner' },
    { id: 'uuid-arch', name: 'adversarial-architecture-critic' },
    { id: 'uuid-qual', name: 'adversarial-quality-reviewer' },
    { id: 'uuid-fao', name: 'final-adversarial-orchestrator' },
    { id: 'uuid-fb', name: 'finishing-branch' },
  ];

  const transport = makeFakeTransport({ rosterAgents: featureLightRoster });
  const output = await runCli({
    args: ['PIP-CO', 'feature.light'],
    transport,
    confirm: true,
  });

  assert.strictEqual(output.exitCode, 0, `exitCode deve ser 0. stderr: ${output.stderr}`);
  const parsed = parseJson(output.stdout);
  const step = Array.isArray(parsed.step) ? parsed.step[0] : parsed.step;
  assert.strictEqual(step, 'classificar', 'primeiro step de feature.light deve ser classificar');
  assert.ok(parsed.issueId, 'deve retornar issueId');
});

test('T-CLI-54: grow-tree CLI — feature.light inválido como complexity sem variante retorna exitCode 1', async () => {
  // 'feature' sem variante deve falhar (não é legacy flat)
  const transport = makeFakeTransport();
  const output = await runCli({
    args: ['PIP-CO', 'feature'],
    transport,
    confirm: false,
  });
  // 'feature' sem variant não tem template flat — deve retornar erro
  assert.strictEqual(output.exitCode, 1, 'feature sem variant deve falhar');
  assert.ok(output.stderr.length > 0, 'stderr deve conter mensagem de erro');
});

test('T-CLI-55: grow-tree CLI — nextStep no output é o step CRIADO (não o seguinte), prevenindo double-advance', async () => {
  // Verifica que o campo nextStep na saída JSON é igual ao step criado
  // (não ao nó que vem depois dele). Isso é o contrato que previne double-advance.
  const transport = makeFakeTransport({ postId: 'FAKE-001' });
  const output = await runCli({
    args: ['PIP-CO', 'SIMPLES'],
    transport,
    confirm: true,
  });

  assert.strictEqual(output.exitCode, 0);
  const parsed = parseJson(output.stdout);
  // O step criado deve ser 'classificar' (primeiro de SIMPLES)
  assert.strictEqual(parsed.step, 'classificar', 'step criado deve ser classificar');
  // O nextStep deve ser o step CRIADO (classificar), não o seguinte (clarificar)
  assert.strictEqual(
    parsed.nextStep,
    'classificar',
    `nextStep deve ser o step criado (classificar) para prevenir double-advance, mas recebeu "${parsed.nextStep}"`,
  );
});
