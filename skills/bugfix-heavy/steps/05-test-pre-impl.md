---
step_number: 5
step_name: "test-pre-impl"
execution_mode: inline
expected_inputs:
  - minimal_change_proposal: from_step_4
  - affected_files_and_scope: from_step_4
  - invariants: from_step_3
  - property_tests: from_step_3
  - transactional_consistency_tests: from_step_3
  - red_test_files: from_step_2
expected_outputs:
  - test_files_created: list
  - fix_contracts: list
  - regression_contracts: list
  - edge_case_contracts: list
  - red_status_confirmed: boolean
  - regression_green_status_confirmed: boolean
expected_next: 6
gate_required: false
allowed_tools: [Read, Grep, Glob, Write, Bash]
---

# Step 05 — Test Pre-Implementation (TDD before fix)

## Objective

Author the full test harness BEFORE implementing the fix. The harness has three flavors of contract:

- **FIX contracts** — encode the correct behavior. MUST FAIL with current code (RED).
- **REGRESSION contracts** — adjacent flows that must keep working. MUST PASS with current code (GREEN).
- **EDGE-CASE contracts** — boundary inputs / failure modes that must be handled defensively.

The invariant property tests and transactional consistency tests defined in step 3 are instantiated here. The RED tests authored in step 2 are integrated as fix contracts.

## Why inline

Test authoring requires precise context (proposal + invariants + existing tests). Inline keeps the chain visible and avoids context loss across subagent boundaries.

## Inputs

- `minimal_change_proposal`, `affected_files_and_scope` (from step 4)
- `invariants`, `property_tests`, `transactional_consistency_tests` (from step 3)
- `red_test_files` (from step 2)

## Instructions

### 5.1 Pre-tester check (TDD v3.0)

Before authoring anything new, check whether a Pre-Tester subagent already created tests:

```bash
ls -la <project tests dir>/*bugfix*.test.* 2>/dev/null
ls -la <project tests dir>/*regression*.test.* 2>/dev/null
grep -r "Pre-Tester\|PRE_TESTER_RESULT" <project tests dir>/ 2>/dev/null
```

If existing tests cover the contracts below, USE THEM and only fill gaps. Otherwise author from scratch.

### 5.2 Behaviors to protect (from step 4)

Build a table:

| Scenario | Bugged behavior (current) | Correct behavior (after fix) |
|----------|---------------------------|------------------------------|
| <scenario 1> | <current> | <expected> |

Then list **adjacent flows that must not break**:
- <flow 1>
- <flow 2>

### 5.3 Behavior contracts

Author contracts in GIVEN/WHEN/THEN form:

**FIX contract:**
```
GIVEN <bug context>
WHEN <action that triggers bug>
THEN <correct behavior expected>
```

**REGRESSION contract:**
```
GIVEN <adjacent context>
WHEN <normal action>
THEN <existing behavior must remain intact>
```

**EDGE contract:**
```
GIVEN <boundary condition>
WHEN <action>
THEN <defensive behavior>
```

Mandatory minimum: ≥1 FIX, ≥2 REGRESSION, ≥1 EDGE. Property tests + transactional consistency tests from step 3 count toward this minimum.

### 5.4 Test files

For each contract, author or update tests:

- FIX tests must FAIL with current code (RED).
- REGRESSION tests must PASS with current code (GREEN).
- Use `it.skip` or `it.todo` where the contract depends on the not-yet-applied fix.
- Place property tests using the project's framework (Hypothesis, fast-check, jqwik, Kotest Property, QuickCheck, etc.).
- Place transactional consistency tests in the integration tier with explicit failure injection.

Layout: `tests/bugfixes/heavy/<bug-id>/{unit,integration,concurrency}/` (or project equivalent).

### 5.5 Validation checklist

| Criterion | Answer |
|-----------|--------|
| Fix tests FAIL with current code? | YES/NO |
| Regression tests PASS with current code? | YES/NO |
| A QA can read the tests and understand what is being protected? | YES/NO |
| If the fix is reverted later, fix tests fail again? | YES/NO |

All four MUST be YES before proceeding.

### 5.6 STOP RULE

Two consecutive failures to confirm RED+GREEN status here trip the STOP RULE.

## Done criteria

- All test files created (or pre-existing ones reused) with FIX, REGRESSION, EDGE contracts.
- RED status confirmed by running fix tests against current code.
- GREEN status confirmed by running regression tests against current code.
- Property tests + transactional consistency tests from step 3 instantiated.

## Outputs (handoff to step 6)

```yaml
test_files_created:
  - <path>
fix_contracts: [<list>]
regression_contracts: [<list>]
edge_case_contracts: [<list>]
red_status_confirmed: true
regression_green_status_confirmed: true
```

## Next

Proceed to `steps/06-execute-minimal-diff.md`.
