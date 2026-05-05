---
title: Spec Workflow Integration — Session Handoff
status: brainstorm-complete; awaiting-implementation
date: 2026-05-04
session_type: brainstorm (sdd:brainstorm)
next_session_action: review or implement
---

# Session Handoff — Spec Workflow Integration v4.9.0

## Onde estamos

✅ **Brainstorm concluído.** Design validado e escrito em:
`D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\.specs\plans\spec-workflow-integration.design.md`

❌ **Implementação NÃO começou.** Nenhum arquivo de produção foi criado/modificado. Só o design doc + este handoff existem.

## O que foi decidido (resumo de 1 tela)

Importar Spec Lifecycle do Pulsar como 6º type no `task-orchestrator` do pipeline-orchestrator, com 3 variantes: `spec-light`, `spec-heavy`, `spec-audit-only`. Adiciona 4 agents novos, 3 skills novas, 1 thin entry-point `/spec`, 6 gates ao Registry, 5 sentinel checkpoints. Versão alvo: **v4.9.0** (Slice 4).

### 6 decisões da fase de brainstorm (todas via AskUserQuestion)

1. **Integração:** novo type 'Spec' no classifier (não entry-point isolado, não variante de Feature)
2. **TDD:** seed do `quality-gate-router` com `tasks.md` + acceptance criteria de `requirements.md`
3. **Mapeamento:** colapsar 9 steps do Pulsar Heavy nas 4 fases existentes (3 agents novos + reuso da máquina adversarial)
4. **Audit depth:** Light = format + slim review (5-6 eixos); Heavy = format + full review (12 eixos)
5. **Closure:** `spec-closer` ANTES de `finishing-branch` (2 reports + spec.json + commit/PR normal)
6. **Confidence:** layer Pulsar grade (PRODUCTION READY etc.) sobre o schema dimensional existente

### Adendos do usuário durante a conversa

- Auditoria da qualidade da spec é **objetivo de primeira classe**
- ATDD explícito (cenários derivados de AC#N)
- Per-batch adversarial em **loop unbounded com escalação interativa a cada 3 tentativas** (vs cap rígido 3x do invariante #6 atual — exceção autorizada para type=Spec)
- 3ª variante `spec-audit-only` adicionada

## Inventário a ser construído (do design doc)

**Novos:** 25 arquivos (4 agents, 23 step files de skills, 1 command, 3 pipeline references, ~30 testes).
**Modificados:** 11 arquivos (task-orchestrator, sentinel, pipeline-controller, quality-gate-router, gates.md, team-registry.md, complexity-matrix.md, pipeline.md Inline Invariants, MIGRATION, CLAUDE.md lineage, plugin.json version, CHANGELOG).

Lista completa: ver `.specs/plans/spec-workflow-integration.design.md` seção "Inventário de arquivos".

## Próximas ações (em ordem sugerida)

1. **Revisar o design** — opções:
   - `/compound-engineering:ce-doc-review` para revisão adversarial multi-perspectiva
   - `bmad-checkpoint-preview` para preview LLM-assisted
   - `cc-context-auditor` se quiser audit de coerência com CLAUDE.md
2. **Criar branch:** `feat/v4.9.0-spec-workflow-import` em `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\`
3. **Implementação por waves (7 waves no design doc, seção "Próximos passos sugeridos")**:
   - Wave 1: 4 agents novos + unit tests
   - Wave 2: 3 skills novas + frontmatter contract
   - Wave 3: modificações em agents core (task-orchestrator, sentinel, pipeline-controller, quality-gate-router)
   - Wave 4: command `/spec` + pipeline references
   - Wave 5: gates registry + Inline Invariants + complexity-matrix
   - Wave 6: integration + e2e tests + fixtures
   - Wave 7: docs + version bump + CHANGELOG
4. **Cada wave passa pelo próprio pipeline-orchestrator** (`/pipeline-orchestrator:pipeline`) — dogfooding
5. **Release:** tag v4.9.0, marketplace publish, atualizar CLAUDE.md lineage

## Open questions (não-bloqueadores, resolver na Wave 1)

1. Definir os 5-6 eixos exatos do `spec-content-reviewer` mode=slim (subset dos 12 do Pulsar). Sugestão no design doc.
2. Ler `D:\Projeto Pulsar\.claude\commands\spec-post-impl-validator.md` integralmente — durante brainstorm só foi lido o spec-pipeline.md. Os 6 eixos exatos de congruência precisam ser confirmados.
3. Protótipo do extrator de AC do `requirements.md` (formato EARS). Regex inicial: `When .+, system shall .+` ou `WHEN .+ THEN .+`.
4. Pesos das dimensões para cálculo de `spec_grade` (sugestão: pesos do Pulsar — format=15, content=20, impl=25, post-impl=25, arch=10, sec=5).

## Arquivos relevantes para retomar

| Caminho | Função |
|---|---|
| `.specs/plans/spec-workflow-integration.design.md` | Design completo (SSOT do brainstorm) |
| `.specs/plans/spec-workflow-integration.handoff.md` | Este arquivo |
| `commands/pipeline.md` | SSOT do fluxo atual; receberá update nos Inline Invariants |
| `references/gates.md` | Registry de gates; ganhará 6 entradas novas |
| `CLAUDE.md` | Layer map canônico; ganhará lineage v4.9.0 |
| `D:\Projeto Pulsar\.claude\commands\Prompts\Spec_lifecycle\` | Fonte original do Pulsar (preservar fidelity) |
| `D:\Projeto Pulsar\.claude\commands\spec-post-impl-validator.md` | **Não foi lido na íntegra durante o brainstorm — ler antes da Wave 1** |

## Comando para retomar

Próxima sessão, abrir esta pasta e dizer: "retomar handoff de spec workflow integration v4.9.0" — ou apontar diretamente para `.specs/plans/spec-workflow-integration.design.md`.

## Estado de memória (para o auto-memory)

Salvar como project memory: pipeline-orchestrator está em v4.8.0; próximo slice (v4.9.0) é importação do Spec Lifecycle do Pulsar com brainstorm validado em 2026-05-04. 4 agents novos + 3 skills + 1 command + 6 gates + 5 sentinel checkpoints. Loop adversarial unbounded com escalação a cada 3 (exceção autorizada para type=Spec ao cap rígido do invariante #6).
