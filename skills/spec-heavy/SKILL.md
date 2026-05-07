---
name: spec-heavy
description: |
  Prescriptive 9-step workflow for the Spec Lifecycle in Heavy mode (relevant impact: domain,
  data, integrations, multiple flows, contracts, jobs, mobile; or maximum predictability
  desired before implementation). Adds full content review (12 axes) and parallel adversarial
  audits (architecture-critic + security-scanner) on top of the Light pipeline. Sequence is
  locked (1→9, no skip, no reorder). 5 mandatory AskUserQuestion gates at steps 1
  (format-gate-approval), 2 (content-review-approval), 3 (tdd-scenarios-approval),
  4 (adversarial-loop-checkpoint), 5 (post-impl-validation). 6 reused agents:
  spec-format-gate (1), spec-content-reviewer (2), spec-post-impl-validator (5),
  adversarial-architecture-critic (6), adversarial-security-scanner (7), spec-closer (9);
  steps 3, 4 and 8 inline. stop_rule_max_failures: 3 (longer workflow warrants more
  tolerance). Manual-only invocation via /pipeline-orchestrator:spec-heavy.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[spec feature name or path to pipeline-runs/<run_id>/01-spec/]"
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9]
sequence_lock: true
gates_at: [1, 2, 3, 4, 5]
sentinel_checkpoints: [pre_1, pre_3, pre_5, pre_9]
stop_rule_max_failures: 3
---

# Spec Lifecycle Skill (Heavy) — 9 prescriptive steps

9 prescriptive steps for the Spec Lifecycle in Heavy mode. Each step file declares its execution contract (sequence, ownership, gates) via frontmatter consumed by the orchestrator. Project-neutral wording — designed to work in any codebase that follows the spec layout under `pipeline-runs/<run_id>/01-spec/`.

## Quando usar

Use **spec-heavy** quando a spec descreve uma feature/melhoria com impacto relevante (dominio rico, dados sensiveis, contratos expostos, integracoes externas, multiplos fluxos, jobs, mobile), ou quando voce quer maxima previsibilidade antes de implementar. A diferenca para `spec-light`: este pipeline NAO confia automaticamente no conteudo da spec — ele audita conteudo (step 02, 12 eixos), arquitetura (step 06, SOLID/DRY/YAGNI/SSOT) e seguranca (step 07, 8 eixos red-team) alem dos passos comuns ao Light.

Se a spec for de risco pequeno-a-medio e voce confia no conteudo, prefira `spec-light` (mais rapido, sem content-review e sem adversarial paralelo).

## Sequencia canonica

1. **[GATE]** Format Gate (`steps/01-format-gate.md`)
2. **[GATE]** Content Review (12 eixos) (`steps/02-content-review.md`)
3. **[GATE]** TDD Scenarios (ATDD seed) (`steps/03-tdd-scenarios.md`)
4. **[GATE]** Implementation (TDD + Vertical Slices + adversarial loop) (`steps/04-implementation.md`)
5. **[GATE]** Post-Impl Validation (6-axis congruence) (`steps/05-post-impl-validation.md`)
6. Architecture Audit (SOLID/DRY/YAGNI/SSOT/code-smells) (`steps/06-architecture-audit.md`)
7. Security Review (8 eixos red-team) (`steps/07-security-review.md`)
8. Confidence Dashboard (`steps/08-confidence-dashboard.md`)
9. Closure (`steps/09-closure.md`)

## Ownership por step

| Step | execution_mode | agent_type |
|---|---|---|
| 01 | subagent | `pipeline-orchestrator:executor:type-specific:spec-format-gate` |
| 02 | subagent | `pipeline-orchestrator:executor:type-specific:spec-content-reviewer` |
| 03 | inline | — (orchestrator inline, ATDD seed) |
| 04 | inline | — (orchestrator inline, drives executor batches) |
| 05 | subagent | `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator` |
| 06 | subagent | `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic` |
| 07 | subagent | `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner` |
| 08 | inline | — (orchestrator inline, scoring math) |
| 09 | subagent | `pipeline-orchestrator:executor:spec-closer` |

## Gates (5 mandatory AskUserQuestion checkpoints)

