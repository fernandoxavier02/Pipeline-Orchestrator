# Pipeline Orchestrator para OpenCode — Plano de Adaptação

> **Status:** Draft v0.1 — 2026-05-24
> **Autor:** OpenCode (adaptação do Pipeline Orchestrator v7.6.0 do Claude Code)
> **Objetivo:** Garantir fidelidade máxima de execução ao migrar o sistema de orquestração multi-agente para o ecossistema OpenCode.

---

## 1. Sumário Executivo

O Pipeline Orchestrator é um sistema de governança multi-agente que opera entre o planejamento e a entrega de código. No Claude Code, ele utiliza hooks nativos (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`), subagentes via `Agent` tool, e perguntas síncronas via `AskUserQuestion`.

O OpenCode possui ferramentas equivalentes e um sistema de hooks compatível (descoberto em `~/.config/opencode/hooks/`). Este documento define como adaptar cada componente do Pipeline Orchestrator para o OpenCode com **mínima perda de fidelidade**.

---

## 2. Tabela de Equivalência de Ferramentas

| Pipeline (Claude Code) | OpenCode Equivalente | Fidelidade | Notas |
|---|---|---|---|
| `Agent` tool (spawn subagente) | `Task` tool | **Alta** | `Task` lança subagente autônomo com contexto próprio. Diferença: não herda contexto automaticamente; requer briefing explícito. |
| `AskUserQuestion` modal síncrono | `question` tool | **Alta** | `question` apresenta opções estruturadas ao usuário. Bloqueia até resposta. Equivalente direto. |
| `PreToolUse` hook | `PreToolUse` hook (`.js`) | **Alta** | OpenCode recebe JSON via `stdin` com `{tool_name, tool_input, ...}` e pode emitir advisory ou `block` (exit 2). |
| `PostToolUse` hook | `PostToolUse` hook (`.sh`/`.js`) | **Alta** | Mesmo padrão de JSON via stdin. |
| `SessionStart` hook | `SessionStart` hook (`.sh`/`.js`) | **Alta** | Injetado no início de cada sessão. OpenCode suporta shell e JS. |
| `Stop` hook | `Stop` hook | **Média** | OpenCode não documenta `Stop` hook nativo, mas `PostToolUse` + sessão timeout podem ser combinados. |
| `EnterPlanMode` | `skill` tool + instruções | **Média** | OpenCode não tem modo plano nativo. Deve ser simulado via skill que impõe read-only e gera documentação. |
| `MEMORY.md` | `~/.config/opencode/memory/` ou PARA | **Alta** | OpenCode não tem memória automática, mas pode escrever para disco. |
| `Skill` tool | `skill` tool | **Alta** | Equivalente direto. Carrega `SKILL.md` por demanda. |
| `Bash` tool | `bash` tool | **Alta** | Equivalente direto. |
| `Read/Write/Edit` | `read/write/edit` | **Alta** | Equivalentes diretos. |

### 2.1 Diferenças Críticas

1. **Contexto de Subagente:** No Claude Code, `Agent` herda o contexto da conversa do pai. No OpenCode, `Task` recebe apenas o prompt explícito. Isso exige que o `DISPATCH_REQUEST` inclua um **context packet** mais rico (histórico de comments, estado do gate, arquivos relevantes).
2. **Hooks são Advisory por Padrão:** Os hooks GSD no OpenCode são advisory-only (não bloqueiam). O hook `gsd-validate-commit.sh` demonstra que `exit 2` com JSON `{"decision": "block"}` pode bloquear. Precisamos validar se o OpenCode respeita esse padrão para todos os hooks.
3. **Sem Plugin Manifesto:** OpenCode não reconhece `.claude-plugin/plugin.json`. A ativação será via skill principal (`pipeline-orchestrator:pipeline`) + hooks instalados manualmente em `~/.config/opencode/hooks/`.

---

## 3. Arquitetura de Hooks para OpenCode

### 3.1 Hooks Necessários (Mapeamento do Pipeline)

| Hook | Arquivo | Evento | Função | Hardness |
|---|---|---|---|---|
| `sentinel-hook.js` | `PreToolUse` | Antes de `Task` (spawn) | Valida transição de fase, run_id, schema_version. | **BLOCK** se inválido |
| `scope-lock-hook.js` | `PreToolUse` | Antes de `Write`/`Edit` | Verifica `CHANGE_CONTRACT`. Bloqueia se fora de escopo. | **BLOCK** se violado |
| `dispatch-guard.js` | `PreToolUse` | Antes de `Task` | Bloqueia adversarial reviewers de lerem artefatos do implementer. | **BLOCK** se isolamento violado |
| `session-lock-hook.js` | `SessionStart` | Início de sessão | Garante uma única pipeline run ativa por workspace. | **BLOCK** se concorrente |
| `session-cleanup-hook.js` | `PostToolUse` / `Stop` | Fim de sessão | Fecha spans Langfuse, arquiva estado órfão. | **AUDIT** (não bloqueia) |
| `langfuse-hook.js` | `PreToolUse` + `PostToolUse` | Antes/depois de `Task` | Emite span para Langfuse Cloud com metadados do subagente. | **AUDIT** (opt-in) |
| `edit-guard-hook.js` | `PreToolUse` | Antes de `Write`/`Edit` | Limita writes a `.pipeline/` durante execução de pipeline. | **BLOCK** se violado |
| `skill-frontmatter-parser.js` | `PreToolUse` | Antes de `skill` | Valida `sentinel_checkpoints`, `gates_at`, `agent_type` no SKILL.md carregado. | **WARN/DENY** |
| `stop-hook.js` | `Stop` | Fim de sessão abrupto | Grava `run-log.jsonl` com resumo da execução. | **AUDIT** |
| `cleanup-orphan-sentinel-state.sh` | `SessionStart` | Início de sessão | Arquiva `sentinel-state.json` com mais de 24h. | **AUDIT** |

### 3.2 Formato de Hook no OpenCode

Baseado nos hooks GSD existentes, o formato é:

```javascript
#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;
    const toolInput = data.tool_input;

    // Lógica de validação...

    if (shouldBlock) {
      process.stdout.write(JSON.stringify({
        decision: "block",
        reason: "Mensagem de bloqueio"
      }));
      process.exit(2); // Exit 2 = block
    }

    // Advisory (não bloqueia)
    if (shouldWarn) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: "Mensagem de aviso"
        }
      }));
    }

    process.exit(0); // Exit 0 = allow
  } catch {
    process.exit(0); // Silent fail = allow
  }
});
```

### 3.3 Configuração de Hooks

OpenCode não parece ter um `settings.json` equivalente ao `.claude/settings.json` para registrar hooks. Os hooks em `~/.config/opencode/hooks/` são globais. Para ativação por projeto, usaremos:

- **Diretório global:** `~/.config/opencode/hooks/` — hooks sempre ativos (sentinel, scope-lock, cleanup-orphan)
- **Diretório local:** `.opencode/hooks/` — hooks específicos do projeto (se OpenCode suportar; precisa validar)
- **Arquivo de config:** `.opencode/config.json` — ativa/desativa hooks por projeto (similar ao `.planning/config.json` do GSD)

---

## 4. Workflow de Orquestração Adaptado

### 4.1 Fase 0 — Triage (task-orchestrator)

**Claude Code:** `pipeline-controller` dispara `task-orchestrator` via `Agent` tool.
**OpenCode:** `pipeline-orchestrator:pipeline` skill é carregada. O agente principal (você, usuário) executa a skill, que instrui a usar `question` para classificar a tarefa.

```yaml
### ORCHESTRATOR_DECISION v1 (OpenCode)
task_type: Feature
complexity: MEDIA
pipeline_selected: feature-heavy
required_agents:
  - task-orchestrator
  - information-gate
  - plan-architect
