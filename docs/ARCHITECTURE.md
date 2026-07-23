# Architecture

> How a request flows through the pipeline, what the agent roster looks like, and how depth scales with complexity. Moved from the README front page — the [README](../README.md) keeps the summary; this document keeps the detail.

<div align="center">
  <img src="../assets/diagrams/architecture-animated.svg" alt="Agent architecture — four layers of agent definition files" width="100%"/>
</div>

## How It Works — the four phases

Every non-trivial request flows through four phases.

### Phase 0 — Triage
`task-orchestrator` classifies your request by **type** (Bug Fix / Feature / Audit / UX / Spec / User Story / Refactor), **complexity** (SIMPLES / MEDIA / COMPLEXA), and **variant**. `information-gate` blocks on critical missing info; on COMPLEXA, `design-interrogator` walks the trade-off tree one question at a time.

### Phase 1.5 — Planning
`plan-architect` enters Plan Mode (read-only), maps the codebase, and emits an `IMPLEMENTATION_PLAN` with the `CHANGE_CONTRACT`, task breakdown, dependency order, risk assessment, and (on COMPLEXA) a Bounded Contexts table. You approve, adjust, or reject before any code is written.

### Phase 2 — Batch execution with TDD
`quality-gate-router` derives test scenarios from acceptance criteria; you approve them in plain language. `pre-tester` writes them as failing tests (RED). `executor-controller` runs implementation in batches sized by complexity. Each batch: `micro-gate → SCOPE LOCK CHECK → implementer → spec-review → quality-review → checkpoint` → then the three parallel adversarial reviewers. Findings trigger a bounded fix loop (max 3 attempts per cycle, max 4 cycles per batch, with a two-level `ADVERSARIAL_LOOP_BREAKER` that can escalate to a blank-slate `REIMPLEMENT`).

### Phase 3 — Closure (Pa de Cal)
`sanity-checker` runs build + tests + regression. The optional `final-adversarial-orchestrator` re-runs the three reviewers with zero shared context. `final-validator` emits **GO / CONDITIONAL GO / NO-GO** with the confidence score. `finishing-branch` offers four closeout options: commit, push+PR, keep uncommitted, discard.

Three flows run **inside every pipeline**, not as separate types: the **brainstorm** (intake → explore → alternatives → ideation), the **spec lifecycle** (init → requirements → validate-gap → design → validate-design → tasks), and the **3-way adversarial review**.

## The agent roster

**50 agent definition files** across four layers — core, brainstorm, executor (including type-specific variants), and quality. Canonical counts in [`references/agent-registry.json`](../references/agent-registry.json); full roster in [`references/team-registry.md`](../references/team-registry.md).

- **Core orchestration** — `pipeline-controller`, `task-orchestrator`, `information-gate`, `sentinel`, `brainstorm-controller`, `spec-controller`, `checkpoint-validator`, `sanity-checker`, `final-validator`, `finishing-branch`.
- **Quality · planning & review** — `plan-architect`, `design-interrogator`, `quality-gate-router`, `pre-tester`, `review-orchestrator`, plus the three parallel reviewers (`adversarial-batch`, `architecture-reviewer`, `diff-discipline-reviewer`).
- **Executor** — `executor-controller`, `executor-implementer-task`, `executor-fix`, `executor-spec-reviewer`, `executor-quality-reviewer`, `spec-closer`.
- **Type-specific variants & brainstorm** — `feature-*`, `bugfix-*`, `audit-*`, `ux-*`, `spec-*`, `user-story-*`, `adversarial-*`, and the brainstorm steps (`intake → explore → alternatives → ideation`).

**34 skills**, **15 commands**, and **38 enforcement hooks** complete the surface. The hook layer is where prompt-only rules became unbreakable — see [ENFORCEMENT.md](ENFORCEMENT.md).

## Depth by complexity

The plugin scales depth automatically by complexity.

| Complexity | Threshold | Batch size | Plan mode | Adversarial | Wall-clock |
|---|---|---|---|---|---|
| **SIMPLES** | 1-2 files · <30 lines · 1 domain | all-at-once | required | required (universal since v8.6) | ~5-15 min |
| **MEDIA** | 3-5 files · 30-100 lines · 2 domains | 2-3 tasks | automatic | 3-way parallel | ~30-60 min |
| **COMPLEXA** | 6+ files · >100 lines · 3+ domains | 1 task | mandatory | 3-way + final sweep | ~90-180 min |

## Mode flags

**Mode flags** modulate any pipeline: `--hotfix` (production emergency, reduced scope, never skips MANDATORY gates), `--diagnostic` (classify + plan only, no code), `--continue` (resume a previous run), `--review-only` (final adversarial against an uncommitted diff), `--light`/`--heavy` (force depth), `--plan`/`--no-plan` (Plan Mode control), `--strict-spec`, `--on=paperclip`.
