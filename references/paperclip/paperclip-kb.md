# Paperclip Knowledge Base
## Referencia operacional consolidada para integracao com pipeline-orchestrator

**Versao:** 1.0 — 2026-05-22
**Fontes:** docs oficiais (paperclipai-paperclip.mintlify.app), repo (github.com/paperclipai/paperclip), DeepWiki (deepwiki.com/paperclipai/paperclip), paperclipai.info, e validacao empirica via D:\paperclip instance v2026.517.0
**Escopo:** tudo que precisamos saber pra adaptar os 46 cargos do pipeline-orchestrator ao modelo Paperclip+Codex sem chute

---

## 1. O que e Paperclip, em uma frase

Paperclip e uma plataforma open-source (MIT, self-hosted, Node.js + React UI) que orquestra times de agentes de IA como se fossem uma empresa: org chart, orcamento, governanca, alinhamento de objetivo, todos coordenados via tickets + heartbeats. Voce traz os agentes (Claude Code, Codex, Cursor, etc.), Paperclip os organiza e roda.

Endereco padrao no setup local: `http://127.0.0.1:3100`. Banco Postgres embutido em `~/.paperclip/instances/default/db`.

---

## 2. Modelo conceitual (entidades principais)

| Entidade | O que e | Onde aparece |
|---|---|---|
| **Company** | Unidade organizacional independente. Tem seu proprio org chart, orcamento, agentes, issues, projects. | Sidebar topo, URL `/COMPANY_SLUG/...` |
| **Agent** | Cargo na empresa. Configurado com adapter (Codex, Claude, etc.), modelo LLM, instructions, reportsTo, orcamento, heartbeat schedule. | `/COMPANY/agents/AGENT_NAME` |
| **Issue** | Ticket de trabalho. Tem assignee, parent, sub-issues, status, priority, reviewers, approvers, comments thread. ID formato `SLUG-N` (ex: `FXS-1`, `PIP-3`). | `/COMPANY/issues/ID` |
| **Project** | Agrupamento logico de issues. Ex: "Onboarding". | `/COMPANY/projects/...` |
| **Goal** | Objetivo de alto nivel ao qual issues sao alinhadas. | `/COMPANY/goals/...` |
| **Routine** | Tarefa recorrente (cron/webhook/API trigger). Cada execucao cria automaticamente um issue tracked. | `/COMPANY/routines/...` |
| **Approval** | Pedido de aprovacao do board. Pode estar pendente em hire, plan, ou gate critico. | `/COMPANY/approvals/...` |
| **Skill** | Pacote de instrucoes reutilizavel. Diretorio contendo `SKILL.md` (frontmatter YAML + corpo markdown). Carregada sob demanda quando agente decide que e relevante. | `/COMPANY/skills/...` |

### 2.1 Hierarquia tipica

```
Company
├── Goals (O que queremos atingir)
├── Projects (Como agrupamos o trabalho)
│   └── Issues (Unidade de trabalho concreto)
│       ├── Sub-issues (decomposicao)
│       ├── Comments (thread de coordenacao)
│       └── Activity log (mudancas de estado)
├── Agents (Quem executa)
│   ├── reportsTo: outro agent (org chart)
│   ├── Adapter config (codex_local, claude_local, etc.)
│   ├── Instructions (markdown injetado no prompt)
│   ├── Skills (sistema + da empresa)
│   └── Budget (limite mensal)
└── Routines (Tarefas recorrentes que criam issues)
```

### 2.2 Granularidade

Uma instancia Paperclip pode hospedar **multiplas companies** independentes. No nosso setup atual: `FX Studio AI` (FXS) e `Pipeline Orchestrator` (PIP). Cada uma tem seu proprio org chart, orcamento, etc.

---

## 3. Heartbeat lifecycle (o coracao do Paperclip)

Heartbeat = janela curta de execucao em que um agente acorda, faz algo util, e sai. Agentes nao rodam continuamente — sao stateless entre heartbeats. A diferenca entre um script qualquer e um agente Paperclip e que o **estado fica em arquivos no disco**, recarregado a cada wake.

### 3.1 Como heartbeats sao disparados

