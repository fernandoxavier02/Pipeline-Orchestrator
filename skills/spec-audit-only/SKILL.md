---
name: spec-audit-only
description: |
  Prescriptive 5-step workflow for re-auditing an already-implemented spec. No implementation
  steps — sequence contains only audit and closure steps. Implementation skip is structural
  (shorter sequence + sequence_lock), not an execution_skip flag. Reuses the same Format Gate
  (25 checks) and full Content Review (12 axes) as Heavy, then runs an adversarial audit loop
  (architecture-critic + security-scanner + post-impl-validator) focused exclusively on
  congruence corrections — no new feature work. Sequence is locked (1→5, no skip, no reorder).
  3 mandatory AskUserQuestion gates at steps 1 (format-gate-approval), 2
  (content-review-approval), 3 (adversarial-loop-checkpoint). 4 reused agents:
  spec-format-gate (1), spec-content-reviewer (2), adversarial-architecture-critic +
  adversarial-security-scanner + spec-post-impl-validator (3, parallel), spec-closer (5);
  step 4 inline. stop_rule_max_failures: 2 (audit-only is shorter than Heavy and tolerates
  less consecutive churn). Manual-only invocation via /pipeline-orchestrator:spec-audit-only.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[spec feature name or path to pipeline-runs/<run_id>/01-spec/]"
sequence: [1, 2, 3, 4, 5]
sequence_lock: true
gates_at: [1, 2, 3]
sentinel_checkpoints: [pre_1, pre_3, pre_5]
stop_rule_max_failures: 2
---

# Spec Lifecycle Skill (Audit-Only) — 5 prescriptive steps

5 prescriptive steps for re-auditing a spec that is already implemented (or whose implementation has been observed in the working tree). Each step file declares its execution contract (sequence, ownership, gates) via frontmatter consumed by the orchestrator. Project-neutral wording — designed to work in any codebase that follows the spec layout under `pipeline-runs/<run_id>/01-spec/`.

## Quando usar

Use **spec-audit-only** quando voce ja tem uma spec implementada (status `post_impl_validation` ou `closed` em `spec.json`) e quer re-auditar congruencia entre os artefatos da spec e o codigo entregue, sem refazer implementacao. Casos tipicos: revisao apos um merge grande, auditoria periodica, follow-up de incidente, due-diligence pre-release.

A diferenca para `spec-heavy`: este pipeline NAO tem fase de implementacao — ele audita o que ja existe. Findings da fase 3 (adversarial-loop) so podem virar correcoes de congruencia (atualizar spec.json, corrigir traceability, alinhar documentacao com o codigo entregue), nunca novas features. Se o audit identificar gaps que exigem codigo novo, escalar para `spec-light` ou `spec-heavy` em ciclo separado.

## Sequencia canonica

1. **[GATE]** Format Gate (`steps/01-format-gate.md`)
2. **[GATE]** Content Review (12 eixos) (`steps/02-content-review.md`)
3. **[GATE]** Audit Loop (adversarial paralelo + fix-loop) (`steps/03-audit-loop.md`)
4. Confidence Dashboard (`steps/04-confidence-dashboard.md`)
5. Closure (`steps/05-closure.md`)

## Ownership por step

| Step | execution_mode | agent_type |
|---|---|---|
| 01 | subagent | `pipeline-orchestrator:executor:type-specific:spec-format-gate` |
| 02 | subagent | `pipeline-orchestrator:executor:type-specific:spec-content-reviewer` |
| 03 | inline | — (orchestrator inline; despacha 3 subagents em paralelo: architecture-critic, security-scanner, post-impl-validator) — multi-concern por design: o step 03 colapsa dispatch paralelo + consolidacao de findings + fix-loop + commit-policy num unico step para encurtar o pipeline audit-only (5 vs 9 steps do Heavy); a separacao em steps distintos seria over-engineering para um pipeline read-only. |
| 04 | inline | — (orchestrator inline, scoring math) |
| 05 | subagent | `pipeline-orchestrator:executor:spec-closer` |

## Gates (3 mandatory AskUserQuestion checkpoints)

| Step | gate_name | What the user approves |
|---|---|---|
| 1 | `format-gate-approval` | Format Gate decision (GO / GO-WARN / NO-GO / BLOCK) before content review |
| 2 | `content-review-approval` | Content review verdict (12 eixos) and mandatory corrections list |
| 3 | `adversarial-loop-checkpoint` | Adversarial loop verdict (continue / escalate / accept-warnings / abort) — escalation prompt every 3 attempts |

