---
name: ux-sim
description: UX Simulation shortcut — skips task-orchestrator type-classification by pre-fixing task_type=UX Simulation. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, sanity, Pa de Cal). Invoked manually via `/pipeline-orchestrator:ux-sim [journey]`. Variant flags `--light` / `--heavy` route directly to skills/ux-sim-light or skills/ux-sim-heavy. REPORT-ONLY by Iron Law — no code modification under any circumstance (simulates real user journeys and reports UX problems).
disable-model-invocation: true
allowed-tools: Task
argument-hint: [UX journey / flow to simulate — devices, personas, accessibility]
---

# UX Simulation entry-point (v7.12.0)

You are invoking `/pipeline-orchestrator:ux-sim` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `UX Simulation`.

## Variant override via flag (v7.12.0)

Before delegating to the controller, inspect `$ARGUMENTS` for a leading variant-override flag. The check is purely additive — invocations without a flag keep the existing auto-classify behavior.

- If `$ARGUMENTS` starts with `--light ` (with trailing space) OR `$ARGUMENTS` is exactly `--light`: strip the `--light` prefix and invoke `Skill(skill: "pipeline-orchestrator:ux-sim-light")` with the remaining `$ARGUMENTS` (may be empty).
- If `$ARGUMENTS` starts with `--heavy ` (with trailing space) OR `$ARGUMENTS` is exactly `--heavy`: strip the `--heavy` prefix and invoke `Skill(skill: "pipeline-orchestrator:ux-sim-heavy")` with the remaining `$ARGUMENTS`.
- Otherwise (no recognized flag): proceed with the controller dispatch below — auto-classification is unchanged.

The `ux-sim-light` and `ux-sim-heavy` skills carry the prescriptive read-only journey-simulation procedures (synthesized from the ux-sim pipeline references + the three UX agents `ux-simulator` / `ux-accessibility-auditor` / `ux-qa-validator`). Phase 0 (information-gate) and Phase 3 (sanity / final-validator / finishing-branch) still wrap them via `pipeline-controller` when invoked through the auto-classify path.

## What this skill does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=UX Simulation`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate UX simulation pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=UX Simulation\n\n$ARGUMENTS"
)
```

The controller returns a `PIPELINE COMPLETE` block as its tool result. Show it to the user **verbatim** — do NOT summarize, trim, or paraphrase.

## What this skill does NOT do

- **Does NOT skip information-gate** — gap detection (target journey, devices, accessibility requirements) is still mandatory.
- **Does NOT skip design-interrogator** for COMPLEXA simulations — journey/persona scope clarity still applies.
- **Does NOT permit any code change.** UX Simulation pipelines are REPORT-ONLY by Iron Law (read-only journey walkthroughs + UX problem reports). `edit-guard-hook.cjs` enforces.
- **Does NOT skip sanity check or Pa de Cal** — Phase 3 runs identically (sanity verifies report completeness; Pa de Cal issues the UX assessment decision).
- **Is NOT auto-invoked.** `disable-model-invocation: true` enforces manual-only triggering.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): the classifier accepts `force_type=UX Simulation` (via the `PRE_CLASSIFIED_TYPE` prefix) and skips the type-classification reasoning, but still computes complexity, pipeline_variant, and ssot_status. See `agents/core/task-orchestrator.md` Step 1a.

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=UX Simulation\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as UX Simulation.

## Why this exists

Without `/ux-sim`, every "walk through the checkout flow as a user" request burns one classification round to deduce `type=UX Simulation` (and risks misclassification as Bug Fix or Feature). With `/ux-sim`, you tell the controller upfront that this is a read-only journey simulation and it goes straight to journey/device/accessibility gap detection. The variant-override flags (`--light` / `--heavy`) run the prescriptive simulation skill directly.

## Achado #7 GATE_REQUEST handler (2026-05-07+, v5.2.0-rc.2+)

When the dispatched pipeline-controller (or any subagent it transitively dispatches via DISPATCH_REQUEST) returns a tool result containing `=== GATE_REQUEST v1 ===`, `=== DISPATCH_REQUEST v1 ===`, or `=== PLAN_MODE_REQUEST v1 ===` blocks AND ends with `STATUS: AWAITING_GATE_RESPONSES` / `AWAITING_DISPATCH_RESULTS` / `AWAITING_PLAN_MODE_RESULTS`, the parent main LLM MUST process them per `references/gate-request-protocol.md`: parse each block, invoke the corresponding tool (`AskUserQuestion` / `Agent` / `EnterPlanMode`), aggregate responses, and re-dispatch the controller with the response payloads prepended. Repeat until the controller emits `PIPELINE COMPLETE` without any AWAITING_* status.