| Trigger | Quando | Frequencia |
|---|---|---|
| **Schedule** | Cron configurado por agente | Default off; tipicamente 4h, 8h, 12h se ligado |
| **Wake on demand** | Algo de fora dispara (mensagem, ticket atribuido, approval resolvido) | Imediato |
| **Routine** | Cron ou webhook dispara uma routine que cria issue | Conforme configurado |
| **@-mention em comment** | Outro agente menciona o agente atual | Imediato |
| **Approval resolved** | Board responde a um approval pendente | Imediato, com `PAPERCLIP_APPROVAL_ID` injetado |

### 3.2 Variaveis de ambiente injetadas em cada heartbeat

Toda sessao Codex/Claude do agente recebe estas variaveis no env:

| Variavel | Conteudo |
|---|---|
| `PAPERCLIP_AGENT_ID` | UUID do agente |
| `PAPERCLIP_COMPANY_ID` | UUID da empresa |
| `PAPERCLIP_API_URL` | Tipicamente `http://127.0.0.1:3100/api` |
| `PAPERCLIP_RUN_ID` | UUID do run atual (heartbeat) |
| `PAPERCLIP_TASK_ID` | ID da issue (se wake foi por atribuicao especifica) |
| `PAPERCLIP_WAKE_REASON` | string explicando porque acordou |
| `PAPERCLIP_WAKE_COMMENT_ID` | ID do comment que disparou wake (se aplicavel) |
| `PAPERCLIP_APPROVAL_ID` | ID do approval (se wake foi por aprovacao resolvida) |

### 3.3 Os 9 passos canonicos do heartbeat

(Vem da `paperclip` skill — SKILL.md no repo oficial)

**Atalho scoped-wake:** se a mensagem injetada contem "Paperclip Resume Delta" ou "Paperclip Wake Payload" identificando uma issue especifica, **pular passos 1-4** e ir direto pro 5. O scoped wake ja diz exatamente o que fazer.

| # | Passo | O que faz |
|---|---|---|
| 1 | **Identity** | `GET /api/agents/me` para obter id, companyId, role, chainOfCommand, budget |
| 2 | **Approval follow-up** | Se `PAPERCLIP_APPROVAL_ID` setado, revisar approval primeiro, fechar issues resolvidas ou comentar o que ainda esta aberto |
| 3 | **Local planning check** | Ler `$AGENT_HOME/memory/YYYY-MM-DD.md` (daily notes) na secao `## Today's Plan`. Ver o que esta done, blocked, e proximo |
| 4 | **Get assignments** | `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`. Priorizar `in_progress`, depois `todo`. Pular `blocked` salvo se voce pode desbloquear |
| 5 | **Checkout** | Verificar se a issue alvo nao tem run ativo, marcar checkout pra evitar double-work |
| 6 | **Read context** | Ler issue body, comments, parent, sub-issues. Carregar skill `paperclip` se ainda nao carregada |
| 7 | **Do the work** | Executar a tarefa concreta — codigo, pesquisa, delegacao, gate, o que for |
| 8 | **Update status & comment** | Postar comment com resultado/proximo passo; atualizar status (in_progress, blocked, done) |
| 9 | **Extract memory & exit** | Atualizar `$AGENT_HOME/memory/YYYY-MM-DD.md` com aprendizados. Sair |

### 3.4 Safety guardrails inseridos em todo HEARTBEAT.md

- **Nunca exfiltrar** secrets ou dados privados em comments publicos
- **Nao executar comandos destrutivos** sem pedido explicito do board (approval)
- **Stop Rule:** ao detectar loop ou 2+ falhas seguidas, status=blocked + comment + escalar via approver

---

## 4. Skills system

### 4.1 Anatomia de uma skill

```
skills/
└── minha-skill/
    ├── SKILL.md           # frontmatter YAML + corpo markdown
    ├── references/        # docs adicionais lidas sob demanda
    │   └── api.md
    └── scripts/           # opcionais
        └── helper.sh
```

`SKILL.md` typical:
```yaml
---
name: minha-skill
description: O que essa skill faz, em uma frase
when_to_use: Em que situacao o agente deve invoca-la
inputs: [...] # opcional
---

# Corpo markdown

Procedimentos detalhados, exemplos, gotchas.
```

### 4.2 Tipos de skill

| Tipo | Onde mora | Quem carrega |
|---|---|---|
| **System skills** | Embutidas no repo Paperclip (`skills/paperclip/`, `skills/paperclip-create-agent/`, etc.) | Todos agentes automaticamente |
| **Company skills** | Custom, da empresa. Podem vir de GitHub, skills.sh, ou workspace local | Agentes da empresa, opcional |

