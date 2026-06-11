---
name: ux-sim-heavy
description: Prescriptive 7-step UX Simulation workflow for COMPLEXA UX audits (5+ journeys, cross-device, accessibility). REPORT-ONLY by Iron Law — comprehensive E2E user-experience audit; never modifies code. Synthesized from references/pipelines/ux-sim-heavy.md (13-step team table) and the 3 UX agents (ux-simulator, ux-accessibility-auditor, ux-qa-validator) to close the variant-coverage layer-3 gap (AUDIT-014). Steps 1 journey inventory gate (task-orchestrator — REQUIRES JOURNEY SCOPE APPROVAL), 2 environment + state matrix (ux-simulator), 3 per-journey simulation (ux-simulator), 4 cross-journey analysis (ux-qa-validator), 5 accessibility audit (ux-accessibility-auditor), 6 adversarial gate (review-orchestrator — REQUIRES APPROVAL), 7 report assembly gate (final-validator — REQUIRES UX ASSESSMENT). Plan Mode + all 5 sentinel checkpoints apply for COMPLEXA. Manual-only invocation via /pipeline-orchestrator:ux-sim-heavy or inline via the controller after a UX Simulation + COMPLEXA classification.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [UX simulation scope — 5+ journeys, devices, accessibility, personas]
sequence: [1, 2, 3, 4, 5, 6, 7]
sequence_lock: true
gates_at: [1, 6, 7]
sentinel_checkpoints: [pre_1, pre_3, pre_6, pre_7]
stop_rule_max_failures: 2
report_only: true
---

# UX Simulation Heavy Workflow (7 prescriptive steps — REPORT ONLY)

This skill executes a deterministic 7-step procedure for COMPLEXA UX simulations (5+ journeys, cross-device, accessibility). It is a comprehensive E2E user-experience audit. It is **synthesized** from the team table in `references/pipelines/ux-sim-heavy.md` and the contracts of the three UX agents — there is no Pulsar source folder for UX Simulation; the per-journey-walkthrough step follows the style of the Pulsar Bug Fix `HEAVY_09_UX_USER_JOURNEY_SIMULATION` playbook.

Heavy differs from Light in **depth and breadth**: it inventories ALL journeys/personas/devices, builds a state matrix, runs a dedicated accessibility audit (`ux-accessibility-auditor` in parallel with `ux-simulator`), performs cross-journey pattern analysis, and adds an adversarial review gate. Per the COMPLEXA discipline, Plan Mode and all sentinel checkpoints apply.

## Iron Law — REPORT ONLY

**No production file may be modified at any point.** All deliverables are structured reports (Markdown narrative + typed `UX_SIMULATION_REPORT`). `report_only: true` is mirrored in every step's `production_writes_allowed: false` and in each UX agent's IRON LAW section. `edit-guard-hook.cjs` rejects any Edit/Write call.

## When to use this skill

Use **ux-sim-heavy** when ANY of the following hold:

- Type is **UX Simulation** and complexity is **COMPLEXA**: 5+ journeys, cross-device, accessibility requirements.
- Multiple personas with distinct journey paths.
- Systemic / cross-cutting UX issues are suspected (patterns across journeys).
- Accessibility compliance (WCAG 2.1 AA) must be audited.

If the scope is small (2-3 journeys, standard flow), prefer `ux-sim-light`.

## Steps overview

