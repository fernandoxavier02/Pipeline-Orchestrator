---
name: user-story-heavy
description: Prescriptive 10-step User Story workflow for COMPLEXA stories (6+ files, >100 lines, 3+ domains). Ported 1:1 from the Pulsar User Story Heavy playbook per the variant-coverage layer-3 gap (AUDIT-014). Use when type is User Story and complexity is COMPLEXA, or when user-story-light auto-escalates (story too large, 3+ domains, SSOT conflict). Code-changing (NOT report-only). Steps 1 intake+spec NLP (feature-vertical-slice-planner), 2 repro+observability (feature-vertical-slice-planner), 3 cause-root matrix (bugfix-root-cause-analyzer), 4 domain+SSOT+contract (feature-vertical-slice-planner), 5 action plan+governance (feature-vertical-slice-planner), 6 TDD pre-impl gate (pre-tester — RED phase), 7 minimal-diff execution + atomic commits (feature-implementer), 8 adversarial+audit gate (review-orchestrator), 9 full sanity check (sanity-checker), 10 Pa de Cal + release notes gate (final-validator — GO/NO-GO). TDD gate at step 6, adversarial at step 8, Pa de Cal at step 10. Manual-only invocation via /pipeline-orchestrator:user-story-heavy or inline via the controller after a User Story + COMPLEXA classification.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion]
argument-hint: [user story narrative — persona, want, benefit, edge cases, domain rules]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
sequence_lock: true
gates_at: [6, 8, 10]
sentinel_checkpoints: [pre_6, pre_8, pre_10]
stop_rule_max_failures: 2
---

# User Story Heavy Workflow (10 prescriptive steps — code-changing)

This skill executes a deterministic 10-step procedure for COMPLEXA User Stories (6+ files, >100 lines, 3+ domains). The procedure is a **faithful 1:1 port** of the Pulsar User Story Heavy playbook: each step body preserves the original prompt text verbatim, wrapped in the plugin step-frontmatter contract. The skill closes the artifact layer-3 gap for the User Story type (AUDIT-014).

This is a **code-changing** workflow (NOT report-only): step 7 implements with atomic commits under minimal-diff rules, gated by the TDD pre-implementation at step 6.

Heavy differs from Light in **depth**, not in **shape** — both run 10 steps. Heavy adds spec-formal NLP intake, minimal observability planning, a per-layer cause-root matrix, contract auditing, governance planning, full regression sanity, and release notes.

## When to use this skill

Use **user-story-heavy** when ANY of the following hold:

- Type is **User Story** and complexity is **COMPLEXA**: roughly 6+ files, >100 lines, 3+ domains.
- The story crosses multiple bounded contexts or touches SSOT / contracts / migrations.
- Acceptance criteria require edge-case enumeration and a scenario matrix.
- `user-story-light` auto-escalated (story too large, SSOT conflict, 3+ domains).

If the story is small (3-5 files, 2 domains), prefer `user-story-light`.

## Steps overview

