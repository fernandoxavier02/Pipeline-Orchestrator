# Variant Catalog — 6 Workflows × Fases × Portões

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Fontes canônicas:**
- `references/complexity-matrix.md` (Pipeline Routing Matrix + Proportional Behavior)
- `references/team-registry.md` (Type-to-Team Mapping)
- `references/gates.md` (Mandatory Gates by Complexity)

> Esta tabela é o catálogo operacional dos 6 variants de pipeline:
> quais fases ativam, quais agentes participam, quais portões são mandatórios.
> É a referência para configurar o INVARIANTS block dos cargos por variant.

---

## Variant 1: bugfix-light (SIMPLES)

**Trigger:** Bug Fix + SIMPLES (1-2 arquivos, < 30 linhas, 1 domínio, risco baixo)
**Pipeline discipline:** Light (menos cerimônia sentinel)

### Fases ativas
| Fase | Descrição | Cargos envolvidos |
|---|---|---|
| 0 — Triagem | Classificação + information-gate | task-orchestrator, information-gate |
| 2 — Execução | Implementação em 1 batch | bugfix-diagnostic-agent, executor-implementer-task, bugfix-regression-tester |
| 2.5 — Review por batch | Adversarial review (auth apenas) | adversarial-batch (se auth touchada) |
| 2.6 — Checkpoint | Build only | checkpoint-validator |
| 3 — Fechamento | Closeout | finishing-branch |

### Portões mandatórios (5 portões SIMPLES)
`STATE_FILE_INIT_FAIL, INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM`

### Portões condicionais
- `ADVERSARIAL_GATE_MANDATORY` — apenas se auth/crypto/data tocados
- `STALE_CONTEXT` — apenas se contexto > 24h

### Fases puladas
- Plan Mode (automático apenas em COMPLEXA)
- Phase 1.5 (design-interrogator, plan-architect)
- Adversarial review completo (apenas se auth tocada)
- Final adversarial (apenas em COMPLEXA)

---

## Variant 2: bugfix-heavy (COMPLEXA)

**Trigger:** Bug Fix + MEDIA ou COMPLEXA
**Pipeline discipline:** Heavy (todos os sentinel checkpoints)

