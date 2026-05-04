---
name: feature-heavy
description: |
  Prescriptive 13-step workflow for implementing a new feature in HEAVY mode (relevant impact:
  domain, data, integrations, multiple flows, contracts, jobs, mobile; or maximum predictability
  desired before implementation). Imported from Pulsar Implement_new_feature/Heavy/ — every
  step file mirrors the canonical Pulsar prompt 1:1 while declaring an execution contract
  (execution_mode, agent_type, expected_*, gate_required) via frontmatter. Sequence is locked
  (1→13, no skip, no reorder). 4 mandatory AskUserQuestion gates at steps 3
  (acceptance-matrix-approval), 7 (architecture-choice), 9 (plan-approval),
  10 (tdd-tests-approval). 5 reused executor agents: feature-vertical-slice-planner (3 spawns
  at 3, 7, 9), pre-tester (10), feature-implementer (11), feature-integration-validator (12).
  Manual-only invocation via /pipeline-orchestrator:feature-heavy or via
  /pipeline-orchestrator:feature --heavy.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[feature description with user story + DoD]"
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
sequence_lock: true
gates_at: [3, 7, 9, 10]
sentinel_checkpoints: [pre_3, pre_10, pre_13]
stop_rule_max_failures: 2
---

# Feature Pipeline Skill (Heavy) — 13 prescriptive steps

13 passos canônicos espelhando 1:1 a fonte Pulsar `D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\Heavy\`. Each step file's prompt body is verbatim from Pulsar; the frontmatter adds the execution contract (sequence, ownership, gates) consumed by the orchestrator.

## Quando usar

Use **feature-heavy** quando a feature/melhoria tem impacto relevante (domínio, dados, integrações, múltiplos fluxos, contratos, jobs, mobile), ou quando você quer máxima previsibilidade antes de implementar. Cada passo declara EVIDÊNCIA (do repo) vs ASSUNÇÃO (inferida); se faltar informação crítica, o passo declara exatamente como confirmar antes de avançar.

## Sequência canônica

1. Intent + Value + Scope (`steps/01-intent-scope.md`)
2. Terrain Recon (`steps/02-terrain-recon.md`)
3. **[GATE]** User Flow + UX (`steps/03-user-flow-ux.md`)
4. Domain Rules (`steps/04-domain-rules.md`)
5. Source of Truth (`steps/05-source-of-truth.md`)
6. Data Model + Persistence (`steps/06-data-model-persistence.md`)
7. **[GATE]** Architecture Design Options (`steps/07-arch-design-options.md`)
8. Risk Controls (`steps/08-risk-controls.md`)
9. **[GATE]** Implementation Plan (`steps/09-implementation-plan.md`)
10. **[GATE]** TDD Pre-Impl (RED) (`steps/10-test-pre-impl.md`)
11. Execution Minimal Diff (GREEN) (`steps/11-execution-minimal-diff.md`)
12. Testing Validation (`steps/12-testing-validation.md`)
13. Release + Observability (`steps/13-release-observability.md`)

## Ownership por step

| Step | execution_mode | agent_type |
|---|---|---|
| 01, 02, 04, 05, 06, 08, 13 | inline | — (orchestrator inline) |
| 03, 07, 09 | subagent | `pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner` (re-spawned 3x) |
| 10 | subagent | `pipeline-orchestrator:quality:pre-tester` |
| 11 | subagent | `pipeline-orchestrator:executor:type-specific:feature-implementer` |
| 12 | subagent | `pipeline-orchestrator:executor:type-specific:feature-integration-validator` |

## Gates (4 mandatory AskUserQuestion checkpoints)

| Step | gate_name | What the user approves |
|---|---|---|
| 3 | `acceptance-matrix-approval` | User flow + full acceptance matrix before deeper design |
| 7 | `architecture-choice` | Chosen architecture option among the trade-offs presented |
| 9 | `plan-approval` | Implementation plan (increments + ordering) before TDD |
| 10 | `tdd-tests-approval` | Test files (RED state confirmed) before code execution |

`AskUserQuestion` is non-negotiable at these gates — prose substitution is forbidden by the global rule "Decisoes do Usuario — AskUserQuestion sempre".

## Sentinel checkpoints

`sentinel-hook` validates state coherence before steps 3, 10, and 13 (`sentinel_checkpoints: [pre_3, pre_10, pre_13]`):
- `pre_3` — verify intake outputs (steps 01–02) are present before user-flow gate.
- `pre_10` — verify implementation plan + acceptance matrix are present before TDD.
- `pre_13` — verify code diff + test results are present before release readiness.

## Execution rules

The 8 enforcement rules inherited from Slice 1.5 (§21.3) apply:
1. Sequence lock (1→13, no skip).
2. Execution-mode lock per step.
3. Agent-type whitelist when `execution_mode: subagent`.
4. Output schema verified before next step proceeds.
5. AskUserQuestion mandatory at the 4 gates.
6. STOP RULE: 2 consecutive failures halt the pipeline (`stop_rule_max_failures: 2`).
7. Audit log append-only to `.pipeline/gate-decisions.jsonl`.
8. Sentinel checkpoints (`pre_3`, `pre_10`, `pre_13`).

**Note:** hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) are ADVISORY for SKILL.md frontmatter (see `designs/pipeline-orchestrator-v5-consolidated.md` §17.4 #8). Enforcement happens via the controller respecting the declared contract.

## Reference docs

- Tests: `tests/tests-feature-heavy.md`
- User-story translation guidelines (Pulsar source): `references/feature-user-story-guidelines.md`
- Team composition: `references/pipelines/feature-heavy.md` (when present)
- Light counterpart: `skills/feature-light/SKILL.md`
- Thin shortcut: `skills/feature/SKILL.md` (with `--heavy` flag)
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §23 (Slice 3b — feature import)
