---
name: bugfix-heavy
description: Prescriptive 11-step bug fix workflow for COMPLEXA bugs and production incidents (cross-cutting concerns, persistence, concurrency, multi-user impact, business rules). Imported from Pulsar bugfix workflow per spec §21. Use when complexity classification is heavy or when bugfix-light auto-escalates at its complexity gate. Steps 1-3 subagent (recon + root-cause + domain truth model), 4 inline gate (controlled change proposal — REQUIRES APPROVAL), 5-6 inline (TDD pre-impl + minimal diff), 7 subagent (sanity + regression), 8 parallel subagents gate (adversarial security+architecture+quality), 9 subagent (post-fix UX E2E), 10 inline gate (Pa de Cal GO/NO-GO), 11 subagent (final after-all sanity sweep). Closes 4 audit gaps Heavy 3 (domain truth model net-new), Heavy 8 (3-way adversarial), Heavy 9 (UX as post-fix E2E), Heavy 11 (after-all distinct from Pa de Cal). Manual-only invocation via /pipeline-orchestrator:bugfix-heavy or via /pipeline-orchestrator:bugfix --heavy.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
argument-hint: [bug description with repro details]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
sequence_lock: true
gates_at: [4, 8, 10]
sentinel_checkpoints: [pre_4, pre_8, pre_10]
stop_rule_max_failures: 2
---

# Bug Fix Heavy Workflow (11 prescriptive steps)

This skill executes a deterministic 11-step procedure for COMPLEXA bugs / production incidents. The procedure is **non-negotiable**: order is locked, execution mode per step is locked, and gates cannot be skipped. The 4 audit gaps from spec §21.2 are closed by net-new step 3 (Domain Truth Model), step 8 (3-way adversarial), refocused step 9 (post-fix UX E2E), and net-new step 11 (final after-all sweep distinct from Pa de Cal).

## When to use this skill

Use **bugfix-heavy** when ANY of the following hold:
- Bug touches more than 2 files OR diff is expected to exceed ~50 lines
- Cross-cutting concerns are involved (persistence, concurrency, multi-user, business rules, source of truth, idempotency, atomicity, cache consistency)
- Bug is a production incident OR has user-visible severity
- Bug is intermittent / non-deterministic / timing-related
- Reproduction requires real services (DB, queues, external APIs)
- `bugfix-light` auto-escalated at its step 7 complexity gate

If none of these hold, prefer `bugfix-light` (8 steps, lighter ceremony).

## Steps overview

| # | Step | File | execution_mode | agent_type | Gate? |
|---|------|------|----------------|------------|-------|
| 1 | Terrain Recon Diagnostic | [steps/01-terrain-recon-diagnostic.md](steps/01-terrain-recon-diagnostic.md) | subagent | `pipeline-orchestrator:executor:type-specific:bugfix-diagnostic-agent` | no |
| 2 | Root Cause Consolidation | [steps/02-root-cause-consolidation.md](steps/02-root-cause-consolidation.md) | subagent | `pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer` | no |
| 3 | Domain Truth Model (GAP CLOSED) | [steps/03-domain-truth-model.md](steps/03-domain-truth-model.md) | subagent | `Explore` (built-in, read-only) | no |
| 4 | Controlled Change Proposal | [steps/04-controlled-change-proposal.md](steps/04-controlled-change-proposal.md) | inline | — | **yes (REQUIRES APPROVAL)** |
| 5 | Test Pre-Implementation | [steps/05-test-pre-impl.md](steps/05-test-pre-impl.md) | inline | — | no |
| 6 | Execute Minimal Diff | [steps/06-execute-minimal-diff.md](steps/06-execute-minimal-diff.md) | inline | — | no |
| 7 | Post-Change Sanity + Regression | [steps/07-post-change-sanity-regression.md](steps/07-post-change-sanity-regression.md) | subagent | `general-purpose` (Bash heavy) | no |
| 8 | Adversarial UX+Tech Review (3 parallel) | [steps/08-adversarial-ux-tech-review.md](steps/08-adversarial-ux-tech-review.md) | subagent (parallel x3) | `pipeline-orchestrator:executor:type-specific:adversarial-{security-scanner,architecture-critic,quality-reviewer}` | **yes** |
| 9 | UX User Journey E2E (GAP CLOSED — post-fix) | [steps/09-ux-user-journey-e2e.md](steps/09-ux-user-journey-e2e.md) | subagent | `pipeline-orchestrator:executor:type-specific:ux-simulator` | no |
| 10 | Pa de Cal (GO / CONDITIONAL / NO-GO) | [steps/10-pa-de-cal.md](steps/10-pa-de-cal.md) | inline | — | **yes (GO/NO-GO)** |
| 11 | Final Validation After-All (GAP CLOSED — distinct) | [steps/11-final-validation-after-all.md](steps/11-final-validation-after-all.md) | subagent | `general-purpose` (read-only verification) | no |

