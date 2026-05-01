---
step_number: 5
step_name: "post-fix-validation"
execution_mode: subagent
agent_type: "general-purpose"
expected_inputs:
  - red_test_file: from_step_2
  - fix_diff: from_step_4
  - invariants: from_step_3
  - additional_unit_tests_added: from_step_4
expected_outputs:
  - all_tests_status: "PASSING | FAILING"
  - regression_test_path: path
  - residual_risks: list
  - promotion_commit_sha: string
expected_next: 6
gate_required: false
allowed_tools: [Bash, Read, Grep]
---

# Step 05 — Post-Fix Validation + RED→Regression Promotion — GAP CLOSED

## Objective

Confirm the fix resolved the bug without introducing new risk, AND **promote the RED reproduction test to a permanent regression test in the suite**. The promotion is the explicit gap closure for Light 5 from spec §21.1.

## Why subagent

This step runs in a `general-purpose` subagent to keep the main agent's context clean. The subagent runs Bash-heavy test commands and reports back compact results.

## Inputs

- `red_test_file` (from step 2)
- `fix_diff` (from step 4)
- `invariants` (from step 3)
- `additional_unit_tests_added` (from step 4)

## Instructions

### 5.1 Run the full relevant test slice

Execute:
- The RED test from step 2 (must PASS now, was previously FAILING).
- Any adjacent unit tests added in step 4.
- Any pre-existing tests on the modified files (regression scope).

```bash
# Example commands; adapt to project conventions
npm test -- <red_test_file>
npm test -- <other test paths>
```

If anything fails, STOP. Do NOT proceed. Adjust the fix (back to step 4 with minimal diff) and re-run. Two consecutive failures here trigger the STOP RULE (`stop_rule_max_failures: 2`).

### 5.2 PROMOTION ACTION (mandatory — gap closure)

This is the explicit RED→regression promotion required by spec §21.1 (Light 5 gap). The RED test from step 2 must move from "reproduction artifact" to "permanent regression test."

Steps (deterministic):

1. **Verify the RED test passes** under the fix.
2. **Move/rename the test file** from its repro location to the regression suite location:
   - `tests/repro/<bug-id>_test.<ext>` → `tests/regression/<bug-id>_regression_test.<ext>` (or per project convention, e.g. `tests/bugfixes/light/`).
3. **Add a header comment** to the promoted test marking it as a regression for this bug, with a brief description of the bug being protected against. Example:
   ```
   // Regression test for bug <BUG-ID>: <one-line description>.
   // Promoted from reproduction repro on <date> after fix in <fix_diff files>.
   // DO NOT REMOVE without team review.
   ```
4. **Commit with the canonical message**:
   ```bash
   git add <new regression path> <old repro path if rename>
   git commit -m "test(regression): promote bug-<BUG-ID> repro to regression suite

   Promotes the RED reproduction test from step 2 to a permanent regression
   test guarding against re-introduction of the bug fixed in step 4.

   Files: <regression path>
   Fix commit: <fix commit sha or fix_diff list>"
   ```
5. **Capture the resulting commit SHA** as `promotion_commit_sha` for downstream audit.

If the project does not have a `tests/regression/` convention, use the closest equivalent (e.g., placing the test alongside related unit tests with a `_regression` suffix). The KEY action is that the test is preserved in the suite as a regression, not deleted, not orphaned.

### 5.3 Residual risk assessment

Briefly note any residual concerns:
- Adjacent behavior that may still be subtly affected.
- Rare paths not covered by tests.
- Operational risks (rollout, monitoring).

If a residual risk is non-trivial, record it — step 7 may use it to escalate to bugfix-heavy.

## Done criteria

- All tests in the relevant slice PASS.
- The RED test was promoted to the regression suite (file moved/renamed, header comment added, regression commit made with canonical message).
- `promotion_commit_sha` captured.
- Residual risks listed (or "none").

## Outputs (handoff to step 6)

```yaml
all_tests_status: "PASSING"
regression_test_path: <new regression test path>
residual_risks:
  - <risk 1 or "none">
promotion_commit_sha: <sha>
```

## Why this step matters (gap closure rationale)

Plugin v4.3.1 had a partial gap (Light 5 🟡 PARCIAL): post-fix validation existed conceptually but the promotion of the RED reproduction test to a permanent regression was not modeled as a deterministic action. Bugs were thus prone to recurrence because the RED test was sometimes deleted or left orphaned in repro folders, never running in CI. By baking the promotion + regression commit into this step, the regression is deterministically protected.

## Next

Proceed to `steps/06-persistence-quick-check.md` (state stability check).