### Fases ativas
| Fase | Descrição | Cargos envolvidos |
|---|---|---|
| 0 — Triagem | Classificação + information-gate + sentinel | task-orchestrator, information-gate, sentinel (#1) |
| 0c — Design interrogation | Trade-offs de design | design-interrogator |
| 1 — Proposta | Plan mode obrigatório (COMPLEXA) | plan-architect, sentinel (#2) |
| 2 — Execução | 1 task/batch para COMPLEXA | bugfix-diagnostic-agent, bugfix-root-cause-analyzer, executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer |
| 2.5 — Review por batch | Adversarial completo | review-orchestrator, adversarial-batch, architecture-reviewer, diff-discipline-reviewer |
| 2.6 — Checkpoint | Build + tests + regression | checkpoint-validator, sentinel (#3) |
| 3 — Fechamento | Sanity + final adversarial + Pa de Cal | sanity-checker, final-adversarial-orchestrator, final-validator, sentinel (#4, #5) |

### Portões mandatórios (16 portões COMPLEXA)
`STATE_FILE_INIT_FAIL, INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM, PLAN_REJECTED, MICRO_GATE_GAP, ADVERSARIAL_GATE, ADVERSARIAL_BLOCK, STOP_RULE, FINAL_ADVERSARIAL_GATE, FINAL_ADVERSARIAL_REWORK, FIX_LOOP_EXHAUSTED, ADVERSARIAL_GATE_MANDATORY, SSOT_CONFLICT`

### Portões condicionais
- `STALE_CONTEXT` (HARD para COMPLEXA+sensitive) — sempre monitorado
- `PROTOCOL_HANDSHAKE_TIMEOUT` — se handshake > 30min
- `STEP_1_7_ROUTING`, `STEP_1_7_RECURSION_GUARD` — roteamento automático

### Diferença vs bugfix-light
- Bugfix-root-cause-analyzer adicionado (profundidade de diagnóstico)
- Plan mode obrigatório (plan-architect + sentinel #2)
- Sentinel em todos os 5 checkpoints
- Final adversarial obrigatório (3 reviewers paralelos)
- Batch size: 1 tarefa por batch

---

## Variant 3: implement-light (Feature/User Story SIMPLES)

**Trigger:** Feature ou User Story + SIMPLES
**Pipeline discipline:** Light

### Fases ativas
| Fase | Descrição | Cargos envolvidos |
|---|---|---|
| 0 — Triagem | Classificação + information-gate | task-orchestrator, information-gate |
| 2 — Execução | 1 batch completo | feature-vertical-slice-planner, feature-implementer |
| 2.6 — Checkpoint | Build only | checkpoint-validator |
| 3 — Fechamento | Closeout | finishing-branch |

### Portões mandatórios (5 portões SIMPLES)
Idêntico ao bugfix-light: `STATE_FILE_INIT_FAIL, INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM`

### Fases puladas
- Feature-integration-validator (pulado em light)
- Plan mode (apenas COMPLEXA)
- Adversarial completo (apenas se auth tocada)

---

## Variant 4: implement-heavy (Feature/User Story MEDIA ou COMPLEXA)

**Trigger:** Feature ou User Story + MEDIA ou COMPLEXA
**Pipeline discipline:** Heavy

### Fases ativas
| Fase | Descrição | Cargos envolvidos |
|---|---|---|
| 0 — Triagem | Classificação + information-gate + sentinel | task-orchestrator, information-gate, sentinel (#1) |
| 0c — Design interrogation | Trade-offs de design | design-interrogator |
| 1 — Proposta + Plan | Plan mode (COMPLEXA) ou opt-in (MEDIA --plan) | plan-architect, quality-gate-router, pre-tester |
| 2 — Execução por slices | VSA — slices verticais | feature-vertical-slice-planner, feature-implementer, executor-spec-reviewer, executor-quality-reviewer |
| 2.5 — Review por batch | Adversarial + arquitetura + diff | review-orchestrator, adversarial-batch, architecture-reviewer, diff-discipline-reviewer |
| 2.6 — Checkpoint | Build + tests | checkpoint-validator |
| 2.7 — Integração | Validação cross-layer | feature-integration-validator |
| 3 — Fechamento | Sanity + final adversarial + Pa de Cal | sanity-checker, final-adversarial-orchestrator, final-validator |

### Portões mandatórios
- MEDIA: 10 portões (SIMPLES set + PLAN_REJECTED + MICRO_GATE_GAP + ADVERSARIAL_GATE + ADVERSARIAL_BLOCK + STOP_RULE)
- COMPLEXA: 16 portões (MEDIA set + FINAL_ADVERSARIAL_GATE + FINAL_ADVERSARIAL_REWORK + FIX_LOOP_EXHAUSTED + ADVERSARIAL_GATE_MANDATORY + SSOT_CONFLICT + STALE_CONTEXT)

---

## Variant 5: spec-light (Spec MEDIA)

**Trigger:** Spec + MEDIA (3-5 artefatos, 1-2 domínios)
**Pipeline discipline:** Light + spec gates adicionais

### Fases ativas
| Fase | Descrição | Cargos envolvidos |
|---|---|---|
| 0 — Triagem | Classificação + spec detection | task-orchestrator, information-gate |
| 1.5 — Format gate | Validação de formato (25 checks) | spec-format-gate |
| 1.5 — Content review (slim) | 6 eixos críticos | spec-content-reviewer (modo slim) |
| 2 — Execução | Implementação da spec | quality-gate-router, pre-tester, executor-implementer-task |
| 2.5 — Validação spec | Post-impl 6 eixos ponderados | spec-post-impl-validator |
| 3 — Fechamento | Closure audit | spec-closer |

### Portões mandatórios (10 MEDIA + 3 spec = 13 portões)
Portões MEDIA + `SPEC_ARTIFACT_MISSING, SPEC_FORMAT_GATE_FAIL, SPEC_AC_TRACEABILITY_GAP`

### Diferença vs spec-heavy
- spec-content-reviewer em modo slim (6 eixos vs 12)
- Sem SPEC_CONTENT_REVIEW_NOGO no conjunto mandatório (apenas gate light)
- Sem ADVERSARIAL_LOOP_CHECKPOINT mandatório
- Sem SPEC_POST_IMPL_FAIL mandatório (ainda dispara, apenas não é obrigatório passar)

---

## Variant 6: spec-heavy (Spec COMPLEXA)

**Trigger:** Spec + COMPLEXA (6+ artefatos, 3+ domínios, auth/crypto/payment)
**Pipeline discipline:** Heavy + todos os spec gates

### Fases ativas
| Fase | Descrição | Cargos envolvidos |
|---|---|---|
| 0 — Triagem | Classificação + spec detection + sentinel | task-orchestrator, information-gate, sentinel (#1) |
| 1.5 — Format gate | Validação de formato (25 checks) | spec-format-gate |
| 1.5 — Content review (full) | 12 eixos completos | spec-content-reviewer (modo full) |
| 2 — Execução por batch | 1 tarefa/batch | quality-gate-router, pre-tester, executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer |
| 2.5 — Review spec por batch | Adversarial + validação spec | review-orchestrator, adversarial-batch, spec-post-impl-validator |
| 3 — Validação final | Closure audit com veredicto | spec-closer, final-validator |

### Portões mandatórios (16 COMPLEXA + 6 spec = 22 portões)
Portões COMPLEXA + `SPEC_ARTIFACT_MISSING, SPEC_FORMAT_GATE_FAIL, SPEC_CONTENT_REVIEW_NOGO, SPEC_AC_TRACEABILITY_GAP, SPEC_POST_IMPL_FAIL, ADVERSARIAL_LOOP_CHECKPOINT`

---

## Matriz de Batch Size

| Variant | Complexidade | Batch Size | Adversarial |
|---|---|---|---|
| bugfix-light | SIMPLES | Tudo de uma vez | Apenas se auth |
| bugfix-heavy | COMPLEXA | 1 tarefa | Sempre (trio completo) |
| implement-light | SIMPLES | Tudo de uma vez | Apenas se auth |
| implement-heavy | COMPLEXA | 1 tarefa | Sempre (trio completo) |
| spec-light | MEDIA | 2-3 tarefas | Por batch |
| spec-heavy | COMPLEXA | 1 tarefa | Por batch + final |

---

## Matriz de Sentinel Checkpoints por Variant

| Checkpoint | bugfix-light | bugfix-heavy | implement-light | implement-heavy | spec-light | spec-heavy |
|---|---|---|---|---|---|---|
| #1 post_orchestrator | ✓ (mandatory all) | ✓ | ✓ | ✓ | ✓ | ✓ |
| #2 phase_0_to_1 | — | ✓ | — | ✓ (COMPLEXA) | recommended | ✓ |
| #3 phase_1_to_2 | — | ✓ | — | ✓ (COMPLEXA) | recommended | ✓ |
| #4 phase_2_to_3 | ✓ (mandatory all) | ✓ | ✓ | ✓ | ✓ | ✓ |
| #5 post_final_validator | — | ✓ | — | ✓ (COMPLEXA) | recommended | ✓ |

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — catálogo de 6 variants com fases, cargos, portões e batch sizes |
