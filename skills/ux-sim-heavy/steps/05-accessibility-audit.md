---
step_number: 5
step_name: "accessibility-audit"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor"
production_writes_allowed: false
expected_inputs:
  - JourneyInventory: from_step_1
  - StateMatrix: from_step_2
expected_outputs:
  - a11y_narrative: string
  - A11Y_REPORT: object
expected_next: 6
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 05 — Accessibility Audit (Heavy)

## Objective

Run a dedicated WCAG 2.1 AA audit across all journeys: keyboard navigation, screen-reader semantics, color contrast, touch targets, and motion. This is the step that distinguishes Heavy from Light — Light folds accessibility checks inline; Heavy runs the dedicated `ux-accessibility-auditor`.

## Why subagent (ux-accessibility-auditor)

The `ux-accessibility-auditor` agent owns the systematic WCAG 2.1 AA traversal (Perceivable / Operable / Understandable / Robust), keyboard-navigation check, contrast analysis, and touch-target evaluation. Contrast/touch checks without a running browser are code-based estimates and are tagged `[CODE-ANALYSIS]` rather than `[VERIFIED]`.

## Parallel dispatch

Per the `references/pipelines/ux-sim-heavy.md` parallel-dispatch note, this step runs IN PARALLEL with step 3 (`ux-simulator`): `[ux-simulator || ux-accessibility-auditor]`. Both receive the same TASK_CONTEXT and operate independently; their outputs converge at `ux-qa-validator` (and into the final report at step 7). Listed as step 5 for sequence-numbering; dispatched alongside step 3 at runtime.

**Evidence rule:** every violation references a specific file and line number; undeterminable states are noted `[NEEDS-RUNTIME-VERIFICATION]`.

## Instructions

Execute the `ux-accessibility-auditor` PROCESS (Steps 1-6 of the agent contract): locate UI files, run the WCAG 2.1 AA criteria tables, check keyboard navigation, analyze contrast pairs, evaluate touch targets, and self-review. Emit the `A11Y_REPORT` block per the agent schema (`wcag_violations`, `keyboard_nav_issues`, `contrast_failures`, `touch_target_issues`, `summary`).

## Done criteria

- WCAG 2.1 AA criteria systematically checked with file:line evidence.
- Keyboard navigation assessed for all interactive elements.
- Contrast pairs identified; touch targets evaluated; confidence levels tagged.
- `A11Y_REPORT` populated.

## Next

→ `steps/06-adversarial-review.md`.
