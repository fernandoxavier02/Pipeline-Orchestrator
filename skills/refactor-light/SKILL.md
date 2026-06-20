---
name: refactor-light
description: Prescriptive 8-step refactor workflow for SIMPLES/MEDIA restructures (single-module, behavior-preserving). Restructure code WITHOUT changing observable behavior; behavior preservation is made auditable by the REFACTOR_SCOPE_LOCK contract and a before/after characterization-test snapshot. Steps 1-2 inline (understand scope + terrain/impact), step 3 subagent (characterization tests via pre-tester in characterization mode — tests MUST PASS), step 4 inline gate (refactor plan + REFACTOR_SCOPE_LOCK — fires before first file touch), step 5 inline (execute minimal diff), step 6 subagent (characterization rerun — IDENTICAL verdict required), 7-8 inline gates (complexity gate + Pa de Cal). Light ceremony — the independent final-review pass of the heavy tier is intentionally omitted here. Reuses explore + plan-architect + pre-tester + executor-implementer-task + diff-discipline-reviewer — ZERO genuinely-new agents. Manual-only invocation via /pipeline-orchestrator:refactor-light or via /pipeline-orchestrator:refactor --light.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [what to restructure + which module/region]
sequence: [1, 2, 3, 4, 5, 6, 7, 8]
sequence_lock: true
gates_at: [4, 7, 8]
sentinel_checkpoints: [pre_4]
stop_rule_max_failures: 2
---

# Refactor Light Workflow (8 prescriptive steps)

This skill executes a deterministic 8-step procedure for SIMPLES/MEDIA refactors — restructuring code without changing what it does from the outside. The procedure is **non-negotiable**: order is locked, execution mode per step is locked, and gates cannot be skipped. The signature gate `REFACTOR_SCOPE_LOCK` (HARD) fires at step 4, before the first file is touched. As of v8.8.0 this is enforced at the code level: the `scope-lock-hook` denies the first production write (outside `.pipeline/`) on a refactor run until `REFACTOR_SCOPE_LOCK` is recorded in `gate-decisions.jsonl` — so the gate is no longer prose-only, it is a write-time backstop.

The mental model is behavior preservation: capture the public behavior in characterization tests BEFORE any edit (step 3), restructure under a signed scope contract (steps 4-5), then re-run the same tests and require an IDENTICAL verdict (step 6). The structural template is `skills/bugfix-light/SKILL.md` (same 8-step shape, same enforcement rules); the difference is that refactor proves "nothing changed" instead of "the bug is fixed".

## When to use this skill

Use **refactor-light** when ALL of the following hold:
- Restructure touches a single module / small contiguous region (at most ~2 files, ~50 lines diff)
- No public API surface change, no changed error codes, no changed output format, no changed side-effects
- The code already works correctly — this is a cleanup, not a fix
- The public behavior is exercisable by tests (so a characterization snapshot is possible)

If any of these does not hold — especially a cross-module restructure — the workflow auto-escalates at step 7 (Complexity Gate) and recommends migrating to `refactor-heavy`.

## Steps overview

| # | Step | File | execution_mode | agent_type | Gate? |
|---|------|------|----------------|------------|-------|
| 1 | Understand Scope | [steps/01-understand-scope.md](steps/01-understand-scope.md) | inline | — | no |
| 2 | Terrain + Impact | [steps/02-terrain-impact.md](steps/02-terrain-impact.md) | inline | — | no |
| 3 | Characterization Tests (MUST PASS) | [steps/03-characterization-tests.md](steps/03-characterization-tests.md) | subagent | `pipeline-orchestrator:quality:pre-tester` (characterization mode) | no |
| 4 | Refactor Plan + REFACTOR_SCOPE_LOCK | [steps/04-refactor-plan-scope-lock.md](steps/04-refactor-plan-scope-lock.md) | inline | — | **yes (REFACTOR_SCOPE_LOCK — REQUIRES SIGNED CONTRACT)** |
| 5 | Execute Minimal Diff | [steps/05-execute-minimal-diff.md](steps/05-execute-minimal-diff.md) | inline | — | no |
| 6 | Characterization Rerun (IDENTICAL) | [steps/06-characterization-rerun.md](steps/06-characterization-rerun.md) | subagent | `pipeline-orchestrator:quality:pre-tester` (characterization rerun) | no |
| 7 | Complexity Gate | [steps/07-complexity-gate.md](steps/07-complexity-gate.md) | inline | — | yes (AskUserQuestion) |
| 8 | Pa de Cal (final GO/NO-GO) | [steps/08-pa-de-cal.md](steps/08-pa-de-cal.md) | inline | — | yes (AskUserQuestion) |

