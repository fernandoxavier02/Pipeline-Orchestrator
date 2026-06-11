---
step_number: 7
step_name: "report-assembly"
execution_mode: subagent
agent_type: "pipeline-orchestrator:core:final-validator"
production_writes_allowed: false
expected_inputs:
  - UX_SIMULATION: from_step_3
  - CrossCuttingFindings: from_step_4
  - A11Y_REPORT: from_step_5
  - AdversarialFindings: from_step_6
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

# Step 07 — Report Assembly (Heavy) — REQUIRES UX ASSESSMENT

## Objective

Assemble the comprehensive, problems-first `UX_SIMULATION_REPORT` from all findings (per-journey + cross-cutting + accessibility + adversarial), prioritized by user impact, and issue the full UX assessment. This is the **terminal user-facing gate** (`gate_required: true`): GO / CONDITIONAL / NO-GO via AskUserQuestion.

## Sentinel checkpoint

`pre_7` per SKILL.md. Validates that all prior outputs (steps 3-6) are present.

## Why subagent (final-validator)

The `final-validator` issues the Go/No-Go for the report as a deliverable, consolidating per-journey friction, cross-cutting patterns, accessibility findings, and adversarial results into the heavy report format.

## Instructions

### 7.1 UX_SIMULATION_REPORT (typed JSON — Heavy format)

```yaml
UX_SIMULATION_REPORT:
  journeys_tested: <N>
  personas_covered: ["list"]
  devices_tested: ["list"]
  problems_found:
    blocker: <N>
    major: <N>
    minor: <N>
    accessibility: <N>
  top_problems:
    - journey: <which>
      step: <where>
      problem: <what>
      impact: <who is affected>
      recommendation: <how to fix>
  cross_cutting_issues:
    - pattern: <systemic issue>
      affected_journeys: <N>
      recommendation: <fix>
  accessibility_summary:
    keyboard_nav: <PASS | FAIL>
    screen_reader: <PASS | FAIL>
    color_contrast: <PASS | FAIL>
```

### 7.2 AskUserQuestion gate (mandatory — no prose substitute)

```
header: "UX"
question: "Relatório de UX (Heavy): aprovar como entregável?"
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

- If any `blocker` problem OR an accessibility FAIL (keyboard/screen-reader) exists → option 1 = `"NO-GO — corrigir blocker/compliance antes de release (Recomendado)"`, option 2 = `"CONDITIONAL — aprovar com follow-up"`, option 3 = `"GO mesmo assim — assumir risco"`.
- Else if `major` problems OR systemic patterns across 3+ journeys exist → option 1 = `"CONDITIONAL — aprovar com follow-up (Recomendado)"`, option 2 = `"GO — encerrar agora"`, option 3 = `"NO-GO — voltar a simular"`.
- Else (clean audit) → option 1 = `"GO — relatório aprovado, encerrar (Recomendado)"`, option 2 = `"CONDITIONAL — quero adicionar follow-up"`, option 3 = `"NO-GO — algo crítico foi notado fora do JSON"`.

(AskUserQuestion automatically appends "Other".)

### 7.3 Final decision

- `ux_assessment`: `GO | CONDITIONAL | NO-GO`.
- `askuserquestion_response`: user's option (verbatim).
- Append to `.pipeline/gate-decisions.jsonl`.

## Done criteria

- All declared journeys, personas, and devices reflected in the report.
- Problems prioritized by user impact (problems-first); systemic patterns identified.
- Accessibility summary present; blocker UX issues recommend immediate fix; accessibility FAILs flagged as compliance risk.
- AskUserQuestion invoked; decision audit-logged.

## Skill exit

Terminal step. On `GO` / `CONDITIONAL`, return control to the caller. On `NO-GO`, re-enter at the appropriate earlier step.