| # | Step | File | execution_mode | agent_type | Output | Gate? |
|---|------|------|----------------|------------|--------|-------|
| 1 | Journey Inventory | [steps/01-journey-inventory.md](steps/01-journey-inventory.md) | subagent | `pipeline-orchestrator:core:task-orchestrator` | `JourneyInventory` | **yes (JOURNEY SCOPE APPROVAL)** |
| 2 | Environment + State Matrix | [steps/02-environment-state-matrix.md](steps/02-environment-state-matrix.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-simulator` | `StateMatrix` | no |
| 3 | Per-Journey Simulation | [steps/03-per-journey-simulation.md](steps/03-per-journey-simulation.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-simulator` | `UX_SIMULATION` | no |
| 4 | Cross-Journey Analysis | [steps/04-cross-journey-analysis.md](steps/04-cross-journey-analysis.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-qa-validator` | `CrossCuttingFindings` | no |
| 5 | Accessibility Audit | [steps/05-accessibility-audit.md](steps/05-accessibility-audit.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor` | `A11Y_REPORT` | no |
| 6 | Adversarial Gate + Review | [steps/06-adversarial-review.md](steps/06-adversarial-review.md) | subagent | `pipeline-orchestrator:quality:review-orchestrator` | `AdversarialFindings` | **yes (APPROVAL)** |
| 7 | Report Assembly (UX Assessment) | [steps/07-report-assembly.md](steps/07-report-assembly.md) | subagent | `pipeline-orchestrator:core:final-validator` | `UX_SIMULATION_REPORT` | **yes (UX ASSESSMENT)** |

The agent mapping follows the UX Sim Heavy team table in `references/pipelines/ux-sim-heavy.md`: `task-orchestrator` frames the journey inventory, `ux-simulator` runs the environment+per-journey simulation, `ux-accessibility-auditor` runs the dedicated WCAG audit (dispatched in parallel with `ux-simulator` per the reference's parallel-dispatch note), `ux-qa-validator` performs cross-journey analysis + consolidation, `review-orchestrator` runs the adversarial review, and `final-validator` issues the UX assessment.

## COMPLEXA discipline (Plan Mode + all checkpoints)

Per the reference, COMPLEXA UX simulations are subject to Plan Mode (plan the simulation execution order) and ALL sentinel checkpoints. This skill declares `sentinel_checkpoints: [pre_1, pre_3, pre_6, pre_7]` — coherence is validated before the scope gate (step 1), before the heavy per-journey simulation (step 3), before the adversarial gate (step 6), and before the final assessment (step 7).

## Execution rules (non-negotiable)

1. **Sequence lock** — steps execute strictly 1→2→3→4→5→6→7. No skip, no reorder.
2. **Execution-mode lock** — each step declares `execution_mode: subagent`.
3. **Agent-type whitelist** — each step declares the EXACT `agent_type:` allowed. Steps 3 and 5 (`ux-simulator` + `ux-accessibility-auditor`) are dispatched IN PARALLEL per the reference's parallel-dispatch note; the bodies document the pattern.
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 1, 6, 7 declare `gate_required: true`. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures halt the pipeline. `stop_rule_max_failures: 2`.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state coherence before steps 1, 3, 6, 7.

## How execution flows

This folder closes the **artifact layer-3** for the UX Simulation type. It is invoked manually via `/pipeline-orchestrator:ux-sim-heavy "<scope>"` OR **dispatched by the pipeline controller** via `Skill(pipeline-orchestrator:ux-sim-heavy)` in Phase 2 after a UX Simulation + COMPLEXA classification (v7.12.0 — the controller dispatch rule covers all skill-backed variants; only DIRETO runs inline). Phases 0 and 3 still wrap it via the controller.

1. The skill is invoked via `/pipeline-orchestrator:ux-sim-heavy "<journey scope>"` (or inline after controller classification).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, spawns a Task with the declared `agent_type:`, and passes `expected_inputs` from previous steps. Steps 3 + 5 may be dispatched in parallel (single message, two Task calls).
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 1, 6, 7) raise AskUserQuestion before transitioning.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 7 steps: [tests/tests-ux-sim-heavy.md](tests/tests-ux-sim-heavy.md)
- Team composition reference: `references/pipelines/ux-sim-heavy.md`
- UX agent contracts: `agents/executor/type-specific/ux-simulator.md`, `ux-accessibility-auditor.md`, `ux-qa-validator.md`
- Style reference for the journey-walkthrough step: `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\heavy\HEAVY_09_UX_USER_JOURNEY_SIMULATION.md`
- Light-tier counterpart (when scope allows): `skills/ux-sim-light/SKILL.md`

## Gap closures relative to prior plugin

Before this folder, the UX Simulation type had a team-composition reference (`references/pipelines/ux-sim-heavy.md`) and three UX agents, but no prescriptive step procedure — the artifact layer-3 was absent for this variant (AUDIT-014). This skill prescribes WHAT each step produces, in WHAT FORMAT, under sequence-lock with journey-scope + adversarial + UX-assessment gates, with the dedicated accessibility audit and cross-journey analysis that distinguish Heavy from Light, report-only by Iron Law.
