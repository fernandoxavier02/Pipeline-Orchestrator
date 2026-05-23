# Paperclip Integration

Este documento descreve como rodar o plugin `pipeline-orchestrator` dentro do [Paperclip](https://paperclip.ing) — uma plataforma open-source de orquestracao de agentes IA por organizacao.

A integracao foi validada end-to-end em **2026-05-22** com `PARITY_VERDICT = PASS_WITH_NOTES` (relatorio: `references/paperclip/pilot-information-gate.md`).

---

## Por que integrar Paperclip + pipeline-orchestrator?

O plugin original eh "Claude Code-native" — usa hooks Node.js, AskUserQuestion modal, Agent tool, EnterPlanMode. Funciona bem **quando voce eh o operador interativo no terminal**.

Paperclip adiciona **uma camada de orquestracao por cima**: os 46 cargos viram agentes-cargos da empresa, com org chart, orcamento mensal por cargo, governanca, dashboard web. Issues entram via API/UI, cargos acordam por heartbeat ou evento, e o trabalho roda **24/7 sem voce no terminal**.

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
| `paperclip-catalog.md` | Catalogo dos 46 agentes do plugin mapeados |
| `paperclip-adaptation-spec.md` | Traducao Achado #7 -> modelo Paperclip |
| `ZONING.md` | Regra de zoneamento entre disco D: canonical e C: install |
| `PLAN-46-AGENTS-UPDATE.md` | Procedimento de migracao com loop adversarial |
| `pilot-information-gate.md` | Validacao end-to-end (PARITY_VERDICT) |
| `install-junctions.bat` | Deployment de skills via mklink /J (Windows) |
| `skills/` | 11 skills custom (engineering-principles + 10 wrappers) |

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
