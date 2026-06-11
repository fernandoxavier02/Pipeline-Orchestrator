---
step_number: 1
step_name: "journey-definition"
execution_mode: subagent
agent_type: "pipeline-orchestrator:core:task-orchestrator"
production_writes_allowed: false
expected_inputs:
  - ux_request: from_user
  - target_flow: from_user
expected_outputs:
  - journey_narrative: string
  - JourneyMap: object
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 2
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 01 — Journey Definition (Light) — REQUIRES JOURNEY APPROVAL

## Objective

Open the UX simulation by defining the target user journey(s) for this MEDIA scope (2-3 journeys). Produce (a) a plain-language narrative describing each journey — who the user is, where they enter, what they are trying to accomplish, and where they exit — and (b) a structured `JourneyMap` listing each journey's steps, entry points, and exit points.

This is the **first user-facing gate** (`gate_required: true`). REQUIRES JOURNEY APPROVAL via AskUserQuestion before simulation runs — confirm the journey scope is correct and capped at 2-3 journeys before deeper steps.

**Evidence rule:** anchor every journey step to a route, screen, or component reference where one exists; if a step cannot be located in code, declare "not evidenced".

## Sentinel checkpoint

`pre_1` per SKILL.md. Validates that `ux_request` and `target_flow` are non-empty.

## Instructions

### 1.1 Journey narrative

Plain-language report:

- What journeys are in scope (2-3 max for Light)?
- For each journey: the user's goal, the entry point, the key steps, and the exit/success point.
- If the scope names more than 3 journeys or implies cross-device / heavy accessibility, flag it as an escalation candidate for `ux-sim-heavy`.

### 1.2 JourneyMap (typed JSON)

```yaml
JourneyMap:
  journeys:
    - id: JRN-001
      name: <short name>
      goal: <what the user wants to achieve>
      entry_point: <route/screen or "not evidenced">
      steps: [<ordered step list>]
      exit_point: <success/exit condition>
      evidence: [<file:line or route reference>]
  scope_note: <"fits Light (<=3 journeys)" | "escalation candidate — recommend ux-sim-heavy">
```

### 1.3 AskUserQuestion gate (mandatory)

```
header: "Jornada"
question: "Aprovar o mapa de jornadas e prosseguir para a simulação (step 2)?"
multiSelect: false
options:
  - label: "Aprovar e seguir (Recomendado)"
    description: "Jornadas mapeadas (<=3) com entrada, passos e saída por jornada."
  - label: "Revisar — me diga o que ajustar"
    description: "Quero estreitar/ampliar as jornadas ou trocar entry/exit points."
  - label: "Abortar — escopo não cabe em ux-sim-light"
    description: "Cobertura precisa de ux-sim-heavy (5+ jornadas, cross-device, acessibilidade)."
```

(AskUserQuestion automatically appends "Other".)

### 1.4 Record the decision

- `gate_decision`: `approved | revise | abort`
- `askuserquestion_response`: user's option (verbatim)
- Append to `.pipeline/gate-decisions.jsonl`

## Done criteria

- Journey narrative written in plain language.
- `JourneyMap` populated with 2-3 journeys.
- AskUserQuestion invoked.
- Decision audit-logged.

## Next

If `approved` → `steps/02-environment-setup.md`.
