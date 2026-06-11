---
name: user-story-light
description: Prescriptive 10-step User Story workflow for MEDIA stories (3-5 files, 30-100 lines, 2 domains). Ported 1:1 from the Pulsar User Story Light playbook per the variant-coverage layer-3 gap (AUDIT-014). Use when type is User Story and complexity is MEDIA, or when the controller dispatches a User Story + MEDIA classification. Code-changing (NOT report-only). Steps 1 intake (feature-vertical-slice-planner), 2 reproduction (feature-vertical-slice-planner), 3 root-cause confirmation (bugfix-root-cause-analyzer), 4 domain + SSOT (feature-vertical-slice-planner), 5 controlled action plan (feature-vertical-slice-planner), 6 TDD pre-impl gate (pre-tester — RED phase), 7 minimal-diff execution (feature-implementer), 8 adversarial gate (review-orchestrator), 9 sanity check (sanity-checker), 10 Pa de Cal gate (final-validator — GO/NO-GO). TDD gate at step 6, adversarial at step 8, Pa de Cal at step 10. Manual-only invocation via /pipeline-orchestrator:user-story-light or inline via the controller after a User Story + MEDIA classification.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion]
argument-hint: [user story narrative — persona, want, benefit + acceptance hints]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
sequence_lock: true
gates_at: [6, 8, 10]
sentinel_checkpoints: [pre_6, pre_8, pre_10]
stop_rule_max_failures: 2
---

# User Story Light Workflow (10 prescriptive steps — code-changing)

This skill executes a deterministic 10-step procedure for MEDIA User Stories (3-5 files, 30-100 lines, 2 domains). The procedure is a **faithful 1:1 port** of the Pulsar User Story Light playbook: each step body preserves the original prompt text verbatim, wrapped in the plugin step-frontmatter contract (execution mode, agent type, expected inputs/outputs, gate flags). The skill closes the artifact layer-3 gap for the User Story type (AUDIT-014) — before it, the User Story pipeline had a team-composition reference but no prescriptive step procedure.

This is a **code-changing** workflow (NOT report-only): step 7 implements under minimal-diff rules, gated by the TDD pre-implementation at step 6.

## When to use this skill

Use **user-story-light** when ALL of the following hold:

- Type is **User Story** (a narrative in the form "As a [persona], I want [action], so that [benefit]").
- Complexity is **MEDIA**: roughly 3-5 files, 30-100 lines, up to 2 domains.
- Acceptance criteria are clear or quickly clarifiable.
- The story fits in 5 tasks or fewer.

If the story is larger (6+ tasks, 3+ domains, >100 lines), prefer `user-story-heavy`.

## Steps overview

| # | Step | File | execution_mode | agent_type | Gate? |
|---|------|------|----------------|------------|-------|
| 1 | Diagnóstico Inicial (Intake) | [steps/01-diagnostico-inicial-intake.md](steps/01-diagnostico-inicial-intake.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 2 | Reprodução + Reduzir Ambiguidade | [steps/02-reproducao-reduzir-ambiguidade.md](steps/02-reproducao-reduzir-ambiguidade.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 3 | Causa Raiz + Confirmação | [steps/03-causa-raiz-confirmacao.md](steps/03-causa-raiz-confirmacao.md) | subagent | `pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer` | no |
| 4 | Domínio + SSOT | [steps/04-dominio-ssot.md](steps/04-dominio-ssot.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 5 | Plano de Ação Controlado | [steps/05-plano-acao-controlado.md](steps/05-plano-acao-controlado.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` | no |
| 6 | TDD Pré-Implementação (RED) | [steps/06-test-pre-impl.md](steps/06-test-pre-impl.md) | subagent | `pipeline-orchestrator:quality:pre-tester` | **yes (TDD — tests must FAIL)** |
| 7 | Execução Diff Mínimo | [steps/07-execucao-diff-minimo.md](steps/07-execucao-diff-minimo.md) | subagent | `pipeline-orchestrator:executor:type-specific:feature-implementer` | no |
| 8 | Avaliação Adversarial | [steps/08-avaliacao-adversarial.md](steps/08-avaliacao-adversarial.md) | subagent | `pipeline-orchestrator:quality:review-orchestrator` | **yes (ADVERSARIAL)** |
| 9 | Cheque de Sanidade | [steps/09-cheque-sanidade.md](steps/09-cheque-sanidade.md) | subagent | `pipeline-orchestrator:core:sanity-checker` | no |
| 10 | Pá de Cal (Fechamento) | [steps/10-pa-de-cal-fechamento.md](steps/10-pa-de-cal-fechamento.md) | subagent | `pipeline-orchestrator:core:final-validator` | **yes (GO/NO-GO)** |

The agent mapping is anchored to the User Story Light team table in `references/pipelines/user-story-light.md` (Feature Light team — `feature-vertical-slice-planner` for decomposition/intake/domain/plan, `feature-implementer` for execution; pre-tester + review-orchestrator + sanity-checker + final-validator for the TDD/adversarial/sanity/Pa de Cal phases).

## Execution rules (8 enforcement rules — non-negotiable)

1. **Sequence lock** — steps execute strictly 1→2→3→4→5→6→7→8→9→10. No skip, no reorder. Validated via `sequence:` + `sequence_lock: true` plus `expected_next:` per step.
2. **Execution-mode lock** — each step declares `execution_mode: subagent`. Cannot be swapped at runtime.
3. **Agent-type whitelist** — each subagent step declares the EXACT `agent_type:` allowed. dispatch-guard rejects any other agent.
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 6, 8, 10 declare `gate_required: true`. The skill MUST invoke AskUserQuestion at those points. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures (build, test, validation) halt the pipeline. `stop_rule_max_failures: 2`.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state coherence before steps 6, 8, 10 (`sentinel_checkpoints: [pre_6, pre_8, pre_10]`).

## TDD discipline (MANDATORY before execution)

Step 6 (`pre-tester`) converts acceptance criteria into automated tests that MUST FAIL (RED) before step 7 implements. Step 7 carries a hard GATE: it refuses to run without a step-6 artifact whose acceptance-criteria tests are RED. This is the 1:1 port of the Pulsar `LIGHT_06_TEST_PRE_IMPL` → `LIGHT_07_Execucao` gate.

## How execution flows

This folder closes the **artifact layer-3** for the User Story type. It is invoked manually via `/pipeline-orchestrator:user-story-light "<story>"` OR inline by the pipeline controller after a User Story + MEDIA classification — **it does NOT change routing** (the controller does not auto-dispatch this skill yet; routing stays inline, consistent with `audit-*` per AUDIT-012).

1. The skill is invoked via `/pipeline-orchestrator:user-story-light "<story narrative>"` (or inline after controller classification).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, spawns a Task with the declared `agent_type:`, and passes `expected_inputs` from previous steps.
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 6, 8, 10) raise AskUserQuestion before transitioning.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 10 steps: [tests/tests-user-story-light.md](tests/tests-user-story-light.md)
- Team composition reference: `references/pipelines/user-story-light.md`
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\User_story_translated\Light\` (LIGHT_01..10 + TESTS_USER_STORY_LIGHT)
- Heavy-tier counterpart (when the story demands depth): `skills/user-story-heavy/SKILL.md`

## Gap closures relative to prior plugin

Before this folder, the User Story type had a team-composition reference (`references/pipelines/user-story-light.md`) but no prescriptive step procedure — the artifact layer-3 was absent for this variant (AUDIT-014). This skill prescribes WHAT each step produces, in WHAT FORMAT, under sequence-lock with TDD + adversarial + Pa de Cal gates, with the Pulsar prompt text preserved 1:1.
