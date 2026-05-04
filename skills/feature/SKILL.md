---
name: feature
description: Feature shortcut — skips task-orchestrator type-classification by pre-fixing task_type=Feature. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, executor-controller, sanity, Pa de Cal). Invoked manually via `/pipeline-orchestrator:feature [task]`. Variant flags `--light` / `--heavy` route directly to skills/feature-light or skills/feature-heavy with their prescriptive 13-step procedures imported from Pulsar.
disable-model-invocation: true
allowed-tools: Task
argument-hint: [feature description with user story + DoD]
---

# Feature entry-point (v4.7.0)

You are invoking `/pipeline-orchestrator:feature` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `Feature`.

## Variant override via flag (Slice 3b v4.7.0+)

Before delegating to the controller, inspect `$ARGUMENTS` for a leading variant-override flag. The check is purely additive — invocations without a flag keep the existing auto-classify behavior.

- If `$ARGUMENTS` starts with `--light ` (with trailing space) OR `$ARGUMENTS` is exactly `--light`: strip the `--light` prefix and invoke `Skill(skill: "pipeline-orchestrator:feature-light")` with the remaining `$ARGUMENTS` (may be empty).
- If `$ARGUMENTS` starts with `--heavy ` (with trailing space) OR `$ARGUMENTS` is exactly `--heavy`: strip the `--heavy` prefix and invoke `Skill(skill: "pipeline-orchestrator:feature-heavy")` with the remaining `$ARGUMENTS`.
- Otherwise (no recognized flag): proceed with the controller dispatch below — auto-classification is unchanged.

The `feature-light` and `feature-heavy` skills carry the prescriptive 13-step procedures imported from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`). Phase 0 (information-gate) and Phase 3 (sanity / final-validator / finishing-branch) still wrap them via `pipeline-controller` when invoked through the auto-classify path.

## What this skill does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=Feature`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate feature pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=Feature\n\n$ARGUMENTS"
)
```

The controller returns a `PIPELINE COMPLETE` block as its tool result. Show it to the user **verbatim** — do NOT summarize, trim, or paraphrase.

## What this skill does NOT do

- **Does NOT skip information-gate** — gap detection (user story, DoD, scope, integration points) is still mandatory.
- **Does NOT skip design-interrogator** for COMPLEXA features — domain/SSOT/contracts clarity still applies.
- **Does NOT skip per-step gates** — the 4 mandatory AskUserQuestion gates (steps 3, 7, 9, 10) inside the variant skills run regardless of entry path.
- **Does NOT skip sanity check or Pa de Cal** — Phase 3 runs identically (sanity verifies code+tests; Pa de Cal issues GO/CONDITIONAL/NO-GO).
- **Is NOT auto-invoked.** `disable-model-invocation: true` enforces manual-only triggering. Claude will never decide to run this skill on its own — it only runs when the user types `/pipeline-orchestrator:feature`.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): the classifier accepts `force_type=Feature` (via the `PRE_CLASSIFIED_TYPE` prefix) and skips the type-classification reasoning, but still computes complexity, pipeline_variant, and ssot_status. See `agents/core/task-orchestrator.md` Step 1a.

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=Feature\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as Feature.

## Why this exists

Without `/feature`, every "implement X feature" or "add capability Y" request burns one classification round to deduce `type=Feature`. With `/feature`, you tell the controller upfront and it goes straight to scope/user-story gap detection — saves tokens and prevents misclassification as Bug Fix when the user already knows it's a new capability.

The variant-override flags (`--light` / `--heavy`) are the recommended path when the user knows the depth they want: they skip the full pipeline-controller wrapper and run the prescriptive 13-step skill directly.
