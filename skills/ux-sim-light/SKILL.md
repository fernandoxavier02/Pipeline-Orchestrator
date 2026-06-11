---
name: ux-sim-light
description: Prescriptive 5-step UX Simulation workflow for MEDIA UX audits (2-3 user journeys, standard flow). REPORT-ONLY by Iron Law — simulates real user interactions and reports friction; never modifies code. Synthesized from references/pipelines/ux-sim-light.md (9-step team table) and the 3 UX agents (ux-simulator, ux-accessibility-auditor, ux-qa-validator) to close the variant-coverage layer-3 gap (AUDIT-014). Steps 1 journey definition gate (task-orchestrator — REQUIRES JOURNEY APPROVAL), 2 environment setup (ux-simulator), 3 journey simulation (ux-simulator), 4 problem classification (ux-qa-validator), 5 report gate (final-validator — REQUIRES UX ASSESSMENT). Manual-only invocation via /pipeline-orchestrator:ux-sim-light or inline via the controller after a UX Simulation + MEDIA classification.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [UX simulation scope — 2-3 target user journeys]
sequence: [1, 2, 3, 4, 5]
sequence_lock: true
gates_at: [1, 5]
sentinel_checkpoints: [pre_1, pre_5]
stop_rule_max_failures: 2
report_only: true
---

# UX Simulation Light Workflow (5 prescriptive steps — REPORT ONLY)

This skill executes a deterministic 5-step procedure for MEDIA UX simulations (2-3 user journeys, standard flow). It simulates real user interactions, identifies UX problems, and produces a problems-first report. It is **synthesized** from the team table in `references/pipelines/ux-sim-light.md` and the contracts of the three UX agents — there is no Pulsar source folder for UX Simulation; the journey-walkthrough step follows the style of the Pulsar Bug Fix `HEAVY_09_UX_USER_JOURNEY_SIMULATION` playbook.

## Iron Law — REPORT ONLY

**No production file may be modified at any point.** All deliverables are structured reports (Markdown narrative + typed `UX_SIMULATION_REPORT`). `report_only: true` is mirrored in every step's `production_writes_allowed: false` and in each UX agent's IRON LAW section. `edit-guard-hook.cjs` rejects any Edit/Write call.

## When to use this skill

Use **ux-sim-light** when ALL of the following hold:

- Type is **UX Simulation** (simulate user journeys, report friction).
- Complexity is **MEDIA**: 2-3 user journeys, standard flow, no cross-device/accessibility-heavy scope.
- No comprehensive accessibility audit is required (Light folds accessibility checks inline where applicable; `ux-accessibility-auditor` is SKIPPED in Light per the reference).

If the scope is broader (5+ journeys, cross-device, full accessibility), prefer `ux-sim-heavy`.

## Steps overview

| # | Step | File | execution_mode | agent_type | Output | Gate? |
|---|------|------|----------------|------------|--------|-------|
| 1 | Journey Definition | [steps/01-journey-definition.md](steps/01-journey-definition.md) | subagent | `pipeline-orchestrator:core:task-orchestrator` | `JourneyMap` | **yes (JOURNEY APPROVAL)** |
| 2 | Environment Setup | [steps/02-environment-setup.md](steps/02-environment-setup.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-simulator` | `SimulationPlan` | no |
| 3 | Journey Simulation | [steps/03-journey-simulation.md](steps/03-journey-simulation.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-simulator` | `UX_SIMULATION` | no |
| 4 | Problem Classification | [steps/04-problem-classification.md](steps/04-problem-classification.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-qa-validator` | `UX_QA_REPORT` | no |
| 5 | Report (UX Assessment) | [steps/05-report.md](steps/05-report.md) | subagent | `pipeline-orchestrator:core:final-validator` | `UX_SIMULATION_REPORT` | **yes (UX ASSESSMENT)** |

The agent mapping follows the UX Sim Light team table in `references/pipelines/ux-sim-light.md`: `task-orchestrator` frames the journey scope, `ux-simulator` runs the environment+journey simulation, `ux-qa-validator` prioritizes problems, `final-validator` issues the UX assessment. `ux-accessibility-auditor` is SKIPPED in Light (inline a11y checks only). The final-adversarial-orchestrator is SKIPPED — this is a report-only pipeline with zero code-review surface.

## Execution rules (non-negotiable)

1. **Sequence lock** — steps execute strictly 1→2→3→4→5. No skip, no reorder.
2. **Execution-mode lock** — each step declares `execution_mode: subagent`.
3. **Agent-type whitelist** — each step declares the EXACT `agent_type:` allowed.
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 1, 5 declare `gate_required: true`. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures halt the pipeline. `stop_rule_max_failures: 2`.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state coherence before steps 1, 5 (`sentinel_checkpoints: [pre_1, pre_5]`).

## How execution flows

This folder closes the **artifact layer-3** for the UX Simulation type. It is invoked manually via `/pipeline-orchestrator:ux-sim-light "<scope>"` OR inline by the pipeline controller after a UX Simulation + MEDIA classification — **it does NOT change routing** (the controller does not auto-dispatch this skill yet; routing stays inline, consistent with `audit-*` per AUDIT-012).

1. The skill is invoked via `/pipeline-orchestrator:ux-sim-light "<journey scope>"` (or inline after controller classification).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, spawns a Task with the declared `agent_type:`, and passes `expected_inputs` from previous steps.
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 1, 5) raise AskUserQuestion before transitioning.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 5 steps: [tests/tests-ux-sim-light.md](tests/tests-ux-sim-light.md)
- Team composition reference: `references/pipelines/ux-sim-light.md`
- UX agent contracts: `agents/executor/type-specific/ux-simulator.md`, `ux-qa-validator.md` (and `ux-accessibility-auditor.md` for Heavy)
- Style reference for the journey-walkthrough step: `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\heavy\HEAVY_09_UX_USER_JOURNEY_SIMULATION.md`
- Heavy-tier counterpart (when scope demands depth): `skills/ux-sim-heavy/SKILL.md`

## Gap closures relative to prior plugin

Before this folder, the UX Simulation type had a team-composition reference (`references/pipelines/ux-sim-light.md`) and three UX agents, but no prescriptive step procedure — the artifact layer-3 was absent for this variant (AUDIT-014). This skill prescribes WHAT each step produces, in WHAT FORMAT, under sequence-lock with journey-approval + UX-assessment gates, report-only by Iron Law.
