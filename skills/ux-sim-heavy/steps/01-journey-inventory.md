---
step_number: 1
step_name: "journey-inventory"
execution_mode: subagent
agent_type: "pipeline-orchestrator:core:task-orchestrator"
production_writes_allowed: false
expected_inputs:
  - ux_request: from_user
  - scope_definition: from_user
expected_outputs:
  - inventory_narrative: string
  - JourneyInventory: object
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 2
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 01 — Journey Inventory (Heavy) — REQUIRES JOURNEY SCOPE APPROVAL

## Objective

Open the comprehensive UX audit by mapping ALL user journeys, personas, devices, and accessibility needs in scope. Produce (a) a plain-language narrative describing the full journey landscape and (b) a structured `JourneyInventory` enumerating every journey, persona, and device/state combination to be simulated.

This is the **first user-facing gate** (`gate_required: true`). REQUIRES JOURNEY SCOPE APPROVAL via AskUserQuestion before the heavy simulation runs.

**Evidence rule:** anchor every journey to a route/screen/component where one exists; if not locatable, declare "not evidenced".

## Sentinel checkpoint

`pre_1` per SKILL.md. Validates that `ux_request` and `scope_definition` are non-empty. Per the COMPLEXA discipline, Plan Mode applies — the simulation execution order is planned before step 2.

## Instructions

### 1.1 Inventory narrative

Plain-language report:

- The full set of journeys in scope (5+ for Heavy).
- The personas (minimum 3 distinct personas for Heavy per the `ux-simulator` contract).
- The devices / form factors (cross-device is in scope for Heavy).
- The accessibility needs to be audited (WCAG 2.1 AA).

### 1.2 JourneyInventory (typed JSON)

```yaml
JourneyInventory:
  journeys:
    - id: JRN-001
      name: <short name>
      goal: <what the user wants to achieve>
      entry_point: <route/screen or "not evidenced">
      exit_point: <success/exit condition>
      evidence: [<file:line or route reference>]
  personas: [<min 3 distinct personas: worst-case + most-frequent + others>]
  devices: [<form factors / breakpoints>]
  accessibility_needs: [<keyboard, screen reader, contrast, motion, ...>]
  plan_mode_note: <simulation execution order planned for COMPLEXA>
```

### 1.3 AskUserQuestion gate (mandatory)

```
header: "Escopo"
question: "Aprovar o inventário de jornadas/personas/devices e prosseguir para a matriz de estados (step 2)?"
multiSelect: false
options:
  - label: "Aprovar e seguir (Recomendado)"
    description: "Inventário cobre todas as jornadas, 3+ personas, devices e necessidades de acessibilidade."
  - label: "Revisar — me diga o que ajustar"
    description: "Quero estreitar/ampliar jornadas, personas ou devices antes de seguir."
  - label: "Abortar — escopo não cabe em UX Simulation"
    description: "O pedido é, na verdade, code-changing ou audit; re-rotear."
```

(AskUserQuestion automatically appends "Other".)

### 1.4 Record the decision

- `gate_decision`: `approved | revise | abort`
- `askuserquestion_response`: user's option (verbatim)
- Append to `.pipeline/gate-decisions.jsonl`

## Done criteria

- Inventory narrative written in plain language.
- `JourneyInventory` populated with journeys + 3+ personas + devices + a11y needs.
- AskUserQuestion invoked; decision audit-logged.

## Next

If `approved` → `steps/02-environment-state-matrix.md`.