```

### 4.2 Fase 0b — Information Gate

**Claude Code:** `information-gate` emite `GATE_REQUEST` como YAML no output. Pai captura via regex e chama `AskUserQuestion`.
**OpenCode:** `information-gate` é um `Task` subagente. Ele posta `GATE_REQUEST` como **comentário estruturado** na conversa. O agente pai (ou o usuário) vê o `question` tool com as opções.

**Diferença crítica:** No Claude Code, o subagente não pode chamar `AskUserQuestion` (Achado 7). No OpenCode, o subagente `Task` TAMBÉM não pode chamar `question` — é uma limitação similar. A solução é a mesma: o subagente emite `GATE_REQUEST` como texto, e o agente pai (ou o harness) apresenta o `question`.

### 4.3 Fase 1.5 — Planning (plan-architect)

**Claude Code:** `plan-architect` entra em `EnterPlanMode`, pesquisa read-only, emite `IMPLEMENTATION_PLAN`.
**OpenCode:** `plan-architect` é um `Task` subagente com instruções explícitas de **modo pesquisa**. Ele não chama `write`/`edit` em código de produção, apenas `read`/`glob`/`grep`. Ao final, posta o plano como comentário estruturado.

**Simulação de Plan Mode:**
- A skill `pipeline-orchestrator:pipeline` carrega uma sub-skill `plan-mode` que adiciona ao prompt: "Você está em modo pesquisa. NÃO use Write/Edit em código de produção. Use apenas Read, Glob, Grep."
- O `scope-lock-hook.js` reforça: se `plan-architect` tentar `Write`/`Edit` fora de `.pipeline/`, bloqueia.

### 4.4 Fase 2 — Execução em Batches (executor-controller)

**Claude Code:** `executor-controller` dispara `executor-implementer-task` via `Agent` tool, que tem acesso a todas as tools.
**OpenCode:** `executor-controller` usa `Task` para disparar `executor-implementer-task`. O briefing do `Task` deve incluir:
- O `CHANGE_CONTRACT` completo
- O arquivo de tarefa atual (TASK-001)
- O estado do gate anterior (checkpoint passou?)
- Links para os requirements.md e design.md

**TDD no OpenCode:**
1. `pre-tester` (Task) escreve teste falho → posta evidência
2. `executor-implementer-task` (Task) lê evidência → implementa mínimo → posta evidência
3. `checkpoint-validator` (Task) roda build + testes → posta `CHECKPOINT_RESULT`

### 4.5 Fase 2e — Adversarial Review (review-orchestrator)

**Claude Code:** `review-orchestrator` dispara 3 `Agent` em paralelo com contexto ZERO.
**OpenCode:** `review-orchestrator` dispara 3 `Task` em **mensagens paralelas** (multi-Task call). Cada `Task` recebe apenas:
- O diff da implementação (via `read` do arquivo modificado)
- O checklist de segurança/arquitetura/qualidade
- **ZERO contexto do implementador** (nenhum briefing sobre intenção)

**Isolamento de Contexto:**
- O `dispatch-guard.js` intercepta `Task` calls de reviewers e verifica se eles tentam ler arquivos do implementer (ex: `$AGENT_HOME/memory/` do implementer). Se sim, bloqueia.
- No OpenCode, cada `Task` é um processo separado, então o isolamento é mais forte que no Claude Code.

### 4.6 Fase 3 — Closure (final-validator)

**Claude Code:** `final-validator` emite `PA_DE_CAL` + `AskUserQuestion` para score.
**OpenCode:** `final-validator` (Task) emite `PA_DE_CAL` como comentário. Se `LANGFUSE_ENABLED`, o agente pai apresenta `question` para coleta de notas 1-5.

---

## 5. Estrutura de Skills para OpenCode

### 5.1 Skill Principal

```yaml
# ~/.config/opencode/skills/pipeline-orchestrator/SKILL.md
---
name: pipeline-orchestrator
description: Orquestração multi-agente com governança, gates adversariais, TDD obrigatório e audit trail. Use para qualquer trabalho não-trivial que exija planejamento, execução disciplinada e revisão.
when_to_use: Quando o usuário pede para implementar, corrigir, auditar ou especificar algo que envolva múltiplos arquivos, decisões de arquitetura, ou revisão de qualidade.
---

