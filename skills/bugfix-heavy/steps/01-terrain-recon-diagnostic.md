---
step_number: 1
step_name: "terrain-recon-diagnostic"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:bugfix-diagnostic-agent"
expected_inputs:
  - bug_description: from_user
  - repro_details: from_user
expected_outputs:
  - terrain_map: object
  - end_to_end_flow: list
  - persistence_concerns: list
  - prioritized_hypotheses: list
  - verification_plan: list
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob, Task]
---

# Step 01 — Terrain Recon Diagnostic

## Objective

Investigate the bug with production rigor — map the system, reduce uncertainty, identify the most probable root cause, and prepare the terrain for a safe correction. **No code changes in this step.** This is a read-only reconnaissance pass.

## Why subagent

This step runs in the `bugfix-diagnostic-agent` subagent to keep the main agent's context clean. The subagent does heavy reading/grepping across the codebase and reports back a compact structured terrain map.

## Inputs

- `bug_description` (from user invocation)
- `repro_details` (from user invocation: env, scope, recency, signals like logs/metrics/IDs)

## Instructions

### 1.1 Project reconnaissance

- Identify high-level architecture and the modules relevant to the bug.
- List entry points, dependencies, and execution paths.
- Mark patterns that must be preserved (naming, layering, state management, validation, error handling, UI patterns).

### 1.2 End-to-end flow mapping

Trace the flow from initial trigger to the user-visible result. Include external integrations, queues/jobs, persistence, cache, and UI layers.

### 1.3 Domain and correction criteria (if relevant)

- Extract explicit and implicit business rules.
- Identify the **source of truth** for the state involved.
- List domain invariants (what must never happen).

### 1.4 Persistence and consistency (if relevant)

- Where and when is state written?
- Risk of intermediate inconsistent state?
- Concurrency, retries, duplication (idempotency)?
- Multi-step operations requiring atomicity?

### 1.5 Prioritized hypotheses

List 5–10 plausible hypotheses, ranked by probability and impact. For each, describe the **objective evidence** that would confirm or rule it out.

### 1.6 Verification plan

Sequence of minimal steps to validate the hypotheses, ordered cheapest-first → most-conclusive-last. Indicate exactly where to look (logs, DB, queues, cache, network, UI).

## Rules

- Do NOT write code.
- Do NOT propose a fix yet.
- If information is missing, declare the assumption explicitly and indicate how to validate it.

## Done criteria

- Terrain map populated with architecture + entry points + preserved patterns.
- End-to-end flow documented from trigger to user-visible outcome.
- 5–10 hypotheses listed with confirmation/rejection evidence.
- Verification plan ordered by cost/value.

## Outputs (handoff to step 2)

```yaml
terrain_map:
  architecture: <high-level summary>
  modules: [<list>]
  entry_points: [<list>]
  preserved_patterns: [<list>]
end_to_end_flow:
  - <step from trigger to outcome>
persistence_concerns:
  - <concern or "none">
prioritized_hypotheses:
  - hypothesis: <text>
    probability: high|medium|low
    evidence_to_confirm: <text>
verification_plan:
  - <step ordered cheapest-first>
```

## Next

Proceed to `steps/02-root-cause-consolidation.md`.
