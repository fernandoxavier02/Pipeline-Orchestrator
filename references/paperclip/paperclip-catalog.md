# Paperclip Catalog — Pipeline-Orchestrator Agents

**Generated:** 2026-05-22 (revisado em 2026-06-02 — contagem de 47 cargos reconferida; lista inalterada)
**Source:** `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\agents\**\*.md`
**Total agents:** 47

---

## Resumo Executivo

### Contagem por categoria

| Categoria | Pasta | Quantidade |
|---|---|---|
| core | `agents/core/` | 10 |
| brainstorm | `agents/brainstorm/` | 3 |
| quality | `agents/quality/` | 8 |
| executor-controller | `agents/executor/` (raiz) | 6 |
| executor-type-specific | `agents/executor/type-specific/` | 20 |
| **TOTAL** | | **47** |

### Contagem por protocolo emitido

| Protocolo | Quantidade | Observação |
|---|---|---|
| GATE_REQUEST v1 (decisão user) | ~22 | Maioria dos agentes que precisam de input do user emitem este |
| DISPATCH_REQUEST v1 (spawn de subagente) | 3 | `brainstorm-controller`, `pipeline-controller`, `adversarial-review-coordinator` |
| PLAN_MODE_REQUEST v1 (research) | 2 | `plan-architect`, `brainstorm-controller` |
| SENTINEL_VERDICT (YAML estruturado próprio) | 1 | `sentinel` |
| ORCHESTRATOR_DECISION (YAML próprio) | 1 | `task-orchestrator` |
| PA_DE_CAL (YAML próprio) | 1 | `final-validator` |
| Apenas YAML de relatório (sem protocolo de hoist) | ~15 | Reviewers/auditors read-only que retornam findings |
| Nenhum (controller puro, sem hoist) | ~3 | Controllers que só dispatcham e consolidam |

### Distribuição de modelos

- `opus` — 12 agentes (orquestradores e implementadores pesados)
- `sonnet` — 29 agentes (maioria dos reviewers, planners, validators)
- `haiku` — 3 agentes (checks rápidos: checkpoint-validator, sanity-checker, bugfix-regression-tester)
- não declarado — 3 agentes (adversarial-batch, adversarial-review-coordinator herdam)

---

## CATEGORIA: core (10 agentes)

### pipeline-controller

- **name:** pipeline-controller
- **category:** core
- **description:** Orchestrates the pipeline-orchestrator 4-phase workflow in an isolated context. Spawned by skills/pipeline/SKILL.md. Handles Phase 0 (triage), 1 (proposal), 1.5 (planning), 2 (batch execution), 3 (closure). Dispatches 37 N2 agents.
- **when_to_use:** Spawned pelo `/pipeline-orchestrator:pipeline` quando o usuário inicia qualquer trabalho não-trivial. É o N1 que coordena tudo.
- **tools:** Read, Write, Glob, Grep, Agent, AskUserQuestion, Task, Bash
- **role_one_line:** Orquestrador-mestre N1 que dispatcha agentes N2/N3 em 4 fases e gerencia gates do pipeline.
- **emits_protocol:** AskUserQuestion direto (tem o tool); coordena GATE_RESPONSES/DISPATCH_RESULTS de subagentes; emite PIPELINE COMPLETE block no fim.
- **paperclip_role_suggestion:** Project Manager / Delivery Lead

### task-orchestrator

- **name:** task-orchestrator
- **category:** core
- **description:** Mandatory entry point before any implementation work. Classifies task type (6 types), complexity (3 levels), spawns information-gate, presents pipeline proposal for user confirmation.
- **when_to_use:** Primeira coisa que roda em qualquer request do usuário; classifica e roteia antes de qualquer outro agente.
- **tools:** não declarado (herda do parent)
- **role_one_line:** Triagista que classifica tipo + complexidade da demanda e propõe pipeline ao usuário.
- **emits_protocol:** ORCHESTRATOR_DECISION (YAML próprio); usa AskUserQuestion para confirmação.
- **paperclip_role_suggestion:** Intake Coordinator / Solutions Triage

### information-gate

- **name:** information-gate
- **category:** core
- **description:** Defense-in-depth macro-gate. Runs after classification, before pipeline selection. Detects information gaps using conditional logic per task type. BLOCKS pipeline until all critical gaps resolved.
- **when_to_use:** Logo após task-orchestrator classificar, antes da seleção do pipeline; faz perguntas críticas para evitar invenção.
- **tools:** não declarado
- **role_one_line:** Detector de lacunas de informação que bloqueia o pipeline até todo gap crítico ser resolvido.
- **emits_protocol:** GATE_REQUEST v1 (uma pergunta por vez, com evidência file:line); INFORMATION_GATE YAML no fim.
- **paperclip_role_suggestion:** Business Analyst / Requirements Clarifier

### sentinel

- **name:** sentinel
- **category:** core
- **description:** Pipeline execution guardian. Validates phase sequence, orchestrator decisions, gate content, and cross-gate coherence. Blocks and auto-corrects deviations. Never contaminated with implementation context.
- **when_to_use:** Acionado em 3 modos: após task-orchestrator (ORCHESTRATOR_VALIDATION), quando hook nega spawn (SEQUENCE_VALIDATION), e em transições de fase (COHERENCE_VALIDATION).
- **tools:** Read, Glob, Grep (read-only, allowed-tools)
- **role_one_line:** Auditor de execução que valida sequência de fases e coerência entre gates, sem contexto de implementação.
- **emits_protocol:** SENTINEL_VERDICT (YAML próprio com status PASS/CORRECTED/BLOCKED).
- **paperclip_role_suggestion:** Compliance Officer / Process Auditor

