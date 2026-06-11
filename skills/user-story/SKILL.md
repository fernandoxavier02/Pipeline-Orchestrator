---
name: user-story
description: User Story shortcut — skips task-orchestrator type-classification by pre-fixing task_type=User Story. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, executor-controller, sanity, Pa de Cal). Invoked manually via `/pipeline-orchestrator:user-story [story]`. Variant flags `--light` / `--heavy` route directly to skills/user-story-light or skills/user-story-heavy with their prescriptive 10-step procedures ported 1:1 from Pulsar. Code-changing (TDD gate at step 6, adversarial at step 8, Pa de Cal at step 10).
disable-model-invocation: true
allowed-tools: Task
argument-hint: [user story — persona, want, benefit + acceptance hints]
---

# User Story entry-point (v7.12.0)

You are invoking `/pipeline-orchestrator:user-story` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `User Story`.

## Variant override via flag (v7.12.0)

Before delegating to the controller, inspect `$ARGUMENTS` for a leading variant-override flag. The check is purely additive — invocations without a flag keep the existing auto-classify behavior.

- If `$ARGUMENTS` starts with `--light ` (with trailing space) OR `$ARGUMENTS` is exactly `--light`: strip the `--light` prefix and invoke `Skill(skill: "pipeline-orchestrator:user-story-light")` with the remaining `$ARGUMENTS` (may be empty).
- If `$ARGUMENTS` starts with `--heavy ` (with trailing space) OR `$ARGUMENTS` is exactly `--heavy`: strip the `--heavy` prefix and invoke `Skill(skill: "pipeline-orchestrator:user-story-heavy")` with the remaining `$ARGUMENTS`.
- Otherwise (no recognized flag): proceed with the controller dispatch below — auto-classification is unchanged.

The `user-story-light` and `user-story-heavy` skills carry the prescriptive 10-step procedures ported 1:1 from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\User_story_translated\`). Phase 0 (information-gate) and Phase 3 (sanity / final-validator / finishing-branch) still wrap them via `pipeline-controller` when invoked through the auto-classify path.

## What this skill does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=User Story`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate user story pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=User Story\n\n$ARGUMENTS"
)
```

The controller returns a `PIPELINE COMPLETE` block as its tool result. Show it to the user **verbatim** — do NOT summarize, trim, or paraphrase.

## What this skill does NOT do

- **Does NOT skip information-gate** — gap detection (persona, trigger, acceptance criteria) is still mandatory.
- **Does NOT skip design-interrogator** for COMPLEXA stories — domain/SSOT/contracts clarity still applies.
- **Does NOT skip TDD** — the user-story skills are code-changing; the test-pre-impl gate at step 6 (RED phase) is mandatory before any production change.
- **Does NOT skip the adversarial gate** (step 8) or Pa de Cal (step 10).
- **Is NOT auto-invoked.** `disable-model-invocation: true` enforces manual-only triggering.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): the classifier accepts `force_type=User Story` (via the `PRE_CLASSIFIED_TYPE` prefix) and skips the type-classification reasoning, but still computes complexity, pipeline_variant, and ssot_status. See `agents/core/task-orchestrator.md` Step 1a.

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=User Story\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as User Story.

## Why this exists

Without `/user-story`, every "as a user I want…" request burns one classification round to deduce `type=User Story`. With `/user-story`, you tell the controller upfront and it goes straight to persona/acceptance-criteria gap detection. The variant-override flags (`--light` / `--heavy`) are the recommended path when the user knows the depth they want: they run the prescriptive 10-step skill directly.

## Achado #7 GATE_REQUEST handler (2026-05-07+, v5.2.0-rc.2+)

When the dispatched pipeline-controller (or any subagent it transitively dispatches via DISPATCH_REQUEST) returns a tool result containing `=== GATE_REQUEST v1 ===`, `=== DISPATCH_REQUEST v1 ===`, or `=== PLAN_MODE_REQUEST v1 ===` blocks AND ends with `STATUS: AWAITING_GATE_RESPONSES` / `AWAITING_DISPATCH_RESULTS` / `AWAITING_PLAN_MODE_RESULTS`, the parent main LLM MUST process them per `references/gate-request-protocol.md`: parse each block, invoke the corresponding tool (`AskUserQuestion` / `Agent` / `EnterPlanMode`), aggregate responses, and re-dispatch the controller with the response payloads prepended. Repeat until the controller emits `PIPELINE COMPLETE` without any AWAITING_* status.
