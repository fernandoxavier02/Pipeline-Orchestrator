# Pipeline Orchestrator v5.2.0 — Contrato Canônico (Checklist de Auditoria)

> Fonte: leitura completa de 8 arquivos canônicos do plugin instalado em
> `C:\Users\win\.claude\plugins\cache\FX-studio-AI\pipeline-orchestrator\5.2.0\`
> (commands/pipeline.md, commands/brainstorm.md, references/gates.md, references/gate-request-protocol.md, references/audit-trail.md, agents/core/pipeline-controller.md, agents/core/brainstorm-controller.md, agents/executor/executor-controller.md)
>
> Síntese executada por subagente Explore em 2026-05-15. Este documento é o **gabarito** contra o qual os 7 cenários da Fase B serão auditados.

## 1. Mapa de modos do /pipeline

| Modo | Fases ativas | Gates MANDATORY | Subagentes obrigatórios |
|------|--------------|-----------------|--------------------------|
| **FULL** | 0 → 1 → 1.5 → 2 → 3 | SSOT_CONFLICT, ADVERSARIAL_GATE_MANDATORY | task-orchestrator → information-gate → plan-architect (MEDIA/COMPLEXA) → executor-controller → review-orchestrator (per batch) → sanity-checker → final-validator |
| **DIAGNOSTIC** | Apenas 0 + 1, sai | SSOT_CONFLICT, INFO_GATE_BLOCKED | task-orchestrator, information-gate, design-interrogator (se COMPLEXA) |
| **CONTINUE** | Pula 0/1/2, entra em Fase 3 | STALE_CONTEXT (escala a HARD se auth/crypto/data-model) | review-orchestrator, sanity-checker, final-validator |
| **REVIEW-ONLY** | Pula tudo; só roda final-adversarial-orchestrator em dirty tree | FINAL_ADVERSARIAL_GATE (SOFT) | 3 reviewers paralelos (security/architecture/quality). Sem fixes. Sem final-validator. |
| **--hotfix** | Phase 0 streamlined (BLOCKER only) + 1 task + 2 checklists (auth+injection) | INFO_GATE_BLOCKED (variante BLOCKER-only) | bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester, final-validator |

## 2. Flags do /pipeline

| Flag | Efeito |
|------|--------|
| `--light` | Force pipeline_variant=bugfix-light (Type=Bug Fix) |
| `--heavy` | Force pipeline_variant=bugfix-heavy (Type=Bug Fix) |
| `--plan` | Forçar plan-architect independente de complexidade |
| `--no-plan` | Skip Phase 1.5 em MEDIA/SIMPLES; em COMPLEXA ignora e loga override em TRACE.md |
| `--grill` | Forçar design-interrogator independente de complexidade |
| `--strict` | Desativa fast-path SIMPLES-DOC |
| `--force-level=<LVL>` | Override complexity (SIMPLES/MEDIA/COMPLEXA), loga COMPLEXITY_GATE |

## 3. Brainstorm: 9 steps

```
00-intake (DISPATCH_REQUEST)
→ 01-explore (7× GATE_REQUEST sequenciais)
→ 02-spec-init (Skill)
→ 03-spec-requirements (Skill)
→ 04-validate-gap (Skill)
→ 05-spec-design (Skill)
→ 06-validate-design (Skill)
→ 07-spec-tasks (Skill)
→ 08-handoff (GATE_REQUEST: Run-now / Stop-here / Notify)
→ [se Run-now] pipeline-controller spawn com PREP_RUN_ID
```

## 4. Registry completo de 22 gates

### MANDATORY (3) — nunca bypass
- `SSOT_CONFLICT`
- `ADVERSARIAL_GATE_MANDATORY` (auth/crypto/data-model)
- `SPEC_ARTIFACT_MISSING`

### HARD (11) — bloqueia até resolução
- `INFO_GATE_BLOCKED`
- `TDD_APPROVAL`
- `PLAN_REJECTED`
- `MICRO_GATE_GAP`
- `CHECKPOINT_FAIL`
- `ADVERSARIAL_BLOCK`
- `FINAL_ADVERSARIAL_REWORK`
- `SPEC_FORMAT_GATE_FAIL`
- `SPEC_CONTENT_REVIEW_NOGO`
- `SPEC_AC_TRACEABILITY_GAP`
- `SPEC_POST_IMPL_FAIL`

### CIRCUIT_BREAKER (3) — para após N falhas
- `STOP_RULE` (2 falhas consecutivas)
- `FIX_LOOP_EXHAUSTED` (3 tentativas)
- `STEP_1_7_RECURSION_GUARD`

### SOFT (5) — recomendado
- `COMPLEXITY_GATE`
- `STALE_CONTEXT`
- `ADVERSARIAL_GATE`
- `FINAL_ADVERSARIAL_GATE`
- `CLOSEOUT_CONFIRM`

## 5. Protocolo GATE_REQUEST / DISPATCH_REQUEST / PLAN_MODE_REQUEST

- Subagent emite bloco YAML estruturado: `gate_id` + `question` + `options` (gate) ou `dispatch_id` + `target_name` + `prompt` (dispatch)
- Subagent NÃO pode invocar `AskUserQuestion` / `Agent` / `EnterPlanMode` diretamente — harness do Claude Code remove em runtime
- Parent (Claude na sessão pai) processa o bloco invocando a ferramenta correspondente e re-dispatcha com payload `GATE_RESPONSES` / `DISPATCH_RESULTS`
- **Dual-write obrigatório:** todo evento vai em `.pipeline/<run>/protocol-events.jsonl`; gates canônicos do registry também vão em `.pipeline/<run>/gate-decisions.jsonl` com referência cruzada via `event_id`
- Sem par evento ↔ decisão → **violação contratual = spawn silenciosamente falhado**

## 6. Os 9 dispatch sites do pipeline-controller

| Fase | Target | Kind | Condição |
|------|--------|------|----------|
| 0a | task-orchestrator | agent | sempre |
| 0b | information-gate | agent | sempre |
| 0c | design-interrogator | agent | COMPLEXA OU `--grill` |
| 1.5 | plan-architect | agent | MEDIA/COMPLEXA/Spec OU `--plan` |
| 2a | skill variant | skill | se bugfix-light/heavy/spec-* |
| 2c | executor-controller | agent | salvo skill em 2a |
| 2e | review-orchestrator | agent | per batch |
| 3a | sanity-checker | agent | sempre |
| 3b | final-validator | agent | sempre |

## 7. Os 4 GATE_REQUEST sites do pipeline-controller

| Fase | gate_id pattern | Opções |
|------|------------------|--------|
| Phase 1 | phase-1-pipeline-proposal | Yes / Adjust / No |
| Phase 1.5 | phase-1-5-plan-approval | Approve / Adjust / Reject (só se plan rodou) |
| Phase 2 (per-batch) | phase-2-adversarial-batch-[N] | Yes / Skip / Adjust (MANDATORY se auth/crypto/data-model) |
| Phase 3b-pre | phase-3-final-adversarial | Yes [recomendado MEDIA/COMPLEXA] / Skip |

## 8. Checklist contratual por cenário (CRÍTICO — gabarito de auditoria)

### C1 — brainstorm + handoff (MEDIA)
- **Gates esperados:** 7× GATE_REQUEST explore + 1× handoff + phase-1-pipeline-proposal + phase-1-5-plan-approval + ≥1× phase-2-adversarial-batch-1 + phase-3-final-adversarial + CLOSEOUT_CONFIRM = ≥12 gates
- **Subagentes esperados:** brainstorm-controller, step-00-intake, step-01-explore, 7 spec lifecycle skills, pipeline-controller, task-orchestrator, information-gate, plan-architect, quality-gate-router, executor-controller, feature-vertical-slice-planner, feature-implementer, executor-spec-reviewer, executor-quality-reviewer, review-orchestrator, adversarial-review-coordinator + 3 type-specific, final-adversarial-orchestrator + 3 reviewers, sanity-checker, final-validator, spec-closer
- **Artefatos esperados:** `.kiro/specs/<id>/{requirements,design,tasks}.md` + `.pipeline/<run>/{01-classification,02-plan,03-implementation/,04-final-report}.md` + `gate-decisions.jsonl` + `protocol-events.jsonl` + `sentinel-state.json` + `TRACE.md`
- **GATE_REQUEST mínimo:** 12

### C2 — FULL classifier-MEDIA
- **Gates esperados:** phase-1-pipeline-proposal + phase-1-5-plan-approval + ≥1× phase-2-adversarial-batch + phase-3-final-adversarial (SOFT) + CLOSEOUT_CONFIRM = 5
- **Subagentes esperados:** pipeline-controller, task-orchestrator, information-gate, plan-architect, quality-gate-router, executor-controller, feature-implementer, executor-spec-reviewer, executor-quality-reviewer, checkpoint-validator, review-orchestrator, adversarial-review-coordinator, final-adversarial-orchestrator, sanity-checker, final-validator
- **NÃO deve disparar:** design-interrogator
- **Artefatos:** `.pipeline/<run>/{01,02,03,04}*` + ambos JSONLs + `TRACE.md` (≥7 entries em gate-decisions.jsonl)
- **GATE_REQUEST mínimo:** 5

### C3 — FULL --force-level=COMPLEXA
- **Gates esperados:** Tudo de C2 + `COMPLEXITY_GATE` logged + design-interrogator obrigatório + por-batch reviews (max 3 loops) + `ADVERSARIAL_GATE_MANDATORY` se toca dados
- **Subagentes:** todos de C2 + design-interrogator, architecture-reviewer, adversarial-architecture-critic, adversarial-security-scanner, pre-tester
- **GATE_REQUEST mínimo:** 6-9

### C4 — DIAGNOSTIC
- **Gates esperados:** 1× phase-1-pipeline-proposal + exit. NÃO deve disparar TDD, ADVERSARIAL, CLOSEOUT
- **Subagentes:** SÓ pipeline-controller + task-orchestrator. **NÃO** executor-controller
- **Artefatos:** SÓ `01-classification.md`. Diretório `03-implementation/` NÃO deve existir
- **Output esperado:** bloco `DIAGNOSTIC COMPLETE` (não `PIPELINE COMPLETE`)
- **GATE_REQUEST mínimo:** 1

### C5 — REVIEW-ONLY (dirty tree)
- **Gates esperados:** phase-3-final-adversarial + CLOSEOUT_CONFIRM (opcional). NÃO TDD_APPROVAL, NÃO PLAN_REJECTED
- **Subagentes:** review-orchestrator, adversarial-batch, 3 reviewers paralelos, final-adversarial-orchestrator. **NÃO** feature-implementer, **NÃO** executor-controller
- **Artefatos:** `.pipeline/<run>/review-report.md` + JSONLs (report-only, sem fixes)
- **GATE_REQUEST mínimo:** 2

### C6 — --hotfix
- **Gates esperados:** emergency-confirm + TDD_APPROVAL (1 regression test) + CLOSEOUT_CONFIRM. Adversarial só auth+injection (2 checklists)
- **Subagentes:** pipeline-controller, task-orchestrator, executor-controller, bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester, final-validator. **NÃO** design-interrogator, **NÃO** plan-architect, **NÃO** full adversarial
- **Sentinel:** `mode: HOTFIX` flag
- **GATE_REQUEST mínimo:** 3-4

### C7 — --grill (SIMPLES com interrogador)
- **Gates esperados:** baseline SIMPLES + design-interrogator forçado + 3 light tests (main+regression+edge) + closeout
- **Subagentes:** baseline SIMPLES + **obrigatoriamente** design-interrogator
- **Artefatos:** padrão + `02-design-interrogation.md`
- **GATE_REQUEST mínimo:** 4-5

## 9. Pontos suspeitos de execução inline (a auditoria deve confirmar/refutar)

Achados levantados pelo subagente Explore durante leitura do `pipeline-controller.md`. **Estes são suspeitos de fallback inline mesmo na v5.2.0 e devem virar fixes da Fase D se confirmados:**

| # | Posição (pipeline-controller.md) | Suspeita | Severidade esperada |
|---|----------------------------------|----------|---------------------|
| 1 | linha ~765 | plan-architect Phase 1.5 — deveria emitir `PLAN_MODE_REQUEST`, não invocar `EnterPlanMode` inline | CRITICAL |
| 2 | linha ~816 | quality-gate-router TDD — deveria emitir `GATE_REQUEST` per scenario, não `AskUserQuestion` inline | CRITICAL |
| 3 | linha ~1245 | finishing-branch `CLOSEOUT_CONFIRM` — deveria emitir `GATE_REQUEST`, não confirmation inline | MAJOR |
| 4 | linha ~763 | `--no-plan` em COMPLEXA — override justification deveria emitir `GATE_REQUEST` antes de pular Phase 1.5 | MAJOR |
| 5 | linha ~1034 | Sentinel Phase 2→3 — usa `DISPATCH_REQUEST` corretamente; validar reprocessamento de `DISPATCH_RESULTS` | MINOR |
| 6 | linha ~843 | exec-window open/close — corretamente Bash (read-only); validar exitcode 0 e close idempotent | MINOR |
| 7 | linha ~1152 | verify-completion skill — corretamente Skill tool; validar FAIL → STOP_BEFORE_PA_DE_CAL HARD gate | MINOR |
| 8 | linha ~1166 | final-validator — `DISPATCH_REQUEST`; validar veredicto consumido (não reinventado) por finishing-branch | MAJOR |

**Conclusão preliminar:** se Achados #1, #2, #3 forem confirmados, a v5.2.0 tem **3 violações CRITICAL/MAJOR do contrato anti-inline** apesar do protocolo formalizado. A Fase B vai gerar evidência forense para cada um.
