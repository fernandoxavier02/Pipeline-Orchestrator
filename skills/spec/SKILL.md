---
name: spec
description: Spec Lifecycle shortcut — pre-classifies task_type=Spec to skip the type-detection round in task-orchestrator. Same Phase-0/Phase-3 wrapper as /pipeline-orchestrator:pipeline (information-gate, sentinel checkpoints, sanity-checker, final-validator, finishing-branch). Variant flags `--light` / `--heavy` / `--audit-only` route directly to skills/spec-light, spec-heavy, or spec-audit-only with their prescriptive 6/9/5-step procedures (Wave 2). Without a flag, dispatches to pipeline-controller, which uses the Wave 3-spec 4-signal classifier (explicit path / --type=spec flag / prose regex / glob fallback under .kiro/specs/) to select the right variant. Manual-only invocation via `/pipeline-orchestrator:spec`.
disable-model-invocation: true
allowed-tools: Task
argument-hint: "[--light | --heavy | --audit-only] [spec feature name or path to .kiro/specs/<feature>/]"
---

# Spec Lifecycle entry-point (v4.12.0)

You are invoking `/pipeline-orchestrator:spec` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `Spec`.

## Variant override via flag (Wave 4-spec, v4.12.0+)

Before delegating to the controller, inspect `$ARGUMENTS` for a leading variant-override flag. The check is purely additive — invocations without a flag keep the Wave 3-spec auto-classifier behavior.

- If `$ARGUMENTS` starts with `--light ` (with trailing space) OR `$ARGUMENTS` is exactly `--light`: strip the `--light` prefix and invoke `Skill(skill: "pipeline-orchestrator:spec-light")` with the remaining `$ARGUMENTS` (may be empty).
- If `$ARGUMENTS` starts with `--heavy ` (with trailing space) OR `$ARGUMENTS` is exactly `--heavy`: strip the `--heavy` prefix and invoke `Skill(skill: "pipeline-orchestrator:spec-heavy")` with the remaining `$ARGUMENTS`.
- If `$ARGUMENTS` starts with `--audit-only ` (with trailing space) OR `$ARGUMENTS` is exactly `--audit-only`: strip the `--audit-only` prefix and invoke `Skill(skill: "pipeline-orchestrator:spec-audit-only")` with the remaining `$ARGUMENTS`.
- Otherwise (no recognized flag): proceed with the controller dispatch below — the Wave 3-spec 4-signal classifier picks the variant.

The `spec-light` / `spec-heavy` / `spec-audit-only` skills carry the prescriptive 6 / 9 / 5-step procedures (see `skills/spec-light/SKILL.md`, `skills/spec-heavy/SKILL.md`, `skills/spec-audit-only/SKILL.md`). Phase 0 (information-gate, sentinel) and Phase 3 (sanity / final-validator / finishing-branch) still wrap them via `pipeline-controller` when invoked through the auto-classify path.

## What this skill does

Spawn the `pipeline-controller` agent with the user's request prefixed by `PRE_CLASSIFIED_TYPE=Spec`:

```
Agent(
  subagent_type: "pipeline-orchestrator:core:pipeline-controller",
  description: "Orchestrate spec lifecycle pipeline for the user request",
  prompt: "PRE_CLASSIFIED_TYPE=Spec\n\n$ARGUMENTS"
)
```

The controller returns a `PIPELINE COMPLETE` block as its tool result. Show it to the user **verbatim** — do NOT summarize, trim, or paraphrase.

## What this skill does NOT do

- **Does NOT skip information-gate** — gap detection on the spec artifacts (spec.json + requirements.md + design.md + tasks.md, plus research.md if applicable) is still mandatory.
- **Does NOT skip the variant skill's gates** — the prescriptive 4 / 5 / 3 mandatory `AskUserQuestion` gates inside spec-light / spec-heavy / spec-audit-only run regardless of entry path.
- **Does NOT skip TDD** for spec-light or spec-heavy — ATDD seed (1 scenario per AC, EARS preserved) still gates implementation.
- **Does NOT skip sanity check or Pa de Cal** — Phase 3 runs identically (sanity verifies code+tests; Pa de Cal issues GO/CONDITIONAL/NO-GO).
- **Is NOT auto-invoked.** `disable-model-invocation: true` enforces manual-only triggering. Claude will never decide to run this skill on its own — it only runs when the user types `/pipeline-orchestrator:spec`.

The ONLY phase shortened is Phase 0a (`task-orchestrator`): the classifier accepts `force_type=Spec` (via the `PRE_CLASSIFIED_TYPE` prefix) and skips the type-detection reasoning, but still resolves `pipeline_variant` (spec-light / spec-heavy / spec-audit-only) via the 4-signal classifier and computes complexity, ssot_status, and the populated `spec_context.yaml`. See `agents/core/task-orchestrator.md` Step 1a (Wave 3-spec).

