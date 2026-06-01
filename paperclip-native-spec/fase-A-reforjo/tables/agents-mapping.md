# Agents Mapping — Claude Code ↔ Paperclip Fase A

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Fonte canônica:** `references/paperclip/paperclip-catalog.md` (47 agentes CC mapeados)
**Total CC:** 47 agentes | **Total Paperclip:** 48 cargos (47 agentes CC + 1 Board)

> Esta tabela mapeia cada agente do Claude Code para o cargo equivalente no Paperclip,
> com os decision points aplicáveis (para configurar o INVARIANTS block de cada cargo)
> e a prioridade de rollout na Onda A3.

---

## CATEGORIA: core (10 agentes → 10 cargos)

| Agente CC | Cargo Paperclip | Slug | Rollout Batch | DPs aplicáveis |
|---|---|---|---|---|
| pipeline-controller | Project Manager / Delivery Lead | pipeline-controller | Batch 5 (crítico) | DP-08 a DP-17, DP-42 a DP-53 |
| task-orchestrator | Intake Coordinator / Solutions Triage | task-orchestrator | Batch 5 (crítico) | DP-01 a DP-09 |
| information-gate | Business Analyst / Requirements Clarifier | information-gate | PILOTO (Onda A2) | DP-01 a DP-09, DP-06 específico |
| sentinel | Compliance Officer / Process Auditor | sentinel | Batch 5 (crítico) | DP-53 a DP-62 (meta-guards) |
| sanity-checker | QA Engineer / Build Verifier | sanity-checker | Batch 5 (crítico) | DP-21, DP-22, DP-44, DP-45 |
| checkpoint-validator | Continuous Integration Specialist | checkpoint-validator | Batch 5 (crítico) | DP-21, DP-22, DP-23 |
| final-validator | Release Manager / Sign-off Authority | final-validator | Batch 5 (crítico) | DP-42 a DP-51 |
| finishing-branch | Release Engineer / DevOps | finishing-branch | Batch 5 (crítico) | DP-46 a DP-51 |
| brainstorm-controller | Pre-Sales Lead / Discovery Workshop Facilitator | brainstorm-controller | Batch 5 (crítico) | DP-08 a DP-17 |
| adversarial-batch | Security Analyst / Penetration Tester (per-batch) | adversarial-batch | Batch 3 (qualidade) | DP-32 a DP-41 |

---

## CATEGORIA: brainstorm (3 agentes → 3 cargos)

| Agente CC | Cargo Paperclip | Slug | Rollout Batch | DPs aplicáveis |
|---|---|---|---|---|
| brainstorm-step-00-intake | Discovery Note-Taker / Onboarding Specialist | brainstorm-step-00-intake | Batch 2 (brainstorm) | DP-01 a DP-03 |
| brainstorm-step-01-explore | Senior Discovery Analyst / Requirements Detective | brainstorm-step-01-explore | Batch 2 (brainstorm) | DP-01 a DP-09 |
| brainstorm-step-01b-alternatives | Solutions Architect / Options Strategist | brainstorm-step-01b-alternatives | Batch 2 (brainstorm) | DP-13, DP-15, DP-16 |

---

## CATEGORIA: quality (8 agentes → 8 cargos)

| Agente CC | Cargo Paperclip | Slug | Rollout Batch | DPs aplicáveis |
|---|---|---|---|---|
| design-interrogator | Principal Engineer / Design Reviewer | design-interrogator | Batch 3 (qualidade) | DP-10 a DP-17 |
| plan-architect | Tech Lead / Implementation Architect | plan-architect | Batch 3 (qualidade) | DP-10 a DP-17 |
| quality-gate-router | QA Lead / Test Strategist | quality-gate-router | Batch 3 (qualidade) | DP-18, DP-29 |
| pre-tester | Test Engineer / TDD Specialist | pre-tester | Batch 3 (qualidade) | DP-18, DP-22, DP-29 |
| architecture-reviewer | Senior Architect (Patterns/Conventions) | architecture-reviewer | Batch 3 (qualidade) | DP-32 a DP-41 |
| diff-discipline-reviewer | Scope/PR Reviewer / Change Control Specialist | diff-discipline-reviewer | Batch 3 (qualidade) | DP-19, DP-20, DP-26 a DP-30 |
| review-orchestrator | Code Review Lead / Quality Coordinator | review-orchestrator | Batch 3 (qualidade) | DP-32 a DP-41 |
| final-adversarial-orchestrator | Independent Audit Lead / Red Team Coordinator | final-adversarial-orchestrator | Batch 3 (qualidade) | DP-32 a DP-41 |

---

## CATEGORIA: executor-controller (6 agentes → 6 cargos)

| Agente CC | Cargo Paperclip | Slug | Rollout Batch | DPs aplicáveis |
|---|---|---|---|---|
| executor-controller | Engineering Manager / Sprint Master | executor-controller | Batch 4 (execução) | DP-18 a DP-31, DP-52, DP-53 |
| executor-implementer-task | Mid/Senior Engineer (IC) | executor-implementer-task | Batch 4 (execução) | DP-18 a DP-31 |
| executor-spec-reviewer | Spec Reviewer / Requirements Validator | executor-spec-reviewer | Batch 4 (execução) | DP-32 a DP-41 |
| executor-quality-reviewer | Senior IC / Clean Code Reviewer | executor-quality-reviewer | Batch 4 (execução) | DP-32 a DP-41 |
| executor-fix | Remediation Engineer / Bug Squasher | executor-fix | Batch 4 (execução) | DP-32 a DP-37 |
| spec-closer | Project Closure Officer / Executive Reporter | spec-closer | Batch 5 (crítico) | DP-42 a DP-51 |