## Execution rules (8 enforcement rules — non-negotiable)

These rules are baked into the frontmatter contract. The dispatch-guard hook + sentinel-hook validate them at runtime. Violations are blocked deterministically.

1. **Sequence lock** — steps execute strictly in order 1→2→3→4→5→6→7→8→9→10→11. No skip, no reorder. Validated via `sequence:` + `sequence_lock: true` plus `expected_next:` per step.
2. **Execution-mode lock** — each step declares `execution_mode: inline | subagent`. Cannot be swapped at runtime.
3. **Agent-type whitelist** — when `execution_mode: subagent`, the step declares the EXACT `agent_type:` allowed. dispatch-guard rejects any other agent. Step 8 declares `agent_type: parallel` and the body documents the 3-spawn pattern (single message, three Task tool calls in parallel).
4. **Output schema** — each step declares `expected_outputs:`; the next step verifies inputs match before proceeding. Fail-closed.
5. **AskUserQuestion gates obrigatórios** — steps 4, 8, 10 declare `gate_required: true`. The skill MUST invoke AskUserQuestion at those points. Prose substitution is forbidden.
6. **STOP RULE** — 2 consecutive failures (build, test, validation) halt the pipeline. `stop_rule_max_failures: 2` enforced by sanity-checker + checkpoint-validator.
7. **Audit log append-only** — every gate decision, AskUserQuestion answer, step transition, and STOP event is appended to `.pipeline/gate-decisions.jsonl`.
8. **Sentinel checkpoints** — sentinel-hook validates state coherence before steps 4, 8, 10 (`sentinel_checkpoints: [pre_4, pre_8, pre_10]`). Outside these checkpoints, sentinel blocks execution.

## How execution flows

1. The skill is invoked via `/pipeline-orchestrator:bugfix-heavy "<bug description>"` (or via `/pipeline-orchestrator:bugfix --heavy` after pipeline-controller dispatch, or via auto-escalation from `bugfix-light` step 7).
2. The orchestrator reads `sequence:` and walks the steps.
3. For each step, the orchestrator opens `steps/0X-*.md`, reads the frontmatter, and:
   - if `execution_mode: inline`, the agent processes the step body in main context using `allowed_tools` from the step
   - if `execution_mode: subagent`, the agent spawns a Task with `agent_type:` and passes `expected_inputs` from previous steps
   - for step 8 (parallel), three Task calls are spawned in a SINGLE message (security-scanner + architecture-critic + quality-reviewer)
4. Outputs accumulate; `expected_next` chains the next step.
5. Gates (steps 4, 8, 10) raise AskUserQuestion before transitioning.
6. On any failure, the STOP RULE may halt the pipeline.

## Reference docs

- Test strategy across the 11 steps: [tests/tests-bugfix-heavy.md](tests/tests-bugfix-heavy.md)
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §21
- Pulsar source playbook (read-only ancestor): `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\heavy\` (HEAVY_01..11 + TESTS_BUGFIX_HEAVY)
- Light-tier counterpart (when complexity allows): `skills/bugfix-light/SKILL.md`

## Gap closures relative to v4.3.1 plugin

- **Heavy 3 — Domain Truth Model (NET-NEW)**: enforced in `steps/03-domain-truth-model.md`. Explicit business rules + source of truth + invariants + property tests + transactional consistency tests BEFORE any code change. v4.3.1 had no equivalent step.
- **Heavy 8 — Adversarial 3-way**: enforced in `steps/08-adversarial-ux-tech-review.md` via three parallel subagents (security-scanner, architecture-critic, quality-reviewer). v4.3.1 had a single-agent adversarial pass; this triples coverage and parallelizes for latency.
- **Heavy 9 — UX as POST-FIX E2E** (refocus): `steps/09-ux-user-journey-e2e.md` is framed as post-fix verification of the user journey end-to-end (mobile-first), NOT generic UX simulation. Confirms the fix from the user's perspective.
- **Heavy 11 — Final Validation After-All (NET-NEW, distinct from Pa de Cal)**: enforced in `steps/11-final-validation-after-all.md`. Step 10 is the GO/NO-GO decision (subjective synthesis). Step 11 is the post-decision sanity sweep (artifacts intact, commits made, branch clean, tests passing on cold checkout). They are distinct phases.
