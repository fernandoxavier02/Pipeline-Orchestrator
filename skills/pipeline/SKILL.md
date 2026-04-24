---
name: pipeline
description: Automated multi-agent pipeline for any project. Use when ANY task needs rigorous Bug Fix, Feature, User Story, Audit, or UX Simulation execution with TDD, adversarial review, and gate enforcement. Invoked via `/pipeline-orchestrator:pipeline [task]`.
---

# pipeline v4 — thin skill (delegates to controller agent)

This skill's ONLY job is to spawn the pipeline-controller agent. All orchestration logic lives in the controller's prompt, running in an isolated subagent context. This design eliminates main-LLM bypass of the pipeline protocol.

## What to do

Invoke the controller agent with the user's full request as prompt:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate pipeline for the user request",
  prompt: "{{arguments}}"
)
```

## What NOT to do

- **Do NOT perform any orchestration yourself.** The controller handles Phase 0, 1, 1.5, 2, 3.
- **Do NOT invoke Edit or Write during this session.** The `edit-guard-hook` will block you. Delegate all edits to the controller.
- **Do NOT attempt to "help" by pre-classifying the task.** The controller's task-orchestrator does that.
- **Do NOT bypass with reasoning like "this is too small for a pipeline".** If the user invoked `/pipeline-orchestrator:pipeline`, they want the pipeline. If it's truly too small, the controller will propose SIMPLES+DIRETO and ask for confirmation.

## When controller returns

The controller returns a PIPELINE COMPLETE block as its tool result. Pass it to the user verbatim.

## Reference (v3 archive)

Legacy orchestration spec (900 lines) is preserved at `skills/pipeline/SKILL.v3-reference.md`. The controller agent's prompt (`agents/core/pipeline-controller.md`) inherits and updates this spec.
