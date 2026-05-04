# AGENTS.md — Pipeline-Orchestrator Agent Roster

> **SSOT** for the agent roster. Operational dispatch policy lives in `references/team-registry.md` (type-to-team mapping) and `commands/pipeline.md` (phase flow). This file is the entry point for understanding **who exists** and **how they're invoked**.

**Total agents:** 19 agents (auditado 2026-05-03 via `ls agents/**/*.md` no canonical repo). O número antigo "38" estava errado — vinha do D1/D2 sem reality-check, mesmo padrão criticado em `designs/pipeline-orchestrator-v5-consolidated.md` §1.1 e §16 erro #4. Source-of-truth para roster operacional: `references/team-registry.md`.

## Tool declaration policy (CC 2.x convention)

| Layer | Convention | Why |
|---|---|---|
| **N0 controller** | Declare `tools:` with least-privilege | Entry point, restricted scope, security-conscious |
| **N1 orchestrators** | Omit `tools:` (inherit full default) | Need `Agent`/`Task` to dispatch N2; full tool set is harness default |
| **N2 workers** | Omit `tools:` or declare narrow read-only set | Terminal — usually only Read/Grep/Glob; no dispatch |

This convention is empirically validated by 4.1.3 in production. See `designs/slice-0/SPIKE-NESTED-SPAWN.md` v2.0 for full audit.

---

## Roster (full table)

