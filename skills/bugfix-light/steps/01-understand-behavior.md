---
step_number: 1
step_name: "understand-behavior"
execution_mode: inline
expected_inputs:
  - bug_description: from_user
expected_outputs:
  - actual_behavior: string
  - expected_behavior: string
  - reproduction_steps: list
  - decision_points: list
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 01 — Understand Behavior (Light)

## Objective

Quickly understand what the affected feature does today, before any analysis or fix attempt. This step is read-only — no proposals, no code changes, no test creation yet.

## Inputs

- `bug_description` (from user $ARGUMENTS): free-form description of the bug, ideally including reproduction steps and observed vs expected behavior.

## Instructions

Using the bug description and codebase exploration tools (`Read`, `Grep`, `Glob`), answer the following questions about the affected feature:

1. **What does the feature do today?** Describe the current behavior in plain language, grounded in the actual code (cite file:line references).
2. **Under which conditions does it act?** What inputs / states / triggers cause it to run.
3. **Under which conditions does it NOT act?** What guards / early-returns / preconditions prevent execution.
4. **Where are the most relevant decision points in the flow?** Branches (if/switch/match), polymorphic dispatch, configuration toggles.

Do NOT propose improvements. Do NOT write tests yet. Do NOT change code.

The objective is purely understanding. If the bug description is ambiguous, use AskUserQuestion to disambiguate the actual vs expected behavior before proceeding (this is a Non-Invention guard — see `.claude/rules/41-no-invention.md` if present).

## Done criteria

- Actual behavior described in 2-5 sentences with file:line citations.
- Expected behavior described in 1-3 sentences (from user description).
- Reproduction steps enumerated (if not already in the bug description).
- 1-5 key decision points in the flow listed.

## Outputs (handoff to step 2)

```yaml
actual_behavior: <description grounded in code>
expected_behavior: <description from user / domain knowledge>
reproduction_steps:
  - <step 1>
  - <step 2>
  - ...
decision_points:
  - <file:line — what is decided>
  - ...
```

## Next

Proceed to `steps/02-simple-bug-analysis.md` (RED test creation + cause hypothesis).