### 4.3 Como skills sao injetadas no agente

Para Codex (`codex_local` adapter): o Paperclip **automaticamente symlinka** as skills em `$CODEX_HOME/skills/`, fazendo o Codex CLI descobri-las naturalmente como ja faz para skills do `.codex/skills/`.

Para Claude Code (`claude_local` adapter): mesmo modelo, em `$CLAUDE_HOME/skills/` (`~/.claude/skills/`).

### 4.4 Lazy loading

O agente **so ve nome + descricao** das skills inicialmente. So carrega o corpo da `SKILL.md` quando decide que e relevante para a tarefa atual. Isso evita poluir o contexto com instrucoes irrelevantes.

### 4.5 Skills built-in essenciais

| Skill | Funcao |
|---|---|
| `paperclip` | "OS" do agente. Define heartbeat procedure, identidade, API client para issues/comments/projects/goals/agents |
| `paperclip-create-agent` | Contratar novos agentes. Define payload e endpoint `POST /api/companies/$COMPANY_ID/agent-hires` |
| `para-memory-files` | PARA memory system (projects/areas/resources/archives), qmd recall, knowledge graph, daily notes |
| Outras opcionais | `vercel-labs/agent-browser`, etc. |

---

## 5. PARA Memory System

Inspirado no metodo PARA (Projects, Areas, Resources, Archives) do Tiago Forte. Resolve o **Memento Man problem**: agente acorda sem memoria, precisa reconstruir contexto a cada heartbeat.

### 5.1 Estrutura de pastas

Todos os paths sao relativos a `$AGENT_HOME` (tipicamente `~/.paperclip/instances/default/agents/{{agent-name}}/`):

```
$AGENT_HOME/
├── AGENTS.md          # identidade: quem voce eh, role, safety
├── HEARTBEAT.md       # checklist de 9 passos
├── SOUL.md            # persona, valores, defaults de comportamento
├── TOOLS.md           # ferramentas disponiveis
├── memory/
│   ├── YYYY-MM-DD.md  # daily notes (com "## Today's Plan")
│   └── ...
└── life/
    ├── index.md
    ├── projects/      # ativo, goal/deadline claros
    │   └── {{project-name}}/
    ├── areas/         # responsabilidade ongoing, sem fim
    │   ├── people/{{name}}/
    │   └── companies/{{name}}/
    ├── resources/     # referencia, topicos de interesse
    │   └── {{topic}}/
    └── archives/      # inativos das outras 3 categorias
```

### 5.2 As 3 camadas de memoria

| Camada | O que e | Quando atualizar |
|---|---|---|
| **Knowledge graph** | Atomic facts sobre o mundo (datas, decisoes, status). Schema estruturado | Toda vez que aprende fato novo verificavel |
| **Daily notes** | `$AGENT_HOME/memory/YYYY-MM-DD.md`. Planning + progress + scratch | Inicio + fim de cada heartbeat |
| **Tacit knowledge** | Como o usuario (board) opera — patterns, preferencias, licoes. NAO fatos do mundo, fatos do usuario | Quando observa novo padrao de operacao |

### 5.3 Principio fundamental

> "Memory does not survive session restarts. Files do. Want to remember something — write it to a file."

- "Remember this" → update daily note ou entity file
- "Learn a lesson" → update AGENTS.md, TOOLS.md, ou skill relevante
- "Made a mistake" → documentar pra future-you nao repetir

### 5.4 Recall tools (qmd CLI)

Skill `para-memory-files` instala `qmd` (queryable markdown):

| Comando | Modelo de busca |
|---|---|
| `qmd query "<pergunta>"` | Semantic search com reranking (recomendado pra perguntas) |
| `qmd search "<frase exata>"` | BM25 keyword (recomendado pra strings literais) |
| `qmd vsearch "<conceito>"` | Pure vector similarity (recomendado pra conceitos abstratos) |

---

## 6. Identity files de cada agente (autogerados na contratacao)

Quando um agente eh criado, o Paperclip seeda quatro arquivos canonicos em `$AGENT_HOME`:

### 6.1 `AGENTS.md` — Identity
> "You are CEO of {{company}}. Your role is {{role}}. Read HEARTBEAT.md every wake. Use the memory system. Safety: never exfil secrets, no destructive ops without board approval."

