# Manual Validation Log

Record of BDD scenario runs and smoke test outcomes for pipeline-orchestrator v4.

Each row captures one manual run. Scenarios live in `tests/test_pipeline_controller.md` (BDD) and `tests/fixtures/sample-pipeline-run/README.md` (E2E smoke).

| Date | Plugin hash | Scenario | Result | Notes |
|------|-------------|----------|--------|-------|
| _TBD_ | _TBD_ | _(first run pending)_ | _—_ | _—_ |

## How to add a row

1. Run the scenario per its README.
2. Capture plugin git short hash: `git rev-parse --short HEAD` in the plugin fork.
3. Result: `PASS` / `FAIL` / `PARTIAL` (with checklist progress, e.g. `PARTIAL 7/10`).
4. Notes: anything surprising — hook failures, rationalization attempts, timing, missing artifacts.

## Gate for v4.0.0 release

A tag of `v4.0.0` (promoting the `v4.0.0-draft.1` fork to release) requires at minimum:

- 1 E2E smoke (`sample-pipeline-run`) with PASS
- 3 of 6 BDD scenarios from `test_pipeline_controller.md` with PASS
- Zero critical findings from a final adversarial review pass on the complete fork
