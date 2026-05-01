---
step_number: 2
step_name: "simple-bug-analysis"
execution_mode: inline
expected_inputs:
  - actual_behavior: from_step_1
  - expected_behavior: from_step_1
  - reproduction_steps: from_step_1
expected_outputs:
  - probable_cause_hypothesis: string
  - red_test_file: path
  - red_test_status: "FAILING (confirmed reproduces bug)"
  - risk_signals: list
expected_next: 3
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Step 02 — Simple Bug Analysis + RED Test (Light)

## Objective

Identify the probable cause of the bug AND create a deterministic reproduction test that fails (RED). Do not change production code yet — only create the failing test.

## Inputs

- `actual_behavior` (from step 1)
- `expected_behavior` (from step 1)
- `reproduction_steps` (from step 1)

## Instructions

### 2.1 Pre-Tester check (TDD v3.0 integration)

Before creating any test, verify whether a Pre-Tester (or analogous role) already authored regression / bugfix tests. Search common test directories:

```bash
ls -la tests/__tests__/*regression*.test.* 2>/dev/null
ls -la tests/__tests__/*bugfix*.test.* 2>/dev/null
grep -r "Pre-Tester\|PRE_TESTER" tests/ 2>/dev/null
```

If existing tests cover this scenario, REUSE them — do NOT duplicate. Run them and confirm they FAIL (RED) under the current bug. Skip to 2.3.

If no existing tests, proceed to 2.2.

### 2.2 Create the RED test

Author a deterministic test that reproduces the bug. The test MUST:

- Fail right now (RED) — the assertion captures the wrong observed behavior versus the expected behavior.
- Be isolated — use mocks/stubs to avoid network/DB unless the bug REQUIRES integration.
- Use a descriptive name (`shouldReturnX_whenY` / `deve...quando...`).
- Live in a clearly labeled location (e.g., `tests/repro/<bug-id>_test.<ext>` or project convention).

Run the test once and confirm it fails with the expected assertion error.

### 2.3 Cause hypothesis (analysis only)

Analyze briefly:
- Where in the flow may divergence be happening?
- Is it a simple logic issue (wrong condition, off-by-one, stale state)?
- Or does it touch business rules, persistence, concurrency, multi-user behavior?

Do NOT change production code yet. The fix lives in step 4. The point of step 2 is reproduction + hypothesis.

If risk signals appear (business rules / persistence / concurrency), record them — they will trigger escalation logic in step 7.

## Done criteria

- RED test file exists at a known path.
- RED test was executed and confirmed FAILING with the expected assertion.
- A 1-3 sentence probable-cause hypothesis is recorded.
- Risk signals (if any) listed.

## Outputs (handoff to step 3)

```yaml
probable_cause_hypothesis: <1-3 sentences>
red_test_file: <path>
red_test_status: "FAILING (confirmed reproduces bug)"
risk_signals:
  - <e.g. "touches persistence in module X">
  - <or empty list>
```

## Next

Proceed to `steps/03-impact-check.md` (invariants enumeration BEFORE any fix).
