# 01 — Inventário dos Hooks

> Mapeia os trinta e seis scripts de hook registrados no manifesto do repositório canônico, organizados por evento do harness onde disparam hoje, com o destino de cada um na portabilidade para Z-Code.

## Veredicto

Dos trinta e seis hooks, **trinta e três permanecem sem alteração** (KEEP), **um é removido** (REMOVE — o hook de telemetria Langfuse), e **dois são migrados** de evento (MIGRATE — saem do `SubagentStop`, que não existe no Z-Code, para `PostToolUse` com matcher `Agent`). Há ainda uma sutileza: o hook `stop-gate-hook` aparece três vezes no canônico (em `Stop`, `SessionEnd`, `StopFailure`); no port ele sobrevive apenas em `Stop`, porque `SessionEnd` e `StopFailure` não existem no Z-Code e o hook já está em `Stop`.

> Nota sobre a contagem: a pasta de hooks tem trinta e sete arquivos, mas um deles é uma biblioteca compartilhada (usada por outros hooks via require), não um hook registrado no manifesto. Por isso o inventário cobre trinta e seis.

---

## TDD checklist (critérios verificáveis)

- [x] T1: contagem total == trinta e seis hooks registrados (verificável parseando o manifesto)
- [x] T2: cada hook do canônico aparece no inventário (alguns aparecem múltiplas vezes porque têm múltiplos registros: stop-gate-hook três vezes, langfuse-hook duas, edit-guard-hook duas)
- [x] T3: o hook `langfuse-hook` marcado como REMOVE
- [x] T4: os hooks `subagent-stop-commit-hook` e `corrective-error-signal-gate` marcados como MIGRATE de `SubagentStop` para `PostToolUse`
- [x] T5: o hook `stop-gate-hook` aparece marcado como KEEP (em Stop) com nota de dedup (SessionEnd e StopFailure somem)
- [x] T6: nenhum caminho de arquivo na prosa narrativa (paths só em blocos de código)
- [x] T7: acrônimos expandidos na primeira ocorrência (matcher, HMAC, etc.)

---

## Termos do domínio usados neste arquivo

Estes termos complementam o glossário do arquivo de visão geral. Aparecem aqui na forma expandida antes do uso no corpo.

- **arm** (do inglês "armar") — estado da sessão que indica que um pipeline está em execução. Quando a sessão está "armada", certos hooks bloqueiam ações fora do fluxo. O arm é gravado por um hook específico e lido pelo arm-gate.
- **arm-gate** — o gate (ponto de checagem) que bloqueia comandos shell quando a sessão está armada mas o plano ainda não foi registrado.
- **ledger** (do inglês "livro-razão") — registro linear e imutável dos passos da execução. Cada passo da fase é carimbado no ledger; gates validam a ordem.
- **dispatch** (do inglês "despachar") — o ato de chamar um subagente (agente de nível dois) a partir de um controlador.
- **run-id** — identificador único de uma execução de pipeline. Gerado no início, presente em todos os logs.
- **HMAC** (Hash-based Message Authentication Code, "código de autenticação de mensagem baseado em hash") — assinatura criptográfica que protege arquivos de estado contra adulteração.
- **matcher** — critério que diz qual ferramenta do harness dispara um hook (ex.: `Edit|Write` significa "dispara nas ferramentas Edit ou Write").
- **manifesto de hooks** — o arquivo JSON que lista quais hooks disparam em quais eventos.

---

## Os oito eventos do canônico vs os sete do Z-Code

O canônico registra hooks em oito eventos. O Z-Code suporta sete eventos (informação confirmada no guia de configuração do Z-Code). Os eventos do canônico são: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`, `StopFailure`, `SubagentStop`. Os do Z-Code são: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop`.

Três eventos canônicos não têm equivalente direto no Z-Code: `SessionEnd`, `StopFailure`, `SubagentStop`. A migração é:

- `SessionEnd` (fim de sessão) → sem equivalente; os hooks dele voltam para `Stop` (que cobre o caso).
- `StopFailure` (parada com falha) → sem equivalente; idem, vai para `Stop`.
- `SubagentStop` (fim de subagente) → sem equivalente; os hooks migram para `PostToolUse` com matcher `Agent` (dispara quando uma chamada de agente termina).

Note que o Z-Code tem dois eventos que o canônico não usa: `PermissionRequest` e `PostToolUseFailure`. São oportunidades para o futuro, mas o port não os adiciona por ora.

---

## Critério de destino no port

- **KEEP** — permanece, mesmo evento, mesma função.
- **MIGRATE** — permanece, mas muda de evento (anotado para onde vai).
- **REMOVE** — sai do port (decisão de portabilidade: Langfuse).
- **DEDUP** — versão duplicada do hook noutro evento é eliminada (a versão em `Stop` é a que sobrevive).

