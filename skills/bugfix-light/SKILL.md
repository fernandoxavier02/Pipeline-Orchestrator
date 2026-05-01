---
name: bugfix-light
description: Prescriptive 8-step bug fix workflow for SIMPLES/MEDIA bugs (max 2 files, ~50 lines diff). Imported from Pulsar bugfix workflow per spec §21. Use when complexity classification is light. Steps 1-4 inline (analysis + point fix), steps 5-6 subagent (validation + persistence check), 7-8 inline gates (complexity gate + Pa de Cal). Closes 3 audit gaps Light 3 (invariants BEFORE), Light 5 (RED→regression promotion), Light 6 (persistence quick check). Manual-only invocation via /pipeline-orchestrator:bugfix-light or via /pipeline-orchestrator:bugfix --light.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [bug description with repro details]
sequence: [1, 2, 3, 4, 5, 6, 7, 8]
sequence_lock: true
gates_at: [7, 8]
sentinel_checkpoints: [pre_7]
stop_rule_max_failures: 2
---

# Bug Fix Light Workflow (8 prescriptive steps)

This skill executes a deterministic 8-step procedure for SIMPLES/MEDIA bugs. The procedure is **non-negotiable**: order is locked, execution mode per step is locked, and gates cannot be skipped. The 6 audit gaps from spec §21.1 are closed by enriched steps 3, 5, 6.

## When to use this skill

Use **bugfix-light** when ALL of the following hold:
- Bug touches at most 2 files
- Diff is expected to be at most ~50 lines
- No cross-cutting business rules / persistence / concurrency / multi-user impact at first glance
- Bug is reproducible deterministically

If any of these does not hold, the workflow auto-escalates at step 7 (Complexity Gate) and recommends migrating to `bugfix-heavy`.

## Steps overview

| # | Step | File | execution_mode | agent_type | Gate? |
|---|------|------|----------------|------------|-------|
| 1 | Understand Behavior | [steps/01-understand-behavior.md](steps/01-understand-behavior.md) | inline | — | no |
| 2 | Simple Bug Analysis (RED test) | [steps/02-simple-bug-analysis.md](steps/02-simple-bug-analysis.md) | inline | — | no |
| 3 | Impact Check (invariants BEFORE) | [steps/03-impact-check.md](steps/03-impact-check.md) | inline | — | no |
| 4 | Point Fix (TDD GREEN) | [steps/04-point-fix.md](steps/04-point-fix.md) | inline | — | no |
| 5 | Post-Fix Validation (RED→regression) | [steps/05-post-fix-validation.md](steps/05-post-fix-validation.md) | subagent | general-purpose | no |
| 6 | Persistence Quick Check | [steps/06-persistence-quick-check.md](steps/06-persistence-quick-check.md) | subagent | general-purpose | no |
| 7 | Complexity Gate | [steps/07-complexity-gate.md](steps/07-complexity-gate.md) | inline | — | yes (AskUserQuestion) |
| 8 | Pa de Cal (final GO/NO-GO) | [steps/08-pa-de-cal.md](steps/08-pa-de-cal.md) | inline | — | yes (AskUserQuestion) |

## Execution rules (8 enforcement rules — non-negotiable)

These rules are baked into the frontmatter contract. The dispatch-guard hook + sentinel-hook validate them at runtime. Violations are blocked deterministically — there is no agent discretion.

1. **Sequence lock** — steps execute strictly in order 1→2→3→4→5→6→7→8. No skip, no reorder. Validated via `sequence:` + `sequence_lock: true` in this SKILL.md plus `expected_next:` in each step.
2. **Execution-mode lock** — each step declares `execution_mode: inline | subagent` in its frontmatter. The agent CANNOT swap modes at runtime. Inline steps run in main context; subagent steps spawn a Task with the declared `agent_type`.
3. **Agent-type whitelist** — when `execution_mode: subagent`, the step declares the EXACT `agent_type:` allowed. dispatch-guard rejects any other agent.
4. **Output schema** — each step declares `expected_outputs:`. The next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 7 and 8 declare `gate_required: true`. The skill MUST invoke AskUserQuestion at those points. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures (build, test, validation) halt the pipeline. `stop_rule_max_failures: 2` enforced by sanity-checker + checkpoint-validator.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state before step 7 (`sentinel_checkpoints: [pre_7]`). Outside this checkpoint, sentinel blocks execution.

## How execution flows

1. The skill is invoked via `/pipeline-orchestrator:bugfix-light "<bug description>"` (or via `/pipeline-orchestrator:bugfix --light` after pipeline-controller dispatch).
2. The orchestrator reads `sequence:` from this file and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, and:
   - if `execution_mode: inline`, the agent processes the step body in main context using `allowed_tools` from the step
   - if `execution_mode: subagent`, the agent spawns a Task with `agent_type:` and passes `expected_inputs` from previous steps
4. Outputs are accumulated; `expected_next` chains to the following step.
5. Gates (steps 7, 8) raise AskUserQuestion before transitioning out.
6. On any failure, the STOP RULE rule may halt the pipeline.

## Reference docs

- Test strategy across the 8 steps: [tests/tests-bugfix-light.md](tests/tests-bugfix-light.md)
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §21
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\light\` (LIGHT_01..07 + LIGHT_PA_DE_CAL + TESTS_BUGFIX_LIGHT)

## Gap closures relative to v4.3.1 plugin

- **Light 3 — invariants BEFORE the fix**: enforced in `steps/03-impact-check.md` (REQUIRED OUTPUT block listing invariants + edge cases is mandatory before step 4).
- **Light 5 — RED → regression promotion**: enforced in `steps/05-post-fix-validation.md` (PROMOTION ACTION subsection + commit `test(regression): promote bug-X repro to regression suite`).
- **Light 6 — Persistence Quick Check**: net-new step, no v4.3.1 equivalent. Enforced in `steps/06-persistence-quick-check.md` (rerun-twice protocol + `persistence_stable` / `side_effects_detected` outputs).
