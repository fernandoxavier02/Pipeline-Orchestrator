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
  // Roster padrão: agentes SIMPLES/MEDIA/COMPLEXA.
  // CORREÇÃO G6: task-orchestrator é o cargo canônico de 'classificar' (emite ORCHESTRATOR_DECISION).
  // pipeline-controller permanece no roster pois é cargo válido e usado em outros testes (T-IO-29).
  const defaultRoster = [
    { id: 'uuid-to', name: 'task-orchestrator' },
    { id: 'uuid-pc', name: 'pipeline-controller' },
    { id: 'uuid-ig', name: 'information-gate' },
    { id: 'uuid-pa', name: 'plan-architect' },
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
  // CORREÇÃO G6: cargo canônico de 'classificar' é task-orchestrator, não pipeline-controller.
  const roster = [
    { id: 'uuid-to', name: 'task-orchestrator' },
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

// ─── T-CLI-56: hotfix ponta a ponta — junção fan-in via stepMap do CLI ────────

test('T-CLI-56: grow-tree CLI — hotfix ponta a ponta: percorre todos os nós incluindo junção HF-N9 via stepMap (fan-in real)', async () => {
  // Este teste prova que o caminho real do CLI consegue criar a junção HF-N9-juncao
  // usando o stepMap retornado pela chamada do grupo paralelo (HF-N6/7/8).
  // Antes da correção, runCli nunca passava stepToIssueIdMap a growSpine,
  // causando "Fan-in incompleto bloqueado" em TODOS os templates com paralelo.
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

  const allCreatedSteps = [];
  let currentStepArg = null;
  let prevIssueIdArg = null;
  let stepMapArg = null;  // JSON string do stepMap — necessário quando junção segue paralelos

  // hotfix tem 12 nós: percorrer todos sem deixar nenhum para trás
  for (let i = 0; i < 15; i++) {
    const args = ['PIP-CO', 'hotfix'];
    if (currentStepArg) args.push(currentStepArg);
    if (prevIssueIdArg) args.push(prevIssueIdArg);
    // 5º argumento: stepMap JSON para fan-in de junção (só quando vem de grupo paralelo)
    if (stepMapArg) args.push(stepMapArg);

    const output = await runCli({ args, transport, confirm: true });
    assert.strictEqual(
      output.exitCode,
      0,
      `Step ${i} (currentStep=${currentStepArg}): exitCode deve ser 0. stderr: ${output.stderr}`,
    );

    const parsed = parseJson(output.stdout);

    // Fim de cadeia: nextStep null sem issueId
    if (parsed.nextStep === null && !parsed.issueId) break;

    // Coletar steps criados
    const steps = Array.isArray(parsed.step) ? parsed.step : [parsed.step];
    allCreatedSteps.push(...steps);

    // Extrair issueId para o próximo prevIssueId (usar primeiro do grupo paralelo)
    prevIssueIdArg = Array.isArray(parsed.issueIds) && parsed.issueIds.length > 0
      ? parsed.issueIds[0]
      : parsed.issueId;

    // Propagar stepMap para a próxima chamada SE a chamada atual criou paralelos
    stepMapArg = parsed.stepMap ? JSON.stringify(parsed.stepMap) : null;

    // Contrato sem double-advance: próximo currentStep = step criado nesta chamada
    currentStepArg = parsed.nextStep;

    if (!parsed.nextStep) break;
  }

  // Verificar que a junção HF-N9-juncao foi criada (prova que fan-in funcionou)
  assert.ok(
    allCreatedSteps.includes('HF-N9-juncao'),
    `Junção HF-N9-juncao deve ter sido criada. Steps criados: ${allCreatedSteps.join('→')}`,
  );

  // Verificar que o fluxo completo foi percorrido (12 nós: HF-N0 a HF-N11)
  assert.strictEqual(
    allCreatedSteps.length,
    12,
    `hotfix deve criar 12 nós, criou ${allCreatedSteps.length}: ${allCreatedSteps.join('→')}`,
  );

  // Verificar que o trio adversarial foi criado (3 irmãos)
  assert.ok(allCreatedSteps.includes('HF-N6-adv-sec'), 'HF-N6-adv-sec deve ter sido criado');
  assert.ok(allCreatedSteps.includes('HF-N7-adv-arch'), 'HF-N7-adv-arch deve ter sido criado');
  assert.ok(allCreatedSteps.includes('HF-N8-adv-qual'), 'HF-N8-adv-qual deve ter sido criado');
});

// ─── T-CLI-57: dry-run mostra todos os nós paralelos ─────────────────────────

test('T-CLI-57: grow-tree CLI — dry-run: grupo paralelo mostra steps[] com 3 irmãos (não apenas 1)', async () => {
  // Antes da correção, dry-run usava nodeSpec single-node e mostrava 1 nó
  // mesmo quando --confirm criaria 3. Este teste prova a fidelidade do preview.
  const transport = makeFakeTransport({ rosterAgents: HOTFIX_FULL_ROSTER });
  // Avançar até HF-N5-review para que o próximo nó seja o grupo paralelo
  const output = await runCli({
    args: ['PIP-CO', 'hotfix', 'HF-N5-review', 'PREV-HF-N5'],
    transport,
    confirm: false,  // dry-run
  });

  assert.strictEqual(output.exitCode, 0, `exitCode deve ser 0. stderr: ${output.stderr}`);
  const parsed = parseJson(output.stdout);

  // O preview deve mostrar o array de steps paralelos (não um único step)
  const steps = parsed.steps || (Array.isArray(parsed.step) ? parsed.step : null);
  assert.ok(
    Array.isArray(steps),
    `dry-run para grupo paralelo deve retornar steps[] como array, recebeu: ${JSON.stringify(parsed.step)}`,
  );
  assert.strictEqual(
    steps.length,
    3,
    `dry-run deve antecipar 3 issues (trio adversarial), anunciou ${steps.length}: ${JSON.stringify(steps)}`,
  );
  assert.ok(steps.includes('HF-N6-adv-sec'), 'dry-run deve incluir HF-N6-adv-sec');
  assert.ok(steps.includes('HF-N7-adv-arch'), 'dry-run deve incluir HF-N7-adv-arch');
  assert.ok(steps.includes('HF-N8-adv-qual'), 'dry-run deve incluir HF-N8-adv-qual');
  // Nenhum POST deve ter ocorrido (invariante C1)
  const postCalls = transport.calls.filter((c) => c.method === 'POST');
  assert.strictEqual(postCalls.length, 0, 'dry-run não deve fazer nenhum POST');
});

// ─── T-CLI-58: stepMapJson inválido → exitCode 1 ─────────────────────────────

test('T-CLI-58: grow-tree CLI — stepMapJson inválido (não-JSON) retorna exitCode 1 com mensagem descritiva', async () => {
  const transport = makeFakeTransport({ rosterAgents: HOTFIX_FULL_ROSTER });
  const output = await runCli({
    args: ['PIP-CO', 'hotfix', 'HF-N6-adv-sec', 'PREV', 'NAO-E-JSON-VALIDO'],
    transport,
    confirm: true,
  });
  assert.strictEqual(output.exitCode, 1, 'exitCode deve ser 1 para stepMapJson inválido');
  assert.ok(output.stderr.length > 0, 'stderr deve conter mensagem de erro');
  assert.ok(
    output.stderr.includes('stepMapJson'),
    `stderr deve mencionar "stepMapJson". Recebido: "${output.stderr}"`,
  );
});
