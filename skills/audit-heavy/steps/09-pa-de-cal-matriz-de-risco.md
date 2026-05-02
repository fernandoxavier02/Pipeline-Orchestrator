---
step_number: 9
step_name: "pa-de-cal-matriz-de-risco"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - DependencyImpactAudit: from_step_2
  - DecisionSSOTAudit: from_step_3
  - ContractGovernanceAudit: from_step_4
  - DataGovernanceAudit: from_step_5
  - FrontendDeepAudit: from_step_6
  - BackendDeepAudit: from_step_7
  - DeliveryGovernanceAudit: from_step_8
expected_outputs:
  - AuditMasterSeal: object
  - executive_narrative: string
  - risk_matrix: list
  - priority_backlog: object
  - safe_change_strategy: object
  - contract_and_ssot_strategy: object
  - recommended_validation_suite: list
  - go_no_go: "GO | CONDITIONAL | NO-GO"
  - decision_rationale: list
  - askuserquestion_response: string
expected_next: null
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 09 — Pá de Cal + Risk Matrix + Priority Backlog — REQUIRES GO/NO-GO

## Objective

Close the audit with an **executive synthesis** and a **prioritized plan**, **without implementing**. Produce:

- Risk matrix (impact × probability × evidence).
- Priority backlog (quick wins / medium term / long term).
- Atomic-action plan (small, reversible changes).
- Areas where NOT to start first (cascade-risk avoidance).
- Recommended contract/SSOT strategy.
- Recommended validation suite (minimum gates per `references/gates.md` Hardness Taxonomy).

This is the **second user-facing gate** of the heavy workflow (`gate_required: true`). REQUIRES GO/CONDITIONAL/NO-GO via AskUserQuestion. The decision applies to **the audit report itself** (is it complete, evidence-backed, actionable?), not to any code change — audits do not produce code.

## Why subagent (audit-risk-matrix-generator)

This step runs in the `audit-risk-matrix-generator` subagent (read-only, sonnet model, IRON LAW enforced). The agent ingests ALL prior outputs, deduplicates findings, assigns IDs (`AUDIT-NNN`), and produces the consolidated `AuditMasterSeal` deliverable.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_1, pre_5, pre_9]`). The `sentinel-hook` validates that ALL outputs from steps 1–8 are present and structured before this gate runs.

## Inputs (consolidates all prior steps)

- `AuditIntake` (step 1)
- `DependencyImpactAudit` (step 2)
- `DecisionSSOTAudit` (step 3)
- `ContractGovernanceAudit` (step 4)
- `DataGovernanceAudit` (step 5)
- `FrontendDeepAudit` (step 6)
- `BackendDeepAudit` (step 7)
- `DeliveryGovernanceAudit` (step 8)

## Instructions

### 9.1 Executive narrative

Write a director-grade report — what is good, what is bad, what is urgent, why. Structure:

- **Strengths** (3–5 items, evidence-backed).
- **Weaknesses** (3–5 items, severity-ranked).
- **Urgent items** (P0, ≤72h-window items).
- **Compounding risks** (where multiple findings stack on the same area).

If something cannot be proven, declare "not evidenced" explicitly. No invention.

### 9.2 AuditMasterSeal (typed JSON)

Produce the structured consolidated deliverable:

```yaml
AuditMasterSeal:
  audit_id: <YYYYMMDD-HHMM-<scope-slug>>
  scope: <copied from step 1 audit_spec>
  axes_covered: [intake, architecture, domain, contracts, data, frontend, backend, governance]
  risk_matrix:
    - id: AUDIT-001
      finding: <text>
      axis: <one of axes_covered>
      severity: <Critical | High | Medium | Low>
      probability: <High | Medium | Low>
      impact: <High | Medium | Low>
      evidence:
        - file: <path>
          line: <int>
      tag: <[VERIFIED] | [HYPOTHESIS] | [DESIGN]>
      sources: [<step numbers where this finding originated>]
      recommendation: <text — read-only suggestion, not a patch>
    # ... one entry per consolidated finding
  priority_backlog:
    quick_wins: # ≤1 day each, low cascade risk
      - id: <AUDIT-NNN>
        action: <text>
        effort: <S>
    medium_term: # 1–2 weeks, contained scope
      - id: <AUDIT-NNN>
        action: <text>
        effort: <M>
    long_term: # >1 month, structural change
      - id: <AUDIT-NNN>
        action: <text>
        effort: <L>
  safe_change_strategy:
    atomicity_principle: <text>
    independence_principle: <text>
    rollback_principle: <text>
    do_not_start_with: [<paths that are too central — refactor_boundaries from step 2>]
  contract_and_ssot_strategy:
    ssot_consolidation_plan: <text>
    contract_source_of_truth_recommendation: <text>
    enforcement_mechanism: <text>
  recommended_validation_suite:
    - tier: <unit | integration | e2e | property | load | security_scan>
      coverage_target: <text>
      rationale: <text>
      priority: <P0 | P1 | P2>
  overall_assessment:
    summary: <2-3 sentences>
    confidence_level: <High | Medium | Low>
    confidence_rationale: <text — what limited the confidence>
