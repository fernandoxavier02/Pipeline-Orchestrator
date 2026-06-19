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

# Step 05 — Execute Minimal Diff (behavior-preserving cross-module restructure)

## Objective

Apply the refactor steps from step 4 as the smallest possible diff, strictly inside the signed CHANGE_CONTRACT scope across the in-scope modules. No behavior change. No "while I'm here" improvements. The first file touch is authorized only because step 4 returned `LOCKED`.

## Inputs

- `change_contract` (from step 4) — must have `signed_off: true` and `scope_lock_decision: LOCKED`.
- `refactor_steps` (from step 4) — the behavior-preserving transformations to apply.

## Instructions

### 5.1 Scope-lock guard (before every Write/Edit)

Before touching any file, confirm it is in `change_contract.allowed_files` (or `allowed_new_files`) and within an in-scope module. Reading is free; writing outside the allowed set is forbidden and is a scope-lock violation — STOP and report rather than expand scope. This mirrors the SCOPE LOCK CHECK in `executor-implementer-task` and is what the diff-discipline reviewer verifies.

### 5.2 Apply the restructure steps

Apply each step from `refactor_steps`:
- **rename** — update the symbol and all in-scope references across modules; behavior identical.
- **extract** — pull a region into a named helper; call-site behavior unchanged.
- **inline** — fold a trivial indirection back; output unchanged.
- **move** — relocate code across the allowed modules; imports updated, behavior unchanged.
- **restructure internal data** — change a private representation while keeping the public surface identical.

Do NOT change public signatures, error codes, output formats, or side-effects — forbidden by the contract and would fail the step-6 IDENTICAL check and the step-8 adversarial review.

### 5.3 Keep it building between steps (where possible)

For a cross-module restructure, prefer an ordering that keeps the codebase compiling/importing between transformations, so a failure is attributable to the last step. This eases both the STOP RULE and the step-11 cold-checkout sweep.

### 5.4 Minimal-diff discipline

- Touch only the lines necessary for the restructure.
- Do NOT reformat unrelated code, reorder unrelated imports, or rename out-of-scope symbols.
- Any collateral improvement you notice goes into the step 10 notes as a SUGGESTION, not into this diff.

### 5.5 Confirm within scope

After editing, verify every touched file is within the contract and within an in-scope module, and that the diff contains no forbidden change. Set `within_scope: true` only if all hold.

## Done criteria

- All `refactor_steps` applied.
- Every touched file is within `change_contract.allowed_files` / `allowed_new_files` and an in-scope module.
- Diff contains no public-surface change.
- `within_scope: true`.

## Outputs (handoff to step 6)

```yaml
refactor_diff:
  summary: <what was restructured>
  files: [<file>, ...]
  modules: [<module>, ...]
files_touched: [<file>, ...]
within_scope: true
```

## Next

Proceed to `steps/06-characterization-rerun.md` (re-run the step-3 snapshot; require IDENTICAL).
