# Research: Missing Pipeline Workflows Roadmap

Status: VALIDATING
Subject: pipeline-orchestrator plugin (v8.7.0). META-SPEC, design-only.

## Discovery scope

This research backs a META-SPEC: the subject is the plugin itself, and the deliverable documents future workflows rather than implementing them. The discovery was a read-only survey of the existing plugin surfaces a new workflow must integrate with, verified against the repo on 2026-06-19 at version 8.7.0.

## Gap-analysis note

No git-history gap analysis was performed because there is nothing to diff against: none of the eight proposed workflows (Refactor, Performance, Migration, Release, Test Backfill, Research/Spike, Incident/Postmortem, Documentation) exists today. They are greenfield additions. The only incidental mentions in the codebase are unrelated: "refactor" appears inside the red-green-refactor TDD cycle, "migration period" appears in a hook-rollout doc, and schema-migration is listed as a RESTRICTED operation in the implementation-discipline reference. None of these is a workflow. Therefore the validate-gap step has no prior implementation to compare, and this research records the discovery surface instead.

## Verified integration surfaces (evidence)

- **Task-type model.** The task-orchestrator holds the CLASSIFICATION table (five canonical types + Spec). The complexity-matrix holds the ROUTING matrix (type x complexity -> variant). The pipeline-controller dispatches by variant to a skill; the DIRETO/SIMPLES path runs inline.
- **Variant pattern.** A workflow is two skill folders (light + heavy), each a SKILL.md with frozen frontmatter (sequence_lock, gates_at, sentinel_checkpoints, per-step execution_mode + agent_type + expected_inputs/outputs).
- **Gate model / Iron Law.** The Gate Registry declares 48 gates; the Mandatory-Gates-by-Complexity table is cumulative (SIMPLES 11 / MEDIA 13 / COMPLEXA 18, +6 for Spec). The inline gate list in the pipeline command is SSOT and overrides a Grep'd registry on conflict. Adding a gate is additive: append a row, add a mandatory-table check if mandatory, bump the count, add a decision token if new.
- **Existing CHANGE_CONTRACT plan-block.** Verified: `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` already exists (since v6.3.0) and is consumed by the diff-discipline-reviewer. The Refactor workflow REUSES this block; its signature gate is therefore named `REFACTOR_SCOPE_LOCK` (not `CHANGE_CONTRACT`) to avoid a gate-vs-plan-block name collision in the audit trail.
- **Existing review-only mode.** Verified: `pipeline review-only` is a mode inside `commands/pipeline.md` (runs the final adversarial review on uncommitted changes); there is NO `commands/review.md`. The Incident/Postmortem second-tier flag therefore rides `pipeline review-only --incident`, not a non-existent `review` command.
- **Existing help.md.** Verified: `commands/help.md` exists (the plain-language command guide). A new command must add a stub there, which makes help.md the ninth lockstep surface.
- **Agent roster.** 50 agent files on disk (core 11 / brainstorm 4 / executor 6 / executor/type-specific 21 / quality 8). Code-changing workflows reuse a known cluster (executor-implementer-task, quality-gate-router, pre-tester, checkpoint-validator, review-orchestrator, final-adversarial-orchestrator, sanity-checker, final-validator, finishing-branch). pre-tester's hardcoded invariant is "tests MUST FAIL (TDD RED phase)", so Refactor's characterization snapshot needs a thin-wrapper "characterization" mode (a documented prompt delta flipping that one expectation), not a plain reuse. Read-only workflows skip Phase 3. Known drift: team-registry says "20 agents".
- **Nine lockstep surfaces** a new command must update together, enumerated as nine: (1) entry-points.json, (2) the task-orchestrator CLASSIFICATION table, (3) the complexity-matrix ROUTING matrix, (4) the two skill folders, (5) team-registry, (6) the gates Registry, (7) the two enforcement hooks, (8) both plugin manifests (Claude + Cursor), and (9) `commands/help.md` (a stub for the new command). This set is distinct from the release channel fan-out (npm/GitHub/marketplace/cache/installed-plugins) tracked by the Channel Parity Checklist.
- **Paperclip mirror.** Additive only: a workflow document + a thin skill wrapper + a catalog entry; the card tree mounts from the native spec via the tree-factory. No plugin code change.

## Conclusion

The existing architecture has clean extension points for all four strong-gap workflows. Three of them need exactly one genuinely-new agent each to own a proof no existing agent produces; Refactor needs none (only a pre-tester thin-wrapper characterization mode). The four second-tier proposals ride existing structures as flags. Nothing in the survey requires changing the Iron Law tables — only additive entries.
