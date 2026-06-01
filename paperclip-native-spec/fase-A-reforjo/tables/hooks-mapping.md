# Hooks Mapping — Claude Code ↔ Paperclip Fase A

**Status:** Draft v1.1 (Onda A1 + calibração 2026-06-01)
**Data:** 2026-05-24 · calibrado 2026-06-01
**Fonte canônica:** `D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/.claude/hooks/*.cjs`
**Total de hooks CC:** 12 arquivos (excluindo `__tests__/` e `skill-frontmatter-parser.cjs` que é shared module, não hook)

> ⚠️ **CALIBRADO PÓS-EXECUÇÕES — ver `A0-CALIBRACAO-pos-execucoes-2026-06-01.md`.** Dois ajustes: (1) onde a tabela disser `executionState.pipeline.*`, leia o comentário estruturado `PIPELINE_STATE` (A0 §3 — o campo está morto). (2) **Teto de fidelidade (A0 §6):** os hooks de runtime do Claude Code (`sentinel-hook`, `edit-guard`, `scope-lock`, `dispatch-guard`) IMPÕEM comportamento no nível do processo; os "equivalentes Paperclip" abaixo são **cooperativos** (o cargo precisa escolher consultá-los), não impostos. A evidência real (`approvals=0` em 54 execuções) confirma que, sem um forçador, esse caminho não é seguido organicamente.

> No Claude Code, hooks `.cjs` são scripts executados em eventos de ciclo de vida (PreToolUse, SessionStart, Stop).
> No Paperclip, esses hooks NÃO executam — o Paperclip orquestra seu próprio lifecycle.
> Esta tabela mapeia QUAL problema cada hook resolve → COMO o Paperclip resolve o mesmo problema sem hook.

---

## Mapeamento Hook → Equivalente Paperclip

### Hook 1: cleanup-orphan-sentinel-state-hook.cjs

**Evento CC:** SessionStart
**O que faz no CC:** Auto-archive de `sentinel-state.json` com idade > 24h via atomic rename. Fecha o Achado B1-001 (workaround manual).
**Por que existe:** Sessions abandonadas deixavam sentinel-state.json orphan bloqueando próximas sessões.

**Equivalente Paperclip:**
- O `executionState` da issue não é um arquivo — existe enquanto a issue existir
- Issues "orphan" são visíveis no quadro do Paperclip (status=paused ou in_progress sem atividade)
- Sentinel-agent em cron detecta issues paradas há > 24h e cria approval issue de alerta para o Board
- **Implementação:** `lib/paperclip-sentinel.cjs` função `detectOrphanSessions(issueList, thresholdHours=24)`

### Hook 2: completion-checklist.cjs

**Evento CC:** Stop (post-execução)
**O que faz no CC:** Valida checklist de conclusão antes de encerrar sessão.
**Por que existe:** Garantir que passos de fechamento não sejam esquecidos.

**Equivalente Paperclip:**
- O workflow spec de fechamento (`PAPERCLIP-SPEC-WORKFLOW.md` fase de closeout) contém a checklist
- O cargo `spec-closer` (Project Closure Officer) executa a checklist como parte do workflow
- Não precisa de mecanismo de hook — está no fluxo do cargo

### Hook 3: dispatch-guard.cjs

**Evento CC:** PreToolUse (Agent tool)
**O que faz no CC:** Valida que o agente sendo despachado está no `expected_next` do sentinel-state.json. Bloqueia dispatch fora de sequência.
**Por que existe:** Impedir que o pipeline-controller despache agentes na ordem errada.

**Equivalente Paperclip:**
- O cargo executor verifica a sequência consultando o `executionState.pipeline.current_phase` antes de criar sub-tarefas
- Se a fase atual não é a esperada, o cargo cria approval issue em vez de prosseguir
- **DP-09:** "Pipeline routing ambíguo após classificação → consultar team-registry antes de qualquer spawn"
- Enforcement: INVARIANTS block + decision point DP-09

### Hook 4: edit-guard-hook.cjs

**Evento CC:** PreToolUse (Edit/Write tools)
**O que faz no CC:** Garante que edições respeitem restrições de escopo (não editar arquivos fora do CHANGE_CONTRACT).
**Por que existe:** Prevenir scope creep durante implementação.

**Equivalente Paperclip:**
- O cargo executor lê o `executionState.pipeline.change_contract.allowed_files` antes de qualquer mudança
- **DP-19 (Scope Lock):** "Arquivo fora do CHANGE_CONTRACT encontrado → não tocar, reportar"
- Enforcement: INVARIANTS block + self-check protocol (A2-design.md §3.3 item 2)
- Sem enforcement de runtime — é de prompt. Limitação conhecida (A2 Lente 10).

### Hook 5: force-pipeline-agents.cjs

**Evento CC:** PreToolUse (Agent tool)
**O que faz no CC:** Força que apenas agentes autorizados sejam despachados. Valida `agent_type` do SKILL.md frontmatter.
**Por que existe:** Impedir que o controller despache agentes não-declarados.

**Equivalente Paperclip:**
- Sub-tarefas no Paperclip só podem ser criadas para cargos existentes na empresa
- O cargo executor cria sub-tarefas pelo slug do cargo destino
- Se o slug não existe, a API do Paperclip rejeita a criação
- Enforcement: validação de API nativa (diferente do CC, aqui o enforcement é real no runtime)

### Hook 6: langfuse-hook.cjs

**Evento CC:** PreToolUse (Agent tool)
**O que faz no CC:** Instrumentação de observabilidade — envia traces de execução para o Langfuse.
**Por que existe:** Observabilidade de pipelines multi-agente.

