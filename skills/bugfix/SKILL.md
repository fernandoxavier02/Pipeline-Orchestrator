---
name: bugfix
description: Bug Fix shortcut — skips task-orchestrator type-classification by pre-fixing task_type=Bug Fix. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, executor-controller, adversarial review, sanity, Pa de Cal). Invoked manually via `/pipeline-orchestrator:bugfix [task]` — never auto-invoked because every bug-fix run has side effects (TDD-RED tests created, code edited, commits proposed) that the user must consciously trigger.
disable-model-invocation: true
allowed-tools: Task
argument-hint: [bug description with repro details]
---

# Bug Fix entry-point (v4.3.0)

You are invoking `/pipeline-orchestrator:bugfix` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `Bug Fix`.

## What this skill does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=Bug Fix`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate bug fix pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=Bug Fix\n\n$ARGUMENTS"
)
```

The controller returns a `PIPELINE COMPLETE` block as its tool result. Show it to the user **verbatim** — do NOT summarize, trim, or paraphrase.

## What this skill does NOT do

- **Does NOT skip information-gate** — gap detection (repro steps, error logs, env) is still mandatory.
- **Does NOT skip design-interrogator** for COMPLEXA bugs — design clarity still applies.
- **Does NOT skip TDD** — RED test must prove the fix before GREEN.
- **Does NOT skip per-batch adversarial review** — security-sensitive bugs (auth, crypto, data-model) keep MANDATORY adversarial review.
- **Does NOT skip sanity check or Pa de Cal** — Phase 3 runs identically.
- **Is NOT auto-invoked.** `disable-model-invocation: true` enforces manual-only triggering. Claude will never decide to run this skill on its own — it only runs when the user types `/pipeline-orchestrator:bugfix`.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): the classifier accepts `force_type=Bug Fix` (via the `PRE_CLASSIFIED_TYPE` prefix) and skips the type-classification reasoning, but still computes complexity, pipeline_variant, and ssot_status. See `agents/core/task-orchestrator.md` Step 1a.

## Why this is a skill (not a command) in v4.3.0

In Claude Code 2026, custom commands have been merged into skills (per official doc: *"Skills are recommended since they support additional features like supporting files."*). Bug Fix is the ideal candidate for a skill with `disable-model-invocation: true`:

- It has side effects (creates RED tests, edits production code, proposes commits) — the user must consciously trigger it.
- It belongs to a family of 5 entry-points (`/bugfix`, `/feature`, `/userstory`, `/audit`, `/ux`) that will all follow this pattern in Slice 3.
- Skill directory format opens room for future supporting files (templates, examples, scripts) without restructuring the entry-point.

This skill replaces the v4.2.x `commands/bugfix.md` flat file. The user-facing invocation (`/pipeline-orchestrator:bugfix [task]`) is identical — only the file structure changed.

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=Bug Fix\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as Bug Fix.

## Why this exists

Without `/bugfix`, every "fix login error" request burns one classification round to deduce `type=Bug Fix`. With `/bugfix`, you tell the controller upfront and it goes straight to gap detection — saves tokens and prevents misclassification as Feature when the user already knows it's a bug.
