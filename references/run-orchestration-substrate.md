# Run-Orchestration Substrate (SSOT)

> Single source of truth for the run-directory / manifest / audit-trail machinery shared by every N1 orchestrator. Introduced v8.0.0 so the `spec-controller` and the `brainstorm-controller` reuse one implementation instead of duplicating it.

## Why this exists

Two N1 controllers now exist:
- `agents/core/brainstorm-controller.md` — clarification → Kiro lifecycle → handoff.
- `agents/core/spec-controller.md` — clarification → forced interrogator → Kiro lifecycle → adversarial-review loop → seal.

Their **step sequences differ** (different terminus), but the run-directory allocation, manifest transitions, and audit-trail append are **identical**. Those identical parts are the substrate. Each controller owns only its own sequence and calls the substrate for everything else. This prevents the DRY/SSOT violation of duplicating run machinery and the SRP violation of bolting two lifecycles onto one controller.

## Substrate contract

### Run-directory allocation
- Implementation: `lib/run-directory.cjs` (`RunDirectory.allocate`). Exclusive `mkdir`, collision-resistant `uniqueId`, publishes `PIPELINE_RUN_ID`.
- Both controllers MUST allocate via this helper; neither computes run ids or creates run dirs inline.
- Layout: `pipeline-runs/<run_id>/` with subfolders `00-brainstorm`, `01-spec`, `02-validations`, `03-execution`, `attachments`.

### Manifest transitions
- Implementation: `lib/run-manifest.cjs` parsing/validation rules.
- Protocol (both controllers): pre-step mark `in_progress_step=N`; run step; post-step commit `step_completed=N` + `updated_at`; strip the in-progress marker. Crash recovery keys on a lingering `in_progress_step` with `step_completed < N`.
- `notes.options` carries per-run flags; **missing flags are treated as auto-skipped on resume** (backward-compat with legacy runs).

### Audit-trail append
- Gate/telemetry events go through `lib/gate-decision-writer.cjs` (closed 8-value decision vocabulary: `BLOCKED`, `DISPATCHED`, `SKIPPED`, `APPROVED`, `CONFIRMED`, `REJECTED`, `TRIGGERED`, `NOT_TRIGGERED`). Event names live in the `gate` field; the human label lives in `detail`. The writer throws on unknown decision values.
- Append-only JSONL under the run directory. Exclusive-lock append per `lib/exclusive-lock.cjs`.

## spec.json lifecycle (documented schema)

`spec.json.phase` progresses: `initialized` → `requirements-generated` → `design-generated` → `tasks-generated` → `sealed`. `phase` is the SSOT for lifecycle state. At seal, the spec-controller also sets the derived `ready_for_implementation: true`, `spec_version` (1, incremented on `--amend`), `sealed_at`, and a `sealed_spec` pointer `{ run_dir, artifacts:[the five filenames] }`. Content hashing of artifacts is deferred to the future enforcement gate (Req 8 follow-up) — the seal stores a pointer, not hashes.

## notes.options ownership (avoid cross-controller collision)

Both controllers store per-run flags in the `notes.options` JSON blob. To prevent silent key collisions:
- `controller_type` (`"brainstorm"` | `"spec"`) is stamped at allocation and identifies which controller owns the run; terminal-guard checks MUST respect it.
- brainstorm-owned: `no_impl`, `skip_validate_gap`, `type`, `plan_flag`, `alternatives_done`, `ideation_done`.
- spec-owned: `controller_type`, `alternatives_done`, `ideation_done`, `interrogator_done`, `spec_review_done`, `spec_review_attempts`, `spec_sealed`, `max_review_attempts`.
A controller MUST NOT act on a flag outside its ownership set without first checking `controller_type`.

## Invariant

A controller that re-implements any of run-dir allocation, manifest transition, or audit append (instead of calling the substrate) is a substrate violation. The v8.0.0 regression suite asserts both controllers resolve to the same substrate helpers.