Define quem o agente eh, role, e safety rules.

### 6.2 `HEARTBEAT.md` — Execution checklist
Os 9 passos canonicos (secao 3.3). Lido a cada wake.

### 6.3 `SOUL.md` — Persona
> Default CEO soul: "You own the P&L. You default to action. You hold the long view while executing the near-term."

Define personalidade e defaults de comportamento. **Aqui que customizamos a "voz" e os valores do cargo.**

### 6.4 `TOOLS.md` — Tools inventory
Lista as ferramentas disponiveis pro agente (CLI, APIs, skills carregaveis).

---

## 7. Adapter `codex_local` — configuracao completa

(Da documentacao oficial em paperclipai-paperclip.mintlify.app/agents/process-adapter)

### 7.1 Campos de adapterConfig

| Campo | Tipo | Default | O que faz |
|---|---|---|---|
| `command` | string | `"codex"` | Comando CLI a executar |
| `cwd` | string | — | Working directory absoluto (criado se nao existir) |
| `instructionsFilePath` | string | — | Caminho pra arquivo .md prepended em todos os prompts (NOSSO HOOK pra injetar adaptation spec) |
| `model` | string | — | Ex: `gpt-5.4`, `gpt-5.3-codex`, `o3-mini` |
| `modelReasoningEffort` | string | `""` | `minimal` \| `low` \| `medium` \| `high` |
| `search` | boolean | `false` | Habilita web search via flag `--search` |
| `promptTemplate` | string | — | Mustache template, suporta `{{agent.id}}`, `{{agent.name}}`, etc. |
| `env` | object | — | KEY=VALUE pairs no env do subprocess. Inclui `OPENAI_API_KEY` se nao usando OAuth |
| `timeoutSec` | number | `900` | Timeout (0 = ilimitado) |
| `graceSec` | number | `20` | SIGTERM grace antes de SIGKILL |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | `false` | Bypass sandbox — usar com cuidado |
| `extraArgs` | string[] | `[]` | Args adicionais pro Codex CLI |

### 7.2 Campos agent-level (fora do adapterConfig)

| Campo | Tipo | O que faz |
|---|---|---|
| `name` | string | Slug do agente (nosso: `information-gate`, `pipeline-controller`, etc.) |
| `role` | string | Identificador do role (ex: `senior_engineer`, `pm`) |
| `title` | string | Texto humano (ex: `Business Analyst / Requirements Clarifier`) |
| `icon` | string | Identificador de icone |
| `reportsTo` | string | UUID do parent no org chart |
| `capabilities` | string | Descricao livre |
| `desiredSkills` | string[] | Slugs de skills (ex: `vercel-labs/agent-browser/agent-browser`) |
| `adapterType` | string | `codex_local` \| `claude_local` \| outros |
| `adapterConfig` | object | Conforme 7.1 |
| `instructionsBundle` | object | Conjunto de arquivos identity (AGENTS.md, SOUL.md, etc.) |
| `runtimeConfig.heartbeat` | object | `{ enabled: false, wakeOnDemand: true, intervalSec: 0 }` por padrao |
| `sourceIssueId` | string | Issue que originou a contratacao (rastreabilidade) |
| `contextMode` | string | `"fat"` ou `"thin"` — controla quanto contexto eh injetado |
| `budgetMonthlyCents` | number | Limite mensal em centavos USD |

### 7.3 Adapter `claude_local` (paralelo)

Mesmos campos, mas `command: "claude"` e Paperclip injeta skills em `~/.claude/skills/` ao inves de `$CODEX_HOME/skills/`.

---

## 8. API endpoints essenciais

Base URL: `$PAPERCLIP_API_URL` (tipicamente `http://127.0.0.1:3100/api`).

### 8.1 Identity & assignments
- `GET /api/agents/me` — Quem sou eu (chamado no passo 1 do heartbeat)
- `GET /api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked` — Minhas assignments (passo 4)

### 8.2 Issues
- `GET /api/issues/{issueId}` — Detalhes da issue
- `POST /api/companies/{companyId}/issues` — Criar issue
- `PATCH /api/issues/{issueId}` — Update (status, priority, assignee, etc.)
- `POST /api/issues/{issueId}/comments` — Postar comment

