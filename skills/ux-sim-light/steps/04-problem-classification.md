---
step_number: 4
step_name: "problem-classification"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-qa-validator"
production_writes_allowed: false
expected_inputs:
  - UX_SIMULATION: from_step_3
  - friction_catalog: from_step_3
expected_outputs:
  - classification_narrative: string
  - UX_QA_REPORT: object
  - prioritized_problem_list: list
expected_next: 5
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 04 — Problem Classification (Light)

## Objective

Consolidate the friction findings from the simulation, tag each by severity, and build a prioritized problem list. In Light there is a single source (the `ux-simulator` friction catalog, with inline a11y notes); the `ux-qa-validator` agent merges duplicates, applies severity tags, and assigns priority.

## Why subagent (ux-qa-validator)

The `ux-qa-validator` agent owns consolidation, severity tagging, the priority matrix, and action items. It does NOT discover new issues — it consolidates, tags, and prioritizes only what the simulation surfaced.

## Instructions

### 4.1 Severity tagging

Apply ONE severity tag per finding per the agent contract:

- `blocker` — user cannot complete the flow.
- `major` — flow completes but with significant friction.
- `minor` — degraded but works.
- `accessibility` — fails compliance without blocking the flow.

### 4.2 Priority matrix + action items

Build the 2D impact×effort priority matrix (P0..P4) and produce action items with a definition of done per the `ux-qa-validator` `UX_QA_REPORT` schema (`findings`, `action_items`, `priority_matrix`, `summary`). Every action item must trace back to a `FRC-xxx` finding with file:line evidence.

### 4.3 UX_QA_REPORT output

Emit the `UX_QA_REPORT` block per the agent contract. The `prioritized_problem_list` is the P0→P4-ordered list of findings feeding the final report.

## Done criteria

- All findings severity-tagged.
- Duplicates merged (keep higher severity).
- Priority matrix populated; P0 items highlighted.
- Action items have a definition of done.

## Next

→ `steps/05-report.md`.
