# CLAUDE.md — Pipeline-Orchestrator (canonical)

## Estilo de comunicacao (vale neste projeto tambem)

Linguagem leiga, completa e curta. Veredicto primeiro, detalhe depois. Sem jargao seco — termo tecnico so com traducao na primeira ocorrencia. Prosa curta > bullets/tabelas (use tabela so para comparacao real). Codigo/paths/hashes ficam em blocos de codigo. Modo tecnico completo so quando pedido explicitamente. SSOT da regra: `~/.claude/CLAUDE.md` secao "Estilo de Conversa com o Usuario (REGRA MESTRA)".

---

## Identidade

**Nome:** Pipeline-Orchestrator (CC plugin para Claude Code)
**Propósito:** caixa de vidro multi-agente — todo trabalho não-trivial passa por triagem, planejamento, execução em batches com TDD e adversarial review, fechando com Pa de Cal e audit trail.
**Persona dos contributors:** arquitetos B2B sêniores. Plugin é OSS e shippado via marketplace; usuários incluem outros engenheiros, não consumidores finais.

## Source-of-Truth Layer Map

| Camada | SSOT | Notas |
|---|---|---|
| **Design v5** | `designs/pipeline-orchestrator-v5-consolidated.md` | 1796 linhas, sucessor único dos 3 docs em `designs/legacy/` |
| **Design v5 Slice 0** | `designs/slice-0/INVENTORY.md` + 4 SPIKEs | Reality-check pós-sync 4.1.3 — INVENTORY atualizado em 2026-04-30 (Slices 0+0.5+1 marcados como concluídos) |
| **Versão canônica** | `.claude-plugin/plugin.json` `"version"` | Atualmente: **4.6.0**. Lineage: v4.2.0 → v4.2.1 → v4.3.0 → v4.3.1 → v4.4.0 (Slice 1.5 — Pulsar bugfix workflow import) → v4.4.1 (exec-window wrapper fix) → v4.5.0 (Slice 3a — Pulsar audit workflow import) → v4.6.0 (Slice 3b — Pulsar feature workflow import, single-skill-com-mode-flag pattern). Marketplace lê este arquivo. |
| **Pipeline flow** | `commands/pipeline.md` (full classifier) + `commands/bugfix.md` (thin shortcut) | 1112 linhas no full + 40 no thin. **Inline Invariants** em `pipeline.md` sobrepõem Grep-loaded refs em caso de conflito |
| **Agent orchestrator** | `agents/core/pipeline-controller.md` | N1, dispatched pela skill, coordena 4 fases |
| **Gates** | `references/gates.md` | Hardness Taxonomy + 16-gate Registry |
| **Audit Trail** | `references/audit-trail.md` | Phase Transition Summary + JSONL log format |
| **Confidence** | `references/confidence.md` | Scoring schema (advisory) |
| **Sentinel** | `references/sentinel-integration.md` + `agents/core/sentinel.md` | 5 mandatory checkpoints |
| **Team roster** | `references/team-registry.md` | **19 agents reais** [VERIFICADO 2026-05-03] (`agents/**/*.md`). O número antigo "38" estava errado — vinha do D1 sem reality-check; corrigido em `designs/pipeline-orchestrator-v5-consolidated.md` §1.1 e §16 erro #4. `team-registry.md` pode ainda mostrar 38 — atualizar quando tocado. |

## Política de edits

🔴 **REGRA #1:** Todas as alterações nascem em `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator` (este repo). 

🔴 **REGRA #2:** O cache `C:\.claude\plugins\cache\FX-studio-AI\pipeline-orchestrator\<version>\` é **runtime read-only** — NUNCA editar lá. Ele é populado pelo marketplace ao instalar/atualizar.