| Tier | Layer | Name | Namespace | Model | Tools | Pipeline Owner |
|------|-------|------|-----------|-------|-------|----------------|
| **N0** | core | pipeline-controller | `pipeline-orchestrator:core:pipeline-controller` | opus | Read, Write, Glob, Grep, Agent, AskUserQuestion | All phases |
| **N1** | core | task-orchestrator | `pipeline-orchestrator:core:task-orchestrator` | sonnet | (default) | Phase 0a (triage) |
| **N1** | core | information-gate | `pipeline-orchestrator:core:information-gate` | sonnet | (default) | Phase 0b (macro-gate) |
| **N1** | quality | design-interrogator | `pipeline-orchestrator:quality:design-interrogator` | sonnet | (default) | Phase 0c (COMPLEXA / `--grill`) |
| **N1** | quality | plan-architect | `pipeline-orchestrator:quality:plan-architect` | sonnet | (default) | Phase 1.5 (planning) |
| **N1** | quality | quality-gate-router | `pipeline-orchestrator:quality:quality-gate-router` | sonnet | (default) | Phase 2b (TDD scenarios) |
| **N1** | quality | pre-tester | `pipeline-orchestrator:quality:pre-tester` | opus | (default) | Phase 2b (RED tests) |
| **N1** | executor | executor-controller | `pipeline-orchestrator:executor:executor-controller` | opus | (default) | Phase 2c (batch execution) |
| **N1** | core | checkpoint-validator | `pipeline-orchestrator:core:checkpoint-validator` | haiku | (default) | Phase 2c (post-batch validation) |
| **N1** | quality | review-orchestrator | `pipeline-orchestrator:quality:review-orchestrator` | opus | (default) | Phase 2e (per-batch review) |
| **N1** | core | adversarial-batch | `pipeline-orchestrator:core:adversarial-batch` | sonnet | (default) | Phase 2e (security checklists) |
| **N1** | quality | architecture-reviewer | `pipeline-orchestrator:quality:architecture-reviewer` | sonnet | (default) | Phase 2e (architecture pass) |
| **N1** | core | sanity-checker | `pipeline-orchestrator:core:sanity-checker` | haiku | (default) | Phase 3a |
| **N1** | quality | final-adversarial-orchestrator | `pipeline-orchestrator:quality:final-adversarial-orchestrator` | opus | (default) | Phase 3b-pre (final review) |
| **N1** | core | final-validator | `pipeline-orchestrator:core:final-validator` | sonnet | (default) | Phase 3b (Pa de Cal) |
| **N1** | core | finishing-branch | `pipeline-orchestrator:core:finishing-branch` | sonnet | (default) | Phase 3c (closeout) |
| **N1** | core | sentinel | `pipeline-orchestrator:core:sentinel` | sonnet | (default) | Cross-cutting (5 checkpoints) |
| **N2** | executor | executor-implementer-task | `pipeline-orchestrator:executor:executor-implementer-task` | opus | (default) | Per-task implementation |
| **N2** | executor | executor-spec-reviewer | `pipeline-orchestrator:executor:executor-spec-reviewer` | sonnet | (default) | Per-task spec review |
| **N2** | executor | executor-quality-reviewer | `pipeline-orchestrator:executor:executor-quality-reviewer` | sonnet | (default) | Per-task quality |
| **N2** | executor | executor-fix | `pipeline-orchestrator:executor:executor-fix` | opus | (default) | Fix loop (max 3) |
| **N2** | type-specific | adversarial-review-coordinator | `pipeline-orchestrator:executor:type-specific:adversarial-review-coordinator` | opus | (default) | Adversarial coordination |
| **N3** | type-specific | adversarial-security-scanner | `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner` | sonnet | (default) | Security scan (zero-context) |
| **N3** | type-specific | adversarial-architecture-critic | `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic` | sonnet | (default) | Architecture critique (zero-context) |
| **N3** | type-specific | adversarial-quality-reviewer | `pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer` | sonnet | (default) | Quality review (zero-context) |
| **N3** | type-specific | bugfix-diagnostic-agent | `pipeline-orchestrator:executor:type-specific:bugfix-diagnostic-agent` | sonnet | (default) | Bug diagnosis |
| **N3** | type-specific | bugfix-root-cause-analyzer | `pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer` | sonnet | (default) | Root cause |
| **N3** | type-specific | bugfix-regression-tester | `pipeline-orchestrator:executor:type-specific:bugfix-regression-tester` | haiku | (default) | Regression check |
| **N3** | type-specific | feature-vertical-slice-planner | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | sonnet | (default) | Slice planning |
| **N3** | type-specific | feature-implementer | `pipeline-orchestrator:executor:type-specific:feature-implementer` | opus | (default) | Feature implementation |
| **N3** | type-specific | feature-integration-validator | `pipeline-orchestrator:executor:type-specific:feature-integration-validator` | sonnet | (default) | Integration check |
| **N3** | type-specific | audit-intake | `pipeline-orchestrator:executor:type-specific:audit-intake` | sonnet | (default) | Audit intake |
| **N3** | type-specific | audit-domain-analyzer | `pipeline-orchestrator:executor:type-specific:audit-domain-analyzer` | opus | (default) | Domain analysis |
| **N3** | type-specific | audit-compliance-checker | `pipeline-orchestrator:executor:type-specific:audit-compliance-checker` | sonnet | (default) | Compliance check |
| **N3** | type-specific | audit-risk-matrix-generator | `pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator` | sonnet | (default) | Risk matrix |
| **N3** | type-specific | ux-simulator | `pipeline-orchestrator:executor:type-specific:ux-simulator` | sonnet | (default) | UX persona simulation |
| **N3** | type-specific | ux-accessibility-auditor | `pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor` | sonnet | (default) | A11y audit |
| **N3** | type-specific | ux-qa-validator | `pipeline-orchestrator:executor:type-specific:ux-qa-validator` | sonnet | (default) | UX QA consolidation |

## Bounded Contexts

| Context | Agents | Description |
|---|---|---|
| **Phase orchestration** | pipeline-controller, task-orchestrator, sentinel | Entry, classification, transition validation |
| **Information gathering** | information-gate, design-interrogator | Pre-execution gap detection and design clarity |
| **Planning** | plan-architect, quality-gate-router, pre-tester | Plan generation, TDD scenarios, RED tests |
| **Execution** | executor-controller, executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer, executor-fix, checkpoint-validator | Per-batch implementation flow |
| **Review (per-batch)** | review-orchestrator, adversarial-batch, architecture-reviewer | Independent context-isolated review |
| **Review (final)** | final-adversarial-orchestrator, adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer | 3-parallel zero-context final review |
| **Closure** | sanity-checker, final-validator, finishing-branch | Pre-PR validation and merge prep |
| **Type-specific: Bug Fix** | bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester | Diagnosis → fix → regression |
| **Type-specific: Feature/User Story** | feature-vertical-slice-planner, feature-implementer, feature-integration-validator | Slice planning → impl → integration |
| **Type-specific: Audit** | audit-intake, audit-domain-analyzer, audit-compliance-checker, audit-risk-matrix-generator | Read-only assessment chain |
| **Type-specific: UX Simulation** | ux-simulator, ux-accessibility-auditor, ux-qa-validator | Persona simulation + a11y + consolidation |
| **Type-specific: Adversarial Audit** | adversarial-review-coordinator, adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer | Zero-context audit (when audit task has security keywords) |