## Spec path resolution

The variant skills (and the controller, when no flag is supplied) need a target spec directory. Resolution order:

1. **Explicit path in `$ARGUMENTS`** — e.g. `/pipeline-orchestrator:spec .kiro/specs/auth-flow/` (recognized by Wave 3-spec signal #1).
2. **`spec_path` field in `.claude/pipeline.local.md`** frontmatter (project-level default).
3. **Glob fallback under `.kiro/specs/`** — if exactly one feature directory matches, use it; if zero or multiple, the controller asks the user via `AskUserQuestion` (NEVER guesses).

This resolution is owned by `task-orchestrator` Step 1a (Wave 3-spec); the entry-point itself does not pre-resolve — it only forwards `$ARGUMENTS` verbatim.

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=Spec\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as Spec.

## Why this exists

Without `/spec`, every spec lifecycle request burns one classification round on type-detection (was this an audit, a re-implementation, a fresh feature?). With `/spec`, you tell the controller upfront and it goes straight to gap detection on the spec artifacts and variant selection — saves tokens and prevents misclassification when the user already knows the input is a Kiro spec.

The variant-override flags (`--light` / `--heavy` / `--audit-only`) are the recommended path when the user knows the depth they want: they skip the full pipeline-controller wrapper and run the prescriptive variant skill directly.

## Reference docs

- Variant skills: `skills/spec-light/SKILL.md` (6 steps, default for small-to-medium scope), `skills/spec-heavy/SKILL.md` (9 steps, full content review + parallel adversarial), `skills/spec-audit-only/SKILL.md` (5 steps, no implementation — for already-shipped specs).
- Pipeline composition refs (team/step flow): `references/pipelines/spec-light.md`, `references/pipelines/spec-heavy.md`, `references/pipelines/spec-audit-only.md`.
- Wave 3-spec classifier logic: `agents/core/task-orchestrator.md` Step 1a (4-signal detection + spec_context resolution).
- Wave 1 backing agents: `agents/executor/type-specific/spec-format-gate.md`, `agents/executor/type-specific/spec-content-reviewer.md`, `agents/executor/type-specific/spec-post-impl-validator.md`, `agents/executor/spec-closer.md`.

## Achado #7 GATE_REQUEST handler (2026-05-07+, v5.2.0-rc.2+)

When the dispatched pipeline-controller (or any subagent it transitively dispatches via DISPATCH_REQUEST) returns a tool result containing `=== GATE_REQUEST v1 ===`, `=== DISPATCH_REQUEST v1 ===`, or `=== PLAN_MODE_REQUEST v1 ===` blocks AND ends with `STATUS: AWAITING_GATE_RESPONSES` / `AWAITING_DISPATCH_RESULTS` / `AWAITING_PLAN_MODE_RESULTS`, the parent main LLM MUST process them per `references/gate-request-protocol.md`:

1. Parse each block out of the tool result.
2. For `GATE_REQUEST`: invoke `AskUserQuestion` with the parsed question + options.
3. For `DISPATCH_REQUEST` with `target_kind: agent`: invoke `Agent(subagent_type, description, prompt)`.
4. For `DISPATCH_REQUEST` with `target_kind: skill`: invoke `Skill(skill: target_name)`.
5. For `PLAN_MODE_REQUEST`: invoke `EnterPlanMode`, conduct read-only research, exit with plan.
6. Aggregate responses/results into `GATE_RESPONSES` / `DISPATCH_RESULTS` / `PLAN_MODE_RESULTS` YAML payloads.
7. Re-dispatch the SAME subagent with the original prompt PLUS payloads prepended.
8. Repeat 1-7 until the subagent emits its terminal block (e.g., `PIPELINE COMPLETE`) without AWAITING_*.

Append every block emission and every response to `{PIPELINE_DOC_PATH}/protocol-events.jsonl` (NOT `gate-decisions.jsonl`). Named gates (ADVERSARIAL_GATE, FINAL_ADVERSARIAL_GATE, CLOSEOUT_CONFIRM, TDD_APPROVAL, PLAN_REJECTED, INFO_GATE_BLOCKED) ALSO get a canonical `gate-decisions.jsonl` entry with `decided_by: user` referencing the protocol event id. See `references/gate-request-protocol.md` "gate_id → canonical gate mapping" for the full table.

**Never silently default.** Malformed blocks → present to user via your own `AskUserQuestion` ("malformed block — investigate, retry, or abort?"); do NOT guess.