### 8.3 Agent hires (skill `paperclip-create-agent`)
- `POST /api/companies/$PAPERCLIP_COMPANY_ID/agent-hires` — Contratar
  - Body: `{ name, role, title, icon, reportsTo, capabilities, desiredSkills, adapterType, adapterConfig, instructionsBundle, runtimeConfig: { heartbeat: { enabled, wakeOnDemand, intervalSec } }, sourceIssueId }`
  - Se response.status === `pending_approval`: aguardar board responder, acorda com `PAPERCLIP_APPROVAL_ID`

### 8.4 Routines
- `GET /api/companies/{companyId}/routines`
- `GET /api/routines/{routineId}`
- `POST /api/companies/{companyId}/routines` — Criar
- `PATCH /api/routines/{routineId}` — Update
- `POST /api/routines/{routineId}/trigger` — Disparar manualmente

Campos importantes:
- `concurrencyPolicy`: `coalesce_if_active` (skip se previous still active) \| `allow_parallel`
- `catchUpPolicy`: `skip_missed` \| `run_missed`
- `triggers[].kind`: `schedule` (cron) \| `webhook`

### 8.5 Onboarding/invites (machine-readable)
- `GET /api/invites/:token` — Invite summary
- `GET /api/invites/:token/onboarding` — Manifest
- `GET /api/invites/:token/onboarding.txt` — Plain-text doc estilo llm.txt (handoff humano + agente)

### 8.6 LLM configuration docs
- `curl $PAPERCLIP_API_URL/llms/agent-configuration/claude_local.txt` — convencoes de adapter pra claude_local
- `GET /api/companies/$PAPERCLIP_COMPANY_ID/agent-configurations` — convencoes da propria empresa (naming, icon, reporting-line)

> **IMPORTANTE pra hire de qualidade:** sempre buscar 8.6 antes de criar agente novo. Sao "as convencoes que essa empresa segue" — naming, reporting line, adapter padrao.

### 8.7 Approvals
- `POST /api/issues/{issueId}/approvers` — Adicionar approver
- `POST /api/approvals/{approvalId}/resolve` — Aprovar/negar (chamado pelo board no painel)

---

## 9. CLI commands (pnpm-based)

(Da `doc/CLI.md` do repo)

| Comando | Funcao |
|---|---|
| `pnpm paperclipai onboard --yes` | Setup inicial (instalacao) |
| `pnpm paperclipai run` | Subir servidor |
| `pnpm paperclipai configure` | Reconfigurar |
| `pnpm paperclipai doctor` | Diagnostico |
| `pnpm paperclipai issue list --company-id <id>` | Listar issues |
| `pnpm paperclipai issue create --company-id <id> --title "..."` | Criar issue |
| `pnpm paperclipai issue update <id> --status in_progress --comment "..."` | Update issue |

---

## 10. Context packet (o que o agente recebe a cada wake)

Cada heartbeat, o Paperclip **monta fora da sessao do agente** um payload estruturado puxando do storage e injeta como contexto inicial. Esse e o **context packet**. Contem:

1. **Memory state**: trechos relevantes do PARA + daily notes recentes
2. **Task queue**: issues atribuidas, priorizadas
3. **Recent events**: deltas desde o ultimo heartbeat
4. **Agent configuration**: role, tools, behavioral instructions

> "O agente nunca 'lembra' beats anteriores sozinho — o storage layer faz isso, e o context packet eh como essa memoria chega ate ele."

Isso e o que diferencia um agente Paperclip de um script agendado: o script roda igual toda vez sem memoria; o agente acorda sabendo o que ja fez e o que mudou desde a ultima visita.

---

## 11. Scoped wake (otimizacao critica)

Quando o Paperclip acorda um agente por motivo especifico (ticket atribuido, approval resolvido, @mention), ele injeta no contexto:

```
Paperclip Wake Payload
- Issue: {{issue_id}}
- Wake Reason: {{reason}}
- Wake Comment: {{comment_id_if_any}}
```

Nesse caso, **agente PULA passos 1-4** do heartbeat e vai direto pro 5 (checkout). Nao precisa chamar `/api/agents/me`, nao precisa fetchar inbox, ja sabe exatamente o que fazer.

Isso reduz latencia + custo significativamente em wakes orientados por evento.

---

## 12. Permissoes e governanca

### 12.1 Cargo nao cria cargo por default
Por seguranca, **o CEO eh quem tem permissao de contratar** (chamar `POST /agent-hires`). Outros cargos podem **solicitar** contratacao via comment + approver=CEO ou Board. No nosso setup: cto da Pipeline Orchestrator nao pode criar agentes; pipeline-controller pode.

