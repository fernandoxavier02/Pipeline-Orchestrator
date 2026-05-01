# INVENTORY.md — Slice 0 Reality Check (CC plugin) — REVISED 2026-04-30

**Date:** 2026-04-30 (post-sync revision)
**Auditor:** Claude (controller principal — Slice 0 não delegável)
**Repo:** `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator` (canonical, source-of-truth)
**Cross-ref:** `designs/pipeline-orchestrator-v5-consolidated.md` §1.1 (reality-check) e §16 (10 erros de baseline)
**Cenário:** este INVENTORY foi inicialmente escrito quando o canonical D:\ estava em **3.0.2**, divergente da cache C:\ que tinha **4.1.3**. Em 2026-04-30 o canonical foi sincronizado com a cache 4.1.3 (5 commits: 59e0984..c5c9477). Esta revisão reflete o baseline **pós-sync**.

---

## 1. Contagem REAL pós-sync (4.1.3)

| Métrica | D1/D2/D3 alegavam | INVENTORY v1 (3.0.2) | **Real pós-sync (4.1.3)** | Verificado em |
|---|---|---|---|---|
| `commands/pipeline.md` linhas | ~1100 | 957 | **1112** | `wc -l commands/pipeline.md` |
| `agents/**/*.md` arquivos | 38 | 19 | **38** ✅ | `find agents -name "*.md"` |
| Hooks `.cjs` em `.claude/hooks/` | 7 | 2 | **7** ✅ | dispatch-guard, edit-guard, sentinel, session-cleanup, session-lock, completion-checklist, force-pipeline-agents |
| `references/pipelines/*.md` | 12 | 10 | **12** ✅ | 6 light + 6 heavy: audit, bugfix, implement, user-story, ux-sim, **adversarial** |
| Plugin version | v4.1.x | 3.0.2 / 3.1.0 | **4.1.3** ✅ | `.claude-plugin/plugin.json` |
| `agents/core/pipeline-controller.md` | assumido existir | NÃO EXISTE | **EXISTE (1049 linhas)** ✅ | Slice 0 P0 atendido |
| `agents/core/sentinel.md` | referenciado | NÃO EXISTE | **EXISTE (194 linhas)** ✅ | §16 #7 resolvido |
| `agents/executor/type-specific/` | referenciado | NÃO EXISTE | **EXISTE (17 agents)** ✅ | §16 #8 resolvido |
| `references/gates.md` | a criar Slice 0.5 | NÃO EXISTE | **EXISTE (49 linhas, 15 gates + Hardness Taxonomy)** ✅ | §16 #9 resolvido |
| `references/audit-trail.md` | a criar Slice 0.5 | NÃO EXISTE | **EXISTE** ✅ | Phase Transition + JSONL |
| `references/confidence.md` | a criar Slice 0.5 | NÃO EXISTE | **EXISTE** ✅ | Scoring schema |
| `references/sentinel-integration.md` | a criar Slice 0.5 | NÃO EXISTE | **EXISTE** ✅ | 5 mandatory checkpoints |
| `references/team-registry.md` | implícito | NÃO EXISTE | **EXISTE** ✅ | 37-agent roster |

**Total agentes por camada (pós-sync):**
- `agents/core/`: 9 (adversarial-batch, checkpoint-validator, final-validator, finishing-branch, information-gate, **pipeline-controller**, sanity-checker, **sentinel**, task-orchestrator)
- `agents/executor/`: 5 (controller, fix, implementer-task, quality-reviewer, spec-reviewer)
- `agents/executor/type-specific/`: 17 (4 adversarial, 4 audit, 3 bugfix, 3 feature, 3 ux)
- `agents/quality/`: 7 (architecture-reviewer, design-interrogator, final-adversarial-orchestrator, plan-architect, pre-tester, quality-gate-router, review-orchestrator)
- **Total: 38** ✅ (alinha com D1:12)

**Hooks (pós-sync, todos em `.claude/hooks/`):**
- `completion-checklist.cjs` (preexistente, atualizado v4)
- `force-pipeline-agents.cjs` (preexistente, atualizado v4)
- `sentinel-hook.cjs` (NOVO — guards Agent spawns)
- `dispatch-guard.cjs` (NOVO — bloqueia adversarial reading implementer artifacts)
- `edit-guard-hook.cjs` (NOVO — limita writes a `.pipeline/`)
- `session-lock-hook.cjs` (NOVO — single-session lock)
- `session-cleanup-hook.cjs` (NOVO — cleanup ao Stop)
- `__tests__/` (NOVO — 5 unit tests + smoke-hooks.sh)

