# v4 Pipeline Smoke Test — Sample Run

## Purpose

Validate end-to-end that `/pipeline-orchestrator:pipeline` on v4 correctly:

1. Creates session lock via `session-lock-hook`
2. Blocks direct Edit attempts via `edit-guard-hook`
3. Spawns `pipeline-controller` agent (N1 orchestrator)
4. Controller spawns `task-orchestrator` (N2)
5. Session completes with GO

## Scenario

Task: "Add function `add(a, b)` that returns `a + b` to sample.py"

## Prerequisites

- v4 plugin enabled (disable any v3.x installation of `pipeline-orchestrator` first)
- Fresh working directory (no active `.pipeline/sessions/*.lock` from a prior run)

## Execution

1. Enable v4 plugin (disable v3 if present).
2. Invoke in the project root:

   ```
   /pipeline-orchestrator:pipeline Add function add(a,b) returning a+b to tests/fixtures/sample-pipeline-run/sample.py
   ```

3. Observe (check each):
   - [ ] `SessionStart` hook announces v4 banner
   - [ ] `UserPromptSubmit` hook creates `.pipeline/sessions/{id}.lock`
   - [ ] Main LLM spawns `pipeline-controller` agent (visible as a Task/Agent call in the transcript)
   - [ ] If main LLM tries Edit/Write outside `.pipeline/`, `edit-guard-hook` returns `permissionDecision: deny` with the unlock instructions
   - [ ] Controller emits `PIPELINE PROPOSAL` block
   - [ ] `AskUserQuestion` appears with 3 options (Yes / Adjust / No)
   - [ ] Confirming "Yes" advances to Phase 2 and subsequent phases
   - [ ] After conclusion: `PIPELINE COMPLETE` block visible to main LLM
   - [ ] `sample.py` contains `def add(a, b): return a + b`
   - [ ] `.pipeline/docs/Pre-*/` contains per-agent artifacts + `gate-decisions.jsonl`

## Recording

Log the outcome in `tests/manual-validation-log.md`. Include:

- Date/time of run
- Plugin version (git short hash of the fork)
- Pass/fail per checkbox above
- Any unexpected hook behavior, stalls, or rationalization attempts by main LLM

## Cleanup

```bash
rm -rf .pipeline/sessions .pipeline/docs
git checkout tests/fixtures/sample-pipeline-run/sample.py
```

## Known limitations tested by this fixture

- **Not tested here:** REVIEW-ONLY mode (requires explicit file list in v4 — see `docs/MIGRATION-v3-to-v4.md`).
- **Not tested here:** context-exhaustion checkpoint/resume (currently validated only via the explicit-signal path in `tests/test_pipeline_controller.md`).
