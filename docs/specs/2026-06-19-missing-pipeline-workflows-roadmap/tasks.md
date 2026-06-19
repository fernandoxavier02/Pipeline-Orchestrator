# Tasks: Missing Pipeline Workflows Roadmap

Status: VALIDATING
Subject: pipeline-orchestrator plugin (v8.7.0). META-SPEC, design-only.

## How to read this file

These are FUTURE per-workflow IMPLEMENTATION task skeletons, one slice per proposed workflow. They are NOT authoring tasks for this spec — the authoring proof for this spec lives in spec.json approvals and the seal. Nothing here is executed by this spec. A future implementer picks one slice and runs it as its own pipeline. Each task is checkbox-unchecked because none is done. The phased order (Req 8) is: Slice 1 (Refactor) and Slice 4 (Release) first, then Slice 2 (Performance), then Slice 3 (Migration).

Where a task touches a non-standard case (a validator reading external state, a circuit-breaker recovery path), a brief testability note names how a future implementer would prove it — these are hints for the eventual TDD step, not new authoring work.

## Slice 1: Refactor workflow

The Refactor workflow restructures code without changing behavior. Zero genuinely-new agents; the highest-reuse flow.

### [ ] Task 1. Create the refactor light/heavy skill folders
- Create `skills/refactor-light/` and `skills/refactor-heavy/` mirroring an existing light/heavy pair's frontmatter shape.
- Light skips the final adversarial pair; heavy includes it.
- Requirements: Req 3.

### [ ] Task 1.1. Define the CHANGE_CONTRACT use in the plan step
- The Refactor workflow plan-architect step reuses the existing `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` plan-block (allowed vs. forbidden change types) per the design data model. No new artifact is defined.
- Requirements: Req 5.

### [ ] Task 1.2. Register the REFACTOR_SCOPE_LOCK gate (HARD, additive)
- Append the `REFACTOR_SCOPE_LOCK` gate row to the Gate Registry following the gate-registration appendix; fire before first file touch; consume the CHANGE_CONTRACT plan-block; abort on a forbidden change. The gate name is distinct from the CHANGE_CONTRACT plan-block by design.
- Requirements: Req 5.

### [ ] Task 1.3. Wire BEHAVIOR_EVIDENCE for Refactor (pre-tester characterization mode)
- Capture the before/after characterization-test snapshot via pre-tester run in its thin-wrapper "characterization" mode (tests MUST PASS against current behavior). Bind the identical-results check to public-surface tests only; verdict IDENTICAL gates the close.
- Testability note: add a regression test that pre-tester's characterization mode emits PASS-expecting tests (not the RED-phase MUST-FAIL default), and that an internal-only test change does NOT trip the DIVERGED verdict while a public-surface change does.
- Requirements: Req 4.

### [ ] Task 1.4. Add Refactor to the nine lockstep surfaces + Paperclip mirror + help stub
- Update classification, routing, team-registry, manifests, hooks, and `commands/help.md` (paste the authored Refactor help stub from the design.md help-stub appendix); add the PAPERCLIP-REFACTOR-WORKFLOW doc + thin wrapper + catalog row.
- Requirements: Req 1, Req 7, Req 8.

## Slice 2: Performance workflow

The Performance workflow makes slow code fast and proves the speedup with numbers.

### [ ] Task 2. Create the performance light/heavy skill folders
- Create `skills/performance-light/` and `skills/performance-heavy/`.
- Requirements: Req 3.

### [ ] Task 2.1. Build the genuinely-new performance-benchmark-validator agent
- New agent runs the agreed benchmark before and after and emits the before/after numbers.
- Requirements: Req 3, Req 4.

### [ ] Task 2.2. Register the PERF_REGRESSION gate (HARD)
- Append the gate row per the registration appendix; consume the benchmark snapshot at close; block a win claim that does not beat the before-numbers, and block if any measured metric regressed past its before-value. The gate is always HARD (no "hot path" auto-detection exists; KISS).
- Requirements: Req 5.

