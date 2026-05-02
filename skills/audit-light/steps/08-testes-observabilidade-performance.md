---
step_number: 8
step_name: "testes-observabilidade-performance"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - ArchitectureAudit: from_step_2
  - DataAudit: from_step_5
  - BackendAudit: from_step_7
expected_outputs:
  - quality_ops_narrative: string
  - QualityOpsAudit: object
  - test_inventory: object
  - how_to_run_tests: string
  - observability_inventory: object
  - pwa_cache_findings: object
  - performance_risks: list
  - recommendations_top3: list
expected_next: 9
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 08 — Tests + Observability + Performance (Light)

## Objective

Operational quality audit. Define inline:

- **Unit test** = "tests an isolated function".
- **Integration test** = "tests parts together".
- **E2E test** = "simulates a real user".
- **Observability** = "seeing inside via logs / metrics".
- **Cache / service worker (PWA)** = "a layer that may serve old content".

Evaluate what tests exist, how to run them, practical coverage, useful logs, metrics, and cache/performance risks.

## Why subagent (audit-compliance-checker)

Same agent as steps 5–7, fresh context.

## Inputs

- `AuditSnapshot` (from step 1)
- `ArchitectureAudit` (from step 2)
- `DataAudit` (from step 5)
- `BackendAudit` (from step 7)

## Instructions

### 8.1 Quality-ops narrative

Tests present, how to run, coverage observed, logs/metrics seen, cache/performance risks. Cite file:line.

### 8.2 QualityOpsAudit (typed JSON)

```yaml
QualityOpsAudit:
  test_inventory:
    unit: {count_evidenced: <int>, framework: <text or "none">}
    integration: {count_evidenced: <int>, framework: <text or "none">}
    e2e: {count_evidenced: <int>, framework: <text or "none">}
  how_to_run_tests: <text — exact commands or "not evidenced">
  observability_inventory:
    logs: <text or "none evidenced">
    metrics: <text or "none evidenced">
    correlation_ids: <true | false | "not evidenced">
  pwa_cache_findings:
    has_service_worker: <true | false | "n/a">
    cache_strategy: <text or "n/a">
    stale_content_risk: <low | medium | high | "n/a">
  performance_risks:
    - risk: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommendations_top3:
    - recommendation: <text>
      impact: <high | medium | low>
      effort: <S | M | L>
```

### 8.3 Constraints

- Read-only, evidence-bound, scope-bound.

## Done criteria

- Quality-ops narrative written.
- `QualityOpsAudit` populated with all six fields.
- "How to run tests" command captured (or explicit "not evidenced").
- Top-3 recommendations listed.

## Outputs (handoff to step 9)

```yaml
QualityOpsAudit: <JSON above>
quality_ops_narrative: <text>
test_inventory: <copied>
how_to_run_tests: <copied>
observability_inventory: <copied>
pwa_cache_findings: <copied>
performance_risks: <copied>
recommendations_top3: <copied>
```

## Next

Proceed to `steps/09-pa-de-cal-conclusao.md` — final GO/CONDITIONAL/NO-GO gate.
