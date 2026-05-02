---
step_number: 8
step_name: "governanca-testes-ci-cd-documentacao"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - DependencyImpactAudit: from_step_2
  - DataGovernanceAudit: from_step_5
  - BackendDeepAudit: from_step_7
expected_outputs:
  - DeliveryGovernanceAudit: object
  - governance_narrative: string
  - git_hygiene_guess: object
  - ci_cd_inventory: list
  - test_strategy_inventory: object
  - documentation_inventory: list
  - regression_controls: list
  - recommended_gates: list
expected_next: 9
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 08 — Governance + Tests + CI/CD + Documentation

## Objective

Audit governance and delivery quality:

- **Branch / commit hygiene** (traceability — can we link a deployed change to a discussion or ticket?).
- **CI/CD** (workflows, quality gates: lint / test / build / scan / deploy).
- **Test strategy** (unit / integration / E2E / property / load — and how to run them).
- **Living documentation** (DECISIONS, CHANGELOG, ADRs, runbooks).
- **Practices for reducing regression** (review checklists, mandatory reviewers, release gates).

This is the operational layer. Findings here drive the "minimum gates" recommendation in step 9.

## Why subagent (audit-compliance-checker, fourth invocation)

Same agent as steps 5, 6, 7, fresh context for the governance pass. Produces a typed `DeliveryGovernanceAudit` deliverable.

## Inputs

- `AuditIntake` (from step 1) — `scripts_and_environments`.
- `DependencyImpactAudit` (from step 2) — to identify which paths most need regression coverage.
- `DataGovernanceAudit` (from step 5) — migration testing strategy.
- `BackendDeepAudit` (from step 7) — observability and reliability test gaps.

## Instructions

### 8.1 Governance narrative

Describe in flowing text:

- Branch / commit conventions, mandatory reviewers, signed commits, traceability to issues.
- CI/CD inventory (workflows / jobs / gates / required checks).
- Test inventory (types, frameworks, run commands, coverage if measured).
- Documentation inventory (README, CONTRIBUTING, ADR, runbook, CHANGELOG, API docs).
- Regression-reduction practices (review checklists, code-owners, deploy windows, canary).

Cite file:line for each claim.

### 8.2 DeliveryGovernanceAudit (typed JSON)

Produce the structured deliverable:

```yaml
DeliveryGovernanceAudit:
  git_hygiene_guess:
    branch_strategy: <text or "not evidenced">
    commit_message_convention: <text or "not evidenced">
    code_owners: <true | false>
    pr_template: <true | false>
    tag: <[VERIFIED] | [HYPOTHESIS]>
  ci_cd_inventory:
    - workflow: <path>
      triggers: [<list>]
      jobs: [<list>]
      required_gates: [<list>]
      tag: <[VERIFIED]>
  test_strategy_inventory:
    unit:
      framework: <text or "none">
      file_count_evidenced: <int>
      example_path: <path or null>
    integration:
      framework: <text or "none">
      file_count_evidenced: <int>
      example_path: <path or null>
    e2e:
      framework: <text or "none">
      file_count_evidenced: <int>
      example_path: <path or null>
    property:
      framework: <text or "none">
      file_count_evidenced: <int>
    load:
      framework: <text or "none">
      file_count_evidenced: <int>
    coverage_measurement: <text or "none evidenced">
    how_to_run: <text — exact commands>
    tag: <[VERIFIED]>
  documentation_inventory:
    - doc: <name>
      file: <path>
      freshness: <fresh | stale | unknown>
      tag: <[VERIFIED]>
  regression_controls:
    - control: <text — review checklist, mandatory reviewers, code-owners, canary>
      coverage: <full | partial | none>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommended_gates:
    - gate: <text — required check or process step>
      rationale: <text>
      effort_estimate: <S | M | L>
      priority: <P0 | P1 | P2>
```

### 8.3 Cross-checks

- **vs Hotspots (step 1)**: are hotspot files protected by tests / mandatory reviewers / restrictive CODEOWNERS?
- **vs Cascade risk (step 2)**: paths flagged as cascade-risky should have integration or E2E tests; flag missing coverage.
- **vs Migrations (step 5)**: are migrations tested (reversibility, idempotency)?

## Done criteria

- Governance narrative written.
- `DeliveryGovernanceAudit` JSON populated with all seven top-level fields.
- CI/CD inventory present (or explicit "no CI evidenced").
- Test inventory broken down by tier (unit / integration / E2E / property / load).
- "How to run tests" command documented.
- Recommended minimum gates listed with priority.

## Outputs (handoff to step 9)

```yaml
DeliveryGovernanceAudit: <full structured JSON above>
governance_narrative: <text>
git_hygiene_guess: <copied>
ci_cd_inventory: <copied>
test_strategy_inventory: <copied>
documentation_inventory: <copied>
regression_controls: <copied>
recommended_gates: <copied>
```

## Next

Proceed to `steps/09-pa-de-cal-matriz-de-risco.md` — final GO/CONDITIONAL/NO-GO gate on the audit report.