### sanity-checker

- **name:** sanity-checker
- **category:** core
- **description:** Fifth pipeline agent. Runs proportional sanity checks - build only (SIMPLES), build+tests (MEDIA), build+tests+regression (COMPLEXA). Automatic flow to final-validator.
- **when_to_use:** Stage 5/6 do pipeline, antes do final-validator; valida build/test/regression conforme complexidade.
- **tools:** não declarado
- **role_one_line:** Validador de sanidade que roda build, testes e reprodução do sintoma com evidência verificável.
- **emits_protocol:** GATE_REQUEST v1 quando há ambiguidade; SANITY_CHECK YAML padrão.
- **paperclip_role_suggestion:** QA Engineer / Build Verifier

### checkpoint-validator

- **name:** checkpoint-validator
- **category:** core
- **description:** Validates batch completion with build + test + optional regression. Runs after each batch in the executor phase. Enforces STOP RULE (2 consecutive failures = stop). Every claim requires command + actual output evidence.
- **when_to_use:** Após cada batch da fase de execução; controla a regra do "para com 2 falhas seguidas" e promove testes ao registro de regressão.
- **tools:** não declarado (modelo haiku)
- **role_one_line:** Validador rápido por batch que prova com evidência (command + output) que o build e os testes passaram.
- **emits_protocol:** GATE_REQUEST v1 quando inputs ausentes; CHECKPOINT_RESULT YAML + tabela markdown consolidada.
- **paperclip_role_suggestion:** Continuous Integration Specialist

### final-validator

- **name:** final-validator
- **category:** core
- **description:** Sixth and final pipeline agent (Pa de Cal). Consolidates results from all agents, applies proportional validation criteria, and issues final Go/No-Go decision. End of automated pipeline.
- **when_to_use:** Última estação do pipeline; consolida tudo, calcula confidence + fidelity, emite GO / CONDITIONAL / NO-GO, coleta nota do usuário em 4 eixos se Langfuse ligado.
- **tools:** não declarado
- **role_one_line:** Decisor final Pa de Cal que consolida todos os agentes e emite veredicto Go/No-Go com justificativa.
- **emits_protocol:** PA_DE_CAL (YAML próprio); AskUserQuestion direto para score collection e closeout.
- **paperclip_role_suggestion:** Release Manager / Sign-off Authority

### finishing-branch

- **name:** finishing-branch
- **category:** core
- **description:** Optional post-validation agent. Presents structured options to finalize work on a branch (merge/PR/keep/discard). Only activated when pipeline worked on a branch.
- **when_to_use:** Depois do final-validator, quando trabalho foi em branch e usuário escolheu push+PR; oferece 4 opções de fechamento (commit/push+PR/keep/discard).
- **tools:** não declarado
- **role_one_line:** Helper de closeout git que apresenta merge/PR/keep/discard com confirmações de dupla checagem.
- **emits_protocol:** AskUserQuestion direto para closeout; CLOSEOUT_ACTION report.
- **paperclip_role_suggestion:** Release Engineer / DevOps

### brainstorm-controller

- **name:** brainstorm-controller
- **category:** core
- **description:** Orchestrates the pre-execution brainstorm + spec lifecycle pipeline. Handles 10 sequential steps (00-intake → 01-explore → 01b-alternatives → 02-spec-init → ... → 08-handoff). Returns RUN_COMPLETE block.
- **when_to_use:** Spawnado pelo `/brainstorm` ou pelo pipeline-controller STEP 1.7 (auto-dispatch para MEDIA/COMPLEXA/Spec); coordena preparação pré-execução.
- **tools:** Read, Write, Glob, Grep, Agent, AskUserQuestion, Bash
- **role_one_line:** Orquestrador N1 do pipeline de brainstorm e spec lifecycle (10 steps até handoff).
- **emits_protocol:** GATE_REQUEST v1 (em todos os gates do explore + handoff); DISPATCH_REQUEST v1 para spawn de step-agents; RUN_COMPLETE block no fim.
- **paperclip_role_suggestion:** Pre-Sales Lead / Discovery Workshop Facilitator

### adversarial-batch

- **name:** adversarial-batch
- **category:** core
- **description:** Per-batch adversarial reviewer. Loads only relevant security checklists from references/checklists/. Fix loop max 3 attempts - on 3rd failure STOPS and proposes new approach to user.
- **when_to_use:** Após cada batch da execução; pensa como atacante e busca o que pode dar errado com checklists carregados sob demanda.
- **tools:** não declarado
- **role_one_line:** Reviewer adversarial por batch que pensa como atacante e roda checklists de segurança seletivos.
- **emits_protocol:** ADVERSARIAL_BATCH_REVIEW YAML; AskUserQuestion para escalation no 3rd failure.
- **paperclip_role_suggestion:** Security Analyst / Penetration Tester (per-batch)

---

## CATEGORIA: brainstorm (3 agentes)

### brainstorm-step-00-intake

