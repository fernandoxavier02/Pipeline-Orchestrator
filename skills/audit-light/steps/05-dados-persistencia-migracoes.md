---
step_number: 5
step_name: "dados-persistencia-migracoes"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - DomainSSOTAudit: from_step_3
  - ContractAudit: from_step_4
expected_outputs:
  - data_narrative: string
  - DataAudit: object
  - db_tech_guess: string
  - schema_locations: list
  - migration_strategy: string
  - data_integrity_risks: list
  - rollback_feasibility: object
expected_next: 6
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 05 — Data + Persistence + Migrations (Light)

## Objective

Light data-layer audit. Define inline:

- **Schema** = "structure of the database (fields, types)".
- **Migration** = "versioned change to the schema".
- **Integrity** = "data is coherent and complete".

Locate where the schema lives, how migrations work, and whether there are risks (missing migrations, manual ALTERs, no rollback).

## Why subagent (audit-compliance-checker)

From step 5 onward, `light_mode` no longer applies — the compliance checker runs in its full pass for data, frontend, backend, governance.

## Inputs

- `AuditSnapshot` (from step 1)
- `DomainSSOTAudit` (from step 3)
- `ContractAudit` (from step 4)

## Instructions

### 5.1 Data narrative

Where does the schema live, how are migrations done, and what risks exist (drift, manual changes, no rollback). Cite file:line.

### 5.2 DataAudit (typed JSON)

```yaml
DataAudit:
  db_tech_guess: <text or "no DB evidenced">
  schema_locations: [<paths>]
  migration_strategy: <text>
  data_integrity_risks:
    - risk: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  rollback_feasibility:
    level: <high | medium | low>
    rationale: <text>
```

### 5.3 Constraints

- Read-only.
- If no DB is evidenced, declare "stateless or DB not in scope" with reason.

## Done criteria

- Data narrative written.
- `DataAudit` populated.
- Rollback feasibility classified.

## Outputs (handoff to step 6)

```yaml
DataAudit: <JSON above>
data_narrative: <text>
db_tech_guess: <copied>
schema_locations: <copied>
migration_strategy: <copied>
data_integrity_risks: <copied>
rollback_feasibility: <copied>
```

## Next

Proceed to `steps/06-frontend-qualidade-estado-ui.md`.