---

## Inventário por evento canônico

### SessionStart (quatro entradas)

| Hook | Matcher | Função | Destino |
|---|---|---|---|
| `[prompt banner]` | (vazio) | Mensagem de boas-vindas listando entry points e modo de enforcement | KEEP |
| `cleanup-orphan-sentinel-state-hook.cjs` | (vazio) | Limpa estado sentinel órfão de sessões anteriores | KEEP |
| `pipeline-session-arm-hook.cjs` | (vazio) | Arma a sessão para execução de pipeline | KEEP |
| `enforcement-surface-verify-hook.cjs` | (vazio) | Verifica a superfície de enforcement (warn ou deny) | KEEP |

### UserPromptSubmit (três entradas)

| Hook | Matcher | Função | Destino |
|---|---|---|---|
| `force-pipeline-agents.cjs` | (vazio) | Garante que prompts que pareçam pipeline usem os agentes do plugin | KEEP |
| `session-lock-hook.cjs` | (vazio) | Trava sessão exclusiva (impede concorrência manual durante run) | KEEP |
| `pipeline-arm-writer.cjs` | (vazio) | Escreve marker de arm baseado no prompt do usuário | KEEP |

### PreToolUse (dezoito entradas, em seis blocos matcher)

| Hook | Matcher | Função | Destino |
|---|---|---|---|
| `audit-read-budget-gate.cjs` | `Read\|Grep\|Glob` | Limita leituras em modo audit (anti-vazamento de orçamento) | KEEP |
| `sentinel-hook.cjs` | `Agent` | Valida dispatched agent antes de rodar (sentinel guardião) | KEEP |
| `langfuse-hook.cjs` | `Agent` | Telemetria Langfuse para dispatch de agente | **REMOVE** |
| `dispatch-record-hook.cjs` | `Agent` | Registra o dispatch no log de run | KEEP |
| `audit-dispatch-marker.cjs` | `Agent` | Marca dispatch para auditoria | KEEP |
| `parallel-dispatch-gate.cjs` | `Agent` | Valida que grupos marcados como paralelo realmente disparam em paralelo | KEEP |
| `step-ledger-gate.cjs` | `Agent` | Valida step atual do ledger antes do dispatch | KEEP |
| `gate-log-gate.cjs` | `Agent` | Valida que gates só entraram no log pelo caminho certo | KEEP |
| `batch-review-gate.cjs` | `Agent` | Garante que cada batch passou por revisão adversarial | KEEP |
| `checkpoint-verdict-gate.cjs` | `Agent` | Valida veredito de checkpoint antes de avançar | KEEP |
| `phase-verdict-gate.cjs` | `Agent` | Valida veredito de fase antes da transição | KEEP |
| `dispatch-guard.cjs` | `Skill\|Agent` | Bloqueia `Skill()` quando deveria ser `Agent()` (erro comum) | KEEP |
| `edit-guard-hook.cjs` | `Edit\|Write\|NotebookEdit\|MultiEdit` | Bloqueia subagente de editar fora de `.pipeline/` | KEEP |
| `scope-lock-hook.cjs` | `Edit\|Write\|NotebookEdit\|MultiEdit` | Trava de escopo: bloqueia Write/Edit fora dos arquivos permitidos | KEEP |
| `edit-guard-hook.cjs` (2ª entrada) | `Bash\|PowerShell` | Mesmo guard, agora para comandos shell | KEEP (matcher distinto, ambos sobrevivem) |
| `spec-seal-guard.cjs` | `Bash\|PowerShell` | Bloqueia comandos que tentam alterar spec selada | KEEP |
| `dispatch-pending-gate.cjs` | `.*` (todos) | Bloqueia se há dispatch pendente não resolvido | KEEP |
| `pipeline-arm-gate.cjs` | `.*` (todos) | Bloqueia Bash antes do plano estar registrado (o arm-gate) | KEEP |

### PostToolUse (sete entradas, em seis blocos matcher)

| Hook | Matcher | Função | Destino |
|---|---|---|---|
| `langfuse-hook.cjs` (2ª entrada) | `Agent` | Telemetria Langfuse pós-dispatch | **REMOVE** |
| `step-ledger-stamp.cjs` | `Agent` | Carimba o step no ledger após dispatch | KEEP |
| `human-gate-record.cjs` | `AskUserQuestion` | Registra gate humano quando usuário responde | KEEP |
| `machine-evidence-hook.cjs` | `Bash\|PowerShell` | Captura evidência de máquina após comando shell | KEEP |
| `corrective-dispatch-gate.cjs` | `Edit\|Write\|NotebookEdit\|MultiEdit\|Bash\|PowerShell\|Read\|Glob\|Grep` | Despacha correção quando erro é detectado | KEEP |
| `sentinel-state-autosign.cjs` | `Edit\|Write\|NotebookEdit\|MultiEdit` | Re-assina estado sentinel automaticamente após escrita | KEEP |
| `audit-read-counter-hook.cjs` | `Read\|Grep\|Glob` | Conta leituras para o orçamento de audit | KEEP |

