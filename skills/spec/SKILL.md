---
name: spec
description: Spec-authoring workflow — drives brainstorm clarification + proactive ideation, a forced design-interrogation, the Kiro spec lifecycle, and an adversarial architecture review over the documents, then SEALS a complete contract-grade specification and STOPS (no implementation). Produces spec.json + requirements.md + design.md + tasks.md + research.md. Use `--amend <run_id>` to amend a sealed spec. Legacy spec-processing (implement an existing spec) moved to /pipeline-orchestrator:spec-light, :spec-heavy, :spec-audit-only, and /pipeline-orchestrator:pipeline --type=Spec. Manual-only via /pipeline-orchestrator:spec.
disable-model-invocation: true
allowed-tools: [Task]
argument-hint: "<feature description> | --amend <run_id> [--skip-validate-gap]"
---

# /pipeline-orchestrator:spec — Spec-authoring workflow (v8.0.0)

You are invoking `/pipeline-orchestrator:spec`. As of v8.0.0 this command **authors a new specification from scratch** and seals it as a contract — it no longer pre-classifies and implements an existing spec.

> **Name take-over (MAJOR, breaking).** Before v8.0.0 this command was a thin shortcut into the processing pipeline. That behavior now lives at:
> - `/pipeline-orchestrator:spec-light` / `:spec-heavy` / `:spec-audit-only` — the prescriptive processing pipelines.
> - `/pipeline-orchestrator:pipeline --type=Spec` — the full pipeline pre-classified as Spec.
> These still reach spec PROCESSING; they are not captured by the new authoring path.

## What this does

Dispatches the `spec-controller` (N1 orchestrator), which runs: brainstorm clarification (decision-class gaps always asked, never invented) → proactive ideation → forced, proportional design-interrogation → the Kiro lifecycle (init → requirements → validate-gap → design → validate-design → tasks) → a bounded adversarial-review loop over the spec documents → SEAL. It STOPS at the sealed spec; implementation is a separate, later step.

```
Agent(
  subagent_type: "pipeline-orchestrator:core:spec-controller",
  description: "Author and seal a contract-grade spec for the user request",
  prompt: "SPEC_AUTHORING_MODE=true\n\n$ARGUMENTS"
)
```

The controller returns a `SPEC AUTHORING COMPLETE` block. Show it to the user **verbatim**.

## Achado #7 GATE/DISPATCH/PLAN_MODE handler

When the dispatched `spec-controller` (or anything it transitively dispatches) returns a tool result containing `=== GATE_REQUEST v1 ===`, `=== DISPATCH_REQUEST v1 ===`, or `=== PLAN_MODE_REQUEST v1 ===` ending with `STATUS: AWAITING_*`, you (the parent main LLM) MUST process it per `references/gate-request-protocol.md`: parse each block; for `GATE_REQUEST` call `AskUserQuestion`; for `DISPATCH_REQUEST` invoke the named `Agent`/`Skill`; for `PLAN_MODE_REQUEST` enter read-only plan mode, research, and return results; aggregate into `GATE_RESPONSES`/`DISPATCH_RESULTS`/`PLAN_MODE_RESULTS`; re-dispatch the controller with them prepended. Repeat until it emits `SPEC AUTHORING COMPLETE`. Never silently default; malformed blocks → ask the user how to proceed.

> **Re-dispatch = a FRESH `Agent()` call**, not a live-agent resume. The controller recovers its full state from the run-dir on disk (manifest + `notes.options` + artifacts), so re-dispatching loses nothing. Do **NOT** use `SendMessage`, and do **NOT** try to "continue/resume the same live agent" — this protocol is **stateless per dispatch by design**, and `SendMessage` is **never** part of it. If you conclude you need `SendMessage` to return a result to a waiting subagent (e.g. one stuck at `AWAITING_DISPATCH_RESULTS`), you have mis-read the protocol: re-dispatch instead. (Aside: even where it exists, `SendMessage` is a deferred tool loadable via `ToolSearch` — its apparent absence is never a reason to abandon a run.)

## Flags

- `--amend <run_id>` — reopen a SEALED spec to amend it (delta-scoped clarification + ideation, re-review, re-seal with `spec_version` increment). The only sanctioned way to change a sealed spec's scope.
- `--skip-validate-gap` — skip the gap-analysis step (greenfield); `research.md` is still guaranteed (a minimal stub is written before seal).

## What this does NOT do

- Does **not** implement the spec — the workflow stops at the seal. The `SPEC AUTHORING COMPLETE` block prints the command to implement later.
- Does **not** auto-invoke (`disable-model-invocation: true`).
- Does **not** decide product-shaping things on its own — every decision-class gap is escalated to you.

## Related

- `/pipeline-orchestrator:spec-review <run_id>` — run only the adversarial spec-document critic over an existing spec (read-only, advisory).
- `agents/core/spec-controller.md` — the N1 orchestrator.
- `references/run-orchestration-substrate.md` — shared run machinery.
