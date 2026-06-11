---
step_number: 2
step_name: "environment-setup"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-simulator"
production_writes_allowed: false
expected_inputs:
  - JourneyMap: from_step_1
expected_outputs:
  - environment_narrative: string
  - SimulationPlan: object
expected_next: 3
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 02 — Environment Setup (Light)

## Objective

For the approved journeys, identify the pages, components, and state requirements involved, and produce a `SimulationPlan` that the simulation step will walk. This locates the actual UI surface (routes, templates, components, services) and the states each journey must traverse (loading, success, partial, error, blocked).

**Evidence rule:** every page/component/state must reference a specific file. If a state cannot be determined from code, mark it `[NEEDS-RUNTIME-VERIFICATION]` rather than guessing.

## Why subagent (ux-simulator)

The `ux-simulator` agent owns journey/state mapping. In Light mode it builds a single representative persona and folds accessibility checks inline where applicable (the dedicated `ux-accessibility-auditor` is SKIPPED in Light).

## Instructions

### 2.1 Locate the UI surface

Use `Glob`/`Grep` to find the routes, templates, components, and services that each journey in `JourneyMap` touches. Read the key files to understand entry points, form fields, actions, feedback mechanisms, and exit points.

### 2.2 SimulationPlan (typed JSON)

```yaml
SimulationPlan:
  persona:
    name: <representative persona>
    profile: <demographics, tech familiarity, context>
    primary_limitation: <patience | knowledge | accessibility need>
  journeys:
    - id: JRN-001
      pages_components: [<file:line references>]
      states_to_simulate: [loading, success, partial, error_recoverable, error_irrecoverable, blocked]
      data_or_permission_requirements: [<text>]
  inline_a11y_notes: [<applicable accessibility checks to run inline during simulation>]
```

## Done criteria

- UI surface located with file references per journey.
- `SimulationPlan` populated with a representative persona + per-journey pages/states.
- Inline accessibility checks noted (Light folds a11y inline).

## Next

→ `steps/03-journey-simulation.md`.