`AskUserQuestion` is non-negotiable at these gates — prose substitution is forbidden by the global rule "Decisoes do Usuario — AskUserQuestion sempre".

## Modelagem estrutural (sem flag de skip)

Audit-only NAO usa `execution_skip` ou flag de runtime para "pular" implementacao. A variante e modelada estruturalmente: `sequence: [1,2,3,4,5]` simplesmente nao contem steps de implementacao ou post-impl validation isolada. Hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) enforce o contrato declarado — o que esta em `sequence` e `gates_at` E o pipeline; nao ha rota alternativa.

Consequencia: o adversarial-loop (step 03) substitui a fase de implementacao do Heavy. Ele dispatcha em paralelo os tres auditores (architecture-critic + security-scanner + post-impl-validator) e itera correcoes ate convergir. Nenhuma feature nova nasce daqui — apenas alinhamento entre artefatos.

## Step 03 dispatcha 3 subagents em paralelo (per design)

O step 03 (audit-loop) e `execution_mode: inline` mas o orchestrator inline despacha em paralelo tres subagents independentes em uma unica mensagem (3 Agent calls):
- `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic`
- `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner`
- `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator`

Os tres auditam o codigo ja implementado (via spec_path + working tree) e nao se modificam mutuamente. Apos coleta dos tres reports, o orchestrator inline consolida findings e roda o fix-loop (correcoes de congruencia, sem codigo novo).

## Sentinel checkpoints

`sentinel-hook` validates state coherence before steps 1, 3 e 5 (`sentinel_checkpoints: [pre_1, pre_3, pre_5]`):
- `pre_1` — verify spec path exists, `spec.json.phase` is `post_impl_validation` or `closed` (warn if `open`), and the 5 spec artifacts (spec.json + requirements.md + design.md + tasks.md + research.md if applicable) are reachable before format validation begins.
- `pre_3` — verify Format Gate decision (GO/GO-WARN) and Content Review approval are present before adversarial dispatch.
- `pre_5` — verify adversarial loop closed (no unresolved BLOCKER findings) and confidence dashboard emitted before formal closure.

## spec-context.yaml schema

The orchestrator pipes a single artifact `spec-context.yaml` into every step. The canonical schema (fields, semantics, ownership) is declared in a single location to prevent drift across the 3 spec lifecycle skills:

→ See [`references/spec-context-schema.md`](../../references/spec-context-schema.md) for the full schema, field-by-field semantics, and the sub-field reference convention.

In `spec-audit-only`, `spec-context.yaml` is created by the task-orchestrator (Phase 0a) and populated by steps 01-02 as they progress. Step 02 reads `acceptance_criteria` as a SUB-FIELD of `spec_context`, NOT as a separate input (i.e. `spec_context.acceptance_criteria`).

## Execution rules

The 8 enforcement rules inherited from v4.7.0+ contract apply:
1. Sequence lock (1→5, no skip).
2. Execution-mode lock per step.
3. Agent-type whitelist when `execution_mode: subagent`.
4. Output schema verified before next step proceeds.
5. AskUserQuestion mandatory at the 3 gates.
6. STOP RULE: 2 consecutive failures halt the pipeline (`stop_rule_max_failures: 2`). Audit-only e mais curto que Heavy e tolera menos churn consecutivo.
7. Audit log append-only to `.pipeline/gate-decisions.jsonl`.
8. Sentinel checkpoints (`pre_1`, `pre_3`, `pre_5`).

**Note:** hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) enforce SKILL.md frontmatter via the shared parser at `.claude/hooks/skill-frontmatter-parser.cjs`. Roll-out per `designs/pipeline-orchestrator-v5-consolidated.md` §17.4 #8 (warn mode → deny mode 2026-05-17).

## Reference docs

- Light counterpart: `skills/spec-light/SKILL.md` (6 steps, with implementation, no content-review, no adversarial parallel)
- Heavy counterpart: `skills/spec-heavy/SKILL.md` (9 steps, with implementation + content-review + parallel adversarial)
- Wave 1 agents: `agents/executor/type-specific/spec-format-gate.md`, `agents/executor/type-specific/spec-content-reviewer.md`, `agents/executor/type-specific/spec-post-impl-validator.md`, `agents/executor/spec-closer.md`
- Adversarial agents (reused from existing fleet): `agents/executor/type-specific/adversarial-architecture-critic.md`, `agents/executor/type-specific/adversarial-security-scanner.md`