# Pipeline Orchestrator para OpenCode

## Iron Laws (inalteráveis)
1. TDD obrigatório: RED antes de GREEN
2. Ask-first em ambiguidade: use `question` tool
3. Self-review antes de done
4. Stop Rule: 2 falhas = pare
5. Evidence-based: cite file:line
6. Diff mínimo
7. Decisões em comments, não em memória

## Fases
1. **Triage** — Carregar `pipeline-orchestrator-classification` skill
2. **Information Gate** — Carregar `pipeline-orchestrator-contracts` para GATE_REQUEST
3. **Planning** — Carregar `pipeline-orchestrator-spec-protocol` se type=Spec; senão plano inline
4. **Execution** — Batches com TDD (Task para implementer → Task para reviewer → question para gate)
5. **Adversarial** — 3 Task paralelos com zero contexto
6. **Closure** — PA_DE_CAL + score Langfuse (se habilitado)
```

### 5.2 Skills Secundárias (Reutilizáveis do Projeto)

Todas as skills em `.pipeline/skills/` já são compatíveis com OpenCode (são arquivos markdown puros):

- `pipeline-orchestrator-iron-laws`
- `pipeline-orchestrator-contracts`
- `pipeline-orchestrator-classification`
- `pipeline-orchestrator-tdd`
- `pipeline-orchestrator-spec-protocol`
- `pipeline-orchestrator-adversarial`
- `pipeline-orchestrator-bugfix-method`
- `pipeline-orchestrator-vsa`
- `pipeline-orchestrator-ux-method`
- `pipeline-orchestrator-audit-method`

### 5.3 Instalação de Skills no OpenCode

O OpenCode descobre skills em `~/.config/opencode/skills/` (similar ao Claude Code). O script `install-junctions.bat` do projeto Pipeline Orchestrator já cria junctions para `~/.paperclip/skills/`. Precisamos de um equivalente para OpenCode:

```batch
:: install-opencode-skills.bat
@echo off
set SOURCE=%CD%\.pipeline\skills
set TARGET=%USERPROFILE%\.config\opencode\skills

