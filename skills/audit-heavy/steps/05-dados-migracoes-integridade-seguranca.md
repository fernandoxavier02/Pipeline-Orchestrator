---
step_number: 5
step_name: "dados-migracoes-integridade-seguranca"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - ssot_map: from_step_3
  - ContractGovernanceAudit: from_step_4
expected_outputs:
  - DataGovernanceAudit: object
  - persistence_narrative: string
  - db_stack: object
  - schema_and_migrations: object
  - integrity_controls: list
  - access_controls_touchpoints: list
  - rollback_strategy_assessment: object
  - high_risk_migrations: list
expected_next: 6
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 05 — Data + Migrations + Integrity + Security

## Objective

Audit the data layer with rigor:

- Where the **schema** lives and how it **evolves** (migrations).
- **Integrity** controls (constraints, validations, defaults, referential integrity).
- **Access security** for the data layer (least privilege, parameterized queries, role separation).
- **Rollback feasibility** (reversible migrations, recovery strategy).

This is the layer where data corruption happens — and where audit findings carry the heaviest blast radius.

## Why subagent (audit-compliance-checker, first invocation)

This step runs in the `audit-compliance-checker` subagent (read-only, sonnet model, IRON LAW enforced). The agent specializes in data integrity + security pattern review. Produces a typed `DataGovernanceAudit` deliverable.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_1, pre_5, pre_9]`). The `sentinel-hook` validates that outputs from steps 1–4 are present and structured before this step runs. This is the mid-pipeline coherence check.

## Inputs

- `AuditIntake` (from step 1) — `stack_detected.databases` and `data_flow_guess`.
- `ssot_map` (from step 3) — to cross-check whether DB constraints align with declared domain SSOT.
- `ContractGovernanceAudit` (from step 4) — to cross-check whether contract validation matches DB constraint.

## Instructions

### 5.1 Persistence narrative

Describe in flowing text:

- Database technology in use (SQL flavor, NoSQL, key-value, search, blob).
- Schema definition location (ORM models, raw DDL, declarative schema files).
- Migration strategy (versioned migrations, auto-sync, manual ALTERs, drift risk).
- Risks observed (missing migrations, manual prod changes, no rollback path).

Cite file:line for each claim.

### 5.2 DataGovernanceAudit (typed JSON)

Produce the structured deliverable:

```yaml
DataGovernanceAudit:
  db_stack:
    technology: <text>
    version: <text or "not evidenced">
    orm_or_query_layer: <text>
    evidence:
      - file: <path>
        line: <int>
  schema_and_migrations:
    schema_location: <path or "scattered: <list>">
    migration_tool: <text or "none evidenced">
    migration_directory: <path>
    migration_count: <int>
    drift_risk: <low | medium | high>
    tag: <[VERIFIED] | [HYPOTHESIS]>
  integrity_controls:
    - control: <NOT NULL | UNIQUE | FK | CHECK | trigger | app-level validation>
      coverage: <full | partial | none>
      example_evidence: <file:line>
      tag: <[VERIFIED]>
  access_controls_touchpoints:
    - touchpoint: <text — connection string, role grant, RLS policy, parameterized query>
      file: <path>
      line: <int>
      severity_if_misconfigured: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  rollback_strategy_assessment:
    reversibility: <high | medium | low>
    backup_strategy: <text or "none evidenced">
    recovery_runbook: <path or "none evidenced">
    last_tested: <text or "not evidenced">
    tag: <[VERIFIED] | [HYPOTHESIS]>
  high_risk_migrations:
    - migration: <path>
      risk: <text — DROP COLUMN, ALTER type, large backfill, no down>
      severity: <low | medium | high>
      tag: <[VERIFIED]>
```

### 5.3 Cross-checks

- **vs SSOT (step 3)**: do DB constraints encode the domain invariants? Or are invariants only enforced at app level (and easily bypassed by direct SQL)?
- **vs Contracts (step 4)**: does request validation at the API match validation at the DB? Mismatches create silent failures.
- **vs Hotspots (step 1)**: any migration touching a hotspot file requires a high-severity flag.

## Done criteria

- Persistence narrative written.
- `DataGovernanceAudit` JSON populated with all six top-level fields.
- DB stack identified with evidence (or explicitly "no DB evidenced — stateless?").
- Migration strategy assessed with drift risk classified.
- Integrity controls cataloged with coverage assessment.
- Rollback feasibility classified (high / medium / low).
- High-risk migrations flagged (or explicit "none flagged").

## Outputs (handoff to step 6)

```yaml
DataGovernanceAudit: <full structured JSON above>
persistence_narrative: <text>
db_stack: <copied>
schema_and_migrations: <copied>
integrity_controls: <copied>
access_controls_touchpoints: <copied>
rollback_strategy_assessment: <copied>
high_risk_migrations: <copied>
```

## Next

Proceed to `steps/06-frontend-estado-acessibilidade-pwa.md`.