- **name:** brainstorm-step-00-intake
- **category:** brainstorm
- **description:** Captures the original prompt + git state + candidate files into 00-brainstorm/01-intake.md. First step of the brainstorm pipeline.
- **when_to_use:** Step 0 do brainstorm; roda uma vez no início de cada run para capturar contexto inicial.
- **tools:** Read, Write, Glob, Grep, Bash
- **role_one_line:** Capturador inicial de contexto (prompt + git + arquivos candidatos) para o pipeline de brainstorm.
- **emits_protocol:** Nenhum protocolo de hoist (sem AskUserQuestion); retorna path do artefato escrito.
- **paperclip_role_suggestion:** Discovery Note-Taker / Onboarding Specialist

### brainstorm-step-01-explore

- **name:** brainstorm-step-01-explore
- **category:** brainstorm
- **description:** Runs exhaustive, context-aware clarification — analyses prompt + project state + likely affected files FIRST, then formulates gap-driven questions across 11 dimensions (no fixed count, no template list). Second step of brainstorm pipeline. Replaces legacy "fixed 7-question" template.
- **when_to_use:** Step 1 do brainstorm; eliminação exaustiva de ambiguidade antes de qualquer downstream agent inventar.
- **tools:** Read, Write, AskUserQuestion, Glob, Grep, Bash
- **role_one_line:** Investigador exaustivo que lê o código primeiro e gera gates de clarificação por gap real ancorados em file:line.
- **emits_protocol:** GATE_REQUEST v1 (um por gap, evidência file:line obrigatória); registra Q&A em 02-explore.md.
- **paperclip_role_suggestion:** Senior Discovery Analyst / Requirements Detective

### brainstorm-step-01b-alternatives

- **name:** brainstorm-step-01b-alternatives
- **category:** brainstorm
- **description:** Proposes 2-4 alternative approaches to the user's implicit plan after clarification is complete. Surfaces routes the user may not have considered (minimal / pattern-aligned / aggressive / contrarian). GATE_REQUEST to choose.
- **when_to_use:** Step 1b do brainstorm, após step-01-explore; auto-skipa em tarefas mecânicas SIMPLES com zero lenses abertas.
- **tools:** Read, Write, AskUserQuestion, Glob, Grep
- **role_one_line:** Brainstormer de alternativas que propõe 2-4 caminhos (mínimo/padrão/agressivo/contrário) antes de travar o design.
- **emits_protocol:** GATE_REQUEST v1 para escolha de alternativa; ALTERNATIVES_SKIPPED telemetria quando auto-skip.
- **paperclip_role_suggestion:** Solutions Architect / Options Strategist

---

## CATEGORIA: quality (8 agentes)

### design-interrogator

- **name:** design-interrogator
- **category:** quality
- **description:** Design interrogation agent. Runs after information-gate for COMPLEXA tasks (or when --grill flag is used). Walks the design decision tree relentlessly, resolving trade-offs one-by-one before implementation begins.
- **when_to_use:** Pós information-gate em COMPLEXA ou via --grill; explora trade-offs de design (HOW), não fatos faltantes (WHAT).
- **tools:** não declarado
- **role_one_line:** Interrogador de design que stress-testa cada trade-off arquitetural antes da implementação começar.
- **emits_protocol:** AskUserQuestion direto (uma pergunta por vez, com recomendação como primeira opção).
- **paperclip_role_suggestion:** Principal Engineer / Design Reviewer

### plan-architect

- **name:** plan-architect
- **category:** quality
- **description:** Implementation planning agent. Enters Plan Mode (read-only) after proposal confirmation to research the codebase and create a structured implementation plan. Auto for COMPLEXA, opt-in via --plan flag, skipped for SIMPLES.
- **when_to_use:** Fase 1.5; pesquisa codebase em Plan Mode e propõe plano com CHANGE_CONTRACT antes do executor implementar.
- **tools:** não declarado
- **role_one_line:** Arquiteto de implementação que pesquisa em Plan Mode e desenha o plano com contrato de mudança explícito.
- **emits_protocol:** PLAN_MODE_REQUEST v1 (delega EnterPlanMode ao parent); AskUserQuestion para approve/adjust/reject do plano.
- **paperclip_role_suggestion:** Tech Lead / Implementation Architect

### quality-gate-router

- **name:** quality-gate-router
- **category:** quality
- **description:** Pipeline stage 2.5. Selects the correct test strategy based on pipeline type and intensity. Generates tests in PLAIN LANGUAGE for user approval BEFORE implementation. Blocks pipeline until user approves test scenarios.
- **when_to_use:** Stage 2.5; gera cenários de teste em linguagem clara e bloqueia até o usuário aprovar antes de qualquer código.
- **tools:** não declarado
- **role_one_line:** Roteador de estratégia de teste que escreve cenários em linguagem natural e exige approve do usuário antes do TDD.
- **emits_protocol:** AskUserQuestion direto (um cenário por vez: approve/changes/skip).
- **paperclip_role_suggestion:** QA Lead / Test Strategist

### pre-tester

- **name:** pre-tester
- **category:** quality
- **description:** Pipeline stage 2.6. Converts user-approved plain language scenarios into automated test code (RED phase). Does NOT modify production code. Tests MUST FAIL before implementation begins.
- **when_to_use:** Stage 2.6; converte cenários aprovados em testes automatizados na fase RED do TDD (devem falhar antes do GREEN).
- **tools:** não declarado (modelo opus)
- **role_one_line:** Escritor de testes TDD RED-phase que materializa os cenários aprovados em código de teste que precisa falhar.
- **emits_protocol:** AskUserQuestion quando assertion ambígua; lista de testes criados.
- **paperclip_role_suggestion:** Test Engineer / TDD Specialist

