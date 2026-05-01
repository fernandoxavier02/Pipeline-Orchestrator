---
description: "Bug Fix shortcut — skips task-orchestrator classification by pre-fixing task_type=Bug Fix. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, executor-controller, adversarial review, sanity, Pa de Cal). Use when you already know it's a bug — saves one classification round-trip and prevents misclassification as Feature."
allowed-tools: Task
---

You are invoking `/pipeline-orchestrator:bugfix` — a thin shortcut that delegates to the same pipeline-controller as `/pipeline`, but with `task_type` pre-fixed to "Bug Fix".

<arguments>
$ARGUMENTS
</arguments>

## What this command does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=Bug Fix`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate bug fix pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=Bug Fix\n\n$ARGUMENTS"
)
```

## What this command does NOT do

- **Does NOT skip information-gate** — gap detection (repro steps, error logs, env) is still mandatory.
- **Does NOT skip design-interrogator** for COMPLEXA bugs — design clarity still applies.
- **Does NOT skip TDD** — RED test must prove the fix before GREEN.
- **Does NOT skip per-batch adversarial review** — security-sensitive bugs (auth, crypto, data-model) keep MANDATORY adversarial.
- **Does NOT skip sanity check or Pa de Cal** — Phase 3 runs identically.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): classifier accepts `force_type=Bug Fix` and skips the type-classification reasoning, but still computes complexity, pipeline_variant, and ssot_status.

## Pass-through behavior

The controller returns a PIPELINE COMPLETE block as its tool result. Show it to the user verbatim — do NOT summarize, do NOT trim, do NOT paraphrase.

## Why this exists

Without `/bugfix`, every "fix login error" request burns one classification round to deduce type=Bug Fix. With `/bugfix`, you tell the controller upfront and it goes straight to gap detection.
