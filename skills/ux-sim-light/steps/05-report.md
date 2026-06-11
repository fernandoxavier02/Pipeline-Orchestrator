---
step_number: 5
step_name: "report"
execution_mode: subagent
agent_type: "pipeline-orchestrator:core:final-validator"
production_writes_allowed: false
expected_inputs:
  - UX_QA_REPORT: from_step_4
  - prioritized_problem_list: from_step_4
  - JourneyMap: from_step_1
expected_outputs:
  - report_narrative: string
  - UX_SIMULATION_REPORT: object
  - ux_assessment: "GO | CONDITIONAL | NO-GO"
  - askuserquestion_response: string
  - gate_decision: "GO | CONDITIONAL | NO-GO"
expected_next: null
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 05 — Report (Light) — REQUIRES UX ASSESSMENT

## Objective

Assemble the problems-first `UX_SIMULATION_REPORT` and issue a UX assessment. The report leads with problems (not praise), grouped by impact, each with a recommendation. This is the **second user-facing gate** (`gate_required: true`): GO / CONDITIONAL / NO-GO via AskUserQuestion.

## Why subagent (final-validator)

The `final-validator` issues the Go/No-Go for the report as a deliverable, consolidating the prioritized problem list into the report format.

## Sentinel checkpoint

`pre_5` per SKILL.md. Validates that `UX_QA_REPORT` is present.

## Instructions

### 5.1 UX_SIMULATION_REPORT (typed JSON)

```yaml
UX_SIMULATION_REPORT:
  journeys_tested: <N>
  problems_found:
    blocker: <N>
    major: <N>
    minor: <N>
  top_problems:
    - journey: <which journey>
      step: <where in journey>
      problem: <what went wrong>
      recommendation: <how to fix>
```

### 5.2 AskUserQuestion gate (mandatory — no prose substitute)

```
header: "UX"
question: "Relatório de UX (Light): aprovar como entregável?"
multiSelect: false
options:
  - label: "<dynamic recommendation> (Recomendado)"   # see logic below
    description: <reason>
  - label: "<other 1>"
    description: <reason>
  - label: "<other 2>"
    description: <reason>
```

**Recommendation logic:**

- If any `blocker` problem exists → option 1 = `"NO-GO — corrigir blocker antes de seguir (Recomendado)"`, option 2 = `"CONDITIONAL — aprovar com follow-up"`, option 3 = `"GO mesmo assim — assumir risco"`.
- Else if `major` problems exist → option 1 = `"CONDITIONAL — aprovar com follow-up (Recomendado)"`, option 2 = `"GO — encerrar agora"`, option 3 = `"NO-GO — voltar a simular"`.
- Else (clean simulation) → option 1 = `"GO — relatório aprovado, encerrar (Recomendado)"`, option 2 = `"CONDITIONAL — quero adicionar follow-up"`, option 3 = `"NO-GO — algo crítico foi notado fora do JSON"`.

(AskUserQuestion automatically appends "Other".)

### 5.3 Final decision

- `ux_assessment`: `GO | CONDITIONAL | NO-GO`.
- `askuserquestion_response`: user's option (verbatim).
- Append to `.pipeline/gate-decisions.jsonl`.

## Done criteria

- All target journeys reflected in the report.
- Problems prioritized by impact (problems-first).
- Actionable recommendations provided.
- AskUserQuestion invoked; decision audit-logged.

## Skill exit

Terminal step. On `GO` / `CONDITIONAL`, return control to the caller. On `NO-GO`, re-enter at the appropriate earlier step. Blocker-level UX problems recommend immediate fix.
