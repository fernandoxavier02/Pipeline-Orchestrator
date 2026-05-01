---
step_number: 6
step_name: "execute-minimal-diff"
execution_mode: inline
expected_inputs:
  - minimal_change_proposal: from_step_4
  - affected_files_and_scope: from_step_4
  - test_files_created: from_step_5
  - red_status_confirmed: from_step_5
expected_outputs:
  - fix_diff: object
  - before_after_behavior: list
  - invariants_preserved: list
  - persistence_guarantees_applied: object
  - revert_instructions: string
expected_next: 7
gate_required: false
allowed_tools: [Read, Edit, Write, Bash, Grep, Glob]
---

# Step 06 — Execute Minimal Diff

## Objective

Implement only the change authorized in step 4, with the smallest possible diff and full traceability. Make the FIX tests from step 5 turn GREEN.

## Hard preconditions (verify before proceeding)

- [ ] `red_status_confirmed: true` from step 5 (proof that fix tests FAIL today).
- [ ] Step 4 `gate_decision: approved`.

If either is missing → STOP. Do not implement.

## No-Invention rule (mandatory)

Reference: `.claude/rules/41-no-invention.md` (or project equivalent).

Before writing any change:
- All concrete values must be explicit (timeouts, retries, limits, batch sizes).
- Data paths must be defined (which DB? which collection? which index?).
- Billing / credit impacts must be specified if applicable.
- **If anything is missing → STOP and ask.** Do not invent values.

## Why inline

Implementation runs in main context for traceability and to keep `fix_diff` reportable to the next step.

## Inputs

- `minimal_change_proposal`, `affected_files_and_scope` (from step 4)
- `test_files_created`, `red_status_confirmed` (from step 5)

## Instructions

### 6.1 Implementation rules

- **Minimal diff.** Do NOT refactor, rename, or reorganize.
- Do NOT change unrelated style/UI, except strictly required for the approved change.
- Do NOT widen scope. If something new appears, STOP and report — re-enter the workflow at step 4 with an updated proposal.

### 6.2 TDD loop

- Apply just enough code to turn FIX tests GREEN.
- Add adjacent unit tests only when an invariant or edge case from step 3 is at material risk and not already covered by step 5 tests.
- If any test fails after a change, fix the change before proceeding.

### 6.3 Document the change

For the diff, explicitly capture:

- **Before/after behavior**: what changes from the user's / caller's perspective.
- **Invariants preserved**: list each invariant from step 3 and confirm the diff does not violate it.
- **Persistence guarantees applied**: how idempotency / atomicity / source of truth respect was implemented (when applicable).

### 6.4 Deliverables

- Per-file diff summary.
- Why the diff resolves the bug.
- How to revert (the literal commands or the commit SHA to revert).

## STOP RULE

Two consecutive failures to bring fix tests to GREEN trip the STOP RULE. The diff is reverted; the workflow re-enters at step 4 with revised proposal.

## Done criteria

- All FIX tests turned GREEN.
- All REGRESSION tests still GREEN.
- Diff is minimal (no scope creep beyond step 4 proposal).
- Before/after behavior documented; invariants preserved; persistence guarantees applied.
- Revert instructions captured.

## Outputs (handoff to step 7)

```yaml
fix_diff:
  files_changed: [<list>]
  total_lines_changed: <int>
  summary: <text>
before_after_behavior:
  - scenario: <text>
    before: <text>
    after: <text>
invariants_preserved:
  - invariant: <text>
    enforcement_in_diff: <file:line>
persistence_guarantees_applied:
  idempotency: <text or "n/a">
  atomicity: <text or "n/a">
  source_of_truth: <text or "n/a">
revert_instructions: <text or commit SHA>
```

## Next

Proceed to `steps/07-post-change-sanity-regression.md`.