### [ ] Task 2.3. Add Performance to the nine lockstep surfaces + Paperclip mirror + help stub
- Includes pasting the authored Performance help stub into `commands/help.md`.
- Requirements: Req 1, Req 7, Req 8.

## Slice 3: Migration workflow

The Migration workflow bumps libraries or migrates schema in reversible steps with an enforced rollback plan.

### [ ] Task 3. Create the migration light/heavy skill folders
- Create `skills/migration-light/` and `skills/migration-heavy/`.
- Requirements: Req 3.

### [ ] Task 3.1. Build the genuinely-new migration-safety-checker agent
- New agent validates rollback-plan completeness and runs the pre/post health check.
- Requirements: Req 3, Req 4.

### [ ] Task 3.2. Register the MIGRATION_COMMITTED gate (HARD → CIRCUIT_BREAKER)
- Append the gate row per the registration appendix; fire at the mandatory pre-destructive-op confirmation immediately before the single plan step tagged `irreversible: true`; escalate + halt with a recovery instruction if the rollback plan is missing or "no rollback possible". For a light Migration with no irreversible step, the gate is trivially SATISFIED ("reversible: no point of no return"), not skipped silently.
- Testability note: add a regression test that the gate fires CIRCUIT_BREAKER when the rollback artifact is absent or `no_rollback_possible: true`, asserting the run halts and the recovery instruction is emitted; and a test that a zero-irreversible-step plan records the SATISFIED-reversible outcome rather than skipping the gate.
- Requirements: Req 5.

### [ ] Task 3.3. Add Migration to the nine lockstep surfaces + Paperclip mirror + help stub
- Includes pasting the authored Migration help stub into `commands/help.md`.
- Requirements: Req 1, Req 7, Req 8.

## Slice 4: Release workflow

The Release workflow ships across all channels with no forgotten channel; AUDIT-pattern template, light + heavy.

### [ ] Task 4. Create the release light/heavy skill folders
- Create `skills/release-light/` and `skills/release-heavy/`; light skips adversarial, heavy (default) includes it.
- Requirements: Req 3, Req 6.

### [ ] Task 4.1. Build the genuinely-new channel-parity-validator agent
- New agent checks each Channel Parity Checklist row across channels + the nine lockstep surfaces (including reading external channel state: npm/marketplace/installed-plugins).
- Testability note: the validator reads external channel state, so a future test mocks the channel-state reader (a stub returning a known channel/version map) and asserts the CHANNEL_PARITY gate fails when any row is unsatisfied and passes only when all are.
- Requirements: Req 6.

### [ ] Task 4.2. Register the CHANNEL_PARITY gate (HARD)
- Append the gate row per the registration appendix; fire at close; verify every checklist row satisfied.
- Requirements: Req 5, Req 6.

### [ ] Task 4.3. Materialize the versioned Channel Parity Checklist
- Implement the checklist appendix (15 rows: 6 release channels + 9 lockstep surfaces incl. help.md) as the Release workflow's BEHAVIOR_EVIDENCE channel-parity snapshot input.
- Requirements: Req 4, Req 6.

### [ ] Task 4.4. Add Release to the nine lockstep surfaces + Paperclip mirror + help stub
- Includes pasting the authored Release help stub into `commands/help.md`.
- Requirements: Req 1, Req 7, Req 8.

## Slice 5: Second-tier flags (no new commands)

### [ ] Task 5. Implement the four second-tier verdicts as flags
- Add `pipeline --test-backfill`, `pipeline review-only --incident` (alias `--postmortem`, riding the existing review-only mode in pipeline.md), `audit --doc-only`; document Research/Spike as already-covered by `brainstorm --no-impl`.
- Each flag rides an existing structure; none becomes a new command unless its promotion criterion is met. Each flag also gets a one-line entry under its host command in `commands/help.md`.
- Requirements: Req 2.