### architecture-reviewer

- **name:** architecture-reviewer
- **category:** quality
- **description:** Per-batch architecture reviewer. Verifies code follows project patterns, uses existing abstractions, avoids semantic duplication, and respects naming conventions. Runs after executor-quality-reviewer.
- **when_to_use:** Em paralelo no review-orchestrator (3-way em MEDIA/COMPLEXA); confere que o batch respeita padrões e abstrações existentes.
- **tools:** não declarado
- **role_one_line:** Reviewer arquitetural por batch que confere aderência a padrões e detecta duplicação semântica.
- **emits_protocol:** YAML de findings; sem AskUserQuestion direto (reports para review-orchestrator).
- **paperclip_role_suggestion:** Senior Architect (Patterns/Conventions)

### diff-discipline-reviewer

- **name:** diff-discipline-reviewer
- **category:** quality
- **description:** Per-batch diff discipline reviewer. Verifies the batch's actual diff respects the IMPLEMENTATION_PLAN.CHANGE_CONTRACT — scope, minimal-diff, no over-engineering, no dependency/config/contract/migration drift, no test weakening. Static-only inspection. Introduced in v6.3.0.
- **when_to_use:** Em paralelo no review-orchestrator (3-way) quando o plano tem CHANGE_CONTRACT; valida que o diff respeita escopo e disciplina.
- **tools:** Read, Grep, Glob
- **role_one_line:** Reviewer de disciplina de diff que compara o diff real contra o CHANGE_CONTRACT do plano e flagra over-engineering.
- **emits_protocol:** YAML de findings (PASS/NEEDS_REDUCTION/REJECTED); sem AskUserQuestion.
- **paperclip_role_suggestion:** Scope/PR Reviewer / Change Control Specialist

### review-orchestrator

- **name:** review-orchestrator
- **category:** quality
- **description:** Per-batch review orchestrator. Spawns adversarial-batch and architecture-reviewer in PARALLEL with clean context. Spawned by pipeline.md, NOT by executor-controller — ensures zero context contamination.
- **when_to_use:** Após cada batch (spawned pelo pipeline.md, não pelo executor); dispara 2-3 reviewers em paralelo sem contaminação de contexto.
- **tools:** não declarado (modelo opus)
- **role_one_line:** Coordenador de review por batch que dispara reviewers em paralelo com contexto limpo e consolida findings.
- **emits_protocol:** REVIEW_CONSOLIDATED YAML; sem GATE_REQUEST direto (delega ao fix loop).
- **paperclip_role_suggestion:** Code Review Lead / Quality Coordinator

### final-adversarial-orchestrator

- **name:** final-adversarial-orchestrator
- **category:** quality
- **description:** Final independent adversarial review orchestrator. Runs AFTER sanity-checker, BEFORE final-validator. Spawns 3 independent reviewers in parallel (security, architecture, quality) with ZERO prior context. Opt-in gate.
- **when_to_use:** Antes do final-validator; opt-in pelo custo de tokens; dispatcha 3 reviewers zero-context sobre todo o diff acumulado.
- **tools:** não declarado (modelo opus)
- **role_one_line:** Coordenador da revisão adversarial final que dispatcha 3 reviewers independentes sobre o diff completo do pipeline.
- **emits_protocol:** Consolidated findings report; sem AskUserQuestion direto.
- **paperclip_role_suggestion:** Independent Audit Lead / Red Team Coordinator

---

## CATEGORIA: executor-controller (6 agentes em agents/executor/)

### executor-controller

- **name:** executor-controller
- **category:** executor-controller
- **description:** Orchestrates task execution in adaptive batches. Dispatches per-task subagents (implementer -> spec-reviewer -> quality-reviewer), runs micro-gate before each task, triggers checkpoint-validator after each batch.
- **when_to_use:** Fase 2 (execução); recebe ORCHESTRATOR_DECISION e dispatcha implementers em batches adaptativos com micro-gate.
- **tools:** não declarado (modelo opus)
- **role_one_line:** Engine de execução por batches que dispatcha implementer/spec-review/quality-review por tarefa e roda checkpoint após cada batch.
- **emits_protocol:** AskUserQuestion direto para gates mid-batch; EXECUTOR_RESULT YAML consolidado.
- **paperclip_role_suggestion:** Engineering Manager / Sprint Master

### executor-implementer-task

- **name:** executor-implementer-task
- **category:** executor-controller
- **description:** Per-task implementer subagent. Runs micro-gate BEFORE writing any code, then follows Iron Laws (TDD, ask-first, self-review). Stops immediately on information gaps.
- **when_to_use:** Subagent dispatched por executor-controller para implementar UMA tarefa específica seguindo TDD GREEN.
- **tools:** não declarado (modelo opus)
- **role_one_line:** Implementador por tarefa que roda micro-gate de 5 checks antes de qualquer Write/Edit e segue TDD.
- **emits_protocol:** AskUserQuestion para gaps detectados no micro-gate; TASK_RESULT report.
- **paperclip_role_suggestion:** Mid/Senior Engineer (IC)

### executor-spec-reviewer

- **name:** executor-spec-reviewer
- **category:** executor-controller
- **description:** Per-task spec compliance reviewer subagent. Verifies implementation matches requirements. Does NOT trust the implementer's report.
- **when_to_use:** Após implementer terminar uma task; lê o código e confere contra os requirements sem confiar no summary do implementer.
- **tools:** não declarado
- **role_one_line:** Reviewer por tarefa que confere se o código realmente cumpre o requisito (não confia no resumo do implementer).
- **emits_protocol:** SPEC_REVIEW YAML com PASS/FAIL.
- **paperclip_role_suggestion:** Spec Reviewer / Requirements Validator

