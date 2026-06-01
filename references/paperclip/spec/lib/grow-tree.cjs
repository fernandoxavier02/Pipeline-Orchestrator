#!/usr/bin/env node
'use strict';
// grow-tree.cjs — G4-Braco CLI
//
// Ponto de entrada de linha de comando para criar a próxima issue da espinha
// no Paperclip. Thin wrapper sobre tree-factory-io.cjs.
//
// Argumentos: companyId complexity [currentStep] [prevIssueId]
// Flags: --confirm (sem ela, executa dry-run)
//
// Invariantes (CLI):
//   C1: sem --confirm → dry-run (imprime o que criaria, sem POST)
//   C2: com --confirm → fluxo real (GET roster + POST issue)
//   C3: saída padrão em JSON { step, issueId, title, nextStep }
//   C4: quando nextStep é null → imprime { ..., nextStep: null } e exit code 0
//   C5: erros → exit code 1 e mensagem descritiva em stderr
//
// Transport real (HttpTransport) só é instanciado quando o módulo é executado
// diretamente como CLI (require.main === module). Em testes, transport é injetado
// via runCli({ transport }) — Invariante T1 preservada.

const { nextStep, nodeSpec } = require('./tree-factory.cjs');
const { assertSafeId, resolveRole, growSpine } = require('./tree-factory-io.cjs');

// ─── HTTP TRANSPORT (produção) ────────────────────────────────────────────────
// Envolve http.request para o loopback. Só usado quando --confirm e CLI real.

function makeHttpTransport(baseUrl) {
  const http = require('http');
  const url = require('url');
  const base = baseUrl || process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100';

  return {
    request({ method, path: reqPath, body }) {
      return new Promise((resolve, reject) => {
        const parsed = url.parse(base);
        const bodyStr = body ? JSON.stringify(body) : '';
        const options = {
          hostname: parsed.hostname,
          port: parsed.port || 3100,
          path: reqPath,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
          },
        };

        const req = http.request(options, (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            let data;
            try {
              data = JSON.parse(raw);
            } catch (_) {
              data = { raw };
            }
            resolve({ status: res.statusCode, data });
          });
        });

        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
      });
    },
  };
}

// ─── INDEXAR ROSTER ──────────────────────────────────────────────────────────
// Converte array de agentes [{id, name}] em mapa nome→uuid (Invariante R1).
// Duplicatas: o PRIMEIRO registro na lista prevalece (L1 — determinístico).

function indexRoster(agents) {
  const map = {};
  for (const agent of agents) {
    if (agent.name && !Object.prototype.hasOwnProperty.call(map, agent.name)) {
      map[agent.name] = agent.id;
    }
  }
  return map;
}

// ─── FETCH ROSTER ────────────────────────────────────────────────────────────

async function fetchRoster(transport, companyId) {
  const { status, data } = await transport.request({
    method: 'GET',
    path: `/api/companies/${companyId}/agents`,
    body: null,
  });
  if (status !== 200) {
    throw new Error(
      `grow-tree/fetchRoster: falha ao buscar roster (status ${status}).`,
    );
  }
  return Array.isArray(data) ? data : [];
}

// ─── VALIDATE COMPLEXITY ─────────────────────────────────────────────────────

function validateComplexity(complexity) {
  // Verifica se nextStep consegue resolver o template
  const firstNode = nextStep(complexity, null);
  if (!firstNode) {
    throw new Error(
      `grow-tree: complexidade "${complexity}" inválida ou desconhecida. ` +
      `Valores conhecidos: SIMPLES, COMPLEXA, hotfix, review-only, e variantes hierárquicas (ex: feature.light).`,
    );
  }
}

