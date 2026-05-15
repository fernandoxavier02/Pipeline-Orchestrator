# Stale Thresholds — SSOT canônico

> **Por que este documento existe:** auditoria 2026-05-15 (H1-003) descobriu que o
> plugin usa três valores diferentes para a palavra "stale" em hooks vs registry
> vs documentação. Os três valores são CORRETOS para conceitos DIFERENTES — o
> problema era nomenclatura ambígua. Este doc fixa a terminologia.

## Os três conceitos de "stale"

| Conceito | Threshold canônico | Constante no código | Aplicação | Quem checa | Ação ao expirar |
|----------|---------------------|----------------------|------------|------------|-------------------|
| **STALE_SPAWN** | **5 minutos** (300_000 ms) | `STALE_SPAWN_THRESHOLD_MS` em `.claude/hooks/sentinel-hook.cjs` | Tempo entre o controller atualizar `sentinel-state.json` e a próxima `Agent` call. Se passou > 5 min, controller provavelmente esqueceu de atualizar o state antes do spawn. | sentinel-hook (PreToolUse:Agent) | **WARNING** advisory no stderr, NÃO bloqueia. O spawn segue, mas o operador é alertado de possível drift de state. |
| **STALE_HEARTBEAT** | **10 minutos** (600_000 ms) | `STALE_HEARTBEAT_THRESHOLD_MS` em `.claude/hooks/session-lock-hook.cjs` + `edit-guard-hook.cjs` | Tempo desde o último UserPromptSubmit refresh de `last_seen_at` em `.pipeline/sessions/<id>.lock`. Se passou > 10 min sem heartbeat, presume-se que o processo Claude Code dono do lock morreu (crash, kill, reboot). | session-lock-hook + edit-guard-hook | **Foreign lock marked completed** (status="completed", completed_reason="stale_heartbeat"). Edits voltam a ser permitidos por outras sessões. NÃO bloqueia a sessão atual. |
| **STALE_CONTEXT** | **24 horas** (86_400_000 ms) | Gate `STALE_CONTEXT` no registry (`references/gates.md:32`) | Tempo desde `last_updated` do sentinel-state.json no momento de `/pipeline continue`. Pipeline retomado de contexto antigo pode acionar em código que já mudou. | sentinel agent em modo STALE_CONTEXT_CHECK + Phase 0a do CONTINUE | **GATE SOFT** por padrão (ask user revalidate). **Escala para HARD** se `complexity == COMPLEXA` E `domains_touched` inclui `core-flow`/`auth`/`data-model`. Em HARD: ABORT_AND_RESTART obrigatório (sem waiver). |

## Por que três valores são corretos

Estes não são duplicações — são tempos característicos de fenômenos diferentes:

- **5 min (STALE_SPAWN):** janela razoável entre dois spawns de subagent no mesmo pipeline. Modelos Opus podem levar 60-90s por spawn em tarefas COMPLEXAs; 5 min cobre 3-4 spawns sem alerta.
- **10 min (STALE_HEARTBEAT):** janela razoável para detectar processo morto sem causar falso-positivo em pausas legítimas (usuário fez café, atendeu telefone, etc.). 5 min seria muito apertado, 30+ min faria locks órfãos persistirem demais.
- **24 h (STALE_CONTEXT):** janela razoável para "código pode ter mudado significativamente". Mais curto criaria fricção em retomada normal (manhã seguinte, fim-de-semana → segunda); mais longo permitiria retomar sobre código drift demais.

## Nomes canônicos (use estes na documentação)

- ✅ **STALE_SPAWN** (5 min) — entre dispatches do controller
- ✅ **STALE_HEARTBEAT** (10 min) — detecção de processo morto
- ✅ **STALE_CONTEXT** (24 h) — gate de /pipeline continue

## Nomes a evitar

- ❌ "STALE_THRESHOLD" genérico — ambíguo entre os três
- ❌ "stale state" sem qualificação — pergunta sempre: stale spawn, heartbeat, ou context?

## Constantes nos arquivos do código

| Arquivo | Constante atual | Constante canônica (v5.3.0+) | Valor |
|---------|------------------|-------------------------------|-------|
| `.claude/hooks/sentinel-hook.cjs:249` | `STALE_THRESHOLD_MS` | `STALE_SPAWN_THRESHOLD_MS` | 300_000 ms (5 min) |
| `.claude/hooks/session-lock-hook.cjs:17` | `STALE_THRESHOLD_MS` | `STALE_HEARTBEAT_THRESHOLD_MS` | 600_000 ms (10 min) |
| `.claude/hooks/edit-guard-hook.cjs:13` | `STALE_HEARTBEAT_MS` | `STALE_HEARTBEAT_THRESHOLD_MS` | 600_000 ms (10 min) |
| `references/gates.md:32` (registry) | `STALE_CONTEXT` | (sem renomeação — já é canônico) | 24h descrito em texto |
| `agents/core/sentinel.md` § D9 ORPHAN STATE CLEANUP | `24h TTL threshold` | (sem renomeação) | 24h |

**Backwards compatibility:** os nomes antigos (`STALE_THRESHOLD_MS`, `STALE_HEARTBEAT_MS`) seguem exportados como aliases por 1 release (v5.3.0 → deprecated; v5.4.0 → remover) para não quebrar consumidores externos.

## Decision tree para diagnóstico

Você viu uma mensagem mencionando "stale" e não sabe qual conceito é?

```
Mensagem origem:
├─ "SENTINEL WARNING: State file is Xs old" (sentinel-hook stderr)
│  → STALE_SPAWN (5 min) — controller esqueceu de atualizar state.json
│  → Ação: revisar pipeline-controller para verificar se Write tool foi
│         chamado entre o último spawn e o atual
│
├─ "completed_reason: stale_heartbeat" (.pipeline/sessions/<id>.lock)
│  → STALE_HEARTBEAT (10 min) — sessão Claude Code dona do lock morreu
│  → Ação: nenhuma — auto-recovery; lock liberado
│
└─ "GATE: STALE_CONTEXT" (gate-decisions.jsonl)
   → STALE_CONTEXT (24 h) — /pipeline continue sobre estado antigo
   → Ação: se SOFT: revalidar Phase 0 ou prosseguir
          se HARD (COMPLEXA + sensitive domain): ABORT_AND_RESTART
```

## Audit reference

Achado H1-003 (audit 2026-05-15) — relatório completo em
`docs/audits/2026-05-15-ifrs16-deep-audit/FASE_H_FINDINGS.md` § "H1-003".
Este documento (SSOT) resolve o drift. Os hooks foram atualizados na mesma
sessão para usar as constantes canônicas como nomes primários, mantendo
aliases para os antigos durante o período de migração.