## Execution rules (8 enforcement rules — non-negotiable)

These rules are baked into the frontmatter contract. The dispatch-guard hook + sentinel-hook validate them at runtime. Violations are blocked deterministically — there is no agent discretion.

1. **Sequence lock** — steps execute strictly in order 1→2→3→4→5→6→7→8. No skip, no reorder. Validated via `sequence:` + `sequence_lock: true` in this SKILL.md plus `expected_next:` in each step.
2. **Execution-mode lock** — each step declares `execution_mode: inline | subagent` in its frontmatter. The agent CANNOT swap modes at runtime. Inline steps run in main context; subagent steps spawn a Task with the declared `agent_type`.
3. **Agent-type whitelist** — when `execution_mode: subagent`, the step declares the EXACT `agent_type:` allowed. dispatch-guard rejects any other agent. Step 3 dispatches `pre-tester` in **characterization mode** (tests MUST PASS, capturing current behavior — see `agents/quality/pre-tester.md` → "Characterization Mode").
4. **Output schema** — each step declares `expected_outputs:`. The next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 4, 7, and 8 declare `gate_required: true`. The skill MUST invoke AskUserQuestion at those points. Prose substitution is forbidden. Step 4 is the REFACTOR_SCOPE_LOCK gate: it blocks until the CHANGE_CONTRACT plan-block exists and is signed, and aborts the run if a forbidden change (new public API, changed error codes, changed output format, changed side-effects) is proposed.
6. **STOP RULE** — 2 consecutive failures (build, test, characterization divergence) halt the pipeline. `stop_rule_max_failures: 2` enforced by sanity-checker + checkpoint-validator.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state before step 4 (`sentinel_checkpoints: [pre_4]`) — the scope-lock gate, where the first file touch is authorized. Outside this checkpoint, sentinel blocks execution.

## How execution flows

1. The skill is invoked via `/pipeline-orchestrator:refactor-light "<what to restructure>"` (or via `/pipeline-orchestrator:refactor --light` after pipeline-controller dispatch).
2. The orchestrator reads `sequence:` from this file and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, and:
   - if `execution_mode: inline`, the agent processes the step body in main context using `allowed_tools` from the step
   - if `execution_mode: subagent`, the agent spawns a Task with `agent_type:` and passes `expected_inputs` from previous steps
4. Outputs are accumulated; `expected_next` chains to the following step.
5. Gates (steps 4, 7, 8) raise AskUserQuestion before transitioning out. Step 4 additionally validates the signed CHANGE_CONTRACT and fires REFACTOR_SCOPE_LOCK.
6. On any failure (including a DIVERGED characterization verdict at step 6), the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 8 steps: [tests/tests-refactor-light.md](tests/tests-refactor-light.md)
- Design rationale: `docs/specs/2026-06-19-missing-pipeline-workflows-roadmap/design.md` → "Refactor workflow"
- Signature gate definition: `references/gates.md` → `REFACTOR_SCOPE_LOCK`
- Characterization mode contract: `agents/quality/pre-tester.md` → "Characterization Mode"
- Structural template (8-step shape): `skills/bugfix-light/SKILL.md`
- Heavy-tier counterpart (when complexity allows): `skills/refactor-heavy/SKILL.md`

## How refactor differs from bugfix-light (same shape, inverted proof)

- **Step 3** authors characterization tests that MUST **PASS** (snapshot current behavior), not RED tests that MUST FAIL. The inversion is documented as pre-tester's characterization mode.
- **Step 4** is a HARD scope-lock gate (REFACTOR_SCOPE_LOCK) that fires BEFORE the first file touch — bugfix-light has no equivalent pre-touch contract gate.
- **Step 6** requires an IDENTICAL public-behavior verdict (proof nothing changed), where bugfix-light promotes a RED test to a regression guard (proof the bug is fixed).
- **No independent final-review pass** — light ceremony. The heavy variant adds that scrutiny.
