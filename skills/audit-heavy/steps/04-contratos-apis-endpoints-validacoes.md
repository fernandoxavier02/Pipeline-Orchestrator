---
step_number: 4
step_name: "contratos-apis-endpoints-validacoes"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-domain-analyzer"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - DecisionSSOTAudit: from_step_3
  - ssot_map: from_step_3
expected_outputs:
  - ContractGovernanceAudit: object
  - contracts_narrative: string
  - endpoints_inventory: list
  - contract_sources: list
  - validation_points: list
  - backward_compatibility_assessment: object
  - contract_risks_top: list
  - recommended_contract_strategy: object
expected_next: 5
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 04 — Contracts + APIs + Endpoints + Validations

## Objective

Audit the contract layer — the formal agreement between caller and callee (HTTP endpoints, GraphQL schemas, gRPC, message-bus payloads, CLI argument shapes). Apply four concepts explicitly:

- **Endpoint** = the server's address (URL + verb + auth scheme).
- **Contract** = the agreed shape of request/response (types, schema, validation).
- **Backward compatibility** = old clients keep working when the contract evolves.
- **Breaking change** = a change that breaks compatibility (rename, remove field, type narrowing, required→optional flip on the wrong side).

The contract layer is where SSOT (from step 3) meets the outside world. Inconsistencies here surface as integration bugs.

## Why subagent (audit-domain-analyzer, third invocation)

Same agent as steps 2 and 3, fresh context for the contract pass. Produces a typed `ContractGovernanceAudit` deliverable.

## Inputs

- `AuditIntake` (from step 1) — `entry_points` lists API/event/CLI surfaces.
- `DecisionSSOTAudit` (from step 3) — `ssot_map` to verify whether contracts respect the authoritative source.
- `ssot_map` (from step 3) — for cross-reference.

## Instructions

### 4.1 Contracts narrative

Describe in flowing text:

- Where contracts are **defined** (types/DTO/schema/OpenAPI/JSON Schema/Protobuf/Avro/Zod/Yup).
- How contracts are **validated** at runtime (entry validation, response validation, both).
- Where the frontend/clients **consume** the contracts (typed clients, hand-written fetch, codegen).
- Whether there is a **single source of truth** for the contract or multiple parallel definitions that may drift.

Cite file:line for each claim.

### 4.2 ContractGovernanceAudit (typed JSON)

Produce the structured deliverable:

```yaml
ContractGovernanceAudit:
  endpoints_inventory:
    - method: <GET | POST | PUT | DELETE | PATCH | EVENT | CLI>
      path: <path or topic>
      auth: <text or "none evidenced">
      file: <path>
      line: <int>
      tag: <[VERIFIED]>
  contract_sources:
    - source_type: <openapi | graphql | typescript_types | json_schema | protobuf | zod | yup | other>
      file: <path>
      covers: [<endpoint references>]
      tag: <[VERIFIED]>
  validation_points:
    - point: <"request entry" | "response exit" | "boundary middleware" | "model layer">
      mechanism: <library/lib + how>
      file: <path>
      line: <int>
      coverage: <full | partial | none>
      tag: <[VERIFIED]>
  backward_compatibility_assessment:
    versioning_strategy: <text or "none evidenced">
    deprecation_pattern: <text or "none evidenced">
    detected_breaking_changes:
      - change: <text>
        file: <path>
        line: <int>
        severity: <low | medium | high>
    tag: <[VERIFIED] | [HYPOTHESIS]>
  contract_risks_top:
    - risk: <text>
      affected_endpoints: [<list>]
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommended_contract_strategy:
    ssot_candidate: <text — which source should be authoritative>
    enforcement_mechanism: <text — how to keep parallel sources in sync>
    rationale: <text>
```

### 4.3 Cross-check vs SSOT (from step 3)

For every state concept identified in step 3's `ssot_map`, verify whether the contract layer respects it:

- Does the API expose data from the SSOT, or from a duplicate that may drift?
- Does the validation at the contract layer match the validation at the domain layer?
- Are constraints declared at contract entry consistent with constraints declared at the database?

Findings here feed step 5 (data) and step 9 (Pa de Cal risk matrix).

## Done criteria

- Contracts narrative written.
- `ContractGovernanceAudit` JSON populated with all six top-level fields.
- ≥1 endpoint cataloged per evidenced API surface.
- Versioning / deprecation strategy explicitly stated (or "none evidenced").
- Top contract risks listed with severity.
- Recommended contract strategy proposed with SSOT candidate.

## Outputs (handoff to step 5)

```yaml
ContractGovernanceAudit: <full structured JSON above>
contracts_narrative: <text>
endpoints_inventory: <copied>
contract_sources: <copied>
validation_points: <copied>
backward_compatibility_assessment: <copied>
contract_risks_top: <copied>
recommended_contract_strategy: <copied>
```

## Next

Proceed to `steps/05-dados-migracoes-integridade-seguranca.md`.
