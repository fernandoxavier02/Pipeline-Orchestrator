---
step_number: 9
step_name: "ux-user-journey-e2e"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-simulator"
expected_inputs:
  - refactor_diff: from_step_5
  - public_surface: from_step_1
  - identical_verdict: from_step_6
  - gate_decision: from_step_8
expected_outputs:
  - journey_status: "PRESERVED | SHIFTED | N/A"
  - journey_findings: list
expected_next: 10
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 09 — UX User Journey E2E (post-refactor)

## Objective

Confirm the user-facing journey is unchanged from the user's perspective after the restructure. A cross-module refactor that touches UI-adjacent code can subtly shift the experience (a reordered render path, a moved loading state, a relocated error message) even when the public characterization snapshot is IDENTICAL — because the snapshot binds to programmatic behavior, not to the felt journey. This step is the post-refactor verification of the journey end-to-end (mobile-first where applicable), NOT generic UX exploration.

## Why subagent (ux-simulator)

The `ux-simulator` agent walks the user journey from a persona's perspective with zero implementation bias and reports friction points. It is read-only — it never modifies production files. If the restructure did not touch any user-facing path, this step is `N/A`.

## Inputs

- `refactor_diff` (from step 5) — what moved, to know which journeys to re-walk.
- `public_surface` (from step 1) — the user-facing entry points.
- `identical_verdict` (from step 6) — IDENTICAL at the programmatic level; this step checks the felt level.
- `gate_decision` (from step 8) — must be `proceed` to reach this step.

## Instructions

### 9.1 Scope the journeys

From the diff, identify which user-facing journeys pass through the restructured code. If none (pure backend/internal restructure with no UI-adjacent path), set `journey_status: N/A` and proceed.

### 9.2 Walk each journey end-to-end (post-refactor)

For each in-scope journey, dispatch `ux-simulator` to walk it as a user: entry → action → loading/success/error states → completion. Compare the felt experience to what it was before the restructure (from the persona's expectation, since behavior should be preserved).

### 9.3 Classify the result

- **PRESERVED** — the journey feels identical; no friction the restructure introduced.
- **SHIFTED** — the journey changed observably for the user (a state appears/disappears, ordering changed, an error reads differently). This is a flag even if the characterization snapshot was IDENTICAL — surface it to step 10's Pa de Cal as a finding to weigh.
- **N/A** — no user-facing path touched.

## Done criteria

- In-scope journeys identified from the diff (or N/A declared).
- Each journey walked end-to-end post-refactor.
- `journey_status` declared with any findings.

## Outputs (handoff to step 10)

```yaml
journey_status: <PRESERVED | SHIFTED | N/A>
journey_findings:
  - journey: <name>
    observation: <PRESERVED, or what SHIFTED>
  # empty list when PRESERVED/N/A with no findings
```

## Next

Proceed to `steps/10-pa-de-cal.md` (final GO/NO-GO over all evidence).