### executor-quality-reviewer

- **name:** executor-quality-reviewer
- **category:** executor-controller
- **description:** Per-task code quality reviewer subagent. Checks SOLID, KISS, DRY, YAGNI, tests, and patterns. Only runs AFTER spec-reviewer PASS.
- **when_to_use:** Após spec-reviewer aprovar; valida princípios de código e qualidade da tarefa.
- **tools:** não declarado
- **role_one_line:** Reviewer de qualidade por tarefa que confere SOLID/KISS/DRY/YAGNI após o spec-reviewer aprovar.
- **emits_protocol:** QUALITY_REVIEW YAML com PASS/FAIL.
- **paperclip_role_suggestion:** Senior IC / Clean Code Reviewer

### executor-fix

- **name:** executor-fix
- **category:** executor-controller
- **description:** Per-finding fix subagent. Receives adversarial/architecture findings and applies targeted fixes within strict file scope. Fresh context — not the original implementer. Max 3 attempts per finding set.
- **when_to_use:** Após adversarial/architecture review levantar findings; aplica fix em contexto limpo (não é o implementer original) com 3 tentativas máx.
- **tools:** não declarado (modelo opus)
- **role_one_line:** Fixer em contexto limpo (não é o implementer original) que aplica correções pontuais sobre findings de review.
- **emits_protocol:** AskUserQuestion quando finding ambíguo; FIX_RESULT report.
- **paperclip_role_suggestion:** Remediation Engineer / Bug Squasher

### spec-closer

- **name:** spec-closer
- **category:** executor-controller
- **description:** Spec closer (Phase 3 closure). Consolidates results from all spec lifecycle phases, computes spec_grade via progressive scoring, generates two reports (technical + executive), updates spec.json to status=closed. Variant-agnostic.
- **when_to_use:** Fase 3 de todo pipeline spec-*; consolida verdicts, calcula nota e fecha o spec.json em status=closed.
- **tools:** Read, Grep, Glob, Bash, Write
- **role_one_line:** Fechador do ciclo Spec que consolida verdicts de todas as fases, calcula nota final e gera dois relatórios + spec.json closed.
- **emits_protocol:** CLOSEOUT_CONFIRM gate decision; sem AskUserQuestion direto.
- **paperclip_role_suggestion:** Project Closure Officer / Executive Reporter

---

## CATEGORIA: executor-type-specific (20 agentes em agents/executor/type-specific/)

### feature-vertical-slice-planner

- **name:** feature-vertical-slice-planner
- **category:** executor-type-specific
- **description:** Plans vertical slice architecture for Feature and User Story pipelines. Scopes slices, maps terrain, defines architecture approach.
- **when_to_use:** Início da fase de execução em pipelines Feature/User Story; quebra a feature em slices verticais com BDD Gherkin.
- **tools:** não declarado (read-only por Iron Law)
- **role_one_line:** Planejador VSA que quebra feature em slices verticais com BDD Gherkin e mapeia terreno do projeto.
- **emits_protocol:** Plan report; sem AskUserQuestion (read-only Iron Law).
- **paperclip_role_suggestion:** Product Engineer (Planning) / Feature Architect

### feature-implementer

- **name:** feature-implementer
- **category:** executor-type-specific
- **description:** Feature-aware implementation agent. Wraps executor-implementer-task with VSA constraints (per-slice TDD, minimal diff). Handles both Feature and User Story types.
- **when_to_use:** Implementa slices verticais de Feature/User Story com TDD por slice e diff mínimo.
- **tools:** não declarado (modelo opus)
- **role_one_line:** Implementador feature-aware que escreve código por slice vertical com TDD RED→GREEN→REFACTOR.
- **emits_protocol:** AskUserQuestion para trade-offs de domínio; FEATURE_TASK_RESULT.
- **paperclip_role_suggestion:** Full-Stack Engineer / Feature Developer

### feature-integration-validator

- **name:** feature-integration-validator
- **category:** executor-type-specific
- **description:** Validates feature integration across all layers (UI, service, data, contracts). Verifies integration points, acceptance criteria, and cross-slice consistency.
- **when_to_use:** Pós-implementação de Feature/User Story; confere integração cross-layer e cumprimento de acceptance criteria.
- **tools:** não declarado (read-only por Iron Law)
- **role_one_line:** Validador de integração de feature que confere UI/service/data/contracts e acceptance criteria.
- **emits_protocol:** Integration report (read-only); sem AskUserQuestion.
- **paperclip_role_suggestion:** Integration QA / Acceptance Tester

### bugfix-diagnostic-agent

- **name:** bugfix-diagnostic-agent
- **category:** executor-type-specific
- **description:** Performs terrain reconnaissance and hypothesis ranking for Bug Fix pipelines. Maps system architecture, traces end-to-end flow, generates ranked hypotheses. Does NOT write code.
- **when_to_use:** Primeira etapa de pipelines Bug Fix; mapeia terreno, traça flow E2E e ranqueia hipóteses sem escrever código.
- **tools:** não declarado (read-only por Iron Law)
- **role_one_line:** Investigador de bug que mapeia terreno, traça fluxo end-to-end e ranqueia hipóteses (não escreve fix).
- **emits_protocol:** AskUserQuestion entre hipóteses equiplausíveis; DIAGNOSTIC_REPORT.
- **paperclip_role_suggestion:** Production Support Engineer / Diagnostician

