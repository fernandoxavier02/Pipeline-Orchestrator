---
step_number: 6
step_name: "frontend-qualidade-estado-ui"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - ArchitectureAudit: from_step_2
  - ContractAudit: from_step_4
expected_outputs:
  - frontend_narrative: string
  - FrontendAudit: object
  - ui_structure: object
  - shared_components_hotspots: list
  - state_management_guess: string
  - routing_guess: string
  - ui_regression_risks: list
  - recommendations_top3: list
expected_next: 7
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 06 — Frontend Quality + State + UI (Light)

## Objective

Frontend audit focused on consistency and regression risk. Define inline:

- **State** = "the app's temporary memory".
- **Lifecycle** = "when the screen loads / refreshes data".
- **Shared component** = "a piece used in multiple screens".

Evaluate component organization, state patterns, navigation/routes, design system, and cascade risk in global components.

## Why subagent (audit-compliance-checker)

Same agent as step 5, fresh context.

## Inputs

- `AuditSnapshot` (from step 1)
- `ArchitectureAudit` (from step 2)
- `ContractAudit` (from step 4)

## Instructions

### 6.1 Frontend narrative

Component organization, state pattern, navigation, design system, cascade risk on global components. Cite file:line.

### 6.2 FrontendAudit (typed JSON)

```yaml
FrontendAudit:
  ui_structure:
    framework: <text>
    component_dir: <path>
    routing_dir: <path>
  shared_components_hotspots:
    - component: <path>
      reused_in_count: <int or "not evidenced">
      cascade_risk: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  state_management_guess: <text>
  routing_guess: <text>
  ui_regression_risks:
    - risk: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommendations_top3:
    - recommendation: <text>
      impact: <high | medium | low>
      effort: <S | M | L>
```

### 6.3 Constraints

- Read-only, evidence-bound, scope-bound.

## Done criteria

- Frontend narrative written.
- `FrontendAudit` populated with all six fields.
- Top-3 recommendations listed.

## Outputs (handoff to step 7)

```yaml
FrontendAudit: <JSON above>
frontend_narrative: <text>
ui_structure: <copied>
shared_components_hotspots: <copied>
state_management_guess: <copied>
routing_guess: <copied>
ui_regression_risks: <copied>
recommendations_top3: <copied>
```

## Next

Proceed to `steps/07-backend-servicos-seguranca.md`.
