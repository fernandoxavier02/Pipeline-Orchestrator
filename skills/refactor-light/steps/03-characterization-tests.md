---
step_number: 3
step_name: "characterization-tests"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:pre-tester"
expected_inputs:
  - public_surface: from_step_1
  - invariants_to_preserve: from_step_2
  - regression_risk: from_step_2
expected_outputs:
  - characterization_test_files: list
  - before_snapshot: object
  - characterization_status: "CHARACTERIZATION_CONFIRMED | ALREADY_DIVERGENT | ERROR"
  - test_command: string
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Bash]
---

# Step 03 — Characterization Tests (capture current behavior — MUST PASS)

## Objective

Capture the CURRENT public behavior of the target surface as automated tests that **PASS against the code as it exists today**, before any restructure. This `before` snapshot is the baseline that step 6 re-runs and requires to be IDENTICAL. This is the explicit inverse of a RED test: nothing is broken, so the tests must pass — they characterize, they do not drive new behavior.

## Why subagent (pre-tester in characterization mode)

This step dispatches `pre-tester` in its documented **characterization mode** (see `agents/quality/pre-tester.md` → "Characterization Mode"). That mode is a thin prompt delta over pre-tester's default RED-phase contract: instead of authoring tests that MUST FAIL, it authors tests that capture current behavior and MUST PASS. The flip is one expectation and nothing else — no new agent file exists; dispatch-guard whitelists `pre-tester` for this step.

The agent runs in a subagent to keep the main context clean and to run the Bash-heavy test commands compactly.

## Inputs

- `public_surface` (from step 1) — the exported names/signatures/error codes/output formats/side-effects to characterize.
- `invariants_to_preserve` (from step 2) — assertions to bake into the snapshot.
- `regression_risk` (from step 2) — informs how many edge cases to capture.

## Instructions

### 3.1 Brief the pre-tester for characterization mode

Pass the public surface + invariants and instruct: **mode = characterization**. The tests must:
- Bind ONLY to the PUBLIC surface (the CHANGE_CONTRACT allowed-files public behavior). Internal coverage-only tests are out of scope — a restructure may legitimately move or rename internal tests, so they are excluded from the IDENTICAL check.
- Assert the observed current outputs / error codes / output formats / side-effects for representative inputs, including the invariants from step 2 and the edge cases proportional to `regression_risk`.
- PASS against the current code. If a characterization test FAILS on current code, that is `WRONG` — the test mischaracterizes; fix the test, do not "fix" the code.

### 3.2 Run and verify GREEN (characterization is the inverse of RED)

Execute the characterization tests against the unmodified code:

```bash
{test_command} [characterization-test-files]
```

They MUST PASS. Record the exact results as `before_snapshot` (test names + pass status + any captured values that the IDENTICAL check will compare). If a test does NOT pass against current code, STOP — the snapshot is invalid; correct the test so it faithfully reflects today's behavior, then re-run.

### 3.3 Record the before snapshot

`before_snapshot` is the authoritative baseline. It must be reproducible (same test command, same files) so step 6 can produce an `after_snapshot` and compare for IDENTICAL.

## Done criteria

- Characterization tests authored over the PUBLIC surface only.
- All characterization tests PASS against current code (`CHARACTERIZATION_CONFIRMED`).
- `before_snapshot` recorded (test names + pass status + compared values).
- `test_command` captured for reuse in step 6.

## Outputs (handoff to step 4)

```yaml
characterization_test_files:
  - <path>
before_snapshot:
  test_command: <command>
  results:
    - test: <name>
      status: PASS
      captured: <value/output/error-code if compared>
characterization_status: CHARACTERIZATION_CONFIRMED
test_command: <command to re-run in step 6>
```

## Next

Proceed to `steps/04-refactor-plan-scope-lock.md` (the REFACTOR_SCOPE_LOCK gate — fires before the first file touch).