### bugfix-root-cause-analyzer

- **name:** bugfix-root-cause-analyzer
- **category:** executor-type-specific
- **description:** Consolidates root cause from diagnostic hypotheses with objective evidence chains. Tests hypotheses systematically, confirms root cause, maps SSOT and domain model, produces fix guidance.
- **when_to_use:** Após bugfix-diagnostic-agent; confirma root cause com cadeia de evidências objetivas e gera fix guidance.
- **tools:** não declarado (read-only por Iron Law)
- **role_one_line:** Analista de causa raiz que confirma a hipótese vencedora com cadeia objetiva de evidências.
- **emits_protocol:** AskUserQuestion para aceitar evidência; ROOT_CAUSE_RESULT.
- **paperclip_role_suggestion:** Root Cause Analyst / Forensic Engineer

### bugfix-regression-tester

- **name:** bugfix-regression-tester
- **category:** executor-type-specific
- **description:** Post-fix sanity check and regression testing agent. Verifies symptom resolution, runs full test suite, creates regression tests, checks for adjacent breakage. MAY write test files.
- **when_to_use:** Após fix implementado; verifica que o sintoma sumiu, cria regressão e checa quebras adjacentes (pode escrever arquivos de TESTE).
- **tools:** não declarado (modelo haiku)
- **role_one_line:** Tester de regressão pós-fix que verifica resolução do sintoma e escreve testes de regressão.
- **emits_protocol:** GATE_REQUEST v1 quando inputs ausentes; AskUserQuestion para trade-offs de teste.
- **paperclip_role_suggestion:** Regression Test Engineer

### ux-simulator

- **name:** ux-simulator
- **category:** executor-type-specific
- **description:** UX Simulation agent. Creates persona matrix, simulates user journeys per persona, catalogs friction points. PARALLEL-capable with ux-accessibility-auditor.
- **when_to_use:** Pipelines UX Simulation; em paralelo com ux-accessibility-auditor; simula jornadas por persona e cataloga atritos.
- **tools:** Read, Grep, Glob (Iron Law read-only)
- **role_one_line:** Simulador de UX que cria personas, percorre jornadas e cataloga friction points.
- **emits_protocol:** AskUserQuestion para confirmação de persona; UX_SIM_REPORT.
- **paperclip_role_suggestion:** UX Researcher / Journey Designer

### ux-accessibility-auditor

- **name:** ux-accessibility-auditor
- **category:** executor-type-specific
- **description:** Accessibility auditor agent. Performs WCAG 2.1 AA audit, keyboard navigation check, contrast analysis, and touch target evaluation. PARALLEL-capable with ux-simulator.
- **when_to_use:** Pipelines UX em paralelo com ux-simulator; audita WCAG 2.1 AA, teclado, contraste e touch targets.
- **tools:** Read, Grep, Glob (Iron Law read-only)
- **role_one_line:** Auditor de acessibilidade WCAG 2.1 AA que confere teclado, contraste e touch targets.
- **emits_protocol:** AskUserQuestion para bar de compliance; A11Y_AUDIT_REPORT.
- **paperclip_role_suggestion:** Accessibility Specialist / A11y Engineer

### ux-qa-validator

- **name:** ux-qa-validator
- **category:** executor-type-specific
- **description:** UX QA validator agent. Consolidates findings from ux-simulator and ux-accessibility-auditor, tags severity, creates priority matrix and action items.
- **when_to_use:** Após ux-simulator + ux-accessibility-auditor rodarem em paralelo; consolida findings com priorização.
- **tools:** Read, Grep, Glob (Iron Law read-only)
- **role_one_line:** Consolidador UX que junta findings de simulator + a11y auditor com matriz de prioridade e ações.
- **emits_protocol:** AskUserQuestion para ordering de prioridade; UX_QA_REPORT.
- **paperclip_role_suggestion:** UX QA Lead / Priority Triage

### audit-intake

- **name:** audit-intake
- **category:** executor-type-specific
- **description:** Audit intake agent. Performs technology stack identification, repository mapping, entry point enumeration, hotspot detection, and evidence classification setup. READ-ONLY.
- **when_to_use:** Primeira etapa de pipelines Audit; inventário do repo (stack, entry points, hotspots).
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Inventariador inicial de auditoria que mapeia stack, repositório, entry points e hotspots.
- **emits_protocol:** AuditIntake report YAML; sem AskUserQuestion.
- **paperclip_role_suggestion:** Audit Intake Analyst / Code Inventory

### audit-domain-analyzer

- **name:** audit-domain-analyzer
- **category:** executor-type-specific
- **description:** Audit domain analyzer agent. Performs architecture analysis, domain model mapping, SSOT verification, API contract compliance, and business rule extraction. READ-ONLY.
- **when_to_use:** Segunda etapa do pipeline Audit, após audit-intake; análise arquitetural profunda + SSOT + business rules.
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Analista de domínio que mapeia arquitetura, modelo de domínio, SSOTs e regras de negócio.
- **emits_protocol:** DOMAIN_ANALYSIS report (read-only); sem AskUserQuestion.
- **paperclip_role_suggestion:** Senior Domain Architect / Auditor

### audit-compliance-checker