if not exist "%TARGET%" mkdir "%TARGET%"

for /d %%D in ("%SOURCE%\*") do (
  mklink /J "%TARGET%%%~nD" "%%~fD"
)
```

---

## 6. Considerações de Fidelidade

### 6.1 O que se mantém 1:1

| Componente | Fidelidade | Como |
|---|---|---|
| Contratos de texto (GATE_REQUEST, PA_DE_CAL) | **100%** | São YAML em markdown; independente de runtime |
| Iron Laws | **100%** | Regras comportamentais; independente de runtime |
| EARS pattern para requirements | **100%** | Formato markdown |
| 25 checks do Format Gate | **100%** | Lógica de validação documental |
| 12 eixos do Content Review | **100%** | Critérios de qualidade |
| 6 eixos do Post-Impl Validator | **100%** | Critérios de fidelidade |
| Progress scoring (spec_grade) | **100%** | Algoritmo documentado |

### 6.2 O que requer adaptação

| Componente | Fidelidade | Adaptação Necessária |
|---|---|---|
| Subagente context-isolation | **95%** | `Task` no OpenCode já é mais isolado que `Agent` no Claude Code. Vantagem. |
| Hooks de enforcemente | **90%** | Mesmo padrão de JSON via stdin. Precisa converter `.cjs` → `.js` e ajustar schema de entrada. |
| Plan Mode | **80%** | Não existe nativamente. Simulado via skill + hook de bloqueio de Write/Edit. |
| AskUserQuestion síncrono | **100%** | `question` tool é equivalente direto. |
| Langfuse tracing | **90%** | Mesma lógica, mas hooks OpenCode têm schema de entrada/saída ligeiramente diferente. |
| Session locking | **85%** | OpenCode pode não propagar `PAPERCLIP_RUN_ID` ou equivalente. Precisa usar `process.env` ou arquivo de lock. |
| Auto-memory (MEMORY.md) | **70%** | OpenCode não tem memória automática por projeto. Requer escrita explícita em `$AGENT_HOME/memory/` ou uso do sistema PARA. |
| Plugin auto-discovery | **0%** | OpenCode não lê `.claude-plugin/plugin.json`. Requer carregamento manual da skill. |

### 6.3 Riscos de Perda de Fidelidade

1. **Hook não-bloqueante:** Se o OpenCode não respeitar `exit 2` como block em todos os hooks (apenas em alguns), o `scope-lock` e o `sentinel` perdem eficácia. **Mitigação:** validar empiricamente cada hook com teste de stress.
2. **Task sem herança de contexto:** Se o briefing do `Task` for incompleto, o subagente pode perder decisões anteriores. **Mitigação:** enriquecer o briefing com "context packet" completo (histórico de comments + estado atual + files relevantes).
3. **Sem manifesto de plugin:** O usuário precisa lembrar de carregar a skill `/pipeline-orchestrator:pipeline`. **Mitigação:** criar alias no shell ou instruções no `CLAUDE.md` do projeto.

---

## 7. Próximos Passos

1. **[P0] Validar schema de hooks do OpenCode:** Confirmar que `exit 2` + JSON `{"decision":"block"}` funciona para `PreToolUse` em tools `Write`, `Edit`, `Task`.
2. **[P0] Criar skill mestre `pipeline-orchestrator`:** Consolidar o workflow em um SKILL.md carregável.
3. **[P1] Converter hooks críticos:** `sentinel-hook.js`, `scope-lock-hook.js`, `dispatch-guard.js` do formato `.cjs` (Claude) para `.js` (OpenCode), ajustando leitura de stdin.
4. **[P1] Criar script de instalação:** `install-opencode-skills.bat` + `install-opencode-hooks.sh`.
5. **[P2] Implementar simulação de Plan Mode:** Skill `plan-mode` + hook que bloqueia Write/Edit quando flag `PLAN_MODE_ACTIVE` está setada.
6. **[P2] Adaptar Langfuse hooks:** Ajustar `langfuse-hook.js` para schema de entrada/saída do OpenCode.
7. **[P3] Teste de fidelidade end-to-end:** Rodar uma pipeline MEDIA real (ex: bugfix) e comparar `gate-decisions.jsonl` + `TRACE.md` com o output do Claude Code.

---

## 8. Decisões de Design a Tomar

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| 1 | Formato de entrada dos hooks | (A) JSON via stdin como GSD; (B) Env vars como Claude Code | **A** — já é o padrão observado no OpenCode |
| 2 | Ativação de hooks por projeto | (A) Global em `~/.config/opencode/hooks/`; (B) Local em `.opencode/hooks/` | **B** se suportado; senão **A** com config opt-in |
| 3 | Contexto do subagente Task | (A) Briefing curto; (B) Context packet completo (YAML com histórico + estado + files) | **B** — compensa falta de herança de contexto |
| 4 | Memória entre sessões | (A) `$AGENT_HOME/memory/`; (B) Sistema PARA do Paperclip; (C) Arquivos `.pipeline/memory/` | **C** — mantém tudo no projeto, facilita backup/audit |
| 5 | Score collection Langfuse | (A) No final de toda pipeline; (B) Só quando `LANGFUSE_ENABLED=true`; (C) Perguntar ao usuário | **B** — silent no-op por padrão, como no original |

---

*Documento elaborado para garantir que a adaptação do Pipeline Orchestrator ao OpenCode preserve ao máximo a governança, a auditabilidade e a qualidade do sistema original.*