| Step | gate_name | What the user approves |
|---|---|---|
| 1 | `format-gate-approval` | Format Gate decision (GO / GO-WARN / NO-GO / BLOCK) before content review |
| 2 | `content-review-approval` | Content review verdict (12 eixos) and mandatory corrections list |
| 3 | `tdd-scenarios-approval` | ATDD scenario set + AC traceability matrix before implementation |
| 4 | `adversarial-loop-checkpoint` | Adversarial loop verdict (continue / escalate / accept-warnings / abort) — escalation prompt every 3 attempts |
| 5 | `post-impl-validation` | Post-impl decision (PASS / PASS_WITH_WARNINGS / FAIL) and remediation plan |

`AskUserQuestion` is non-negotiable at these gates — prose substitution is forbidden by the global rule "Decisoes do Usuario — AskUserQuestion sempre".

## Steps 05, 06 e 07 — auditorias independentes em sequencia

Steps 05 (post-impl-validation), 06 (architecture-audit) e 07 (security-review) sao auditorias independentes do mesmo codigo imutavel entregue no step 04 — nao se modificam mutuamente. A cadeia `expected_next` e sequencial (05 → 06 → 07 → 08) e o orchestrator dispatcha nesta ordem; o sentinel-hook valida a sequencia. Resultados consolidam no step 08 (confidence dashboard).

## Sentinel checkpoints

`sentinel-hook` validates state coherence before steps 1, 3, 5 e 9 (`sentinel_checkpoints: [pre_1, pre_3, pre_5, pre_9]`):
- `pre_1` — verify spec path exists and the 5 spec artifacts (spec.json + requirements.md + design.md + tasks.md + research.md if applicable) are reachable before format validation begins.
- `pre_3` — verify Format Gate decision (GO/GO-WARN) and Content Review approval are present before ATDD seed.
- `pre_5` — verify implementation tasks completed and adversarial loop closed before post-impl audit.
- `pre_9` — verify post-impl decision, architecture audit and security review are present before formal closure.

## spec-context.yaml schema

The orchestrator pipes a single artifact `spec-context.yaml` into every step. The canonical schema (fields, semantics, ownership) is declared in a single location to prevent drift across the 3 spec lifecycle skills:

→ See [`references/spec-context-schema.md`](../../references/spec-context-schema.md) for the full schema, field-by-field semantics, and the sub-field reference convention.

In `spec-heavy`, `spec-context.yaml` is created by the task-orchestrator (Phase 0a) and populated by steps 01-03 as they progress. Steps 02 and 03 read `acceptance_criteria` as a SUB-FIELD of `spec_context`, NOT as a separate input (i.e. `spec_context.acceptance_criteria`).

## Execution rules

The 8 enforcement rules inherited from v4.7.0+ contract apply:
1. Sequence lock (1→9, no skip).
2. Execution-mode lock per step.
3. Agent-type whitelist when `execution_mode: subagent`.
4. Output schema verified before next step proceeds.
5. AskUserQuestion mandatory at the 5 gates.
6. STOP RULE: 3 consecutive failures halt the pipeline (`stop_rule_max_failures: 3`). Heavy tolera mais que Light (2) por ser pipeline mais longo com mais oportunidades de retry parcial.
7. Audit log append-only to `.pipeline/gate-decisions.jsonl`.
8. Sentinel checkpoints (`pre_1`, `pre_3`, `pre_5`, `pre_9`).

**Note:** hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) enforce SKILL.md frontmatter via the shared parser at `.claude/hooks/skill-frontmatter-parser.cjs`. Roll-out per `designs/pipeline-orchestrator-v5-consolidated.md` §17.4 #8 (warn mode → deny mode 2026-05-17).

**Convencao de `agent_type` para steps inline:** quando `execution_mode: inline`, o frontmatter declara `agent_type: ""` (string vazia) como sentinela canonica — NAO omitir o campo. Esta convencao e enforced pelo parser compartilhado e mantida consistente entre spec-light, spec-heavy e spec-audit-only. Steps inline nesta skill: 03 (tdd-scenarios), 04 (implementation), 08 (confidence-dashboard).

## Reference docs

- Light counterpart: `skills/spec-light/SKILL.md` (6 steps, no content-review, no adversarial parallel)
- Audit-only counterpart: `skills/spec-audit-only/SKILL.md` (5 steps, no implementation)
- Wave 1 agents: `agents/executor/type-specific/spec-format-gate.md`, `agents/executor/type-specific/spec-content-reviewer.md`, `agents/executor/type-specific/spec-post-impl-validator.md`, `agents/executor/spec-closer.md`
- Adversarial agents (reused from existing fleet): `agents/executor/type-specific/adversarial-architecture-critic.md`, `agents/executor/type-specific/adversarial-security-scanner.md`
