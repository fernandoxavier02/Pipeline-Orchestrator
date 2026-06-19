---
step_number: 6
step_name: "characterization-rerun"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:pre-tester"
mode: characterization
expected_inputs:
  - before_snapshot: from_step_3
  - test_command: from_step_3
  - characterization_test_files: from_step_3
  - refactor_diff: from_step_5
expected_outputs:
  - after_snapshot: object
  - status: "CHARACTERIZATION_CONFIRMED | DIVERGED"
  - identical_verdict: "IDENTICAL | DIVERGED"
  - diverged_details: list
expected_next: 7
gate_required: false
allowed_tools: [Bash, Read, Grep]
---

# Step 06 — Characterization Rerun (IDENTICAL / DIVERGED verdict)

## Objective

Re-run the EXACT characterization tests from step 3 against the restructured code and compare to the `before_snapshot`. Identical public-behavior results are the proof of behavior preservation — the whole point of a refactor. The verdict is binary: `IDENTICAL` (safe to proceed to the adversarial review) or `DIVERGED` (the restructure changed observable behavior — STOP).

## Why subagent (pre-tester, characterization mode, read-only)

The rerun is dispatched to `pipeline-orchestrator:quality:pre-tester` in **characterization mode** — the same agent (and the same contract) that authored the `before` snapshot in step 3. Pre-tester owns the characterization CONTRACT: it binds ONLY to the PUBLIC surface of the CHANGE_CONTRACT allowed-files, it must not weaken tests to fit the new implementation, and it emits a `CHARACTERIZATION_CONFIRMED` status with the `IDENTICAL` verdict when behavior is preserved (see `agents/quality/pre-tester.md` → "Characterization Mode"). A bare `general-purpose` agent guarantees none of that. The subagent does NOT modify production state — it produces the `after_snapshot` and the comparison.

## Inputs

- `before_snapshot`, `test_command`, `characterization_test_files` (from step 3) — the baseline and how to reproduce it.
- `refactor_diff` (from step 5) — what changed, for attributing any divergence.

## Instructions

### 6.1 Re-run the same characterization tests

Run the identical command from step 3 against the post-refactor code:

```bash
{test_command} [characterization-test-files]
```

Capture results as `after_snapshot` using the same shape as `before_snapshot`.

### 6.2 Compare before vs after (public surface only)

Compare `after_snapshot` to `before_snapshot`:
- Every public-surface test must have the SAME pass status and SAME compared values (outputs, error codes, output formats, side-effects), including the coupling-sensitive behaviors characterized in step 3.
- Internal coverage-only test changes are EXCLUDED — a refactor may legitimately move or rename internal tests. Only PUBLIC-behavior characterization tests bind to the IDENTICAL check (per the CHANGE_CONTRACT allowed-files public surface).

### 6.3 Verdict

Pre-tester (characterization mode) emits one of:

- **IDENTICAL** (status `CHARACTERIZATION_CONFIRMED`) — every public-behavior characterization test matches the before snapshot exactly. Behavior preserved; proceed to step 7.
- **DIVERGED** — at least one public-behavior result differs. The restructure changed observable behavior, which a refactor must not. Record `diverged_details` (which test, before vs after) and STOP. Two consecutive DIVERGED results trigger the STOP RULE. The fix is to return to step 5 and correct the restructure — NOT to edit the characterization tests to fit new behavior (`test_weakened_to_fit_implementation`).

## Done criteria

- Characterization tests re-run by pre-tester (characterization mode) with the same command/files as step 3.
- `after_snapshot` captured.
- Before vs after compared over the public surface only.
- pre-tester emitted `status: CHARACTERIZATION_CONFIRMED` with `identical_verdict: IDENTICAL` (or `DIVERGED` with details on any divergence).

## Outputs (handoff to step 7)

```yaml
status: <CHARACTERIZATION_CONFIRMED | DIVERGED>   # pre-tester characterization-mode status
after_snapshot:
  test_command: <command>
  results:
    - test: <name>
      status: PASS
      captured: <value/output/error-code>
identical_verdict: <IDENTICAL | DIVERGED>
diverged_details:
  - test: <name>
    before: <value>
    after: <value>
  # empty list when IDENTICAL (status CHARACTERIZATION_CONFIRMED)
```

## Next

If `IDENTICAL` → `steps/07-risk-consolidation.md`.
If `DIVERGED` → return to `steps/05-execute-minimal-diff.md` (correct the restructure; do NOT edit the tests). STOP RULE applies on repeat.
