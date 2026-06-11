---
step_number: 2
step_name: "environment-state-matrix"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-simulator"
production_writes_allowed: false
expected_inputs:
  - JourneyInventory: from_step_1
expected_outputs:
  - matrix_narrative: string
  - StateMatrix: object
expected_next: 3
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 02 — Environment + State Matrix (Heavy)

## Objective

For the approved inventory, map the required states, data, and permissions per journey across the in-scope devices. Produce a `StateMatrix` that the per-journey simulation will traverse. This is the breadth that distinguishes Heavy: every journey × persona × device × critical-state cell is enumerated with its setup requirement.

**Evidence rule:** every page/component/state references a specific file. States that cannot be determined from code are marked `[NEEDS-RUNTIME-VERIFICATION]`.

## Why subagent (ux-simulator)

The `ux-simulator` agent owns journey/state mapping. In Heavy mode it builds the full persona matrix (3+ personas) and the cross-device state matrix.

## Instructions

### 2.1 Locate the UI surface per journey × device

Use `Glob`/`Grep` to find routes, templates, components, and services per journey. For each, identify the breakpoints / responsive variants per device in `JourneyInventory.devices`.

### 2.2 StateMatrix (typed JSON)

```yaml
StateMatrix:
  cells:
    - journey: JRN-001
      persona: <persona name>
      device: <form factor>
      states:
        - state: <loading | success | partial | error_recoverable | error_irrecoverable | blocked>
          setup_requirement: <data / permission / auth needed to reach this state>
          pages_components: [<file:line references>]
  data_fixtures: [<required test-state descriptions>]
  permissions: [<auth/permission states per journey>]
```

## Done criteria

- State matrix enumerates journey × persona × device × critical-state cells.
- Each cell has setup requirements + file references.
- Data fixtures and permission states catalogued.

## Next

→ `steps/03-per-journey-simulation.md`.
