---
name: spec-review
description: "Run the spec-adversarial-critic over an existing spec's documents (requirements.md, design.md, tasks.md) and report severity-tagged architecture/quality findings. Read-only — never edits the spec or any code. Runs OUTSIDE the locked spec-light/spec-heavy/spec-audit-only sequences, so it adds the critic's reach to every spec path without modifying those pipelines (R10, v8.0.0+). Manual-only invocation via /pipeline-orchestrator:spec-review."
disable-model-invocation: true
allowed-tools: [Task, Read, Glob]
argument-hint: "<run_id | path to a spec dir containing requirements.md/design.md/tasks.md>"
---

# /pipeline-orchestrator:spec-review

A thin, read-only command that points the `spec-adversarial-critic` at an existing specification and shows you what it finds. Use it on a spec produced by `/pipeline-orchestrator:spec`, by the brainstorm, or written by hand — at any time, independent of the processing pipelines.

## Why this exists (R10)

The `spec-light` / `spec-heavy` / `spec-audit-only` pipelines have hook-enforced `sequence_lock`: there is no "optional step" slot to drop a critic into without editing their SKILL frontmatter (forbidden). This command runs the same critic OUTSIDE those locked sequences, so the spec-document critic is reusable on every spec path with zero changes to the processing pipelines.

## Behavior

1. **Resolve the spec directory** from `$ARGUMENTS`:
   - If `$ARGUMENTS` is a path to a directory containing `requirements.md`/`design.md`/`tasks.md`, use it.
   - Else if `$ARGUMENTS` looks like a run id, resolve `pipeline-runs/<run_id>/01-spec/`.
   - If neither resolves to a directory with the three documents, report the problem and stop (never guess).
2. **Dispatch the critic** read-only:
   ```
   Agent(
     subagent_type: "pipeline-orchestrator:executor:type-specific:spec-adversarial-critic",
     description: "Adversarial architecture review of an existing spec",
     prompt: "SPEC_REVIEW_INPUT:\n  spec_dir: \"<resolved dir>\"\n  documents: [\"requirements.md\", \"design.md\", \"tasks.md\"]\n\nReview read-only; return SPEC_REVIEW_FINDINGS."
   )
   ```
3. **Show the `SPEC_REVIEW_FINDINGS` verbatim** — do NOT summarize away findings. Lead with the verdict (CLEAN / FINDINGS_EXIST) and the counts by severity.

## What this command does NOT do

- It does **not** edit the spec or any code (read-only).
- It does **not** seal, approve, or change `spec.json`.
- It does **not** modify or invoke `spec-light` / `spec-heavy` / `spec-audit-only` (those keep their locked sequences).
- It is **not** auto-invoked (`disable-model-invocation: true`).

## Relationship to the authoring workflow

`/pipeline-orchestrator:spec` runs this same critic inside its bounded review loop and acts on the findings before sealing. `/pipeline-orchestrator:spec-review` is the standalone, advisory form: it reports, you decide.