### Stop (cinco entradas)

| Hook | Função | Destino |
|---|---|---|
| `stop-gate-hook.cjs` | Gate de parada: valida que a execução pode terminar | KEEP (absorve as duplicatas de SessionEnd/StopFailure) |
| `completion-checklist.cjs` | Roda a checklist de conclusão antes de aceitar o Stop | KEEP |
| `session-cleanup-hook.cjs` | Limpa estado de sessão ao terminar | KEEP |
| `stop-hook.cjs` | Escreve a linha de resumo no log de run ao parar | KEEP |
| `e2e-eval-gate.cjs` | Avalia fidelidade end-to-end ao parar | KEEP |

### SessionEnd (uma entrada — evento não existe no Z-Code)

| Hook | Função | Destino |
|---|---|---|
| `stop-gate-hook.cjs` (duplicata) | Mesma função da entrada em Stop | **DEDUP** — eliminada; já coberta por Stop |

### StopFailure (uma entrada — evento não existe no Z-Code)

| Hook | Função | Destino |
|---|---|---|
| `stop-gate-hook.cjs` (duplicata) | Mesma função da entrada em Stop | **DEDUP** — eliminada; já coberta por Stop |

### SubagentStop (duas entradas — evento não existe no Z-Code)

| Hook | Função | Destino |
|---|---|---|
| `subagent-stop-commit-hook.cjs` | Grava commit de run no log quando subagente termina | **MIGRATE** → `PostToolUse` com matcher `Agent` |
| `corrective-error-signal-gate.cjs` | Despacha correção quando subagente reporta erro | **MIGRATE** → `PostToolUse` com matcher `Agent` |

---

## Resumo do destino no port

| Destino | Quantidade | Hooks |
|---|---|---|
| **KEEP** | trinta e três | todos exceto os abaixo |
| **REMOVE** | um (com duas entradas no manifesto) | `langfuse-hook.cjs` |
| **MIGRATE** | dois | `subagent-stop-commit-hook.cjs`, `corrective-error-signal-gate.cjs` |
| **DEDUP** | duas entradas duplicadas eliminadas | as duas entradas extras de `stop-gate-hook` |

**Aritmética**: trinta e seis scripts únicos registrados no manifesto. No port: trinta e três mantêm + um removido + dois migrados = trinta e seis scripts no destino (um foi removido, mas contado como destino, não como sobrevivente). As duplicatas eliminadas não reduzem a contagem de scripts — o `stop-gate-hook` continua existindo, só deixa de ser registrado em SessionEnd e StopFailure.

---

## Risco controlado da migração SubagentStop → PostToolUse

O hook `subagent-stop-commit-hook` foi desenhado para disparar quando um subagente termina. Migrar para `PostToolUse` com matcher `Agent` faz ele disparar a cada chamada de `Agent` completada — o que é semanticamente próximo, mas não idêntico. A diferença: no canônico, o evento `SubagentStop` dispara uma vez por subagente; o `PostToolUse:Agent` pode disparar múltiplas vezes se o controlador fizer várias chamadas encadeadas.

**Mitigação**: o hook tem guarda interna idempotente (checa se já gravou commit para aquele run-id + agent-id). Portanto, dispara múltiplas vezes não causa duplicação no log — apenas overhead de checagem. Verificar isso durante o smoke test do port é mandatório (Passo F6 do plano de portabilidade).

O hook `corrective-error-signal-gate` tem o mesmo padrão: lê erro do subagente, decide se despacha correção. A guarda interna é por combinação (run-id + agent + erro-hash), evitando redispatch duplicado.

---

## Caminhos e comandos referenciados

```
# manifesto de hooks (canônico, oito eventos)
Pipeline-Orchestrator/hooks/hooks.json

# pasta de scripts de hook (37 arquivos .cjs)
Pipeline-Orchestrator/.claude/hooks/

# hook de telemetria a remover
Pipeline-Orchestrator/.claude/hooks/langfuse-hook.cjs

# hooks a migrar de SubagentStop para PostToolUse:Agent
Pipeline-Orchestrator/.claude/hooks/subagent-stop-commit-hook.cjs
Pipeline-Orchestrator/.claude/hooks/corrective-error-signal-gate.cjs
```
