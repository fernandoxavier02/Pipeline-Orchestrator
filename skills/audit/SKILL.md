---
name: audit
description: Audit shortcut — skips task-orchestrator type-classification by pre-fixing task_type=Audit. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, executor-controller, sanity, Pa de Cal). Invoked manually via `/pipeline-orchestrator:audit [scope]` — never auto-invoked because every audit run produces a structured report (AUDIT_REPORT) that the user must consciously trigger. Variant flags `--light` / `--heavy` route directly to skills/audit-light or skills/audit-heavy with their prescriptive 9-step procedures imported from Pulsar.
disable-model-invocation: true
allowed-tools: Task
argument-hint: [audit scope description — modules, axes, baseline]
---

# Audit entry-point (v4.5.0)

You are invoking `/pipeline-orchestrator:audit` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `Audit`.

## Variant override via flag (Slice 3a v4.5.0+)

Before delegating to the controller, inspect `$ARGUMENTS` for a leading variant-override flag. The check is purely additive — invocations without a flag keep the existing auto-classify behavior.

- If `$ARGUMENTS` starts with `--light ` (with trailing space) OR `$ARGUMENTS` is exactly `--light`: strip the `--light` prefix and invoke `Skill(skill: "pipeline-orchestrator:audit-light")` with the remaining `$ARGUMENTS` (may be empty).
- If `$ARGUMENTS` starts with `--heavy ` (with trailing space) OR `$ARGUMENTS` is exactly `--heavy`: strip the `--heavy` prefix and invoke `Skill(skill: "pipeline-orchestrator:audit-heavy")` with the remaining `$ARGUMENTS`.
- Otherwise (no recognized flag): proceed with the controller dispatch below — auto-classification is unchanged.

The `audit-light` and `audit-heavy` skills carry the prescriptive 9-step procedures imported from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\`). Phase 0 (information-gate) and Phase 3 (sanity / final-validator / finishing-branch) still wrap them via `pipeline-controller` when invoked through the auto-classify path.

## What this skill does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=Audit`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate audit pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=Audit\n\n$ARGUMENTS"
)
```

The controller returns a `PIPELINE COMPLETE` block as its tool result. Show it to the user **verbatim** — do NOT summarize, trim, or paraphrase.

## What this skill does NOT do

- **Does NOT skip information-gate** — gap detection (scope, axes, baseline, stakeholder) is still mandatory.
- **Does NOT skip design-interrogator** for COMPLEXA audits — scope clarity still applies.
- **Does NOT permit any code change.** Audit pipelines are REPORT-ONLY by Iron Law. Every audit agent (`audit-intake`, `audit-domain-analyzer`, `audit-compliance-checker`, `audit-risk-matrix-generator`) is read-only by frontmatter and prompt.
- **Does NOT skip per-step evidence requirement** — every finding cites file:line or is tagged `[HYPOTHESIS]` / `[DESIGN]`.
- **Does NOT skip sanity check or Pa de Cal** — Phase 3 runs identically (sanity verifies report completeness; Pa de Cal issues GO/CONDITIONAL/NO-GO on the report quality + risk matrix).
- **Is NOT auto-invoked.** `disable-model-invocation: true` enforces manual-only triggering. Claude will never decide to run this skill on its own — it only runs when the user types `/pipeline-orchestrator:audit`.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): the classifier accepts `force_type=Audit` (via the `PRE_CLASSIFIED_TYPE` prefix) and skips the type-classification reasoning, but still computes complexity, pipeline_variant, and ssot_status. See `agents/core/task-orchestrator.md` Step 1a.

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=Audit\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as Audit.

## Why this exists

Without `/audit`, every "audit the auth layer" or "review data integrity" request burns one classification round to deduce `type=Audit`. With `/audit`, you tell the controller upfront and it goes straight to scope/baseline gap detection — saves tokens and prevents misclassification as Bug Fix when the user already knows it's a read-only audit.

The variant-override flags (`--light` / `--heavy`) are the recommended path when the user knows the depth they want: they skip the full pipeline-controller wrapper and run the prescriptive 9-step skill directly.
