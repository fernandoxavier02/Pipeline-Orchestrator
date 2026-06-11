---
step_number: 6
step_name: "adversarial-review"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:review-orchestrator"
production_writes_allowed: false
expected_inputs:
  - UX_SIMULATION: from_step_3
  - CrossCuttingFindings: from_step_4
  - A11Y_REPORT: from_step_5
expected_outputs:
  - adversarial_narrative: string
  - AdversarialFindings: object
  - askuserquestion_response: string
  - gate_decision: "approved | revise | skip"
expected_next: 7
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 06 — Adversarial Gate + Independent Review (Heavy) — REQUIRES APPROVAL

## Objective

Adversarially review the consolidated UX findings to ensure nothing was missed and that severity tagging is defensible, then surface an optional independent security review of any code touched during analysis. This step is the COMPLEXA-tier rigor: it challenges the simulation's conclusions before the final report is sealed.

This is a user-facing gate (`gate_required: true`). The user approves the review start; the final-adversarial layer is opt-in (report-only pipelines have minimal code-review surface, so it is recommended only when analyzed code touches auth/data).

## Sentinel checkpoint

`pre_6` per SKILL.md. Validates that the step-3, step-4, and step-5 outputs are present.

## Why subagent (review-orchestrator)

The `review-orchestrator` runs the adversarial pass with clean context, consolidating findings. For a report-only UX pipeline it focuses on: are severity tags defensible? are there friction vectors the simulation missed? does any analyzed code carry a security concern worth an opt-in independent review?

## Instructions

### 6.1 Adversarial pass

Challenge the consolidated findings: look for under-tagged blockers, missed edge-case journeys, accessibility violations that block interaction (WCAG Level A), and any cross-cutting pattern that was under-weighted. Produce `AdversarialFindings`.

### 6.2 AskUserQuestion gate (mandatory — no prose substitute)

```
header: "Adversarial"
question: "Revisão adversarial das conclusões de UX concluída. Como proceder?"
multiSelect: false
options:
  - label: "Aprovar — seguir para a montagem do relatório (Recomendado)"
    description: "Severidades defensáveis; nenhum blocker sub-tagueado; seguir ao relatório final."
  - label: "Revisar — reabrir simulação/classificação"
    description: "Há vetores ou jornadas a re-simular antes de fechar."
  - label: "Pular revisão final de segurança"
    description: "Pipeline report-only sem superfície de código relevante; seguir direto ao relatório."
```

(AskUserQuestion automatically appends "Other". Final independent security review is opt-in — recommended only if analyzed code touches auth/data. Fix/re-simulate loop is capped at 3 attempts per the STOP RULE.)

### 6.3 Record the decision

- `gate_decision`: `approved | revise | skip`
- `askuserquestion_response`: user's option (verbatim)
- Append to `.pipeline/gate-decisions.jsonl`

## Done criteria

- Adversarial pass complete; `AdversarialFindings` produced.
- AskUserQuestion invoked; decision audit-logged.

## Next

If `approved` / `skip` → `steps/07-report-assembly.md`.