```

### 9.3 AskUserQuestion gate (mandatory — no prose substitute)

Per global rule, invoke AskUserQuestion. This gate has 3 outcomes (GO / CONDITIONAL / NO-GO) on the **audit report quality**:

```
header: "GO/NO-GO"
question: "Pá de Cal: aprovar o relatório de auditoria como entregável final?"
multiSelect: false
options:
  - label: "GO — relatório aprovado, encerrar auditoria"
    description: "Findings com evidencia file:line, risk matrix priorizada, recomendacoes acionaveis. Audit COMPLETE."
  - label: "CONDITIONAL — aprovar com follow-up"
    description: "Relatório utilizável; requer follow-up em N dias para fechar gap X (e.g., baseline historico ausente, axis Y parcial)."
  - label: "NO-GO — relatório incompleto, voltar a etapa apropriada"
    description: "Falha em N: <especificar>; precisa <Z> antes de encerrar. Workflow re-entra na etapa indicada."
```

(The tool automatically appends "Other" for free text.)

### 9.4 Final decision (rigid format)

- **DECISION**: GO / CONDITIONAL / NO-GO
- **REASONS** (3–7 objective items)
- **GAPS** (if CONDITIONAL or NO-GO): exact list of what is missing — which axis, which evidence type.
- **NEXT-STEP HANDOFF** (if GO): the report is consumed by either Bug Fix or Feature pipelines; recommendations carry priority tags so callers know which to dispatch first.

Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7.

### 9.5 Closing rule

Any finding left as `[HYPOTHESIS]` after step 8 must either be:
- Resolved here (additional grep / Read narrows it to `[VERIFIED]`), OR
- Explicitly declared "not provable within audit scope" with reason — and recorded as a low-confidence item in `overall_assessment.confidence_rationale`.

Do not silently promote `[HYPOTHESIS]` to `[VERIFIED]` without evidence.

## Done criteria

- Executive narrative written.
- `AuditMasterSeal` populated with risk matrix (≥1 entry per axis evidenced), priority backlog, safe-change strategy, contract/SSOT strategy, recommended validation suite, overall_assessment.
- All findings carry `[VERIFIED]` / `[HYPOTHESIS]` / `[DESIGN]` tags + file:line.
- AskUserQuestion invoked (not substituted with prose).
- Final decision recorded in rigid format with reasons + gaps (if CONDITIONAL/NO-GO) + handoff (if GO).

## Outputs (terminal step — handoff back to caller)

```yaml
AuditMasterSeal: <full structured JSON above>
executive_narrative: <text>
risk_matrix: <copied>
priority_backlog: <copied>
safe_change_strategy: <copied>
contract_and_ssot_strategy: <copied>
recommended_validation_suite: <copied>
go_no_go: <GO | CONDITIONAL | NO-GO>
decision_rationale: [<list of reasons>]
askuserquestion_response: <user's chosen option label>
```

## Skill exit

This is the terminal step (`expected_next: null`). On `GO` or `CONDITIONAL`, the skill returns control to the caller (pipeline-controller or direct invoker) with the consolidated `AuditMasterSeal`. On `NO-GO`, the caller is expected to address the declared gaps and re-enter the workflow at the appropriate step (typically the step that produced the incomplete deliverable).

The audit report is the final product. If the user wants to act on findings, they invoke `/pipeline-orchestrator:bugfix [finding-AUDIT-NNN]` or `/pipeline-orchestrator:feature [recommendation-AUDIT-NNN]` — those are separate pipelines with their own gates.