- **name:** audit-compliance-checker
- **category:** executor-type-specific
- **description:** Audit compliance checker agent. Performs data integrity assessment, security pattern review, governance check, and test coverage analysis. READ-ONLY.
- **when_to_use:** Terceira etapa do Audit; confere data integrity, security patterns, governança e cobertura de teste.
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Auditor de compliance que confere integridade de dados, padrões de segurança, governança e cobertura de teste.
- **emits_protocol:** COMPLIANCE_REPORT (read-only); sem AskUserQuestion.
- **paperclip_role_suggestion:** Compliance Auditor / Governance Reviewer

### audit-risk-matrix-generator

- **name:** audit-risk-matrix-generator
- **category:** executor-type-specific
- **description:** Audit risk matrix generator agent. Consolidates all audit findings, tags each with VERIFIED/HYPOTHESIS/DESIGN and file:line evidence, builds risk matrix by severity, creates priority backlog. READ-ONLY.
- **when_to_use:** Etapa final do Audit; consolida findings com tags de evidência e gera risk matrix + backlog priorizado.
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Consolidador de risco que tagueia findings com VERIFIED/HYPOTHESIS/DESIGN e monta matriz de severidade.
- **emits_protocol:** AUDIT_REPORT (read-only); sem AskUserQuestion.
- **paperclip_role_suggestion:** Risk Officer / Audit Report Author

### adversarial-review-coordinator

- **name:** adversarial-review-coordinator
- **category:** executor-type-specific
- **description:** Coordinates adversarial review by dispatching security scanner and architecture critic in parallel. Supports two modes: review-only (report, no code) and fix mode.
- **when_to_use:** Pipelines do tipo Adversarial Review; coordena security-scanner + architecture-critic em paralelo (context-aware exception).
- **tools:** não declarado (modelo opus)
- **role_one_line:** Coordenador de revisão adversarial que dispatcha security + architecture critic em paralelo (com modo review-only ou fix).
- **emits_protocol:** Consolidated findings; usa Agent tool para dispatch (precisaria DISPATCH_REQUEST se rodando como subagente).
- **paperclip_role_suggestion:** Red Team Lead

### adversarial-security-scanner

- **name:** adversarial-security-scanner
- **category:** executor-type-specific
- **description:** Independent security scanner that reviews files with ZERO implementation context. Performs assumption analysis, malicious input testing, race condition detection, sensitive data exposure checks, and auth bypass attempts.
- **when_to_use:** Dispatched pelo adversarial-review-coordinator ou final-adversarial-orchestrator; varredura zero-context buscando exploits.
- **tools:** não declarado
- **role_one_line:** Scanner de segurança zero-context que assume o pior caso e busca exploits, race conditions, auth bypass.
- **emits_protocol:** Security findings YAML; sem AskUserQuestion (zero-context).
- **paperclip_role_suggestion:** Security Engineer (Independent) / AppSec Specialist

### adversarial-architecture-critic

- **name:** adversarial-architecture-critic
- **category:** executor-type-specific
- **description:** Independent architecture critic that reviews files with ZERO implementation context. Performs coupling analysis, abstraction leak detection, SOLID violation checks, scalability concern assessment.
- **when_to_use:** Dispatched pelo adversarial-review-coordinator ou final-adversarial-orchestrator; crítica estrutural zero-context.
- **tools:** não declarado
- **role_one_line:** Crítico de arquitetura zero-context que olha para coupling, leaks de abstração e violações SOLID.
- **emits_protocol:** Architecture findings YAML; sem AskUserQuestion (zero-context).
- **paperclip_role_suggestion:** Independent Architect Reviewer

### adversarial-quality-reviewer

- **name:** adversarial-quality-reviewer
- **category:** executor-type-specific
- **description:** Independent code-quality reviewer that reviews files with ZERO implementation context. Performs maintainability assessment, clarity analysis, testability check, dead-code detection.
- **when_to_use:** Dispatched pelo final-adversarial-orchestrator (trio); revisa qualidade pela ótica do próximo engenheiro a abrir o arquivo.
- **tools:** não declarado
- **role_one_line:** Reviewer de qualidade zero-context que otimiza para quem vai ler o código daqui a 6 meses.
- **emits_protocol:** Quality findings YAML; sem AskUserQuestion (zero-context).
- **paperclip_role_suggestion:** Senior Code Reviewer (Maintainability Focus)

### spec-format-gate

- **name:** spec-format-gate
- **category:** executor-type-specific
- **description:** Spec format validator. Runs 25 deterministic checks across requirements/design/tasks/spec.json + EARS pattern compliance. READ-ONLY. Decides GO / GO-WARN / NO-GO.
- **when_to_use:** Fase 0 do Spec Lifecycle; primeira parede de qualidade rodando 25 checks determinísticos de formato + EARS.
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Gate de formato de spec que roda 25 checks determinísticos e EARS, emite GO/WARN/NO-GO.
- **emits_protocol:** format-gate-report.yaml; SPEC_FORMAT_GATE_FAIL gate em NO-GO.
- **paperclip_role_suggestion:** Spec Format Auditor / Linter

### spec-content-reviewer

- **name:** spec-content-reviewer
- **category:** executor-type-specific
- **description:** Spec content quality auditor. Two modes: slim (6 critical axes, light variant) and full (12 axes, heavy + audit-only). Evaluates congruence, testability, ambiguities, risks, contracts, data models. READ-ONLY.
- **when_to_use:** Fase 1.5 do Spec Lifecycle; segunda parede de qualidade focada em substância (slim 6-axis ou full 12-axis).
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Auditor de conteúdo de spec que confere congruência, testabilidade e ausência de contradições.
- **emits_protocol:** content-review-report.yaml; SPEC_CONTENT_REVIEW_NOGO gate em NO-GO.
- **paperclip_role_suggestion:** Senior Spec Reviewer / Requirements Auditor

