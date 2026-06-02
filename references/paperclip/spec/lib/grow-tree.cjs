#!/usr/bin/env node
'use strict';
// grow-tree.cjs — G4-Braco CLI
//
// Ponto de entrada de linha de comando para criar a próxima issue da espinha
// no Paperclip. Thin wrapper sobre tree-factory-io.cjs.
//
// Argumentos: companyId complexity[.variant] [currentStep] [prevIssueId]
//
// Exemplos:
//   grow-tree PIP-CO SIMPLES                          # raiz, dry-run
//   grow-tree PIP-CO SIMPLES --confirm                # raiz, confirma
//   grow-tree PIP-CO feature.light --confirm          # hierárquico light
//   grow-tree PIP-CO hotfix classificar PREV-ID --confirm  # continua a espinha
//
// Flags: --confirm (sem ela, executa dry-run)
//
// Invariantes (CLI):
//   C1: sem --confirm → dry-run (imprime o que criaria, sem POST)
//   C2: com --confirm → fluxo real (GET roster + POST issue)
//   C3: saída padrão em JSON { step, issueId, title, nextStep }
//        Para nós paralelos: { steps[], issueIds[], title, nextStep, stepMap }
//   C4: quando nextStep é null → imprime { ..., nextStep: null } e exit code 0
//   C5: erros → exit code 1 e mensagem descritiva em stderr
//
// Contrato de continuação (sem double-advance):
//   O campo "nextStep" no JSON de saída é o step que FOI criado nesta chamada.
//   Na próxima chamada, passe esse valor como [currentStep] — growSpine avança
//   para o nó seguinte a partir dele. Isso garante que a cadeia percorre TODOS
//   os nós sem saltar nenhum.
//
// Contrato de fan-in (junção de paralelos):
//   Quando a chamada cria nós paralelos (steps[] com >1 entry), o JSON de saída
//   inclui "stepMap": { [step]: issueId } para todos os irmãos criados.
//   Na chamada seguinte (que criará a junção), passe esse objeto como o 5º arg
//   posicional (serializado como JSON) ou via --step-map='{"HF-N6":...}'.
//   args: [companyId, complexity, currentStep, prevIssueId, stepMapJson?]
//   runCli deserializa stepMapJson e passa como stepToIssueIdMap a growSpine.
//   Isso permite ao CLI stateless resolver o fan-in sem memória persistente.
//
// Transport real (HttpTransport) só é instanciado quando o módulo é executado
// diretamente como CLI (require.main === module). Em testes, transport é injetado
// via runCli({ transport }) — Invariante T1 preservada.

const { nextStep, nodeSpec, allParallelSteps } = require('./tree-factory.cjs');
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

// ─── PARSE COMPLEXITY ────────────────────────────────────────────────────────
// Aceita tanto 'SIMPLES' quanto 'feature.light'.
// Retorna { complexity, variant } onde variant pode ser null.

function parseComplexity(complexityArg) {
  if (!complexityArg) return { complexity: complexityArg, variant: null };
  const dotIdx = complexityArg.indexOf('.');
  if (dotIdx === -1) {
    return { complexity: complexityArg, variant: null };
  }
  return {
    complexity: complexityArg.slice(0, dotIdx),
    variant: complexityArg.slice(dotIdx + 1),
  };
}

// ─── VALIDATE COMPLEXITY ─────────────────────────────────────────────────────

