---
title: Spec Workflow Integration into Pipeline-Orchestrator
status: design-validated
date: 2026-05-04
author: brainstormed with user (fernandocostaxavier@gmail.com)
target_version: v4.9.0
slice: Slice 4 — Pulsar Spec Lifecycle import
source_inputs:
  - D:/Projeto Pulsar/.claude/commands/Prompts/Spec_lifecycle/README.md
  - D:/Projeto Pulsar/.claude/commands/Prompts/Spec_lifecycle/Heavy/PIPELINE_SPEC_LIFECYCLE_HEAVY.md
  - D:/Projeto Pulsar/.claude/commands/Prompts/Spec_lifecycle/Light/PIPELINE_SPEC_LIFECYCLE_LIGHT.md
  - D:/Projeto Pulsar/.claude/commands/spec-pipeline.md
  - D:/Projeto Pulsar/.claude/commands/spec-validator.md
  - D:/Projeto Pulsar/.claude/commands/spec-implementer.md
  - D:/Projeto Pulsar/.claude/commands/spec-post-impl-validator.md
related_ssot:
  - commands/pipeline.md
  - references/gates.md
  - references/audit-trail.md
  - references/confidence.md
  - references/sentinel-integration.md
  - CLAUDE.md (canonical layer map)
---

# Spec Workflow Integration into Pipeline-Orchestrator

## TL;DR

