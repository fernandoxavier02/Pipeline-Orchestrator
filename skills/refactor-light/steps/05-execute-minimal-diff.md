---
step_number: 5
step_name: "execute-minimal-diff"
execution_mode: inline
expected_inputs:
  - change_contract: from_step_4
  - scope_lock_decision: from_step_4
  - refactor_steps: from_step_4
expected_outputs:
  - refactor_diff: object
  - files_touched: list
  - within_scope: boolean
expected_next: 6
gate_required: false
allowed_tools: [Read, Edit, Write, Grep, Bash]
---

# Step 05 — Execute Minimal Diff (behavior-preserving restructure)

## Objective

Apply the refactor steps from step 4 as the smallest possible diff, strictly inside the signed CHANGE_CONTRACT scope. No behavior change. No "while I'm here" improvements. The first file touch is authorized only because step 4 returned `LOCKED`.

## Inputs

- `change_contract` (from step 4) — must have `signed_off: true` and `scope_lock_decision: LOCKED`.
- `refactor_steps` (from step 4) — the behavior-preserving transformations to apply.

## Instructions

### 5.1 Scope-lock guard (before every Write/Edit)

Before touching any file, confirm it is in `change_contract.allowed_files` (or `allowed_new_files`). Reading is free; writing outside the allowed set is forbidden and is a scope-lock violation — STOP and report rather than expand scope. This mirrors the SCOPE LOCK CHECK in `executor-implementer-task` and is what the diff-discipline reviewer verifies.

### 5.2 Apply the restructure steps

Apply each step from `refactor_steps`:
- **rename** — update the symbol and all in-scope references; keep behavior identical.
- **extract** — pull a region into a named helper; call site behavior unchanged.
- **inline** — fold a trivial indirection back; output unchanged.
- **move** — relocate code within the allowed files; imports updated, behavior unchanged.
- **restructure internal data** — change a private representation while keeping the public surface identical.

Do NOT change public signatures, error codes, output formats, or side-effects — those are forbidden by the contract and would fail the step-6 IDENTICAL check anyway.

### 5.3 Minimal-diff discipline

- Touch only the lines necessary for the restructure.
- Do NOT reformat unrelated code, reorder unrelated imports, or rename out-of-scope symbols.
- Any collateral improvement you notice goes into the step 8 notes as a SUGGESTION, not into this diff.

### 5.4 Confirm within scope

After editing, verify every touched file is within the contract and that the diff contains no forbidden change. Set `within_scope: true` only if both hold.

## Done criteria

- All `refactor_steps` applied.
- Every touched file is within `change_contract.allowed_files` / `allowed_new_files`.
- Diff contains no public-surface change (no new API, no changed error codes/output/side-effects).
- `within_scope: true`.

## Outputs (handoff to step 6)

```yaml
refactor_diff:
  summary: <what was restructured>
  files: [<file>, ...]
files_touched: [<file>, ...]
within_scope: true
```

## Next

Proceed to `steps/06-characterization-rerun.md` (re-run the step-3 snapshot; require IDENTICAL).
