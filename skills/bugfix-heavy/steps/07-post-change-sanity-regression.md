---
step_number: 7
step_name: "post-change-sanity-regression"
execution_mode: subagent
agent_type: "general-purpose"
expected_inputs:
  - fix_diff: from_step_6
  - test_files_created: from_step_5
  - invariants_preserved: from_step_6
  - persistence_guarantees_applied: from_step_6
expected_outputs:
  - correction_evidence: list
  - regression_check_results: list
  - consistency_check: object
  - idempotency_check: object
  - atomicity_check: object
  - residual_risks_and_monitoring: list
  - all_tests_status: "PASSING | FAILING"
expected_next: 8
gate_required: false
allowed_tools: [Bash, Read, Grep, Task]
---

# Step 07 — Post-Change Sanity + Regression

## Objective

Confirm with evidence that the original problem is resolved and detect regressions, silent failures, or cross-layer inconsistencies. The full test suite from step 5 (RED→GREEN, regression, edge, property, transactional consistency) MUST run; all results reported.

## Why subagent (general-purpose, Bash heavy)

This step runs many test commands and aggregates results. The `general-purpose` subagent runs Bash extensively and reports back compact PASS/FAIL summaries to keep main context clean.

## Inputs

- `fix_diff` (from step 6)
- `test_files_created` (from step 5)
- `invariants_preserved`, `persistence_guarantees_applied` (from step 6)

## Instructions

### 7.1 Confirm correction with evidence

For each of the FIX contracts from step 5, capture the evidence that proves the bug is gone: test name + status + key log line / DB query / metric / observable behavior.

### 7.2 Regression check

Verify likely-affected adjacent flows are still healthy:
- Run pre-existing tests on the modified files.
- Run the REGRESSION contracts from step 5.
- Inspect 1–2 adjacent flows manually if test coverage is thin.

### 7.3 Cross-layer consistency

Validate consistency across:
- source of truth (per step 3)
- persistence
- cache
- UI

The frontend must read from the same source the backend writes. Cache TTLs / invalidation must align with write events. UI states must reflect actual state, not stale snapshots.

### 7.4 Idempotency check (when applicable)

Re-execute the fixed scenario:
- double-click / double-submit
- automatic retry
- duplicate scheduled job
- reprocessing

Confirm the system stays consistent across repeated executions.

### 7.5 Atomicity check (when applicable)

Inject failure mid-operation. Confirm:
- the system stays consistent (no orphan rows / half-updated docs).
- no intermediate state leaks to the user.
- transactional consistency tests from step 3 still PASS.

### 7.6 Run the full relevant test suite

Run reproduction-promoted-to-regression tests, new unit tests, integration tests, concurrency tests (if applicable), performance tests (if applicable), and any relevant E2E.

If any test fails: STOP, revert/fix with minimal diff, re-run. Two consecutive failures here trip the STOP RULE.

### 7.7 Residual risks + monitoring

List residual risks and recommend observability hooks:
- logs (with correlation IDs: userId, requestId, jobRunId)
- metrics (error rate, throughput, latency)
- alerts (what to monitor in the first 24–72h)

## Done criteria

- All FIX, REGRESSION, EDGE, property, and transactional consistency tests PASS.
- Correction evidence captured per FIX contract.
- Cross-layer consistency verified.
- Idempotency + atomicity checks executed (or marked N/A with justification).
- Residual risks + observability hooks listed.

## Outputs (handoff to step 8)

```yaml
correction_evidence:
  - contract: <text>
    evidence: <test name + log/metric>
regression_check_results:
  - flow: <text>
    status: PASS|FAIL
consistency_check:
  source_of_truth_aligned: true|false
  cache_aligned: true|false
  ui_aligned: true|false
idempotency_check:
  applicable: true|false
  result: PASS|FAIL|n/a
atomicity_check:
  applicable: true|false
  result: PASS|FAIL|n/a
residual_risks_and_monitoring:
  - risk: <text>
    monitor: <log/metric/alert>
all_tests_status: "PASSING"
```

## Next

Proceed to `steps/08-adversarial-ux-tech-review.md` — the second user-facing gate (3 parallel adversarial subagents).
