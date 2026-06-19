---
name: refactor-heavy
description: Prescriptive 11-step refactor workflow for COMPLEXA / cross-module restructures (behavior-preserving across module boundaries). Restructure code WITHOUT changing observable behavior, made auditable by REFACTOR_SCOPE_LOCK + a before/after characterization snapshot, PLUS a final 3-parallel adversarial review, a post-refactor UX user-journey E2E, and an after-all sanity sweep. Steps 1-2 inline (understand scope + terrain/impact), step 3 subagent (characterization tests via pre-tester in characterization mode — MUST PASS), step 4 inline gate (refactor plan + REFACTOR_SCOPE_LOCK — fires before first file touch), step 5 inline (execute minimal diff), step 6 subagent (characterization rerun — IDENTICAL verdict), step 7 inline (complexity/risk confirmation), step 8 parallel subagents gate (adversarial security+architecture+quality), step 9 subagent (post-refactor UX E2E), step 10 inline gate (Pa de Cal GO/NO-GO), step 11 subagent (final after-all sanity sweep). Reuses explore + plan-architect + pre-tester + executor-implementer-task + diff-discipline-reviewer + review-orchestrator/adversarial reviewers — ZERO genuinely-new agents. Manual-only invocation via /pipeline-orchestrator:refactor-heavy or via /pipeline-orchestrator:refactor --heavy, or via auto-escalation from refactor-light step 7.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [what to restructure + which modules/region]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
sequence_lock: true
gates_at: [4, 8, 10]
sentinel_checkpoints: [pre_4, pre_8, pre_10]
stop_rule_max_failures: 2
---

# Refactor Heavy Workflow (11 prescriptive steps)

This skill executes a deterministic 11-step procedure for COMPLEXA / cross-module refactors — restructuring code that crosses module boundaries without changing what it does from the outside. The procedure is **non-negotiable**: order is locked, execution mode per step is locked, and gates cannot be skipped. The signature gate `REFACTOR_SCOPE_LOCK` (HARD) fires at step 4, before the first file is touched. The heavy tier adds, over the light tier, a final 3-parallel adversarial review (step 8), a post-refactor UX user-journey E2E (step 9), and an after-all sanity sweep (step 11) distinct from Pa de Cal (step 10).

The mental model is behavior preservation under independent scrutiny: capture the public behavior in characterization tests BEFORE any edit (step 3), restructure under a signed scope contract (steps 4-5), prove the public behavior is IDENTICAL afterward (step 6), then subject the change to independent adversarial review and a user-journey check (steps 8-9) before the GO/NO-GO and a mechanical after-all sweep. The structural template is `skills/bugfix-heavy/SKILL.md` (same 11-step shape, same enforcement rules, same gap-closure pattern at steps 8/9/11).

## When to use this skill

Use **refactor-heavy** when ANY of the following hold:
- Restructure crosses module / package boundaries (cross-module blast radius)
- More than ~2 files OR more than ~50 lines of diff
- The public surface is consumed by many callers, or the invariants are subtle / implicit / cross-cutting
- High regression risk
- `refactor-light` auto-escalated at its step 7 complexity gate

If none of these hold, prefer `refactor-light` (8 steps, lighter ceremony, no final adversarial pair).

## Steps overview

