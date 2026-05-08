---
name: pipeline
description: Automated multi-agent pipeline for any project. Use when ANY task needs rigorous Bug Fix, Feature, User Story, Audit, or UX Simulation execution with TDD, adversarial review, and gate enforcement. Invoked via `/pipeline-orchestrator:pipeline [task]`. Manual-only — never auto-invoked because every pipeline run has side effects (TDD-RED tests, code edits, commits proposed).
disable-model-invocation: true
allowed-tools: Task
argument-hint: [task description]
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
