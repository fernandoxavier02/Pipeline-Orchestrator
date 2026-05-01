---
step_number: 4
step_name: "point-fix"
execution_mode: inline
expected_inputs:
  - probable_cause_hypothesis: from_step_2
  - red_test_file: from_step_2
  - invariants: from_step_3
  - edge_cases: from_step_3
expected_outputs:
  - fix_diff: file_paths
  - red_test_status: "PASSING (GREEN)"
  - additional_unit_tests_added: list
  - before_after_explanation: string
expected_next: 5
gate_required: false
allowed_tools: [Read, Edit, Write, Bash, Grep]
---

# Step 04 — Point Fix (TDD GREEN, minimal diff)

## Objective

Apply the smallest possible localized change that turns the RED test from step 2 into GREEN, without altering unrelated behavior.

## Constraints (light-tier hard limits)

- At most **2 files modified**.
- At most **~50 lines of diff** total.
- No refactor. No file reorganization. No "while I'm here" cleanups.
- Do NOT alter behavior unrelated to the bug.

If you find yourself wanting to exceed these limits, STOP and let step 7 (Complexity Gate) escalate the work to bugfix-heavy.

## Non-Invention guard (mandatory)

Even on a light fix, **STOP and ask the user** (via AskUserQuestion) if any of these hold:

- The intended correct behavior is not 100% clear.
- The fix touches billing / credits / financial values / security-sensitive paths.
- There are multiple valid ways to fix the bug with materially different trade-offs.

Reference: `.claude/rules/41-no-invention.md` (if present in the project).

## Inputs

- `probable_cause_hypothesis` (from step 2)
- `red_test_file` (from step 2)
- `invariants` (from step 3) — the fix MUST NOT violate any of these
- `edge_cases` (from step 3)

## Instructions

### 4.1 Apply the minimal diff

Edit the smallest code surface that addresses `probable_cause_hypothesis`. Use `Edit` for in-place changes; `Write` only if creating a tiny helper is cleaner than inlining (rare for light bugs).

### 4.2 Run the RED test → confirm GREEN

```bash
# Project-specific test runner; example:
npm test -- <red_test_file>
```

The RED test from step 2 MUST now PASS. If it does not, the fix is wrong — adjust and re-run. Do NOT skip ahead.

### 4.3 Add adjacent unit tests (only if needed)

Add unit tests ONLY for invariants / edge cases from step 3 that:
- Are at risk from this specific fix, AND
- Are not already covered by the RED test.

Do not add speculative tests. YAGNI applies.

### 4.4 Before/After explanation

Write a concise before/after note:
- Before: `<what the code did>` → caused `<observed behavior>`.
- After: `<what the code does now>` → produces `<expected behavior>`.
- Why this is the minimal change: `<1 sentence>`.

## Done criteria

- ≤2 files modified, ≤~50 lines diff.
- RED test (from step 2) now PASSES.
- Any adjacent invariant/edge tests pass.
- Before/after note written.

## Outputs (handoff to step 5)

```yaml
fix_diff:
  - <file path 1>
  - <file path 2 if any>
red_test_status: "PASSING (GREEN)"
additional_unit_tests_added:
  - <path>
  - ...
before_after_explanation: <1-3 sentences>
```

## Next

Proceed to `steps/05-post-fix-validation.md` (validation suite + RED→regression promotion).
