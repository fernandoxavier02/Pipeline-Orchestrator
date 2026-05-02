---
step_number: 4
step_name: "apis-endpoints-contratos"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
agent_invocation_mode: "light_mode"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - DomainSSOTAudit: from_step_3
expected_outputs:
  - contracts_narrative: string
  - ContractAudit: object
  - endpoints_found: list
  - request_response_shapes: list
  - contract_sources: list
  - backward_compatibility_risks: list
  - recommendations_top3: list
expected_next: 5
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 04 — APIs + Endpoints + Contracts (Light)

## Objective

Audit the integration layer between frontend and backend in plain language. Define inline:

- **Endpoint** = "an address on the server the app calls".
- **Contract** = "the agreed shape of request/response".
- **Breaking change** = "a change that breaks old versions".

Identify the main endpoints, how the frontend consumes them, whether there is a single source of truth for the contract (types / schemas / OpenAPI / DTOs / validators).

## Why subagent (audit-compliance-checker, light_mode continuation)

Same agent as steps 2 and 3, third invocation, fresh context. `light_mode: true` continues.

## Inputs

- `AuditSnapshot` (from step 1) — `entry_points`.
- `DomainSSOTAudit` (from step 3) — `ssot_candidates`.

## Instructions

### 4.1 Contracts narrative (plain language)

Identify main endpoints + how frontend consumes them. Locate contract source(s). Note whether validation exists, where, and what library.

Cite file:line.

### 4.2 ContractAudit (typed JSON)

```yaml
ContractAudit:
  endpoints_found:
    - method: <GET | POST | …>
      path: <text>
      auth_required: <true | false | "not evidenced">
      file: <path>
      tag: <[VERIFIED]>
  request_response_shapes:
    - endpoint: <ref to endpoints_found>
      request: <text or "not evidenced">
      response: <text or "not evidenced">
      tag: <[VERIFIED] | [HYPOTHESIS]>
  contract_sources:
    - source_type: <openapi | typescript_types | json_schema | zod | other>
      file: <path>
      tag: <[VERIFIED]>
  backward_compatibility_risks:
    - risk: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommendations_top3:
    - recommendation: <text>
      impact: <high | medium | low>
      effort: <S | M | L>
```

If endpoints cannot be mapped, describe what is missing and how to find them.

### 4.3 Constraints

- Read-only, evidence-bound, scope-bound.

## Done criteria

- Contracts narrative written.
- `ContractAudit` populated with all five fields.
- Top-3 recommendations listed.

## Outputs (handoff to step 5)

```yaml
ContractAudit: <JSON above>
contracts_narrative: <text>
endpoints_found: <copied>
request_response_shapes: <copied>
contract_sources: <copied>
backward_compatibility_risks: <copied>
recommendations_top3: <copied>
```

## Next

Proceed to `steps/05-dados-persistencia-migracoes.md`.