**Espelho Codex:** `.codex/hooks/force-pipeline-agents.cjs` mantido para compatibilidade Codex CLI.

---

## 2. Onde a lógica de fase/gate efetivamente reside (pós-sync)

🟢 **Premissa V5 atendida**: lógica de pipeline está agora primariamente no agent `pipeline-controller`.

Estado atual:
- `agents/core/pipeline-controller.md` (1049 linhas) — N1 orchestrator, spawned pela skill
- `commands/pipeline.md` (1112 linhas) — entry point que dispatch o controller; mantém `Anti-Prompt-Injection Inline Invariants` que sobrepõem qualquer Grep-result tampered
- `skills/pipeline/SKILL.md` — skill thin que invoca `/pipeline-orchestrator:pipeline`
- `skills/pipeline/SKILL.v3-reference.md` — preserva prosa v3 como histórico
- `references/pipelines/*.md` (12) — pipeline shapes data-driven (mas ainda lidos por código, não interpretados em runtime — Slice 5 é o YAML interpreter)
- `references/{gates,audit-trail,confidence,sentinel-integration,team-registry}.md` — SSOT extraídos

**Frontmatter atual do pipeline-controller:**
```yaml
name: pipeline-controller
tools: Read, Write, Glob, Grep, Agent, AskUserQuestion
model: opus
color: red
```

**Spec V5 §15.3 propõe:**
```yaml
tools: [Agent, Task, Read, Write, Bash, Glob, Grep, AskUserQuestion]
model: sonnet
```

⚠️ **Drift detectado:** atual usa `opus` (custo maior) e omite `Task`/`Bash`. Decisão: §17.4 spec V5 — analisar custo Opus vs Sonnet em produção antes de bumpar/downgradar.

---

## 3. Estimativas de Slices recalculadas (pós-sync)

| Slice | Original | INVENTORY v1 | **Pós-sync** |
|---|---|---|---|
| **0 — P0 baseline** | 2-3 dias | 2 dias | 🟢 **RESOLVIDO via sync 4.1.3** (controller existe, hooks existem, sentinel existe) |
| **0.5 — Context & Policies** | 22h | 3 dias | 🟢 **MAJORITARIAMENTE RESOLVIDO** (gates.md, audit-trail, confidence, sentinel-integration ✅; CLAUDE.md raiz e AGENTS.md raiz **AINDA PENDENTES**) |
| **1 — `/bugfix` + 2 agentes** | ~1 sem | 3-5 dias | 🔴 **PENDENTE** — só `/pipeline` existe; falta criar 5 commands específicos |
| **2 — TRACE.md** | ~1 sem | 3-5 dias | 🔴 **PENDENTE** — `agents/core/trace-generator.md` ausente |
| **3 — `/feature`, `/audit`, `/ux`** | ~0.5-1 sem | 2-3 dias | 🔴 **PENDENTE** — depende de Slice 1 padrão |
| **4 — compat suite** | (não estimado) | 5-7 dias | 🟡 **PARCIAL** — `tests/` existe com fixtures + manual-validation-log; falta CI test runner |
| **5 — YAML interpreter** | 4-6 sem | 3-5 sem | 🔴 **PENDENTE** — pipeline.md ainda 1112 linhas inline; v5.1 |

**Esforço restante v5.0:** Slice 0.5 finale (CLAUDE.md, AGENTS.md, COMPLEXITY_GATE) + Slices 1+2+3+4 = **~2-3 semanas solo**
**Esforço v5.1:** Slice 5 = +3-5 semanas

---

## 4. R-4 — task-orchestrator v4 → modos Light/Heavy v5

### Status pós-sync
Os 12 pipelines `.md` mantêm frontmatter declarativo com `intensity: light|heavy`. Mapping 3→2 (SIMPLES/MEDIA/COMPLEXA → light/heavy) **continua sendo decisão pendente**.

### 🟠 Recomendação mantida: **(a) Adapter heurístico**

Mapeamento canônico:
| v4 complexity | v5 mode | Tie-breaker |
|---|---|---|
| SIMPLES | Light | sempre |
| MEDIA | Light | exceto se `domains_touched` ⊇ {auth, crypto, data-model, payment} → Heavy |
| COMPLEXA | Heavy | sempre |

Implementação: ~10 linhas dentro do `pipeline-controller` agent. Sem reescrita do `task-orchestrator`.