function validateComplexity(complexity, variant) {
  // Verifica se nextStep consegue resolver o template
  const firstNode = nextStep(complexity, null, variant || undefined);
  if (!firstNode) {
    const label = variant ? `${complexity}.${variant}` : complexity;
    throw new Error(
      `grow-tree: complexidade "${label}" inválida ou desconhecida. ` +
      `Valores conhecidos: SIMPLES, COMPLEXA, hotfix, review-only, ` +
      `e variantes hierárquicas como feature.light, feature.heavy, ` +
      `bugfix.light, bugfix.heavy, user-story.light, user-story.heavy, ` +
      `audit.light, audit.heavy, ux.light, ux.heavy, spec.light, spec.heavy.`,
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
 * args = [companyId, complexity[.variant], currentStep?, prevIssueId?]
 *
 * Contrato de continuação sem double-advance:
 *   O campo "nextStep" na saída JSON é o step que foi criado nesta chamada.
 *   Na próxima invocação, passe-o como currentStep. growSpine usará nextStep()
 *   para avançar ao nó seguinte — sem saltar nenhum nó.
 *
 * @param {{ args: string[], transport: object, confirm: boolean }} opts
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
async function runCli({ args, transport, confirm }) {
  // args = [companyId, complexity[.variant], currentStep?, prevIssueId?, stepMapJson?]
  // stepMapJson: JSON string de { [step]: issueId } — necessário quando o nó a criar
  // é uma junção (fan-in) cujos irmãos foram criados numa chamada anterior.
  const [companyId, complexityArg, currentStep, prevIssueId, stepMapJson] = args || [];

  let stderr = '';
  let stdout = '';

  try {
    // Validações básicas
    if (!companyId) {
      throw new Error('grow-tree: companyId é obrigatório. Uso: grow-tree companyId complexity[.variant] [currentStep] [prevIssueId]');
    }
    if (!complexityArg) {
      throw new Error('grow-tree: complexity é obrigatório. Uso: grow-tree companyId complexity[.variant] [currentStep] [prevIssueId]');
    }

    // Parsear complexity[.variant]
    const { complexity, variant } = parseComplexity(complexityArg);

    // Validar complexidade/variante antes de qualquer I/O
    validateComplexity(complexity, variant);

    // Resolver currentStep: string vazia ou 'null' → null
    const resolvedCurrentStep = (currentStep === undefined || currentStep === '' || currentStep === 'null')
      ? null
      : currentStep;
    const resolvedPrevIssueId = (prevIssueId === undefined || prevIssueId === '' || prevIssueId === 'null')
      ? null
      : prevIssueId;

    // Descobrir o próximo nó a criar
    const nodeToCreate = nextStep(complexity, resolvedCurrentStep, variant || undefined);

    // C4: fim de cadeia quando currentStep já é o último nó
    if (!nodeToCreate) {
      // Se currentStep existe e nextStep retorna null → estamos no fim
      const spec = resolvedCurrentStep
        ? nodeSpec(complexity, resolvedCurrentStep, resolvedPrevIssueId, variant || undefined)
        : null;
      const result = {
        step: resolvedCurrentStep || null,
        issueId: null,
        title: spec ? spec.title : null,
        nextStep: null,
      };
      stdout = JSON.stringify(result);
      return { stdout, stderr, exitCode: 0 };
    }

    if (!confirm) {
      // C1: Dry-run — sem POST. Expande paralelos para mostrar TODOS os nós que seriam criados.
      // Invariante PAR: usar allParallelSteps para que o preview seja fiel ao --confirm.
      const parallelNodes = allParallelSteps(complexity, nodeToCreate.step, variant || undefined);
      const drySpec = nodeSpec(complexity, nodeToCreate.step, resolvedPrevIssueId, variant || undefined);

      let result;
      if (parallelNodes.length > 1) {
        // Grupo paralelo: mostrar todos os steps que seriam criados
        const steps = parallelNodes.map((n) => n.step);
        result = {
          steps,
          step: steps,
          title: drySpec.title,
          nextStep: nodeToCreate.step,  // operador usa este valor como currentStep na próxima chamada
        };
      } else {
        result = {
          step: nodeToCreate.step,
          title: drySpec.title,
          nextStep: nodeToCreate.step,  // operador usa este valor como currentStep na próxima chamada
        };
      }
      stdout = JSON.stringify(result);
      return { stdout, stderr, exitCode: 0 };
    }

    // C2: --confirm → fluxo real
    // Validar safe id do companyId
    assertSafeId(companyId);

    // Desserializar stepMapJson (5º arg posicional) se fornecido — necessário para junções fan-in.
    // O operador recebe stepMap no JSON de saída de uma chamada anterior de grupo paralelo
    // e o repassa como JSON string nesta chamada.
    let stepToIssueIdMap;
    if (stepMapJson && stepMapJson !== '' && stepMapJson !== 'null') {
      try {
        stepToIssueIdMap = JSON.parse(stepMapJson);
      } catch (_) {
        throw new Error(
          `grow-tree: stepMapJson inválido — deve ser um objeto JSON (ex: '{"HF-N6":"id1","HF-N7":"id2"}'). ` +
          `Recebido: "${stepMapJson}"`,
        );
      }
    }

    // Buscar roster
    const agents = await fetchRoster(transport, companyId);
    const agentsById = indexRoster(agents);

    // Criar a(s) issue(s) via growSpine
    // growSpine trata paralelo e fan-in internamente.
    // stepToIssueIdMap é obrigatório quando o nó a criar é uma junção (blockedBy array).
    const { issueId, issueIds, steps, nextStepNode } = await growSpine(
      transport,
      companyId,
      complexity,
      resolvedCurrentStep,   // o step já feito (growSpine avança a partir dele)
      resolvedPrevIssueId,
      agentsById,
      variant || undefined,
      stepToIssueIdMap,      // mapa step→issueId para fan-in de junções (pode ser undefined)
    );

    // Montar o nodeSpec para o título (nó que foi criado — usado somente para title)
    const spec = nodeSpec(complexity, nodeToCreate.step, resolvedPrevIssueId, variant || undefined);

    // C3: saída JSON
    // Para nós paralelos (múltiplos criados), incluímos issueIds[] e steps[].
    // O campo "nextStep" é o step recém-criado (nodeToCreate.step) — sem double-advance.
    // Na próxima chamada, o operador passa nodeToCreate.step como currentStep,
    // e growSpine avança para o nó seguinte.
    //
    // FAN-IN: quando steps.length > 1 (grupo paralelo criado), incluímos "stepMap"
    // no JSON de saída. O operador deve serializar esse objeto como JSON e passá-lo
    // como 5º argumento posicional na chamada seguinte (que criará a junção).
    const result = {
      step: steps.length === 1 ? steps[0] : steps,
      issueId,
      issueIds,
      title: spec.title,
      // CORREÇÃO double-advance: retornar o step CRIADO, não o step seguinte.
      // O chamador passa este valor como currentStep na próxima invocação.
      // growSpine chamará nextStep(complexity, nodeToCreate.step) para avançar.
      nextStep: nodeToCreate.step,
    };

    // Incluir stepMap quando paralelos foram criados — necessário para a junção seguinte.
    if (steps.length > 1) {
      const stepMap = {};
      for (let i = 0; i < steps.length; i++) {
        stepMap[steps[i]] = issueIds[i];
      }
      result.stepMap = stepMap;
    }

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
module.exports = { runCli, indexRoster, makeHttpTransport, parseComplexity, validateComplexity };