Importar o **Spec Lifecycle** do Pulsar (5 steps Light, 9 steps Heavy) como **6º type** no `task-orchestrator`, com 3 variantes (`spec-light`, `spec-heavy`, `spec-audit-only`). Adiciona 4 agents novos, 3 skills novas, 1 thin entry-point `/spec`, 6 gates ao Registry e 5 sentinel checkpoints. Reusa 100% da infraestrutura existente (per-batch adversarial loop, fix-loop com escalação interativa, sentinel state, JSONL audit trail, confidence dimensional). Auditoria de qualidade da spec é objetivo de primeira classe (format-gate 25 checks + content-reviewer 5-12 eixos). ATDD obrigatório com cenários derivados de acceptance criteria. Loop adversarial **unbounded com escalação a cada 3 tentativas** (vs cap rígido 3x do invariante #6 atual — exceção autorizada pelo usuário para type=Spec). Versão alvo **v4.9.0**.

## Motivação

O Pulsar tinha um workflow maduro de "lifecycle de spec" — operava sobre `.kiro/specs/<feature>/` (artefatos requirements + design + tasks + spec.json gerados pelo kiro), validava formato/conteúdo, implementava com TDD, auditava congruência spec↔code, gerava 2 relatórios (técnico + executivo) e fechava com confidence grade (PRODUCTION READY / DEPLOY WITH MONITORING / etc.). O pipeline-orchestrator não tem esse fluxo: trata spec como prosa livre, sem auditoria de contrato, sem traceability formal AC↔task↔test↔código.

Trazer o fluxo nativamente para o orquestrador (em vez de manter `/spec-pipeline` como comando paralelo) ganha:
- Per-batch adversarial loop em todas as fases de implementação (Pulsar tinha auditoria só uma vez no fim)
- Sentinel state machine + frontmatter contract enforcement (Pulsar não tinha)
- Gate decision JSONL audit trail (Pulsar não tinha)
- Confidence score dimensional + grade Pulsar layered em cima
- Reuso das skills de governança (force-pipeline-agents, dispatch-guard, sentinel)

## Decisões da fase de brainstorm (registro)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Como Spec se encaixa no orquestrador? | **Novo type 'Spec' no classifier** (6º tipo, ao lado de Bug Fix/Feature/User Story/Audit/UX Sim) |
| 2 | TDD obrigatório vs tasks.md pré-existente | **Seed do quality-gate-router** com tasks.md + acceptance criteria de requirements.md |
| 3 | 9 steps Pulsar dentro de 4 fases pipeline | **Colapsar nos gates existentes** (3 agents novos + reuso da máquina adversarial/fix-loop) |
| 4 | Audit depth por variante | **Light = format + slim review (5-6 eixos); Heavy = format + full review (12 eixos)** |
| 5 | Closure + 2 reports | **spec-closer ANTES do finishing-branch** (gera reports + atualiza spec.json + finishing-branch faz commit/PR) |
| 6 | Reconciliar confidence Pulsar (% + grade) com dimensional | **Layer Pulsar grade no schema dimensional existente** (advisory, dimensional permanece SSOT) |

### Adendos do usuário durante brainstorm

- **Auditoria de qualidade da spec é objetivo de primeira classe** (não efeito colateral) → spec-content-reviewer-slim adicionado em Light (Pulsar Light não tinha)
- **ATDD explícito** → quality-gate-router seedado pelos ACs de requirements.md, cada AC vira ≥1 cenário rastreável (`AC#N`)
- **Per-batch adversarial em loop até zero findings, só então próximo batch** → loop unbounded com escalação interativa a cada 3 tentativas (substitui cap rígido 3x para type=Spec)
- **3ª variante `audit-only`** → re-audita spec já implementada sem reimplementar

## Arquitetura

```
                        /pipeline-orchestrator:spec <feature>
                                       |
                                       v
+-------------------------------------------------------------------+
|  PHASE 0: AUTOMATIC TRIAGE                                         |
|  task-orchestrator (detecta spec via 4 sinais)                     |
|    -> escreve spec-context.yaml                                    |
|    -> emite ORCHESTRATOR_DECISION com type=Spec, variant=<v>       |
|  spec-format-gate (NEW, 25 checks) [SPEC_FORMAT_GATE_FAIL HARD]    |
|  information-gate (existente)                                      |
|  design-interrogator (só --grill ou COMPLEXA)                      |
+-------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------+
|  PHASE 1: PROPOSAL                                                 |
|  AskUserQuestion: confirmar variante + escopo                      |
+-------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------+
|  PHASE 1.5: CONTENT REVIEW + PLANNING                              |
|  spec-content-reviewer (NEW)                                       |
|    light → mode=slim (5-6 eixos)                                   |
|    heavy → mode=full (12 eixos)                                    |
|    audit-only → mode=full                                          |
|  [SPEC_CONTENT_REVIEW_NOGO HARD]                                   |
|  plan-architect (existente, COMPLEXA) — lê tasks.md como blueprint |
+-------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------+
|  PHASE 2: EXECUTION (skip se variant=audit-only)                   |
|                                                                     |
|  TDD (ATDD via seed por AC):                                        |
|    quality-gate-router seedado por                                  |
|      acceptance_criteria + tasks.md                                 |
|    [SPEC_AC_TRACEABILITY_GAP HARD]                                  |
|    pre-tester gera testes RED rastreáveis a AC#N                    |
|                                                                     |
|  Batches (1 por task de tasks.md, ou agrupado por complexity):     |
|  ┌──────────────────────────────────────────────────┐             |
|  │  executor-controller                              │             |
|  │    micro-gate → implementer → spec-review         │             |
|  │    → quality-review → checkpoint-validator         │             |
|  └──────────────────────────────────────────────────┘             |
|                         ↓                                          |
|  ┌──────────────────────────────────────────────────┐             |
|  │  ADVERSARIAL GATE (paralelo, contexto isolado)   │             |
|  │    review-orchestrator dispatcha 3 em paralelo:  │             |
|  │      adversarial-architecture-critic              │             |
|  │      adversarial-security-scanner                 │             |
|  │      spec-post-impl-validator (NEW, 6 eixos)     │             |
|  │                                                    │             |
|  │  LOOP UNBOUNDED COM ESCALAÇÃO:                    │             |
|  │    while action_required != NONE:                 │             |
|  │      executor-fix → re-checkpoint → re-review    │             |
|  │      if attempt % 3 == 0:                         │             |
|  │        AskUserQuestion 4 opções                   │             |
|  │        [ADVERSARIAL_LOOP_CHECKPOINT SOFT]         │             |
|  │      if same findings 2x:                         │             |
|  │        força checkpoint imediato                  │             |
|  │  só passa para próximo batch quando CLEAN         │             |
|  └──────────────────────────────────────────────────┘             |
+-------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------+
|  PHASE 3: CLOSURE                                                   |
|  sanity-checker (existente, build+tests)                            |
|  final-adversarial-orchestrator (opt-in para light, recomendado    |
|    para heavy/audit-only)                                           |
|  spec-post-impl-validator final-pass (full, todos os arquivos)     |
|    [SPEC_POST_IMPL_FAIL HARD se score <75%]                         |
|  final-validator (Pa de Cal, existente)                             |
|  spec-closer (NEW):                                                 |
|    gera pipeline-report-technical.md                                |
|    gera pipeline-report-executive.md                                |
|    atualiza .kiro/specs/<feature>/spec.json (status=closed)        |
|    calcula spec_grade derivado de confidence-score.yaml             |
|  finishing-branch (existente, commit + PR)                          |
+-------------------------------------------------------------------+
```

### Variantes resumidas

| Aspecto | spec-light | spec-heavy | spec-audit-only |
|---|---|---|---|
| Format gate (25 checks) | ✓ | ✓ | ✓ |
| Content review | slim (5-6) | full (12) | full (12) |
| Plan-architect | só `--plan` | sempre | n/a |
| Implementation (Phase 2) | ✓ | ✓ | **skip** |
| ATDD seed por AC | ✓ | ✓ | n/a |
| Per-batch adversarial loop | unbounded c/ escalação | unbounded c/ escalação | 1 round c/ mesmo loop |
| Final adversarial | opt-in | strongly recommended | recommended |
| Confidence dimensional + grade | ✓ | ✓ | ✓ |
| Closure 2 reports | ✓ | ✓ | ✓ (commit só se houve fixes) |

## Componentes

### Agents novos

| Agent | Localização | Modelo | Função |
|---|---|---|---|
| `spec-format-gate` | `agents/executor/type-specific/` | sonnet | 25 checks de formato em requirements/design/tasks/spec.json. Output: GO / GO-WARN / NO-GO + lista de issues. Roda em Phase 0 |
| `spec-content-reviewer` | `agents/executor/type-specific/` | opus | Audita qualidade do conteúdo. Modo `slim` (5-6 eixos críticos: clareza requirements, AC↔task traceability, DoD presente, completude design, riscos) ou `full` (12 eixos). Output: GO / WARN / NO-GO. Roda em Phase 1.5 |
| `spec-post-impl-validator` | `agents/executor/type-specific/` | opus | 6 eixos de congruência spec↔code: requirements traced, components mapped, tests-by-AC, side-effects declared, contract conformance, traceability matrix. Output: PASS (≥90) / WARN (≥75) / FAIL (<75). Roda per-batch + final |
| `spec-closer` | `agents/executor/` | sonnet | Gera 2 reports + atualiza `spec.json` + calcula spec_grade. Roda Phase 3 entre final-validator e finishing-branch |

**Single agent com modo (vs 2 separados) para spec-content-reviewer:** os 5-6 eixos slim são subset dos 12 full. SSOT único, controlado por flag `--depth=slim|full` passada pelo controller. Skills permanecem 1:1 (padrão v4.6.1); só o agent compartilha lógica.

### Agents reusados (não-destrutivamente)

`task-orchestrator` (ganha branch de detecção Spec), `information-gate`, `design-interrogator`, `plan-architect`, `quality-gate-router` (seed estendido por ACs), `pre-tester`, `executor-controller`, `executor-implementer-task`, `executor-spec-reviewer`, `executor-quality-reviewer`, `checkpoint-validator`, `review-orchestrator`, `adversarial-architecture-critic`, `adversarial-security-scanner`, `executor-fix`, `sanity-checker`, `final-adversarial-orchestrator`, `final-validator`, `finishing-branch`, `sentinel`.

Total agents pós-Slice 4: **23** (era 19).

### Skills novas

```
skills/spec-light/
  SKILL.md                          # frontmatter: gates_at, sentinel_checkpoints, agent_type
  01-format-gate.md
  02-tdd-scenarios.md
  03-implementation.md
  04-post-impl-validation.md
  05-confidence-dashboard.md
  06-closure.md

skills/spec-heavy/
  SKILL.md
  01-format-gate.md
  02-content-review.md
  03-tdd-scenarios.md
  04-implementation.md
  05-post-impl-validation.md
  06-architecture-audit.md         # alias para arch-critic step
  07-security-review.md            # alias para sec-scanner step
  08-confidence-dashboard.md
  09-closure.md

skills/spec-audit-only/
  SKILL.md
  01-format-gate.md
  02-content-review.md
  03-audit-loop.md
  04-confidence-dashboard.md
  05-closure.md
```

### Entry-point

`commands/spec.md` — thin shortcut (~40 linhas) espelhando `commands/bugfix.md`, `commands/audit.md`, `commands/feature.md`.

```
/pipeline-orchestrator:spec <feature> [--variant=light|heavy|audit-only] [--grill] [--plan] [--skip-content]
```

Default de variante: classifier escolhe por complexity (MEDIA→light, COMPLEXA→heavy). `audit-only` só por flag explícita ou se classifier detectar tasks.md 100% `[x]` + código existente (sinal de re-auditoria).

## Data flow + descoberta

### Detecção de spec (em `task-orchestrator`)

| # | Sinal | Detecção | Confiança |
|---|---|---|---|
| 1 | Argumento explícito de path | `arg` resolve para diretório com requirements.md + design.md + tasks.md | Alta |
| 2 | Flag `--type=spec` | Usuário força via flag | Alta |
| 3 | Prosa apontando spec | Regex `valida.*spec\|implementa.*spec\|fech[ae].*spec` + feature-name existe em `<spec_path>/` | Média (confirma com user) |
| 4 | Auto-glob fallback | Sem nada acima: `Glob: <spec_path>/*/spec.json`, lista ao usuário | Baixa (interativa) |

`<spec_path>` lê de `pipeline.local.md` (campo já existe no contrato v3.x). Default: `.kiro/specs/`. Sem `pipeline.local.md`: tenta `.kiro/specs/`, depois `specs/`, depois `docs/specs/`.

### `SPEC_CONTEXT` payload

Persistido em `{PIPELINE_DOC_PATH}/spec-context.yaml`, lido por todos os agents subsequentes:

```yaml
spec_context:
  feature_name: "auth-flow"
  spec_path: ".kiro/specs/auth-flow/"
  artifacts:
    requirements: ".kiro/specs/auth-flow/requirements.md"
    design: ".kiro/specs/auth-flow/design.md"
    tasks: ".kiro/specs/auth-flow/tasks.md"
    spec_json: ".kiro/specs/auth-flow/spec.json"
  spec_metadata:
    phase: "implementation"
    status: "in_progress"
    last_updated: "2026-05-04"
    implementation_files: [...]
  variant: "spec-heavy"
  variant_signals:
    complexity: "COMPLEXA"
    domains_touched: ["auth", "data-model"]
    tasks_completed: 0
    tasks_total: 12
  acceptance_criteria:
    - id: "AC#1"
      text: "When user submits valid creds, system returns JWT token"
      source_req: "REQ-1.1"
    - id: "AC#2"
      text: "..."
  derived:
    spec_grade_initial: null  # preenchido em Phase 3 pelo spec-closer
```

### Quem lê o quê

| Agent | Lê de SPEC_CONTEXT | Escreve |
|---|---|---|
| spec-format-gate | artifacts.* | format-gate-report.yaml; atualiza spec_metadata.format_gate_status |
| spec-content-reviewer | artifacts.* + variant | content-review-report.yaml |
| quality-gate-router | artifacts.tasks + acceptance_criteria | cenários derivados de AC#N |
| pre-tester | cenários | testes RED rastreáveis a AC#N |
| executor-controller | artifacts.tasks + acceptance_criteria | task-progress.yaml; atualiza tasks.md |
| spec-post-impl-validator | artifacts.* + acceptance_criteria + arquivos modificados | post-impl-report.yaml |
| spec-closer | tudo + confidence-score.yaml | 2 reports; atualiza spec.json |

### Atualização incremental de `spec.json`

```yaml
# antes
{ "phase": "ready", "status": "open", ... }

# após Phase 0 (format-gate PASS)
{ "phase": "validating", "format_gate": "PASS@2026-05-04T..." }

# após Phase 1.5 (content-review GO)
{ "phase": "implementation", "content_review": "GO@..." }

# após Phase 2 (todas tasks [x])
{ "phase": "post_impl_validation", "implementation_completed": "..." }

# após Phase 3 (spec-closer)
{ "phase": "closed", "status": "closed",
  "spec_grade": "DEPLOY WITH MONITORING (82%)",
  "reports": ["pipeline-report-technical.md", "pipeline-report-executive.md"] }
```

Permite re-entrada (`/pipeline continue`) e auto-detect entre sessões.

### Edge cases

| Caso | Comportamento |
|---|---|
| Spec existe mas falta tasks.md | format-gate NO-GO; mostra qual artefato falta |
| Spec já está phase: closed | classifier pergunta: Re-auditar (audit-only) / Reabrir (full) / Abortar |
| tasks.md 100% [x] mas phase != closed | sugere variant=audit-only |
| Vários feature-name no glob fallback | AskUserQuestion lista até 4; "Other" abre escolha por texto |
| pipeline.local.md ausente | usa default .kiro/specs/, loga em gate-decisions.jsonl |
| AC do requirements.md em formato não-EARS | extrator faz parse heurístico; se <50% sucesso, avisa e segue (warn) |

## Gates novos

| # | Nome | Hardness | Trigger | Phase | Recovery |
|---|---|---|---|---|---|
| 1 | `SPEC_ARTIFACT_MISSING` | **MANDATORY** | Spec detectada mas falta requirements/design/tasks | 0 | STOP — lista o que falta |
| 2 | `SPEC_FORMAT_GATE_FAIL` | **HARD** | format-gate NO-GO (<22/25 checks) | 0 | STOP — corrigir spec, re-rodar |
| 3 | `SPEC_CONTENT_REVIEW_NOGO` | **HARD** | content-reviewer NO-GO (≥1 finding crítico) | 1.5 | AskUserQuestion: Editar / Bypass justificado / Abortar |
| 4 | `SPEC_AC_TRACEABILITY_GAP` | **HARD** | router falha em derivar ≥1 cenário por AC (<100% cobertura) | 2 (TDD) | AskUserQuestion: Adicionar manual / Re-extrair / Marcar AC não-testável |
| 5 | `ADVERSARIAL_LOOP_CHECKPOINT` | **SOFT** | A cada 3 tentativas de fix-loop sem chegar a CLEAN | 2 (per-batch) | AskUserQuestion 4 opções (Continuar / Escalonar / Aceitar warnings / Abortar) |
| 6 | `SPEC_POST_IMPL_FAIL` | **HARD** | post-impl-validator FAIL (<75%) após esgotar adversarial loop | 2 ou 3 | AskUserQuestion: novo batch fix (1x) / Aceitar warnings (limitado) / Abortar |

### Confidence impact

| Gate decision | Δ no confidence |
|---|---|
| SPEC_FORMAT_GATE_FAIL: BLOCKED | n/a (pipeline para) |
| SPEC_FORMAT_GATE: GO-WARN | -0.10 em info_completeness |
| SPEC_CONTENT_REVIEW: GO-WARN | -0.05 em classification_clarity |
| SPEC_AC_TRACEABILITY: PARTIAL | -0.10 em tdd_coverage |
| ADVERSARIAL_LOOP_CHECKPOINT: PROCEED (cada ocorrência) | -0.05 em gate_penalty |
| SPEC_POST_IMPL: WARN (75-89%) | -0.08 em quality |

### `spec_grade` derivado (apresentado ao usuário, não substitui dimensional)

```
spec_grade = derive_grade(weighted_sum(dimensions))

>= 90% → PRODUCTION READY
75-89% → DEPLOY WITH MONITORING
50-74% → REMEDIATION NEEDED
<  50% → NOT READY
```

`final-validator` continua com check binário PASS/FAIL (invariante #11). spec_grade é cosmetic/visualização.

### Atualização nos Inline Invariants (`commands/pipeline.md`)

```
- Gate names that must exist (additions for type=Spec):
  SPEC_ARTIFACT_MISSING (MANDATORY)
  SPEC_FORMAT_GATE_FAIL, SPEC_CONTENT_REVIEW_NOGO,
  SPEC_AC_TRACEABILITY_GAP, SPEC_POST_IMPL_FAIL (all HARD)
  ADVERSARIAL_LOOP_CHECKPOINT (SOFT)
```

## Error handling, loops e rollback

### Categorias de erro

| Categoria | Quando | Tratamento |
|---|---|---|
| A. Spec inválida | Phase 0/1.5 — format-gate ou content-review reprovam | STOP; usuário edita; re-roda /spec |
| B. ATDD bloqueado | Phase 2 — router falha em derivar cenário por AC | STOP no TDD; AskUserQuestion 3 opções |
| C. Adversarial findings persistentes | Phase 2 per-batch — loop não converge | Loop unbounded com checkpoint a cada 3 |
| D. Falha sistêmica | Build/test fail 2x, executor-fix corrompe arquivo | STOP_RULE existente + rollback path |

### Loop adversarial (categoria C — coração)

```
implementer → spec-review → quality-review → checkpoint-validator
                                                    |
                                                    v
review-orchestrator dispatcha 3 paralelo (contexto isolado):
  - adversarial-architecture-critic
  - adversarial-security-scanner
  - spec-post-impl-validator (só type=Spec)

action_required = NONE | FIX_NEEDED

Se NONE → próximo batch.

Se FIX_NEEDED:
  loop_attempt = 1
  while True:
    executor-fix (escopo: arquivos do batch)
    re-checkpoint-validator
    re-review-orchestrator (RE-SPAWN, mantém contexto isolado)
    if action_required == NONE: break

    loop_attempt += 1
    if loop_attempt % 3 == 0:
      log ADVERSARIAL_LOOP_CHECKPOINT (SOFT) em gate-decisions.jsonl
      AskUserQuestion(4 opções):
        - "Continuar loop (Recomendado)"  → +3 tentativas
        - "Escalonar — mudar abordagem"   → categoria D rollback
        - "Aceitar com warnings"          → permitido só se findings low/medium
        - "Abortar pipeline"              → categoria D rollback

    if findings_now == findings_previous:  # loop infinito detectado
      força checkpoint imediato
      adiciona opção "Sugerir fix manual" às 4
```

### Permissões de "Aceitar com warnings"

| Findings residuais | Disponibilidade |
|---|---|
| 1+ critical | **bloqueada (sem visibilidade)** |
| 1+ high em domínio sensível (auth/crypto/data-model/payment) | **bloqueada** |
| 1+ high em outro domínio | confirmação dupla |
| Só medium/low | normal |

Quando aceito: `decision: "WARN_ACCEPTED"`, `confidence_impact: -0.10`.

### Rollback paths novos

| Situação | Phase | Rollback | Gate |
|---|---|---|---|
| Format-gate FAIL | 0 | Re-entry após editar (não interno) | SPEC_FORMAT_GATE_FAIL |
| Content-review NO-GO | 1.5 | (A) Re-Phase 1.5 / (B) Bypass justificado / (C) Abortar | SPEC_CONTENT_REVIEW_NOGO |
| AC traceability gap | 2 (TDD) | Voltar para Phase 1.5 (1x cap) | SPEC_AC_TRACEABILITY_GAP |
| Adversarial "Escalonar" | 2 | Phase 1.5 (re-plan) ou Phase 2 nova estratégia | ADVERSARIAL_LOOP_CHECKPOINT |
| Post-impl FAIL no fim | 3 | (A) Novo batch fix (1x) / (B) Aceitar warnings / (C) Discard | SPEC_POST_IMPL_FAIL |

Cada rollback path: **1x cap** por execução. Se exercido, suprime opção e limita a "aceitar / abortar" (mesma regra de FINAL_ADVERSARIAL_REWORK).

### Persistência para retomada

```
{PIPELINE_DOC_PATH}/
├── spec-context.yaml
├── confidence-score.yaml
├── gate-decisions.jsonl
├── sentinel-state.json
├── loop-state.yaml          # batch atual + loop_attempt + último diff
├── batch-progress.yaml
├── 0N-{agent-name}.md
└── attempts/
    ├── batch-1-attempt-1-diff.txt
    └── ...
```

**Stale context para Spec:** se `tasks.md` foi editado externamente entre sessões (timestamp > timestamp do PIPELINE_DOC_PATH), força `STALE_CONTEXT` HARD — usuário confirma se memória ainda bate com a spec.

### Abortar não é destrutivo

- Estado em PIPELINE_DOC_PATH preservado
- spec.json atualizado: `status: "aborted_at_phase_N"`
- Gera `pipeline-report-aborted.md` parcial
- Working tree mantido (usuário decide reverter)
- `/pipeline continue` retoma (com prompt se >24h)

## Sentinel checkpoints novos

5 checkpoints específicos do fluxo Spec, declarados no frontmatter das skills:

```yaml
sentinel_checkpoints:
  pre_phase_0:
    - SPEC_DISCOVERY_CHECK         # spec-context.yaml escrito antes de task-orchestrator spawnar
  phase_0_to_1:
    - SPEC_FORMAT_PASSED           # format-gate retornou GO ou GO-WARN antes de proceed
  phase_1_5:
    - SPEC_CONTENT_REVIEW_DONE
  phase_2_per_batch:
    - LOOP_STATE_CONSISTENT        # loop-state.yaml + sentinel-state.json em sincronia
  phase_3_pre_closer:
    - SPEC_GRADE_CALCULABLE        # confidence-score.yaml com todas dimensões preenchidas
```

Sentinel agent (`agents/core/sentinel.md`) ganha um branch para cada um — verificação concreta no estado em disco, retorno PASS/CORRECTED/BLOCKED.

## Hooks: zero código novo

Os 3 hooks v4.8.0 (`sentinel-hook.cjs`, `dispatch-guard.cjs`, `force-pipeline-agents.cjs`) já lêem frontmatter via `skill-frontmatter-parser.cjs`. Os agents/gates novos do Spec entram automaticamente desde que skills declarem corretamente.

**Modo enforcement:** mesmo regime time-based existente. Skills Spec entram **direto em deny** (introduzidas pós-cutoff 2026-05-17).

## Frontmatter contract das skills

```yaml
# skills/spec-heavy/SKILL.md (exemplo)
---
name: spec-heavy
type: spec
variant: heavy
sequence_lock: strict
gates_at:
  phase_0:   [SPEC_ARTIFACT_MISSING, SPEC_FORMAT_GATE_FAIL, INFO_GATE_BLOCKED]
  phase_1_5: [SPEC_CONTENT_REVIEW_NOGO, PLAN_REJECTED]
  phase_2:   [TDD_APPROVAL, SPEC_AC_TRACEABILITY_GAP, MICRO_GATE_GAP, CHECKPOINT_FAIL,
              ADVERSARIAL_GATE, ADVERSARIAL_BLOCK, ADVERSARIAL_LOOP_CHECKPOINT,
              FIX_LOOP_EXHAUSTED, STOP_RULE]
  phase_3:   [SPEC_POST_IMPL_FAIL, FINAL_ADVERSARIAL_GATE,
              FINAL_ADVERSARIAL_REWORK, CLOSEOUT_CONFIRM]
sentinel_checkpoints:
  pre_phase_0: [SPEC_DISCOVERY_CHECK]
  phase_0_to_1: [SPEC_FORMAT_PASSED]
  phase_1_5: [SPEC_CONTENT_REVIEW_DONE]
  phase_2_per_batch: [LOOP_STATE_CONSISTENT]
  phase_3_pre_closer: [SPEC_GRADE_CALCULABLE]
agent_type:
  step_01: pipeline-orchestrator:executor:type-specific:spec-format-gate
  step_02: pipeline-orchestrator:executor:type-specific:spec-content-reviewer
  step_03: pipeline-orchestrator:quality:quality-gate-router
  step_04: pipeline-orchestrator:executor:executor-controller
  step_05: pipeline-orchestrator:executor:type-specific:spec-post-impl-validator
  # arch-audit + sec-review reusam adversarial-* via review-orchestrator
  step_08: pipeline-orchestrator:core:final-validator
  step_09: pipeline-orchestrator:executor:spec-closer
---
```

`spec-audit-only/SKILL.md` omite `phase_2.TDD_APPROVAL` e `phase_2.SPEC_AC_TRACEABILITY_GAP` (não há geração de testes nesse modo).

## Testes

Estrutura espelha feature-light/heavy:

```
tests/
├── unit/
│   ├── spec-format-gate.test.js          # 25 checks
│   ├── spec-content-reviewer-slim.test.js
│   ├── spec-content-reviewer-full.test.js
│   ├── spec-post-impl-validator.test.js
│   ├── spec-closer.test.js
│   └── spec-discovery.test.js            # 4 sinais
├── integration/
│   ├── spec-light-happy-path.test.js
│   ├── spec-heavy-happy-path.test.js
│   ├── spec-audit-only-happy-path.test.js
│   ├── spec-format-fail-recovery.test.js
│   ├── spec-content-nogo-bypass.test.js
│   ├── spec-ac-traceability-gap.test.js
│   ├── adversarial-loop-converges.test.js
│   ├── adversarial-loop-checkpoint-3.test.js
│   ├── adversarial-loop-same-findings.test.js
│   └── spec-post-impl-fail-rework.test.js
├── fixtures/
│   └── specs/
│       ├── auth-flow-good/
│       ├── auth-flow-bad-format/
│       ├── auth-flow-bad-content/
│       ├── auth-flow-no-tasks/
│       ├── auth-flow-non-ears/
│       └── auth-flow-closed/
└── e2e/
    └── spec-pipeline-full-loop.test.js
```

Total: ~30 casos. Cobre descoberta, gates (cada hardness), loop (converge / não converge / mesmos findings), rollback paths (1x cap), persistência+retomada, frontmatter enforcement (testes negativos).

## Inventário de arquivos

### Novos (25)

```
agents/executor/type-specific/
  spec-format-gate.md
  spec-content-reviewer.md
  spec-post-impl-validator.md
agents/executor/
  spec-closer.md
skills/spec-light/         (7 arquivos)
skills/spec-heavy/          (10 arquivos)
skills/spec-audit-only/     (6 arquivos)
commands/spec.md
references/pipelines/
  spec-light.md
  spec-heavy.md
  spec-audit-only.md
tests/                       (~30 arquivos)
```

### Modificados (11)

```
agents/core/task-orchestrator.md          # branch de detecção Spec + spec_context.yaml
agents/core/sentinel.md                   # 5 checkpoints novos
agents/core/pipeline-controller.md        # roteamento para spec-* skills
agents/quality/quality-gate-router.md     # seed estendido por ACs
references/gates.md                       # 6 gates novos no Registry
references/team-registry.md               # 19 → 23 agents
references/complexity-matrix.md           # Spec routing entries
commands/pipeline.md                      # Inline Invariants atualizados
docs/MIGRATION-v3-to-v4.md                # apêndice Spec
CLAUDE.md                                 # lineage 4.8.0 → 4.9.0
.claude-plugin/plugin.json                # version: 4.9.0
CHANGELOG.md
```

## O que NÃO muda

- 13 invariantes operacionais existentes (preservados)
- Schema de `confidence-score.yaml` (só ganha novos eventos)
- Schema de `gate-decisions.jsonl` (só ganha novos `gate` names)
- Os 19 agents existentes (não-destrutivo; alguns ganham branches aditivos)
- Os 3 hooks v4.8.0 (zero código novo; só novo conteúdo nos manifests)
- 5 sentinel checkpoints mandatórios (Spec adiciona 5 NOVOS, não substitui)
- Linhagem de versão (minor bump por slice)

## Fidelidade ao Pulsar

| Pulsar (original) | Aqui | Fidelidade |
|---|---|---|
| HEAVY_01 / LIGHT_01 Format Gate (25 checks) | spec-format-gate | **1:1** |
| HEAVY_02 Content Review (12 eixos) | spec-content-reviewer mode=full | **1:1** |
| HEAVY_03 / LIGHT_02 Implementation (TDD + Vertical Slices) | executor-controller + quality-gate-router seedado por ACs + feature-vertical-slice-planner | Reuso semântico |
| HEAVY_04 / LIGHT_03 Post-Impl Validation (6 eixos) | spec-post-impl-validator | **1:1** |
| HEAVY_05 Architecture Audit | adversarial-architecture-critic | Reuso (mesma cobertura) |
| HEAVY_06 Security Review (8 eixos) | adversarial-security-scanner | Reuso (mesma cobertura) |
| HEAVY_07 Remediation (loop max 2x) | executor-fix loop unbounded c/ escalação 3+3+3 | **Augmentado** (autorizado pelo usuário) |
| HEAVY_08 / LIGHT_04 Confidence Dashboard (% + grade) | confidence-score.yaml + spec_grade derivado | Layered |
| HEAVY_09 / LIGHT_05 Closure (2 reports + spec.json) | spec-closer | **1:1** |
| Sequencial 1-3, Paralelo 4-5-6 | Per-batch adversarial dispatcha 3 paralelo | **1:1** (paralelo preservado) |
| Auto-detect spec phase via spec.json | task-orchestrator lê spec.json | **1:1** |
| Modos full / quick / audit-only | Variantes spec-heavy / spec-light / spec-audit-only | **1:1** |
| Smart resume `--from=N` | `/pipeline continue` | Equivalente semântico |

### Adições autorizadas

1. Slim content review no Light (Pulsar Light não tinha) — usuário pediu auditoria de spec como objetivo central
2. ATDD via seed por AC (Pulsar Heavy só falava em TDD genérico) — usuário pediu
3. Per-batch adversarial loop (Pulsar tinha auditoria 1x no fim) — usuário pediu
4. Loop unbounded com escalação interativa (Pulsar tinha cap 2x rígido) — usuário pediu
5. Skill manifest com frontmatter contract — pipeline-orchestrator exige (governança)

## Versão e linhagem

- **Versão alvo:** v4.9.0 (Slice 4 — Pulsar Spec Lifecycle import)
- **Lineage:** v4.8.0 (Hook Enforcement) → **v4.9.0 (Slice 4)**
- **Total agents:** 19 → 23
- **Total skills com frontmatter contract:** ganha 3 (spec-light, spec-heavy, spec-audit-only)
- **Total commands thin entry-points:** 3 → 4 (ganha `/spec`)
- **Total gates no Registry:** 16 → 22

## Próximos passos sugeridos

1. Revisão deste design com `compound-engineering:document-review` ou `bmad-checkpoint-preview` antes de implementar
2. Criar branch `feat/v4.9.0-spec-workflow-import`
3. Implementação por wave:
   - Wave 1: agents novos (spec-format-gate, spec-content-reviewer, spec-post-impl-validator, spec-closer) + tests unit
   - Wave 2: skills novas (spec-light, spec-heavy, spec-audit-only) + frontmatter contract
   - Wave 3: modificações em task-orchestrator + sentinel + pipeline-controller + quality-gate-router
   - Wave 4: commands/spec.md (thin entry-point) + references/pipelines/spec-*.md
   - Wave 5: gates registry + Inline Invariants + complexity-matrix
   - Wave 6: tests integration + e2e + fixtures
   - Wave 7: docs (MIGRATION, CHANGELOG, CLAUDE.md, plugin.json bump)
4. Cada wave passa pelo próprio pipeline-orchestrator (`/pipeline-orchestrator:pipeline`) — dogfooding
5. Release ritual: tag v4.9.0, marketplace publish, atualizar CLAUDE.md lineage

## Open questions (não-bloqueadores)

- Os 5-6 eixos do `spec-content-reviewer-slim` precisam ser definidos concretamente (subset dos 12 do Pulsar). Sugestão inicial: clareza requirements, AC↔task traceability, DoD presente, completude design, riscos identificados, scope bounded. Validar na Wave 1.
- Os 6 eixos do `spec-post-impl-validator` precisam mapear 1:1 com o spec-post-impl-validator do Pulsar — ler `D:/Projeto Pulsar/.claude/commands/spec-post-impl-validator.md` integralmente na Wave 1 (não foi lido inteiro durante o brainstorm; só metadata).
- O extrator de AC do requirements.md (formato EARS) precisa de protótipo. Heurística: regex `When .+, system shall .+` ou `WHEN .+ THEN .+`. Investigar variantes em fixtures.
- `spec_grade` weighted_sum: pesos por dimensão precisam ser definidos. Sugestão inicial: usar pesos do Pulsar (format=15, content=20, impl=25, post-impl=25, arch=10, sec=5 = 100). Validar na Wave 5.

## Apêndice: comparação com `commands/spec-pipeline.md` original do Pulsar

O Pulsar `/spec-pipeline` é um mega-orchestrador monolítico (337 linhas) que faz tudo num arquivo só: detecção, classificação, fases, confidence, remediation. Aqui isso é **decomposto** em:

- Detecção → `task-orchestrator` (existente, ganha branch)
- Classificação → variant decision baseado em complexity + flags
- Fases → infraestrutura existente do pipeline-orchestrator
- Confidence → `confidence-score.yaml` dimensional + `spec_grade` derivado
- Remediation → `executor-fix` + `ADVERSARIAL_LOOP_CHECKPOINT`

A monolítica fica menor: `commands/spec.md` é thin entry-point (~40 linhas), e a lógica vive nas skills + agents.

**Trade-off explícito:** menos rastreável visualmente (precisa ler vários arquivos para entender o fluxo) mas mais testável, mais auditável (frontmatter contract + sentinel + JSONL log) e reutiliza máquina existente.
