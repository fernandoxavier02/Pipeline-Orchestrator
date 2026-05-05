---
name: spec-light
description: |
  Prescriptive 6-step workflow for the Spec Lifecycle in Light mode (small-to-medium scope,
  controlled risk, prefer speed with discipline; trusts the spec content and skips the deep
  content-review phase, focusing instead on a 25-check Format Gate, ATDD seed, TDD
  implementation with adversarial loop, 6-axis post-impl congruence, simplified confidence
  dashboard, and formal closure). Sequence is locked (1→6, no skip, no reorder). 4 mandatory
  AskUserQuestion gates at steps 1 (format-gate-approval), 2 (tdd-scenarios-approval),
  3 (adversarial-loop-checkpoint), 4 (post-impl-validation). 3 reused executor agents:
  spec-format-gate (1), spec-post-impl-validator (4), spec-closer (6); step 2 and 5 inline.
  Manual-only invocation via /pipeline-orchestrator:spec-light.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[spec feature name or path to .kiro/specs/<feature>/]"
sequence: [1, 2, 3, 4, 5, 6]
sequence_lock: true
gates_at: [1, 2, 3, 4]
sentinel_checkpoints: [pre_1, pre_3, pre_6]
stop_rule_max_failures: 2
---

# Spec Lifecycle Skill (Light) — 6 prescriptive steps

6 prescriptive steps for the Spec Lifecycle in Light mode. Each step file declares its execution contract (sequence, ownership, gates) via frontmatter consumed by the orchestrator. Project-neutral wording — designed to work in any codebase that follows the spec layout under `.kiro/specs/<feature>/`.

## Quando usar

Use **spec-light** quando voce ja tem uma spec escrita em `.kiro/specs/<feature>/` (com `requirements.md`, `design.md`, `tasks.md`, `spec.json`) de risco pequeno-a-medio e quer velocidade com disciplina: confia no conteudo da spec (sem content-review profundo), valida formato em 25 checks, deriva cenarios ATDD a partir dos AC, executa TDD em Vertical Slices com loop adversarial, e fecha com auditoria de congruencia em 6 eixos.

Se durante a analise surgirem indicios de domain/contratos complexos, integracoes criticas, persistencia sensivel ou impacto amplo em UX, sinalize e escale para `spec-heavy` (que adiciona content-review, architecture audit e security review).

## Sequencia canonica

1. **[GATE]** Format Gate (`steps/01-format-gate.md`)
2. **[GATE]** TDD Scenarios (ATDD seed) (`steps/02-tdd-scenarios.md`)
3. **[GATE]** Implementation (TDD + Vertical Slices + adversarial loop) (`steps/03-implementation.md`)
4. **[GATE]** Post-Impl Validation (6-axis congruence) (`steps/04-post-impl-validation.md`)
5. Confidence Dashboard (`steps/05-confidence-dashboard.md`)
6. Closure (`steps/06-closure.md`)

## Ownership por step

| Step | execution_mode | agent_type |
|---|---|---|
| 01 | subagent | `pipeline-orchestrator:executor:type-specific:spec-format-gate` |
| 02 | inline | — (orchestrator inline, ATDD seed) |
| 03 | inline | — (orchestrator inline, drives executor batches) |
| 04 | subagent | `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator` |
| 05 | inline | — (orchestrator inline, scoring math) |
| 06 | subagent | `pipeline-orchestrator:executor:spec-closer` |

## Gates (4 mandatory AskUserQuestion checkpoints)

| Step | gate_name | What the user approves |
|---|---|---|
| 1 | `format-gate-approval` | Format Gate decision (GO / GO-WARN / NO-GO) before proceeding |
| 2 | `tdd-scenarios-approval` | ATDD scenario set + AC traceability matrix before implementation |
| 3 | `adversarial-loop-checkpoint` | Adversarial loop verdict (continue / escalate / accept-warnings / abort) — escalation prompt every 3 attempts |
| 4 | `post-impl-validation` | Post-impl decision (PASS / PASS_WITH_WARNINGS / FAIL) and remediation plan |

`AskUserQuestion` is non-negotiable at these gates — prose substitution is forbidden by the global rule "Decisoes do Usuario — AskUserQuestion sempre".

## Sentinel checkpoints

`sentinel-hook` validates state coherence before steps 1, 3, and 6 (`sentinel_checkpoints: [pre_1, pre_3, pre_6]`):
- `pre_1` — verify spec path exists and the 5 spec artifacts (spec.json + requirements.md + design.md + tasks.md + research.md if applicable) are reachable before format validation begins.
- `pre_3` — verify Format Gate decision (GO/GO-WARN) and ATDD scenarios approval are present before implementation starts.
- `pre_6` — verify post-impl decision (PASS/PASS_WITH_WARNINGS) and confidence dashboard are present before formal closure.

## spec-context.yaml schema

The orchestrator pipes a single artifact `spec-context.yaml` into every step. Required fields:

```yaml
spec_context_schema:
  feature_name: string (required)
  spec_path: string (required, abs path to .kiro/specs/<feature>/)
  estimated_complexity: "Light" | "Heavy" | "Audit-Only" (required)
  acceptance_criteria: list of objects (each: { id: "AC#N", text: string, testable: boolean })
  domains_touched: list of strings
  files_affected: integer
  business_rules: list of strings
```

`spec-context.yaml` é criado pelo task-orchestrator (Phase 0a) e populado pelos steps 01-02 conforme avançam. Step 02 lê `acceptance_criteria` como SUB-FIELD de `spec_context`, NÃO como input separado (i.e. `spec_context.acceptance_criteria`).

## Execution rules

The 8 enforcement rules inherited from v4.7.0+ contract apply:
1. Sequence lock (1→6, no skip).
2. Execution-mode lock per step.
3. Agent-type whitelist when `execution_mode: subagent`.
4. Output schema verified before next step proceeds.
5. AskUserQuestion mandatory at the 4 gates.
6. STOP RULE: 2 consecutive failures halt the pipeline (`stop_rule_max_failures: 2`).
7. Audit log append-only to `.pipeline/gate-decisions.jsonl`.
8. Sentinel checkpoints (`pre_1`, `pre_3`, `pre_6`).

**Note:** hooks (`sentinel-hook`, `dispatch-guard`, `force-pipeline-agents`) enforce SKILL.md frontmatter via the shared parser at `.claude/hooks/skill-frontmatter-parser.cjs`. Roll-out per `designs/pipeline-orchestrator-v5-consolidated.md` §17.4 #8 (warn mode → deny mode 2026-05-17).

## Reference docs

- Heavy counterpart: `skills/spec-heavy/SKILL.md` (9 steps, adds content-review + architecture-audit + security-review)
- Audit-only counterpart: `skills/spec-audit-only/SKILL.md` (5 steps, no implementation)
- Wave 1 agents: `agents/executor/type-specific/spec-format-gate.md`, `agents/executor/type-specific/spec-post-impl-validator.md`, `agents/executor/spec-closer.md`
