---
description: Pre-execution preparation pipeline (Kiro-clone integrated). Runs brainstorming + spec lifecycle (init/requirements/design/tasks) before optional handoff to /pipeline-orchestrator:pipeline. Mandatory for MEDIA/COMPLEXA/Spec tasks via auto-dispatch from pipeline-controller.
argument-hint: "<task description> [--resume <run-id>] [--type <Type>] [--no-impl] [--skip-validate-gap]"
---

# /pipeline-orchestrator:brainstorm

Entry command for the pre-execution brainstorm + spec lifecycle pipeline.

## Behavior

1. Parse arguments. Recognize flags: `--resume <run-id>`, `--type <Type>`, `--no-impl`, `--skip-validate-gap`.
2. Dispatch the `brainstorm-controller` agent with the parsed arguments. The controller is the N1 orchestrator and handles the full workflow.

## Flags

- `--resume <run-id>`: resume a partial run from `pipeline-runs/<run-id>/manifest.yaml`. Picks up at the last completed step.
- `--type <Feature|Bug Fix|Audit|User Story|UX Simulation|Spec>`: pre-classify task type, skip type detection in step-00-intake.
- `--no-impl`: stop after Phase 1 (spec lifecycle complete). Do not offer handoff to /pipeline-orchestrator:pipeline.
- `--skip-validate-gap`: skip step-04 (validate-gap). Use for greenfield projects without prior codebase.

## Output

Creates or updates a directory at `pipeline-runs/<NNN>-<slug>/` with the schema documented in `docs/superpowers/specs/2026-05-06-pipeline-brainstorm-design.md` (Run-dir schema section).

## See Also

- `agents/core/brainstorm-controller.md` — N1 orchestrator
- `docs/examples/brainstorm-feature.md` — full walkthrough
- `references/glossary.md` — Brainstorm Phase, Prep Run, Run Directory
