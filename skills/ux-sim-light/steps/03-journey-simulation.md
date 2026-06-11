---
step_number: 3
step_name: "journey-simulation"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-simulator"
production_writes_allowed: false
expected_inputs:
  - SimulationPlan: from_step_2
  - JourneyMap: from_step_1
expected_outputs:
  - simulation_narrative: string
  - UX_SIMULATION: object
  - friction_catalog: list
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 03 — Journey Simulation (Light)

## Objective

Walk each journey step by step as a real user on a mobile-first device, noting friction points. This is the heart of the simulation: for each step the agent records what the user **sees** (UI elements, messages, feedback), what they **feel** (confusion, confidence, frustration), and what they **do next** — across the critical states (loading, success, partial, recoverable error, irrecoverable error, permission/auth block).

> **Style reference:** this step follows the mobile-first journey-walkthrough style of the Pulsar Bug Fix `HEAVY_09_UX_USER_JOURNEY_SIMULATION` playbook — execute the journey mentally as a real user, capturing immediate feedback, visible result, associated controls, error cases, and recovery at each tap.

**Evidence rule:** every friction point must reference a specific file, template, or code location. If the agent cannot determine what the user sees at a given state, it must read the actual template/component — not guess.

## Instructions

### 3.1 Mobile-first walkthrough

For each journey in `SimulationPlan`, simulate the happy path entry-to-goal, then the alternative paths (error recovery, partial completion, edge/boundary). For each step capture:

- **User action** (tap/click).
- **Immediate feedback** (loading, button state, multi-tap protection).
- **Visible result** (new block, new screen, modal, scroll).
- **Associated controls** (audio, share, save where relevant).
- **Error cases** (network, timeout, backend failure).
- **Recovery** (retry, clear message, consistent state).

### 3.2 UX_SIMULATION output (typed JSON)

Produce the `UX_SIMULATION` block per the `ux-simulator` agent contract: `persona_matrix` (single representative persona in Light), `journey_maps` (happy path + alternative paths + critical states with user_sees/user_feels/user_does/abandonment_risk), and a `friction_catalog`:

```yaml
friction_catalog:
  - id: FRC-001
    persona: <affected persona>
    step: <journey step>
    type: <missing feedback | unclear copy | dead end | slow response | inconsistency | accessibility barrier>
    severity: <blocker | major | minor>
    evidence: <file:line or template reference>
    description: <what happens and why it is friction>
    abandonment_risk: <high | medium | low>
```

### 3.3 Validation questions (per Bug Fix HEAVY_09 style)

For each journey, answer:

1. Does the UI reflect the source of truth (no phantom content, no hidden existing content)?
2. Could multiple taps cause duplication (idempotency in UX and backend)?
3. If the backend is slow, does the UI stay predictable?
4. On partial failure, is the user stuck in a confusing state (perceptible atomicity)?
5. Which points cause friction, and how would you measure it (telemetry/events)?

## Done criteria

- Each journey simulated step-by-step (happy + alternative paths).
- Critical states simulated with user_sees/user_feels/user_does.
- `friction_catalog` populated with file-level evidence.

## Next

→ `steps/04-problem-classification.md`.
