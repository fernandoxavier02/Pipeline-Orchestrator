---
step_number: 3
step_name: "impact-check"
execution_mode: inline
expected_inputs:
  - probable_cause_hypothesis: from_step_2
  - red_test_file: from_step_2
  - risk_signals: from_step_2
expected_outputs:
  - invariants: list
  - edge_cases: list
  - implicit_dependencies: list
  - regression_risk: "low | medium | high"
  - cascade_assessment: string
expected_next: 4
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Step 03 — Impact Check (Invariants BEFORE Fix) — GAP CLOSED

## Objective

Before any code change, **enumerate the invariants and edge cases** that the upcoming fix MUST preserve. This is the explicit gap closure for Light 3 from spec §21.1: invariants must be defined BEFORE altering code, not afterwards.

## Inputs

- `probable_cause_hypothesis` (from step 2)
- `red_test_file` (from step 2)
- `risk_signals` (from step 2)

## Instructions

### 3.1 Map the impact surface

Using `Grep` and `Read`, identify:

- What can be impacted by changing the suspected location?
- Are there implicit dependencies (callers, shared state, config, fixtures)?
- Is the same behavior reused in other flows? Where?
- Does the suspected change risk altering coupling or producing cascade effects?

Cite findings as `file:line — observation`.

### 3.2 REQUIRED OUTPUT — invariants list (mandatory, fail-closed)

You MUST produce an explicit list of **domain invariants** — rules that the fix CANNOT violate. The next step (point fix) will not begin until this list exists. Examples of invariants:

- "User balance MUST NEVER go negative."
- "An order ID MUST be unique (no duplicate insertion)."
- "A persisted record MUST never have null primary key."
- "Idempotent retry MUST not double-charge the customer."

For each invariant, briefly note:
- The invariant statement (one sentence, declarative).
- Why it matters (1-line consequence of violation).
- Whether the RED test from step 2 already covers it (yes/no).

If an invariant is NOT covered by the RED test and is at risk from the suspected fix, mark it for adjacent test coverage in step 4.

### 3.3 REQUIRED OUTPUT — edge cases / boundaries

Enumerate boundary conditions the fix MUST handle correctly:

- Null / empty / undefined inputs.
- Numeric extremes (0, negative, max int, NaN, Infinity).
- Empty collections / single-element collections.
- Timezone / locale edge cases (if temporal).
- Race conditions / re-entrant calls (if relevant).

### 3.4 Regression risk classification

Pick ONE: `low | medium | high`. If `high`, mention it explicitly in step 7 (Complexity Gate) — this often signals the bug should escalate to bugfix-heavy.

### 3.5 Cascade assessment

In 1-2 sentences: does the proposed locus of the fix have callers / consumers that could break? List them or state "no callers identified."

## Done criteria

- ≥1 invariant explicitly listed (more is normal — typical light bug yields 2-5 invariants).
- ≥1 edge case explicitly listed.
- Implicit dependencies and cascade impact assessed.
- Regression risk classified.

## Outputs (handoff to step 4)

```yaml
invariants:
  - statement: "<invariant 1>"
    consequence: "<why violation matters>"
    covered_by_red_test: <true|false>
  - statement: "<invariant 2>"
    ...
edge_cases:
  - <edge case 1>
  - <edge case 2>
  ...
implicit_dependencies:
  - <module / caller / shared state>
  ...
regression_risk: <low | medium | high>
cascade_assessment: <1-2 sentences>
```

## Why this step matters (gap closure rationale)

Plugin v4.3.1 had a partial gap here: `information-gate` agent collected context but did not enforce explicit invariant enumeration BEFORE the fix. Spec §21.1 flags this as a 🟡 PARCIAL gap. By making the invariant list a mandatory frontmatter output of step 3, the next step (point fix) cannot proceed until invariants are explicit, which prevents the classic failure mode of "fixed the bug but broke an unstated invariant."

## Next

Proceed to `steps/04-point-fix.md`. The invariants list will be carried forward as guardrails for the minimal diff.