| # | Step | File | execution_mode | agent_type | Gate? |
|---|------|------|----------------|------------|-------|
| 1 | Understand Scope | [steps/01-understand-scope.md](steps/01-understand-scope.md) | inline | — | no |
| 2 | Terrain + Impact | [steps/02-terrain-impact.md](steps/02-terrain-impact.md) | inline | — | no |
| 3 | Characterization Tests (MUST PASS) | [steps/03-characterization-tests.md](steps/03-characterization-tests.md) | subagent | `pipeline-orchestrator:quality:pre-tester` (characterization mode) | no |
| 4 | Refactor Plan + REFACTOR_SCOPE_LOCK | [steps/04-refactor-plan-scope-lock.md](steps/04-refactor-plan-scope-lock.md) | inline | — | **yes (REFACTOR_SCOPE_LOCK — REQUIRES SIGNED CONTRACT)** |
| 5 | Execute Minimal Diff | [steps/05-execute-minimal-diff.md](steps/05-execute-minimal-diff.md) | inline | — | no |
| 6 | Characterization Rerun (IDENTICAL) | [steps/06-characterization-rerun.md](steps/06-characterization-rerun.md) | subagent | `pipeline-orchestrator:quality:pre-tester` (characterization rerun) | no |
| 7 | Risk Consolidation (Complexity / Risk Confirmation) | [steps/07-risk-consolidation.md](steps/07-risk-consolidation.md) | inline | — | no |
| 8 | Final Adversarial Review (3 parallel) | [steps/08-adversarial-review.md](steps/08-adversarial-review.md) | subagent (parallel x3) | `pipeline-orchestrator:executor:type-specific:adversarial-{security-scanner,architecture-critic,quality-reviewer}` | **yes** |
| 9 | UX User Journey E2E (post-refactor) | [steps/09-ux-user-journey-e2e.md](steps/09-ux-user-journey-e2e.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-simulator` | no |
| 10 | Pa de Cal (GO / CONDITIONAL / NO-GO) | [steps/10-pa-de-cal.md](steps/10-pa-de-cal.md) | inline | — | **yes (GO/NO-GO)** |
| 11 | Final Validation After-All (distinct) | [steps/11-final-validation-after-all.md](steps/11-final-validation-after-all.md) | subagent | `general-purpose` (read-only verification) | no |

## Execution rules (8 enforcement rules — non-negotiable)

These rules are baked into the frontmatter contract. The dispatch-guard hook + sentinel-hook validate them at runtime. Violations are blocked deterministically.

1. **Sequence lock** — steps execute strictly in order 1→2→3→4→5→6→7→8→9→10→11. No skip, no reorder. Validated via `sequence:` + `sequence_lock: true` plus `expected_next:` per step.
2. **Execution-mode lock** — each step declares `execution_mode: inline | subagent`. Cannot be swapped at runtime.
3. **Agent-type whitelist** — when `execution_mode: subagent`, the step declares the EXACT `agent_type:` allowed. dispatch-guard rejects any other agent. Step 3 dispatches `pre-tester` in **characterization mode** (tests MUST PASS). Step 8 declares the parallel adversarial trio and the body documents the 3-spawn pattern (single message, three Task tool calls in parallel).
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 4, 8, 10 declare `gate_required: true`. The skill MUST invoke AskUserQuestion at those points. Prose substitution is forbidden. Step 4 is the REFACTOR_SCOPE_LOCK gate: it blocks until the CHANGE_CONTRACT plan-block exists and is signed, and aborts if a forbidden change (new public API, changed error codes, changed output format, changed side-effects) is proposed.
6. **STOP RULE** — 2 consecutive failures (build, test, characterization divergence) halt the pipeline. `stop_rule_max_failures: 2` enforced by sanity-checker + checkpoint-validator.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state coherence before steps 4, 8, 10 (`sentinel_checkpoints: [pre_4, pre_8, pre_10]`). Outside these checkpoints, sentinel blocks execution.

## How execution flows

1. The skill is invoked via `/pipeline-orchestrator:refactor-heavy "<what to restructure>"` (or via `/pipeline-orchestrator:refactor --heavy` after pipeline-controller dispatch, or via auto-escalation from `refactor-light` step 7).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, and:
   - if `execution_mode: inline`, the agent processes the step body in main context using `allowed_tools` from the step
   - if `execution_mode: subagent`, the agent spawns a Task with `agent_type:` and passes `expected_inputs` from previous steps
   - for step 8 (parallel), three Task calls are spawned in a SINGLE message (security-scanner + architecture-critic + quality-reviewer)
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 4, 8, 10) raise AskUserQuestion before transitioning. Step 4 additionally validates the signed CHANGE_CONTRACT and fires REFACTOR_SCOPE_LOCK.
6. On any failure (including a DIVERGED characterization verdict at step 6), the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 11 steps: [tests/tests-refactor-heavy.md](tests/tests-refactor-heavy.md)
- Design rationale: `docs/specs/2026-06-19-missing-pipeline-workflows-roadmap/design.md` → "Refactor workflow"
- Signature gate definition: `references/gates.md` → `REFACTOR_SCOPE_LOCK`
- Characterization mode contract: `agents/quality/pre-tester.md` → "Characterization Mode"
- Structural template (11-step shape): `skills/bugfix-heavy/SKILL.md`
- Light-tier counterpart (when complexity allows): `skills/refactor-light/SKILL.md`

## How refactor-heavy differs from refactor-light

- **Adds step 8** — a final 3-parallel adversarial review (security + architecture + quality), independent zero-context scrutiny of the cross-module restructure. The light variant has NO final-adversarial step.
- **Adds step 9** — a post-refactor UX user-journey E2E, confirming the user-facing flow is unchanged from the user's perspective (refactors of UI-adjacent code can subtly shift behavior).
- **Adds step 11** — an after-all sanity sweep distinct from Pa de Cal (step 10): step 10 is the subjective GO/NO-GO, step 11 is the mechanical verification (artifacts intact, commits made, branch clean, cold-checkout characterization passes).
- Same signature gate (REFACTOR_SCOPE_LOCK at step 4) and same IDENTICAL proof (step 6) as the light variant.