### spec-post-impl-validator

- **name:** spec-post-impl-validator
- **category:** executor-type-specific
- **description:** Spec post-implementation validator. Runs 6 weighted axes (Requirement Coverage 25%, Test Coverage 20%, Design Congruence 15%, Task Completeness 15%, Non-Invention 15%, Contract Compliance 10%). READ-ONLY.
- **when_to_use:** Fase 2 (per-batch sweep) e Fase 3 final do Spec; confere se cada requirement/design/task tem contraparte real no código.
- **tools:** Read, Grep, Glob, Bash (read-only)
- **role_one_line:** Validador pós-impl de spec que confere se cada requirement/design/task tem contraparte real no código (anti-invenção).
- **emits_protocol:** post-impl-validator-report.yaml; SPEC_POST_IMPL_FAIL gate (HARD) em FAIL.
- **paperclip_role_suggestion:** Spec Implementation Auditor / Coverage Verifier

---

## Mapping Pipeline → Paperclip

| Nome agente | Categoria | Paperclip role_suggestion |
|---|---|---|
| pipeline-controller | core | Project Manager / Delivery Lead |
| task-orchestrator | core | Intake Coordinator / Solutions Triage |
| information-gate | core | Business Analyst / Requirements Clarifier |
| sentinel | core | Compliance Officer / Process Auditor |
| sanity-checker | core | QA Engineer / Build Verifier |
| checkpoint-validator | core | Continuous Integration Specialist |
| final-validator | core | Release Manager / Sign-off Authority |
| finishing-branch | core | Release Engineer / DevOps |
| brainstorm-controller | core | Pre-Sales Lead / Discovery Workshop Facilitator |
| adversarial-batch | core | Security Analyst / Penetration Tester (per-batch) |
| brainstorm-step-00-intake | brainstorm | Discovery Note-Taker / Onboarding Specialist |
| brainstorm-step-01-explore | brainstorm | Senior Discovery Analyst / Requirements Detective |
| brainstorm-step-01b-alternatives | brainstorm | Solutions Architect / Options Strategist |
| design-interrogator | quality | Principal Engineer / Design Reviewer |
| plan-architect | quality | Tech Lead / Implementation Architect |
| quality-gate-router | quality | QA Lead / Test Strategist |
| pre-tester | quality | Test Engineer / TDD Specialist |
| architecture-reviewer | quality | Senior Architect (Patterns/Conventions) |
| diff-discipline-reviewer | quality | Scope/PR Reviewer / Change Control Specialist |
| review-orchestrator | quality | Code Review Lead / Quality Coordinator |
| final-adversarial-orchestrator | quality | Independent Audit Lead / Red Team Coordinator |
| executor-controller | executor-controller | Engineering Manager / Sprint Master |
| executor-implementer-task | executor-controller | Mid/Senior Engineer (IC) |
| executor-spec-reviewer | executor-controller | Spec Reviewer / Requirements Validator |
| executor-quality-reviewer | executor-controller | Senior IC / Clean Code Reviewer |
| executor-fix | executor-controller | Remediation Engineer / Bug Squasher |
| spec-closer | executor-controller | Project Closure Officer / Executive Reporter |
| feature-vertical-slice-planner | executor-type-specific | Product Engineer (Planning) / Feature Architect |
| feature-implementer | executor-type-specific | Full-Stack Engineer / Feature Developer |
| feature-integration-validator | executor-type-specific | Integration QA / Acceptance Tester |
| bugfix-diagnostic-agent | executor-type-specific | Production Support Engineer / Diagnostician |
| bugfix-root-cause-analyzer | executor-type-specific | Root Cause Analyst / Forensic Engineer |
| bugfix-regression-tester | executor-type-specific | Regression Test Engineer |
| ux-simulator | executor-type-specific | UX Researcher / Journey Designer |
| ux-accessibility-auditor | executor-type-specific | Accessibility Specialist / A11y Engineer |
| ux-qa-validator | executor-type-specific | UX QA Lead / Priority Triage |
| audit-intake | executor-type-specific | Audit Intake Analyst / Code Inventory |
| audit-domain-analyzer | executor-type-specific | Senior Domain Architect / Auditor |
| audit-compliance-checker | executor-type-specific | Compliance Auditor / Governance Reviewer |
| audit-risk-matrix-generator | executor-type-specific | Risk Officer / Audit Report Author |
| adversarial-review-coordinator | executor-type-specific | Red Team Lead |
| adversarial-security-scanner | executor-type-specific | Security Engineer (Independent) / AppSec Specialist |
| adversarial-architecture-critic | executor-type-specific | Independent Architect Reviewer |
| adversarial-quality-reviewer | executor-type-specific | Senior Code Reviewer (Maintainability Focus) |
| spec-format-gate | executor-type-specific | Spec Format Auditor / Linter |
| spec-content-reviewer | executor-type-specific | Senior Spec Reviewer / Requirements Auditor |
| spec-post-impl-validator | executor-type-specific | Spec Implementation Auditor / Coverage Verifier |

**Total na tabela:** 47 agentes confirmados.