🟠 **GATE PENDENTE** — confirmar antes de Slice 1.

---

## 5. Os 10 erros de baseline (§16 do consolidado) — STATUS PÓS-SYNC

| # | Erro | Status v1 | **Status pós-sync** |
|---|---|---|---|
| 1 | `pipeline-controller` ausente | 🔴 P0 criar | 🟢 **RESOLVIDO** — existe (1049 linhas) |
| 2 | 5/7 hooks ausentes | 🟠 criar Slice 0.5 | 🟢 **RESOLVIDO** — todos os 5 existem |
| 3 | Versão 4.1.x assumida vs 3.0.2 real | 🟠 alinhar | 🟢 **RESOLVIDO** — agora é 4.1.3 |
| 4 | 38 agentes alegados vs 19 reais | ✓ auditado | 🟢 **RESOLVIDO** — agora 38 reais |
| 5 | 1100 linhas alegadas vs 957 reais | ✓ auditado | ⚪ **OBSOLETO** — agora 1112 |
| 6 | 12 pipelines alegados vs 10 reais | ✓ auditado | 🟢 **RESOLVIDO** — agora 12 |
| 7 | `sentinel.md` referenciado mas ausente | 🟠 criar/remover | 🟢 **RESOLVIDO** — existe (194 linhas) |
| 8 | `agents/executor/type-specific/` ausente | 🟠 criar/remover | 🟢 **RESOLVIDO** — existe (17 agents) |
| 9 | gates registry ausente | 🟠 criar | 🟢 **RESOLVIDO** — `references/gates.md` (15 gates + 4-level hardness) |
| 10 | COMPLEXITY_GATE sem hardness formal | 🟠 formalizar | 🟡 **PARCIAL** — taxonomy formalizada, mas COMPLEXITY_GATE não está no registry (15 gates, não 16) |

🟢 9 de 10 itens resolvidos. Item #10 é o único improvement Slice 0.5 ainda pendente nessa categoria.

---

## 6. Improvements V5 ainda pendentes (não estavam em §16)

Itens do consolidated que ainda NÃO estão na 4.1.3:

| Item | Slice | Effort | Risk |
|---|---|---|---|
| `CLAUDE.md` raiz do projeto (≤200 linhas, identidade + SSOT pointer) | 0.5 A1 | 1h | LOW |
| `AGENTS.md` raiz com roster + namespacing | 0.5 A2 | 2h | LOW |
| Adicionar COMPLEXITY_GATE ao registry (16º gate, SOFT) | 0.5 | 30min | LOW |
| Pipeline-controller frontmatter v5 (`tools` adicionar `Task,Bash`; revisar `model`) | 0 P0 | 1h + decisão custo | MEDIUM (custo Opus→Sonnet) |
| `/bugfix` command + skill thin | 1 | 1 dia | LOW |
| 4 commands restantes (`/feature`, `/audit`, `/ux`, `/user-story`) | 3 | 2-3 dias | LOW |
| `agents/core/trace-generator.md` + `references/trace-schema/v1.md` | 2 | 3-5 dias | MEDIUM (define schema permanente) |
| Adapter heurístico SIMPLES/MEDIA/COMPLEXA → Light/Heavy | 1 dep | 10 linhas | LOW |
| CI test runner (vitest/jest config + GitHub Actions) | 4 | 5-7 dias | MEDIUM (define padrão) |
| YAML interpreter para pipelines/* | 5 / v5.1 | 3-5 sem | HIGH |

---

## 7. Veredicto pós-sync

🟢 **Slice 0 P0 efetivamente concluído** via sync 4.1.3 (não via execução do plano original) — pipeline-controller, sentinel, hooks, type-specific adversarials, gates registry, audit-trail, confidence, sentinel-integration, team-registry **TODOS EXISTEM**.

🟡 Próximos passos imediatos (Slice 0.5 finale):
1. Criar `CLAUDE.md` raiz
2. Criar `AGENTS.md` raiz com roster
3. Adicionar COMPLEXITY_GATE ao gates.md
4. Decidir frontmatter pipeline-controller (Opus vs Sonnet, +Task/Bash?)

🔴 Próximos passos médios (Slices 1-3):
1. `/bugfix` + multi-command split
2. TRACE.md generator
3. CI test runner

**Esforço total restante v5.0:** ~2-3 semanas.
**v5.1 (YAML):** +3-5 semanas.

R-1, R-2 (consolidação metodologias e dogfooding) seguem CLOSED — estruturalmente atendidos.