// ─── RUN CLI (testável) ───────────────────────────────────────────────────────
/**
 * runCli({ args, transport, confirm }) → Promise<{ stdout, stderr, exitCode }>
 *
 * API testável do CLI. Em produção, usa process.argv e HttpTransport.
 * Em testes, recebe transport fake e args diretamente.
 *
 * @param {{ args: string[], transport: object, confirm: boolean }} opts
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
async function runCli({ args, transport, confirm }) {
  // args = [companyId, complexity, currentStep?, prevIssueId?]
  const [companyId, complexity, currentStep, prevIssueId] = args || [];

  let stderr = '';
  let stdout = '';

  try {
    // Validações básicas
    if (!companyId) {
      throw new Error('grow-tree: companyId é obrigatório. Uso: grow-tree companyId complexity [currentStep] [prevIssueId]');
    }
    if (!complexity) {
      throw new Error('grow-tree: complexity é obrigatório. Uso: grow-tree companyId complexity [currentStep] [prevIssueId]');
    }

    // Validar complexidade antes de qualquer I/O
    validateComplexity(complexity);

    // Resolver currentStep: string vazia ou 'null' → null
    const resolvedCurrentStep = (currentStep === undefined || currentStep === '' || currentStep === 'null')
      ? null
      : currentStep;
    const resolvedPrevIssueId = (prevIssueId === undefined || prevIssueId === '' || prevIssueId === 'null')
      ? null
      : prevIssueId;

    // Descobrir o próximo nó a criar
    const nodeToCreate = nextStep(complexity, resolvedCurrentStep);

    // C4: fim de cadeia quando currentStep já é o último nó
    if (!nodeToCreate) {
      // Se currentStep existe e nextStep retorna null → estamos no fim
      const spec = resolvedCurrentStep ? nodeSpec(complexity, resolvedCurrentStep, resolvedPrevIssueId) : null;
      const result = {
        step: resolvedCurrentStep || null,
        issueId: null,
        title: spec ? spec.title : null,
        nextStep: null,
      };
      stdout = JSON.stringify(result);
      return { stdout, stderr, exitCode: 0 };
    }

    // Montar o nodeSpec para dry-run preview
    const spec = nodeSpec(complexity, nodeToCreate.step, resolvedPrevIssueId);

    if (!confirm) {
      // C1: Dry-run — sem POST
      const nextNode = nextStep(complexity, nodeToCreate.step);
      const result = {
        step: nodeToCreate.step,
        title: spec.title,
        nextStep: nextNode ? nextNode.step : null,
      };
      stdout = JSON.stringify(result);
      return { stdout, stderr, exitCode: 0 };
    }

    // C2: --confirm → fluxo real
    // Validar safe id do companyId
    assertSafeId(companyId);

    // Buscar roster
    const agents = await fetchRoster(transport, companyId);
    const agentsById = indexRoster(agents);

    // Criar a issue via growSpine
    const { issueId, nextStepNode } = await growSpine(
      transport,
      companyId,
      complexity,
      resolvedCurrentStep,
      resolvedPrevIssueId,
      agentsById,
    );

    // C3: saída JSON
    const result = {
      step: nodeToCreate.step,
      issueId,
      title: spec.title,
      nextStep: nextStepNode ? nextStepNode.step : null,
    };
    stdout = JSON.stringify(result);
    return { stdout, stderr, exitCode: 0 };

  } catch (err) {
    stderr = err.message || String(err);
    return { stdout, stderr, exitCode: 1 };
  }
}

// ─── ENTRY POINT (CLI real) ───────────────────────────────────────────────────

if (require.main === module) {
  const argv = process.argv.slice(2);
  const confirmIdx = argv.indexOf('--confirm');
  const hasConfirm = confirmIdx !== -1;
  // Remove --confirm do array de posicionais
  const positionalArgs = argv.filter((a) => a !== '--confirm');

  const transport = makeHttpTransport();

  runCli({ args: positionalArgs, transport, confirm: hasConfirm }).then(({ stdout, stderr, exitCode }) => {
    if (stdout) process.stdout.write(stdout + '\n');
    if (stderr) process.stderr.write(stderr + '\n');
    process.exit(exitCode);
  }).catch((err) => {
    process.stderr.write(String(err.message || err) + '\n');
    process.exit(1);
  });
}

// ─── EXPORTS (para testes) ────────────────────────────────────────────────────
module.exports = { runCli, indexRoster, makeHttpTransport };