🟡 **HISTÓRICO:** Antes de 2026-04-30, releases 3.8.0 → 4.1.3 foram publicadas no marketplace SEM passar pelo git canonical (deriva de 97 commits). Em 2026-04-30, canonical foi sincronizado com cache 4.1.3 via 5 commits temáticos (`59e0984..c5c9477` em `feat/v5-addendum-context-policies`). Mesmo dia: Slice 0.5 + Slice 1 (`/bugfix` entry-point) entregues como v4.2.0 + patch v4.2.1 (SEC-1+SEC-2), seguidos de v4.3.0 (skill migration), v4.3.1 (review polish), v4.4.0 (Slice 1.5 Pulsar bugfix import) em 2026-05-01, v4.4.1 (exec-window wrapper) e v4.5.0 (Slice 3a Pulsar audit import) em 2026-05-02. Daqui em diante, **todo release passa pelo git** antes de virar marketplace package.

## Política operacional para Claude (este agent)

1. **Edits via Agent tool durante execução de pipeline.** Quando dentro do pipeline (skill `pipeline` ativada), o `pipeline-controller` é o N1 e dispatcha N2/N3. NUNCA editar inline durante execução.
2. **Edits diretos OK fora do pipeline.** Ad-hoc fixes, doc updates, design iteração — usar Edit/Write direto.
3. **Espelhamento Codex:** `.codex/hooks/force-pipeline-agents.cjs` deve seguir mudanças em `.claude/hooks/force-pipeline-agents.cjs` (manter espelho funcional).
4. **Untracked locais:** `.kiro/`, `.pipeline/` são working-state — NUNCA commitar.
5. **Designs preservados:** `designs/`, `designs/legacy/`, `designs/slice-0/` são history do design v5 — preservar mesmo durante syncs.

## Invariantes resumidos

Os 13 invariantes operacionais vivem em `commands/pipeline.md` (CRITICAL REMINDERS section). Em resumo:
1. Single PIPELINE_DOC_PATH + sentinel state file
2. TDD mandatory para code-changing pipelines
3. Non-Invention + Proportionality
4. User approval em gates específicos
5. AskUserQuestion sempre (nunca prosa para decisão)
6. Automatic batching por complexity
7. Per-batch adversarial + Fix loop max 3
8. Stop rule + phase rollback
9. Review independence (zero-context)
10. Parallel reviewers em final adversarial
11. Verification-before-claim
12. Gate decision log + confidence score (advisory)
13. Sentinel state tracking via PreToolUse hook

Ver `commands/pipeline.md` linhas finais para detalhamento.

## Glossário e referência cruzada

- `references/glossary.md` — termos canônicos (Pipeline, Phase, Gate, Adversarial, etc.)
- `references/complexity-matrix.md` — Pipeline Routing Matrix + Proportional Behavior
- `references/audit-depth-levels.md` — níveis 1/2/3 de auditoria (R-3 do consolidated)
- `references/feature-light-criteria-checklist.md` — ownership de acceptance criteria em feature-light v5.0 (R-5)
- `docs/MIGRATION-v3-to-v4.md` — guia de migração v3 → v4
- `docs/assets/sentinel-philosophy.md` — fundamentos de design do sentinel

## Ponteiros futuros

- `docs/migration-v4-to-v5.md` — a ser criado quando v5.0 for lançado (Slice 4 / DoD)
- `references/trace-schema/v1.md` — a ser criado no Slice 2 (TRACE.md generator)

## Versão deste arquivo

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-04-30 | Inicial — pós-sync 4.1.3 (Slice 0.5 A1) |
| v1.1 | 2026-05-03 | Bump versão canônica 4.4.0 → 4.5.0; lineage estendida com v4.3.x/4.4.x/4.5.0; corrigida contagem do consolidated (1491 → 1796 linhas). Reconciliação de governança disparada por audit do design v5. |
| v1.2 | 2026-05-03 | Team roster corrigido (38 → 19 agents reais [VERIFICADO]) após coherence review apontar drift. |
| v1.3 | 2026-05-03 | Bump versão canônica 4.5.0 → 4.6.0 (Slice 3b — feature skill com mode flag, pattern novo vs Slice 1.5/3a). |
