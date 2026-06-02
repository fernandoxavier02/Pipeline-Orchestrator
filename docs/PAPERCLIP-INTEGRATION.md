# Paperclip Integration

Este documento descreve como rodar o plugin `pipeline-orchestrator` dentro do [Paperclip](https://paperclip.ing) — uma plataforma open-source de orquestracao de agentes IA por organizacao.

A integracao foi validada end-to-end em **2026-05-22** com `PARITY_VERDICT = PASS_WITH_NOTES` (relatorio: `references/paperclip/pilot-information-gate.md`).

---

## Por que integrar Paperclip + pipeline-orchestrator?

O plugin original eh "Claude Code-native" — usa hooks Node.js, AskUserQuestion modal, Agent tool, EnterPlanMode. Funciona bem **quando voce eh o operador interativo no terminal**.

Paperclip adiciona **uma camada de orquestracao por cima**: os 47 cargos viram agentes-cargos da empresa, com org chart, orcamento mensal por cargo, governanca, dashboard web. Issues entram via API/UI, cargos acordam por heartbeat ou evento, e o trabalho roda **24/7 sem voce no terminal**.

Casos de uso especificos do Paperclip:
- Empresa com varios clientes — cada cliente vira uma "company" Paperclip
- Trabalho assincrono prolongado (>1h) que beneficia de pausar/retomar
- Multiplos operadores acompanhando o mesmo organograma
- Auditoria + orcamento por cargo automatico

---

## Arquitetura

```
+-------------------------------------------------------------+
|  Paperclip server (Node.js + Postgres embarcado)            |
|  localhost:3100 — orquestra heartbeats + tickets            |
+--------------------+----------------------------------------+
                     |
                     | subprocess via codex_local OU claude_local adapter
                     v
+-------------------------------------------------------------+
|  Claude Code subprocess (esta integracao usa claude_local)  |
|  - le instructionsFilePath = agent.md ORIGINAL do plugin    |
|  - cwd = D:\Pipeline-Orchestrator\ (paths relativos OK)     |
|  - tem TODAS as tools nativas (Read/Write/Edit/Bash/...)    |
|  - skills custom carregadas via $CLAUDE_HOME/skills/        |
|    (junctions apontando pro repo)                           |
+-------------------------------------------------------------+
```

**Paperclip eh orquestrador leve, nao middleware** — nao intercepta tool calls, nao modifica sandbox, nao injeta primitives. Apenas configura entry point (env, cwd, instructionsFilePath) e dispara o subprocess.

---

## Setup rapido

### Opcao A — Slash command automatico (recomendado)

```
/pipeline-orchestrator:setup-paperclip
```

O command verifica pre-requisitos, instala Paperclip se necessario, configura junctions de skills, cria empresas, contrata cargos via API, e roda piloto de validacao end-to-end.

### Opcao B — Manual

Ver `commands/setup-paperclip.md` (6 passos sequenciais).

---

## Estrutura canonical

Toda config + spec da integracao vive em `references/paperclip/` no repo do plugin:

| Arquivo | Conteudo |
|---|---|
| `PAPERCLIP-AXIOMS.md` | Contrato inquebravel + 4 axiomas universais |
| `PAPERCLIP-BUGFIX-WORKFLOW.md` | Workflow para Bug Fix prompt-native pra Codex |
| `PAPERCLIP-FEATURE-WORKFLOW.md` | Workflow para Feature/User Story |
| `PAPERCLIP-AUDIT-WORKFLOW.md` | Workflow para Auditoria read-only |
| `PAPERCLIP-UX-WORKFLOW.md` | Workflow para UX/A11y review |
| `PAPERCLIP-SPEC-WORKFLOW.md` | Workflow para producao de Spec |
| `PAPERCLIP-ADVERSARIAL-WORKFLOW.md` | Workflow para Adversarial Review standalone |
| `paperclip-kb.md` | KB operacional Paperclip (heartbeat, skills, API) |
| `paperclip-catalog.md` | Catalogo dos 47 agentes do plugin mapeados |
| `paperclip-adaptation-spec.md` | Traducao Achado #7 -> modelo Paperclip |
| `ZONING.md` | Regra de zoneamento entre disco D: canonical e C: install |
| `PLAN-46-AGENTS-UPDATE.md` | Procedimento de migracao com loop adversarial (roster cresceu para 47) |
| `pilot-information-gate.md` | Validacao end-to-end (PARITY_VERDICT) |
| `install-junctions.bat` | Deployment de skills via mklink /J (Windows) |
| `PAPERCLIP-FLOW-MIRROR.md` | Doc dedicado do flow-mirror v7.9.0 (14 fluxos, arvore de issues, 5 modulos, 8 comandos) |
| `skills/` | 11 skills custom (engineering-principles + 10 wrappers) |
| `scripts/` | `provision-pipeline-company.cjs` — provisionador da empresa (v7.8.0) |
| `spec/lib/` | 5 modulos do flow-mirror (`tree-template`, `tree-factory`, `tree-factory-io`, `grow-tree`, `classify-bridge`) + suite de testes (v7.9.0) |

---

## Modos de operacao suportados

### claude_local (recomendado — paridade total)

Adapter Paperclip que invoca `claude` como subprocess. Vantagens:
- Todas as tools nativas do Claude Code disponiveis (AskUserQuestion, Agent, EnterPlanMode)
- Plugin pipeline-orchestrator carrega normalmente
- Skills via `--add-dir` symlink temporario
- Subscription billing (sem API key)

Config tipica de cargo:
```json
{
  "adapterType": "claude_local",
  "adapterConfig": {
    "command": "claude",
    "model": "claude-opus-4-7-1m",
    "cwd": "D:\\Pipeline Orchestrator Claude\\Pipeline-Orchestrator",
    "instructionsFilePath": "agents/core/information-gate.md",
    "search": false,
    "timeoutSec": 1000
  }
}
```

### codex_local (alternativa — paridade parcial)

Adapter Paperclip que invoca `codex` (OpenAI CLI). Vantagens:
- Mais barato em tokens (OpenAI billing)
- Roda em paralelo com Claude Code session

Limitacoes:
- Codex NAO tem AskUserQuestion/Agent/EnterPlanMode nativos
- Agent.md original do plugin instrui usar essas tools — Codex improvisa
- Para paridade neste modo, usar workflow specs prompt-native em `references/paperclip/PAPERCLIP-*.md`

---

## Provisionador da empresa (v7.8.0)

A camada de integracao original (v7.6.0) descrevia *como* rodar os cargos, mas a criacao da empresa era manual. A v7.8.0 fechou esse buraco com um **provisionador generico** que sobe uma empresa Paperclip completa de uma vez.

O script `references/paperclip/scripts/provision-pipeline-company.cjs` cria a empresa (pelo NOME, criando se nao existir), importa as 11 skills custom (lidas de `references/paperclip/skills/`), contrata os **47 cargos** e anexa as skills certas por categoria. Ele e **ID-agnostic e portatil**: nao tem nenhum UUID fixo nem caminho dependente de maquina — captura os IDs dos agentes em runtime e resolve todos os paths do plugin a partir de `__dirname`.

Caracteristicas importantes:

- **Heartbeat DESLIGADO** em cada cargo (`runtimeConfig.heartbeat.enabled = false`, `wakeOnDemand = true`). Nada roda sozinho — os agentes ficam inertes ate voce atribuir uma issue.
- **Org chart automatico:** `pipeline-controller` e contratado primeiro (topo do organograma); todos os outros 46 reportam a ele via `reportsTo`.
- **Adapter + modelo configuraveis** por env: padrao `codex_local` / `gpt-5.4`; sobrescreva com `PAPERCLIP_ADAPTER` e `PAPERCLIP_MODEL`. O nome da empresa vem de `PAPERCLIP_COMPANY` ou do primeiro argumento (padrao `"Pipeline Orchestrator"`), e a API de `PAPERCLIP_API_URL` (padrao `http://127.0.0.1:3100/api`).
- **Idempotente:** se a empresa, uma skill ou um cargo ja existem, o script pula e segue — pode rodar de novo sem duplicar.
- **Orcamento zero + sem auto-criacao de agentes** (`budgetMonthlyCents: 0`, `permissions.canCreateAgents: false`) por padrao.
- Cada cargo aponta `instructionsFilePath` para o workflow prompt-native correspondente (`PAPERCLIP-*.md`) e roda com `cwd` = raiz do plugin (sobrescrivivel via `PAPERCLIP_CWD`).

Uso tipico (rodar onde a API do Paperclip esta acessivel, ex.: na VPS):

```bash
node references/paperclip/scripts/provision-pipeline-company.cjs "Pipeline Orchestrator"
```

O provisionador esta amarrado no slash command `/pipeline-orchestrator:setup-paperclip`. Iron Law preservada: o script e aditivo, nao toca em `agents/`, `skills/` ou `references/` originais.

---

## Flow-mirror: a arvore de tarefas (v7.9.0)

A v7.9.0 deu o passo seguinte: em vez de o Claude executar o pipeline localmente, ele agora pode **espelhar o pipeline inteiro como uma arvore de issues no Paperclip**, e os robos da VPS executam tudo. O detalhe completo vive em `references/paperclip/PAPERCLIP-FLOW-MIRROR.md`; aqui fica o resumo.

São **14 fluxos espelhados** — os 6 tipos de tarefa em duas variantes cada (`bugfix`, `feature`, `user-story`, `audit`, `ux`, `spec`, todos em `light`/`heavy`) mais dois modos de molde unico (`hotfix` com 12 nos exatos e `review-only` com 4 nos exatos). Cada fluxo e um molde declarativo de nos, e cada no vira um cartao (issue) atribuido a um cargo real do roster de 47.

A ordem de execucao e garantida por **travas** `blockedByIssueIds`: cada cartao so desbloqueia quando o(s) anterior(es) concluem. Onde o pipeline roda em paralelo — o trio adversarial (seguranca ‖ arquitetura ‖ qualidade) ou a revisao por lote — a juncao a jusante e bloqueada por TODOS os irmaos ao mesmo tempo (fan-in real), espelhando o paralelismo do pipeline standalone.

Cinco modulos puros (sem rede, testaveis) fazem o trabalho, em `references/paperclip/spec/lib/`: `classify-bridge.cjs` (decide tipo e complexidade por heuristica de palavras-chave, com override do piloto), `tree-template.cjs` (os moldes declarativos dos 14 fluxos), `tree-factory.cjs` (logica pura que decide o proximo no e monta o corpo do cartao), `tree-factory-io.cjs` (camada de I/O que resolve cargos para UUID, monta o payload REST e cria a issue via transport injetavel) e `grow-tree.cjs` (a interface de linha de comando que junta tudo).

Oito comandos slash `paperclip-*` expoem isso ao operador — um por familia de fluxo (`bugfix`, `feature`, `user-story`, `audit`, `ux`, `spec`, `hotfix`, `review`) mais o indice `paperclip-overview`. Tambem ha a flag `--on=paperclip` no `/pipeline` principal: ela faz o controlador classificar localmente e emitir o cartao-raiz (bloco `PAPERCLIP_DISPATCH`) sem rodar nenhuma fase local.

**Guard de seguranca inquebravel:** nenhum cartao e criado na VPS sem confirmacao explicita. O fluxo e sempre dry-run primeiro (sem `--confirm`, zero POST na API — so mostra o que criaria), apresentacao da arvore ao usuario, confirmacao via `AskUserQuestion`, e so entao `grow-tree ... --confirm` cria a raiz. Cancelar em qualquer ponto encerra sem criar nada.

---

## Gaps conhecidos (P1 — nao bloqueantes)

| Gap | Sintoma | Workaround |
|---|---|---|
| Opus 4.7 1M nao reconhecido pelo adapter | Fallback automatico pra sonnet 4.6 | Aceitar — frontmatter dos agents.md ja especifica sonnet |
| `SessionStart:resume` hook (Claude Code) falha em subprocess | Warning, nao bloqueia | Converter hooks SessionStart prompt-type pra command-type, ou simplesmente ignorar |
| Hooks `.claude/hooks/*.cjs` nao executam em modo Paperclip | Sentinel/dispatch-guard validation skipada | Paperclip orquestra heartbeat lifecycle por conta propria |

---

## Quando usar standalone vs Paperclip

| Use caso | Recomendacao |
|---|---|
| Sessao interativa, voce no terminal | **Plugin standalone Claude Code** — mais rapido, mais natural |
| Trabalho assincrono >1h | **Paperclip + claude_local** — heartbeat retoma do mesmo ponto |
| Operacao multi-cliente | **Paperclip** — companies separam estado |
| Auditoria + orcamento por cargo | **Paperclip** — dashboard nativo |
| Multiplos operadores | **Paperclip** — UI web compartilhada |
| Single dev, projeto pequeno | **Plugin standalone** — overhead Paperclip nao compensa |

Os dois modos sao **complementares**, nao mutuamente exclusivos — voce pode rodar Paperclip pra trabalho de longa duracao e usar o plugin standalone pra exploracoes rapidas no mesmo projeto.

---

## Referencias

- Paperclip oficial: https://paperclip.ing
- Paperclip docs: https://paperclipai-paperclip.mintlify.app
- Paperclip repo: https://github.com/paperclipai/paperclip
- Pipeline Orchestrator repo: https://github.com/fernandoxavier02/Pipeline-Orchestrator
- Relatorio piloto: `references/paperclip/pilot-information-gate.md`
