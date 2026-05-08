---
name: bugfix
description: Bug Fix shortcut — skips task-orchestrator type-classification by pre-fixing task_type=Bug Fix. Same pipeline machinery as /pipeline-orchestrator:pipeline (information-gate, design-interrogator, plan-architect, executor-controller, adversarial review, sanity, Pa de Cal). Invoked manually via `/pipeline-orchestrator:bugfix [task]` — never auto-invoked because every bug-fix run has side effects (TDD-RED tests created, code edited, commits proposed) that the user must consciously trigger.
disable-model-invocation: true
allowed-tools: Task
argument-hint: [bug description with repro details]
---

# Bug Fix entry-point (v4.3.0)

You are invoking `/pipeline-orchestrator:bugfix` — a thin shortcut that delegates to the same `pipeline-controller` agent as `/pipeline-orchestrator:pipeline`, but with `task_type` pre-fixed to `Bug Fix`.

## Variant override via flag (Slice 1.5 v4.4.0+)

Before delegating to the controller, inspect `$ARGUMENTS` for a leading variant-override flag. The check is purely additive — invocations without a flag keep the existing auto-classify behavior.

- If `$ARGUMENTS` starts with `--light ` (with trailing space) OR `$ARGUMENTS` is exactly `--light`: strip the `--light` prefix and invoke `Skill(skill: "pipeline-orchestrator:bugfix-light")` with the remaining `$ARGUMENTS` (may be empty).
- If `$ARGUMENTS` starts with `--heavy ` (with trailing space) OR `$ARGUMENTS` is exactly `--heavy`: strip the `--heavy` prefix and invoke `Skill(skill: "pipeline-orchestrator:bugfix-heavy")` with the remaining `$ARGUMENTS`.
- Otherwise (no recognized flag): proceed with the controller dispatch below — auto-classification is unchanged.

The `bugfix-light` and `bugfix-heavy` skills carry the prescriptive 8-step / 11-step procedures, respectively. Phase 0 (information-gate) and Phase 3 (sanity / final-validator / finishing-branch) still wrap them via `pipeline-controller`.

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

## Pass-through behavior

The `$ARGUMENTS` placeholder captures everything the user typed after the skill name. The full string is passed verbatim to the controller, prefixed by `PRE_CLASSIFIED_TYPE=Bug Fix\n\n`. The controller's Step 1 recognizes the prefix, the `task-orchestrator` Step 1a strips and consumes it, and the rest of the 4-phase pipeline runs identically to a `/pipeline` invocation that classified as Bug Fix.

## Why this exists

Without `/bugfix`, every "fix login error" request burns one classification round to deduce `type=Bug Fix`. With `/bugfix`, you tell the controller upfront and it goes straight to gap detection — saves tokens and prevents misclassification as Feature when the user already knows it's a bug.

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