| # | Step | File | execution_mode | agent_type | Gate? |
|---|------|------|----------------|------------|-------|
| 1 | Intake + Spec NLP | [steps/01-intake-spec-nlp.md](steps/01-intake-spec-nlp.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 2 | Repro + Observabilidade | [steps/02-repro-observabilidade.md](steps/02-repro-observabilidade.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 3 | Matriz Causa Raiz | [steps/03-matriz-causa-raiz.md](steps/03-matriz-causa-raiz.md) | subagent | `pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer` | no |
| 4 | Domínio + SSOT + Contrato | [steps/04-dominio-ssot-contrato.md](steps/04-dominio-ssot-contrato.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 5 | Plano de Ação + Governança | [steps/05-plano-acao-governanca.md](steps/05-plano-acao-governanca.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 6 | TDD Pré-Implementação (RED) | [steps/06-test-pre-impl.md](steps/06-test-pre-impl.md) | subagent | `pipeline-orchestrator:quality:pre-tester` | **yes (TDD — tests must FAIL)** |
| 7 | Execução Diff Mínimo + Commits | [steps/07-execucao-diff-minimo-commits.md](steps/07-execucao-diff-minimo-commits.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-implementer` | no |
| 8 | Revisão Adversarial + Auditoria | [steps/08-revisao-adversarial-auditoria.md](steps/08-revisao-adversarial-auditoria.md) | subagent | `pipeline-orchestrator:quality:review-orchestrator` | **yes (ADVERSARIAL)** |
| 9 | Cheque de Sanidade Completo | [steps/09-cheque-sanidade-completo.md](steps/09-cheque-sanidade-completo.md) | subagent | `pipeline-orchestrator:core:sanity-checker` | no |
| 10 | Pá de Cal + Release Notes | [steps/10-pa-de-cal-release-notes.md](steps/10-pa-de-cal-release-notes.md) | subagent | `pipeline-orchestrator:core:final-validator` | **yes (GO/NO-GO)** |

The agent mapping is anchored to the User Story Heavy team table in `references/pipelines/user-story-heavy.md` (Feature Heavy team — `feature-vertical-slice-planner` for intake/decomposition/domain/plan, `feature-implementer` for execution, with `feature-integration-validator` folded into the sanity + Pa de Cal phases; pre-tester + review-orchestrator + sanity-checker + final-validator for the TDD/adversarial/sanity/Pa de Cal phases).

## Execution rules (8 enforcement rules — non-negotiable)

1. **Sequence lock** — steps execute strictly 1→2→3→4→5→6→7→8→9→10. No skip, no reorder.
2. **Execution-mode lock** — each step declares `execution_mode: subagent`. Cannot be swapped at runtime.
3. **Agent-type whitelist** — each subagent step declares the EXACT `agent_type:` allowed. dispatch-guard rejects any other agent.
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 6, 8, 10 declare `gate_required: true`. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures halt the pipeline. `stop_rule_max_failures: 2`.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state coherence before steps 6, 8, 10 (`sentinel_checkpoints: [pre_6, pre_8, pre_10]`).

## TDD discipline (MANDATORY before execution)

Step 6 (`pre-tester`) converts acceptance criteria + journey + regression contracts into automated tests that MUST FAIL (RED) before step 7 implements. Step 7 carries a hard GATE: it refuses to run without a step-6 artifact whose acceptance-criteria tests are RED. This is the 1:1 port of the Pulsar `HEAVY_06_TEST_PRE_IMPL` → `HEAVY_07_Execucao` gate.

## How execution flows

This folder closes the **artifact layer-3** for the User Story type. It is invoked manually via `/pipeline-orchestrator:user-story-heavy "<story>"` OR inline by the pipeline controller after a User Story + COMPLEXA classification — **it does NOT change routing** (the controller does not auto-dispatch this skill yet; routing stays inline, consistent with `audit-*` per AUDIT-012).

1. The skill is invoked via `/pipeline-orchestrator:user-story-heavy "<story narrative>"` (or inline after controller classification, or via auto-escalation from `user-story-light`).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, spawns a Task with the declared `agent_type:`, and passes `expected_inputs` from previous steps.
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 6, 8, 10) raise AskUserQuestion before transitioning.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 10 steps: [tests/tests-user-story-heavy.md](tests/tests-user-story-heavy.md)
- Team composition reference: `references/pipelines/user-story-heavy.md`
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\User_story_translated\Heavy\` (HEAVY_01..10 + TESTS_USER_STORY_HEAVY + INTAKE_NLP_01_Audio_Mismatch.json example)
- Light-tier counterpart (when complexity allows): `skills/user-story-light/SKILL.md`

## Gap closures relative to prior plugin

Before this folder, the User Story type had a team-composition reference (`references/pipelines/user-story-heavy.md`) but no prescriptive step procedure — the artifact layer-3 was absent for this variant (AUDIT-014). This skill prescribes WHAT each step produces, in WHAT FORMAT, under sequence-lock with TDD + adversarial + Pa de Cal gates, with the Pulsar prompt text preserved 1:1.
