---
step_number: 2
step_name: "root-cause-consolidation"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer"
expected_inputs:
  - terrain_map: from_step_1
  - prioritized_hypotheses: from_step_1
  - verification_plan: from_step_1
expected_outputs:
  - primary_root_cause: string
  - alternative_hypotheses: list
  - confirmation_evidence: list
  - applicable_concepts: list
  - red_test_files: list
expected_next: 3
gate_required: false
allowed_tools: [Read, Grep, Glob, Task, Write]
---

# Step 02 — Root Cause Consolidation

## Objective

Force technical prioritization and objective confirmation criteria before any code change. Distill the prioritized hypotheses from step 1 into a single primary root cause hypothesis backed by evidence, plus the strongest alternatives. Author **multiple RED reproduction tests** (parallel/async/integration scenarios) so the bug is reproducible deterministically before we touch production code.

## Why subagent

The `bugfix-root-cause-analyzer` subagent is specialized in consolidating evidence across diverse hypotheses and authoring multiple reproduction tests. Keeps the main context clean.

## Inputs

- `terrain_map` (from step 1)
- `prioritized_hypotheses` (from step 1)
- `verification_plan` (from step 1)

## Instructions

### 2.1 Declare the primary root cause

Pick the single most likely hypothesis. State it plainly and concisely.

### 2.2 List alternative hypotheses

List 2–3 strongest alternatives and explain why each was ranked second (what evidence would promote it back to primary).

### 2.3 Confirmation evidence

Define the **objective evidence** that confirms the primary hypothesis: log lines, DB records, state values, API responses, metrics. Be specific (file:line, query, metric name).

### 2.4 Applicable concepts

Indicate which of these concepts are involved (and why):
- business rules
- source of truth
- persistence
- idempotency
- atomicity
- concurrency
- cache / eventual consistency
- UX feedback to the user

### 2.5 Verification order

Propose the most cost-efficient verification sequence (cheapest-first), without changing code.

### 2.6 RED reproduction tests (MANDATORY)

Once root cause is clear, author **multiple RED reproduction tests** covering:

- **Parallel/async scenarios** when the bug has timing or concurrency aspects.
- At least 1 **integration end-to-end test** when needed to surface the failure (DB/queue/network in scope).
- **Property-based tests** when invariants are involved (these belong in step 3, but flag candidates here).

All RED tests must FAIL with current code (proves the bug exists). Use descriptive names. Place them in `tests/repro/<bug-id>/` or project equivalent.

Reference: `tests/tests-bugfix-heavy.md` §1–2.

## Done criteria

- Single primary root cause stated.
- 2–3 alternative hypotheses ranked.
- Confirmation evidence is concrete and queryable.
- Applicable concepts checked.
- RED tests authored, FAILING with current code (status confirmed).

## Outputs (handoff to step 3)

```yaml
primary_root_cause: <one-sentence hypothesis>
alternative_hypotheses:
  - hypothesis: <text>
    why_secondary: <text>
confirmation_evidence:
  - <log/query/metric/state>
applicable_concepts:
  - <business_rules | source_of_truth | persistence | idempotency | atomicity | concurrency | cache | ux>
red_test_files:
  - <path>
```

## Next

Proceed to `steps/03-domain-truth-model.md`.
