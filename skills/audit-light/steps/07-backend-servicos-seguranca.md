---
step_number: 7
step_name: "backend-servicos-seguranca"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - ArchitectureAudit: from_step_2
  - ContractAudit: from_step_4
  - DataAudit: from_step_5
expected_outputs:
  - backend_narrative: string
  - BackendAudit: object
  - backend_structure: object
  - validation_strategy: string
  - authn_authz_touchpoints: list
  - error_handling_quality_guess: string
  - security_risks_top: list
  - recommendations_top3: list
expected_next: 8
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 07 — Backend Services + Security (Light)

## Objective

Backend audit focused on practical structure and security hygiene. Define inline:

- **Authentication** = "proving who the user is".
- **Authorization** = "what they can do".
- **Validation** = "ensuring input data makes sense".

Evaluate route/handler/controller organization, service layer, validation, error handling, logs, and security touchpoints (authn/authz).

## Why subagent (audit-compliance-checker)

Same agent as steps 5–6, fresh context.

## Inputs

- `AuditSnapshot` (from step 1)
- `ArchitectureAudit` (from step 2)
- `ContractAudit` (from step 4)
- `DataAudit` (from step 5)

## Instructions

### 7.1 Backend narrative

Route/service organization, validation strategy, error handling, logging, security findings. Cite file:line.

### 7.2 BackendAudit (typed JSON)

```yaml
BackendAudit:
  backend_structure:
    framework: <text>
    layering: <text>
  validation_strategy: <text or "none evidenced">
  authn_authz_touchpoints:
    - touchpoint: <text — middleware, decorator, route guard>
      file: <path>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  error_handling_quality_guess: <good | poor | mixed | "not evidenced">
  security_risks_top:
    - risk: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommendations_top3:
    - recommendation: <text>
      impact: <high | medium | low>
      effort: <S | M | L>
```

### 7.3 Constraints

- Read-only, evidence-bound, scope-bound.
- If a security risk is suspected but not evidenced, tag `[HYPOTHESIS]` — never invent severity.

## Done criteria

- Backend narrative written.
- `BackendAudit` populated with all six fields.
- Top-3 recommendations listed.

## Outputs (handoff to step 8)

```yaml
BackendAudit: <JSON above>
backend_narrative: <text>
backend_structure: <copied>
validation_strategy: <copied>
authn_authz_touchpoints: <copied>
error_handling_quality_guess: <copied>
security_risks_top: <copied>
recommendations_top3: <copied>
```

## Next

Proceed to `steps/08-testes-observabilidade-performance.md`.
