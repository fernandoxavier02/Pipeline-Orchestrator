---
step_number: 3
step_name: "per-journey-simulation"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-simulator"
production_writes_allowed: false
expected_inputs:
  - StateMatrix: from_step_2
  - JourneyInventory: from_step_1
expected_outputs:
  - simulation_narrative: string
  - UX_SIMULATION: object
  - per_journey_findings: list
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 03 — Per-Journey Simulation (Heavy)

## Objective

Simulate each journey step-by-step, 1 journey per batch for maximum detail, testing edge cases across the state matrix. As in Light this is a mobile-first walkthrough, but Heavy runs the full persona matrix (3+ personas) and every device/state cell.

> **Style reference:** this step follows the mobile-first journey-walkthrough style of the Pulsar Bug Fix `HEAVY_09_UX_USER_JOURNEY_SIMULATION` playbook — execute each journey mentally as a real user, capturing immediate feedback, visible result, associated controls, error cases, and recovery at each tap, plus technical checkpoints with replicable verification commands.

## Sentinel checkpoint

`pre_3` per SKILL.md. Validates that `StateMatrix` is present before the heavy simulation runs.

## Parallel dispatch

Per the `references/pipelines/ux-sim-heavy.md` parallel-dispatch note, this step (`ux-simulator`) runs IN PARALLEL with step 5 (`ux-accessibility-auditor`): `[ux-simulator || ux-accessibility-auditor]`. Both receive the same TASK_CONTEXT and operate independently; their outputs converge at `ux-qa-validator`.

**Evidence rule:** every friction point references a specific file, template, or code location. The agent reads the actual template/component rather than guessing.

## Instructions

### 3.1 Mobile-first walkthrough per journey × persona × device

For each cell in `StateMatrix`, simulate the happy path and alternative paths (error recovery, partial completion, edge/boundary). For each step capture: user action, immediate feedback (loading, button state, multi-tap protection), visible result, associated controls, error cases (network/timeout/backend failure), and recovery.

### 3.2 Technical checkpoints (per Bug Fix HEAVY_09 style)

For each critical point in a journey, create a structured, replicable checkpoint: objective, verification commands (grep/read), questions to answer (does function X exist? is Y called after Z? is field W persisted?), expected vs. found vs. gap.

### 3.3 UX_SIMULATION output (typed JSON)

Produce the `UX_SIMULATION` block per the `ux-simulator` agent contract: full `persona_matrix` (3+ personas, worst-case + most-frequent identified), `journey_maps` (happy + min-3 alternative paths + critical states), and a `friction_catalog` with severity + file-level evidence + abandonment risk.

### 3.4 Validation questions

For each journey: (1) UI reflects source of truth? (2) multi-tap duplication risk / idempotency? (3) predictable UI on slow backend? (4) confusing stuck state on partial failure? (5) friction points + how to measure (telemetry/events)?

## Done criteria

- Each journey simulated 1-per-batch across persona × device × state.
- Technical checkpoints created with replicable commands.
- `friction_catalog` populated with file-level evidence + abandonment risk.

## Next

→ `steps/04-cross-journey-analysis.md`.
