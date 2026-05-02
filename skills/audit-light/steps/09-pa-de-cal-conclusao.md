---
step_number: 9
step_name: "pa-de-cal-conclusao"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - ArchitectureAudit: from_step_2
  - DomainSSOTAudit: from_step_3
  - ContractAudit: from_step_4
  - DataAudit: from_step_5
  - FrontendAudit: from_step_6
  - BackendAudit: from_step_7
  - QualityOpsAudit: from_step_8
expected_outputs:
  - closing_narrative: string
  - AuditFinalSeal: object
  - strengths: list
  - risks_ranked: list
  - quick_wins: list
  - medium_term_plan: list
  - governance_notes: list
  - go_no_go: "GO | CONDITIONAL | NO-GO | ESCALATE-TO-HEAVY"
  - decision_rationale: list
  - askuserquestion_response: string
expected_next: null
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 09 — Pá de Cal + Conclusion + Plan (Light) — REQUIRES GO/NO-GO

## Objective

Close the Light audit with a clear conclusion for a non-technical reader:

- Main strengths of the project (in scope).
- Main risks ranked by severity (impact × probability × evidence).
- What to fix first with lowest cascade risk.
- Suggested action plan (short — no implementation here).
- **Escalation decision**: does this audit warrant promoting to `audit-heavy`?

This is the **second user-facing gate** (`gate_required: true`). REQUIRES GO/CONDITIONAL/NO-GO via AskUserQuestion. Light has a 4th option: `ESCALATE-TO-HEAVY` (recommended when scope cap was insufficient).

## Why subagent (audit-risk-matrix-generator)

Same agent as audit-heavy step 9. Consolidates all prior outputs and produces the `AuditFinalSeal` (Light-flavored sibling of `AuditMasterSeal`).

## Sentinel checkpoint

`pre_9` per SKILL.md. Validates that all 8 prior outputs are present.

## Inputs (consolidates all prior)

- `AuditSnapshot` (step 1)
- `ArchitectureAudit` (step 2)
- `DomainSSOTAudit` (step 3)
- `ContractAudit` (step 4)
- `DataAudit` (step 5)
- `FrontendAudit` (step 6)
- `BackendAudit` (step 7)
- `QualityOpsAudit` (step 8)

## Instructions

### 9.1 Closing narrative (for a non-technical reader)

Plain-language summary:

- What is good in the project (in scope) — 3–5 strengths.
- What is risky — 3–5 risks ranked.
- What to fix first — 1–3 items with lowest cascade risk.
- What can wait — medium-term roadmap.

If something cannot be proven, declare "not evidenced" explicitly.

### 9.2 AuditFinalSeal (typed JSON)

```yaml
AuditFinalSeal:
  audit_id: <YYYYMMDD-HHMM-<scope-slug>-light>
  scope: <copied from step 1>
  light_mode_acknowledged: true
  strengths:
    - strength: <text>
      evidence: <file:line>
  risks_ranked:
    - id: AUDIT-LIGHT-001
      finding: <text>
      severity: <Critical | High | Medium | Low>
      probability: <High | Medium | Low>
      impact: <High | Medium | Low>
      evidence: [<file:line>]
      tag: <[VERIFIED] | [HYPOTHESIS] | [DESIGN]>
      sources: [<step numbers>]
      recommendation: <text>
  quick_wins:
    - id: <AUDIT-LIGHT-NNN>
      action: <text>
      effort: <S>
  medium_term_plan:
    - id: <AUDIT-LIGHT-NNN>
      action: <text>
      effort: <M>
  governance_notes:
    - note: <text — how to reduce regression and keep changes atomic>
  escalation_assessment:
    recommend_escalate_to_heavy: <true | false>
    rationale: <text>
    triggers_observed: [<critical_severity | many_hypothesis_tags | cascade_3plus_areas | regulatory_keyword>]
  overall_assessment:
    summary: <2-3 sentences>
    confidence_level: <High | Medium | Low>
    confidence_rationale: <text>
```

### 9.3 Escalation triggers

Recommend `ESCALATE-TO-HEAVY` when ANY of:

- Any finding is `Critical` severity.
- ≥30% of risk-matrix entries are tagged `[HYPOTHESIS]` (signals lack of audit-domain-analyzer depth).
- Cascade risk discovered across 3+ areas (audit was scoped to 1).
- Regulatory keyword detected (GDPR, HIPAA, SOC2, LGPD) — audit-light is BLOCKED for these (per §11.2).

If any trigger fires, the AskUserQuestion gate at step 9 surfaces escalation as the **recommended** option.

### 9.4 AskUserQuestion gate (mandatory — no prose substitute)

```
header: "GO/NO-GO"
question: "Pá de Cal (Light): aprovar o relatório como entregável?"
multiSelect: false
options:
  - label: "<dynamic recommendation> (Recomendado)"  # see logic below
    description: <reason>
  - label: "<other 1>"
    description: <reason>
  - label: "<other 2>"
    description: <reason>
```

**Recommendation logic:**

- If escalation triggers fired → option 1 = `"ESCALATE-TO-HEAVY (Recomendado)"`, option 2 = `"GO mesmo assim — assumir risco"`, option 3 = `"NO-GO — relatório incompleto, replanejar"`.
- Else if findings show CONDITIONAL surface (medium-severity gaps) → option 1 = `"CONDITIONAL — aprovar com follow-up (Recomendado)"`, option 2 = `"GO — encerrar agora"`, option 3 = `"NO-GO — voltar a etapa apropriada"`.
- Else (clean audit) → option 1 = `"GO — relatório aprovado, encerrar (Recomendado)"`, option 2 = `"CONDITIONAL — quero adicionar follow-up"`, option 3 = `"NO-GO — algo critico foi notado fora do JSON"`.

(AskUserQuestion automatically appends "Other".)

### 9.5 Final decision

- `go_no_go`: `GO | CONDITIONAL | NO-GO | ESCALATE-TO-HEAVY`.
- `decision_rationale`: 3–7 objective items.
- If `ESCALATE-TO-HEAVY`: hand off context (AuditSnapshot + all 8 reports) to `audit-heavy` invocation; user re-runs as `/pipeline-orchestrator:audit-heavy "<scope>"`.
- Append to `.pipeline/gate-decisions.jsonl`.

## Done criteria

- Closing narrative written.
- `AuditFinalSeal` populated with all eight top-level fields.
- Escalation assessment present.
- AskUserQuestion invoked.
- Decision audit-logged.

## Outputs (terminal step)

```yaml
AuditFinalSeal: <JSON above>
closing_narrative: <text>
strengths: <copied>
risks_ranked: <copied>
quick_wins: <copied>
medium_term_plan: <copied>
governance_notes: <copied>
go_no_go: <GO | CONDITIONAL | NO-GO | ESCALATE-TO-HEAVY>
decision_rationale: [<list>]
askuserquestion_response: <text>
```

## Skill exit

Terminal step. On `GO` / `CONDITIONAL`, return control to the caller. On `NO-GO`, re-enter at the appropriate earlier step. On `ESCALATE-TO-HEAVY`, exit with handoff context for an `/audit --heavy` rerun.
