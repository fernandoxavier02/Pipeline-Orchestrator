---
step_number: 4
step_name: "cross-journey-analysis"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-qa-validator"
production_writes_allowed: false
expected_inputs:
  - UX_SIMULATION: from_step_3
  - per_journey_findings: from_step_3
expected_outputs:
  - cross_journey_narrative: string
  - CrossCuttingFindings: object
expected_next: 5
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 04 — Cross-Journey Analysis (Heavy)

## Objective

Identify patterns, systemic issues, and inconsistencies across all journey findings. Where Light stops at per-journey problem classification, Heavy adds this cross-cutting pass: a friction that appears in 3+ journeys is a systemic/architectural signal, not an isolated bug.

## Why subagent (ux-qa-validator)

The `ux-qa-validator` agent owns consolidation and pattern analysis. It consolidates the `friction_catalog` from step 3, merges duplicates, and surfaces cross-cutting patterns. It does NOT invent new findings beyond what the simulation surfaced.

## Instructions

### 4.1 Pattern detection

Group findings by type and journey. Flag any friction type that recurs across multiple journeys (e.g., "missing feedback on every async action", "inconsistent error copy across flows").

### 4.2 CrossCuttingFindings (typed JSON)

```yaml
CrossCuttingFindings:
  patterns:
    - pattern: <systemic issue>
      affected_journeys: <N>
      affected_journey_ids: [JRN-xxx, ...]
      severity: <blocker | major | minor>
      evidence: [<file:line references across journeys>]
      recommendation: <architectural/systemic fix — description only, no implementation>
  inconsistencies:
    - description: <UI/UX inconsistency across journeys>
      evidence: [<file:line>]
  consolidated_friction: [<merged friction list with higher-severity tag kept on duplicates>]
```

## Done criteria

- Recurring patterns identified (3+ journeys = systemic).
- Inconsistencies across journeys catalogued.
- Consolidated friction list produced (duplicates merged, higher severity kept).

## Next

→ `steps/05-accessibility-audit.md`.