## Cross-Cutting Concerns

| Concern | Agent / Mechanism |
|---|---|
| Phase transition guard | `sentinel` agent + `sentinel-hook.cjs` (PreToolUse:Agent) |
| Adversarial isolation | `dispatch-guard.cjs` blocks adversarial agents from reading implementer artifacts |
| Edit boundary | `edit-guard-hook.cjs` limits writes to `.pipeline/` during pipeline execution |
| Session locking | `session-lock-hook.cjs` enforces single concurrent pipeline run |
| Cleanup | `session-cleanup-hook.cjs` runs on Stop |

## Invocable emergently by

| Agent | Can be spawned by |
|---|---|
| pipeline-controller | The skill `pipeline-orchestrator:pipeline` (entry point) |
| task-orchestrator, information-gate, design-interrogator, plan-architect, quality-gate-router, pre-tester | pipeline-controller only |
| executor-controller | pipeline-controller only |
| review-orchestrator | pipeline-controller only (NOT executor-controller — context isolation) |
| final-adversarial-orchestrator | pipeline-controller only |
| executor-{implementer-task, spec-reviewer, quality-reviewer, fix} | executor-controller |
| checkpoint-validator | executor-controller (post-batch) |
| adversarial-batch, architecture-reviewer | review-orchestrator |
| adversarial-{security-scanner, architecture-critic, quality-reviewer} | final-adversarial-orchestrator OR adversarial-review-coordinator |
| All type-specific (audit-*, bugfix-*, feature-*, ux-*) | executor-controller (resolved via team-registry.md) |
| sanity-checker, final-validator, finishing-branch | pipeline-controller (Phase 3) |
| sentinel | pipeline-controller (5 mandatory checkpoints) |

## Skills inventory (companion to agents)

Plugin v4.3.1 has **2 skills**; v4.4.0 will add 2 more (Slice 1.5):

| Skill | Status | Path | Purpose |
|---|---|---|---|
| `pipeline` | Shipped v4.3.1 | `skills/pipeline/SKILL.md` | Full pipeline classifier; entry for /pipeline-orchestrator:pipeline |
| `bugfix` | Shipped v4.3.0+v4.3.1 | `skills/bugfix/SKILL.md` | Thin entry pre-fixes task_type=Bug Fix |
| `bugfix-light` | 🟢 Shipped v4.4.0 | `skills/bugfix-light/` | 8 prescriptive steps from Pulsar workflow (consolidated §21) |
| `bugfix-heavy` | 🟢 Shipped v4.4.0 | `skills/bugfix-heavy/` | 11 prescriptive steps from Pulsar workflow (consolidated §21) |
| `feature-light` | 🟢 Shipped v4.6.1 | `skills/feature-light/` | 13 step files mirroring Pulsar `Implement_new_feature/Ligth/` 1:1 (consolidated §23) |
| `feature-heavy` | 🟢 Shipped v4.6.1 | `skills/feature-heavy/` | 13 step files mirroring Pulsar `Implement_new_feature/Heavy/` 1:1 (consolidated §23) |

## Versão deste arquivo

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-04-30 | Inicial — pós-sync 4.1.3 (Slice 0.5 A2). 38 agents catalogados. |
| v1.1 | 2026-05-01 | Skills inventory section adicionada (2 shipped + 2 planned for Slice 1.5/v4.4.0). |
| v1.2 | 2026-05-01 | Slice 1.5 skills shipped (`bugfix-light` + `bugfix-heavy` 🟢 Shipped v4.4.0). |