---

## CATEGORIA: executor-type-specific (20 agentes → 20 cargos)

| Agente CC | Cargo Paperclip | Slug | Rollout Batch | DPs aplicáveis |
|---|---|---|---|---|
| feature-vertical-slice-planner | Product Engineer (Planning) / Feature Architect | feature-vertical-slice-planner | Batch 4 (execução) | DP-10 a DP-17 |
| feature-implementer | Full-Stack Engineer / Feature Developer | feature-implementer | Batch 4 (execução) | DP-18 a DP-31 |
| feature-integration-validator | Integration QA / Acceptance Tester | feature-integration-validator | Batch 4 (execução) | DP-42 a DP-45 |
| bugfix-diagnostic-agent | Production Support Engineer / Diagnostician | bugfix-diagnostic-agent | Batch 4 (execução) | DP-24, DP-25 |
| bugfix-root-cause-analyzer | Root Cause Analyst / Forensic Engineer | bugfix-root-cause-analyzer | Batch 4 (execução) | DP-24 |
| bugfix-regression-tester | Regression Test Engineer | bugfix-regression-tester | Batch 4 (execução) | DP-22, DP-29 |
| ux-simulator | UX Researcher / Journey Designer | ux-simulator | Batch 6 (UX) | DP-01 a DP-03 |
| ux-accessibility-auditor | Accessibility Specialist / A11y Engineer | ux-accessibility-auditor | Batch 6 (UX) | DP-01 a DP-03 |
| ux-qa-validator | UX QA Lead / Priority Triage | ux-qa-validator | Batch 6 (UX) | DP-42 a DP-45 |
| audit-intake | Audit Intake Analyst / Code Inventory | audit-intake | Batch 1 (auditoria) | DP-01 a DP-03 |
| audit-domain-analyzer | Senior Domain Architect / Auditor | audit-domain-analyzer | Batch 1 (auditoria) | DP-05, DP-15, DP-16 |
| audit-compliance-checker | Compliance Auditor / Governance Reviewer | audit-compliance-checker | Batch 1 (auditoria) | DP-32 a DP-41 |
| audit-risk-matrix-generator | Risk Officer / Audit Report Author | audit-risk-matrix-generator | Batch 1 (auditoria) | DP-42 a DP-45 |
| adversarial-review-coordinator | Red Team Lead | adversarial-review-coordinator | Batch 7 (específicos) | DP-32 a DP-41 |
| adversarial-security-scanner | Security Engineer (Independent) / AppSec Specialist | adversarial-security-scanner | Batch 1 (auditoria) | DP-32 a DP-41 |
| adversarial-architecture-critic | Independent Architect Reviewer | adversarial-architecture-critic | Batch 1 (auditoria) | DP-32 a DP-41 |
| adversarial-quality-reviewer | Senior Code Reviewer (Maintainability Focus) | adversarial-quality-reviewer | Batch 1 (auditoria) | DP-32 a DP-41 |
| spec-format-gate | Spec Format Auditor / Linter | spec-format-gate | Batch 7 (específicos) | DP-04, DP-13 |
| spec-content-reviewer | Senior Spec Reviewer / Requirements Auditor | spec-content-reviewer | Batch 7 (específicos) | DP-04, DP-13 |
| spec-post-impl-validator | Spec Implementation Auditor / Coverage Verifier | spec-post-impl-validator | Batch 7 (específicos) | DP-44, DP-45 |

---

## Cargo extra: Board (sem equivalente no CC)

| Cargo Paperclip | Função | Slug | Rollout Batch | Notas |
|---|---|---|---|---|
| Board | Tomador de decisões humano | board | N/A (humano) | Recebe todas as approval issues. Equivale ao usuário que responde AskUserQuestion no CC. Não tem AGENTS.md — é o Fernando (ou o usuário humano do Paperclip). |

---

## Resumo por Batch de Rollout (Onda A3)

| Batch | Categoria | Cargos | Quantidade |
|---|---|---|---|
| PILOTO (Onda A2) | core | information-gate | 1 |
| Batch 1 | auditoria e adversarial | audit-intake, audit-domain-analyzer, audit-compliance-checker, audit-risk-matrix-generator, adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer | 7 |
| Batch 2 | brainstorm | brainstorm-step-00-intake, brainstorm-step-01-explore, brainstorm-step-01b-alternatives | 3 |
| Batch 3 | qualidade | design-interrogator, plan-architect, quality-gate-router, pre-tester, architecture-reviewer, diff-discipline-reviewer, review-orchestrator, final-adversarial-orchestrator, adversarial-batch | 9 |
| Batch 4 | execução | executor-controller, executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer, executor-fix, feature-vertical-slice-planner, feature-implementer, feature-integration-validator, bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester | 11 |
| Batch 5 | controle (críticos) | pipeline-controller, task-orchestrator, sentinel, sanity-checker, checkpoint-validator, final-validator, finishing-branch, brainstorm-controller, spec-closer | 9 |
| Batch 6 | UX | ux-simulator, ux-accessibility-auditor, ux-qa-validator | 3 |
| Batch 7 | tipo-específicos | adversarial-review-coordinator, spec-format-gate, spec-content-reviewer, spec-post-impl-validator | 4 |
| **TOTAL** | | | **47 + 1 Board = 48** |

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — mapeamento 47 agentes CC → 48 cargos Paperclip com DPs e rollout batch |