**Equivalente Paperclip:**
- Activity log nativo do Paperclip já é o equivalente funcional
- Para Langfuse específico: não implementado na Fase A (backlog). O activity log é suficiente para audit
- **Lacuna:** Sem traces estruturados no formato Langfuse. Aceitável para Fase A.

### Hook 7: scope-lock-hook.cjs

**Evento CC:** PreToolUse (Edit/Write tools)
**O que faz no CC:** Lock de escopo por tarefa — impede modificar arquivos fora do escopo declarado da task atual.
**Por que existe:** Complementa o edit-guard-hook com granularidade por task.

**Equivalente Paperclip:**
- Idêntico ao edit-guard-hook na Fase A — ambos mapeiam para o self-check protocol + INVARIANTS block
- **DP-19 e DP-20:** "Arquivo fora do escopo → reportar; Dependência não declarada → approval issue"
- Enforcement: prompt-based, sem runtime enforcement

### Hook 8: sentinel-hook.cjs

**Evento CC:** PreToolUse (Agent tool)
**O que faz no CC:** Valida estado do sentinel (`sentinel-state.json`) antes de cada spawn. Bloqueia se o sequence_counter indica desvio.
**Por que existe:** Garantir que o pipeline segue a sequência correta de fases e agentes.

**Equivalente Paperclip:**
- O sentinel-agent em cron lê `executionState.pipeline.current_phase` e compara com o activity log
- **DP-53:** "Sentinel detecta inconsistência de fase → BLOCKED, aguardar resolução"
- `lib/paperclip-sentinel.cjs` implementa a lógica de comparação
- A diferença de latência: CC hook é síncrono (antes do spawn), Paperclip sentinel é assíncrono (próximo heartbeat)

### Hook 9: session-cleanup-hook.cjs

**Evento CC:** Stop
**O que faz no CC:** Limpeza de estado ao encerrar sessão — arquiva arquivos temporários.
**Por que existe:** Evitar acúmulo de estado temporário entre sessões.

**Equivalente Paperclip:**
- O `executionState` persiste na issue (não é temporário)
- Issues concluídas (status=done) são "limpas" naturalmente pelo fluxo do Paperclip
- Issues orphan são tratadas pelo sentinel-agent (mapeamento do hook 1)
- **Sem equivalente direto necessário** — o modelo de persistência do Paperclip é diferente

### Hook 10: session-lock-hook.cjs

**Evento CC:** SessionStart
**O que faz no CC:** Previne que múltiplas sessões Claude Code rodem em paralelo no mesmo pipeline.
**Por que existe:** Prevenir race conditions em pipelines concorrentes.

**Equivalente Paperclip:**
- O Paperclip tem um cargo executando por vez por issue (um cargo pega a issue, outros não podem)
- Concorrência entre issues diferentes é suportada (cargos diferentes em issues diferentes)
- Para o mesmo issue: `status=in_progress` em um cargo impede que outro pegue a mesma issue
- **Enforcement nativo** — não precisa de hook

### Hook 11: skill-frontmatter-parser.cjs

**Tipo:** Shared module (não é hook diretamente)
**O que faz no CC:** Parser de YAML do frontmatter de SKILL.md — usado pelos hooks dispatch-guard, force-pipeline-agents e sentinel-hook.
**Por que existe:** Centralizar parsing de frontmatter entre hooks.

**Equivalente Paperclip:**
- O Paperclip usa `SKILL.md` com frontmatter YAML para configuração de skills dos cargos
- O parsing é feito internamente pelo harness do Paperclip
- **Sem equivalente necessário na Fase A** — as libs CJS da Fase A fazem parsing simples de JSON (executionState), não YAML

### Hook 12: stop-hook.cjs

**Evento CC:** Stop
**O que faz no CC:** Chama `lib/run-log.cjs::appendRunLog` ao encerrar sessão — fecha o bug de 1 entrada por 20 runs no run-log agregado.
**Por que existe:** Garantir que o run-log acumule uma entrada por sessão, mesmo em crashes.

**Equivalente Paperclip:**
- O activity log nativo registra automaticamente toda mudança de status
- Ao final de cada pipeline (status → done), o activity log já tem uma entrada de fechamento
- **Sem equivalente necessário** — o activity log é o run-log do Paperclip

---

## Resumo: Enforcement por Mecanismo

| Mecanismo | Hooks CC | Equivalente Paperclip | Tipo de enforcement |
|---|---|---|---|
| Sequência de fases | dispatch-guard, sentinel-hook | INVARIANTS block + sentinel-agent cron | Prompt (soft) → async |
| Escopo de arquivos | edit-guard-hook, scope-lock-hook | INVARIANTS block + self-check protocol | Prompt (soft) |
| Agentes autorizados | force-pipeline-agents | API do Paperclip rejeita cargo inválido | Runtime (hard) |
| Sessions concorrentes | session-lock-hook | Status in_progress nativo | Runtime (hard) |
| State orphan | cleanup-orphan-sentinel-state | sentinel-agent em cron | Async (soft) |
| Observabilidade | langfuse-hook | Activity log nativo | Nativo (always-on) |
| Audit de sessão | stop-hook | Activity log nativo | Nativo (always-on) |

**Conclusão:** O Paperclip tem enforcement de runtime mais forte para autorização de cargos e concorrência (que o CC não tinha). Mas perde em enforcement síncrono de sequência (o CC bloqueava antes do spawn; o Paperclip alerta assincronamente). A Fase A aceita essa troca: enforcement de prompt > enforcement nativo onde o nativo não existe.

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — mapeamento dos 12 hooks CC para equivalentes Paperclip |