### 12.2 Sandboxing
Codex CLI roda em sandbox por default. `dangerouslyBypassApprovalsAndSandbox: true` libera, mas e arriscado — usar so quando trabalho exige (ex: aplicar migrations).

### 12.3 Budget
Cada agente tem `budgetMonthlyCents`. Ao atingir 100%, **auto-pause**. Soft warning em 80%. Board pode override.

### 12.4 Approvers vs Reviewers vs Assignee
- **Assignee**: faz o trabalho
- **Reviewer**: revisa, comenta, pode bloquear
- **Approver**: tem que aprovar antes do fechamento (gate explicito). Sem approval, status fica `pending_approval`

---

## 13. Skill custom: como criar uma para os 46 cargos

Quando voce escreve uma skill custom (`SKILL.md` + arquivos auxiliares), pode:

1. Colocar em `~/.paperclip/instances/default/skills/{{slug}}/` (local)
2. Ou publicar em GitHub e referenciar via `desiredSkills: ["org/repo/skill-name"]`

Para o nosso caso: vamos criar `pipeline-orchestrator-contracts` como skill custom, contendo todos os contratos traduzidos (GATE_REQUEST, DISPATCH_REQUEST, etc. adaptados pro modelo Paperclip). Os 46 cargos vao ter ela em `desiredSkills`.

---

## 14. Resumo executivo: o que muda pra nossa adaptacao

| Pipeline-orchestrator original | Paperclip+Codex equivalent |
|---|---|
| `AskUserQuestion` modal | Comment + status=blocked + add Board como `Approver` + exit heartbeat |
| `Agent tool` (spawn subagent) | `POST /api/companies/{id}/issues` com `parent` e `assignee` (DISPATCH via API, nao texto YAML) |
| Hook `SessionStart` | Passo 6 do heartbeat (read context) — automatico, nao precisa imitar |
| `MEMORY.md` auto-memory | `$AGENT_HOME/memory/YYYY-MM-DD.md` + PARA folders |
| `GATE_REQUEST` v1 (texto YAML emitido) | Comment estruturado **+ chamada API real** pra adicionar approver. Texto e duplicacao, nao funcao |
| Iron Laws | Inalteradas (TDD, ask-first, stop rule) |
| Achado 7 (tool stripping) | **Nao aplica** — cada cargo eh sessao Codex top-level com tools completas |

---

## 15. Pontos abertos pra investigar

- [ ] Como atualizar `instructionsFilePath` de um agente ja criado? (PATCH no agent ou re-hire?)
- [ ] Skills custom precisam estar fisicamente em disco no momento do heartbeat — onde melhor versionar (git submodule? cp na hora?)
- [ ] Como sincronizar mudancas em `SOUL.md`/`AGENTS.md` se ja existe agente? (Edit direto no `$AGENT_HOME` vs API)
- [ ] O Codex CLI sem flag `--ci-mode` aceita interrupcoes? Heartbeat curto exige saida limpa
- [ ] Modelo `modelReasoningEffort` por categoria: gates simples = `low`, controllers = `high`?

---

## Sources

- [Paperclip oficial](https://paperclip.ing/)
- [Paperclip docs](https://paperclipai-paperclip.mintlify.app/)
- [Process Adapter docs](https://paperclipai-paperclip.mintlify.app/agents/process-adapter)
- [github.com/paperclipai/paperclip](https://github.com/paperclipai/paperclip)
- [Core skill `paperclip` (SKILL.md)](https://github.com/paperclipai/paperclip/blob/master/skills/paperclip/SKILL.md)
- [`paperclip-create-agent` skill](https://github.com/paperclipai/paperclip/blob/master/skills/paperclip-create-agent/SKILL.md)
- [DeepWiki agent skills system](https://deepwiki.com/paperclipai/paperclip/6-agent-skills-system)
- [What an agent does each heartbeat (paperclipai.info)](https://paperclipai.info/blogs/explain_heartbeat/)
- [`para-memory-files` skill (explainx.ai)](https://explainx.ai/skills/paperclipai/paperclip/para-memory-files)
- [Heartbeat pattern (MindStudio)](https://www.mindstudio.ai/blog/what-is-heartbeat-pattern-paperclip-ai-agents)
