# E2E-Eval Fixture Baseline

This directory is a byte-for-byte snapshot of the sealed run
`2026-06-29-telemetry-instrumentation-spec`, captured for use as a
deterministic fixture in the e2e-evaluator replay path.

## Source run

- **Run id:** `2026-06-29-telemetry-instrumentation-spec`
- **Sealed source (read-only reference):**
  `.pipeline/docs/Pre-Complexa-action/2026-06-29-telemetry-instrumentation-spec/`
- **Snapshot recorded:** 2026-07-03
- **Fixture files (7):** `sentinel-state.json`, `gate-decisions.jsonl`,
  `protocol-events.jsonl`, `e2e-eval.json`, `e2e-eval.md`,
  `fidelity-report.json`, `machine-evidence.jsonl`
- **Fixture integrity:** all 7 files verified identical to the sealed source
  via SHA-256 hash comparison + `git diff --no-index` on 2026-07-03 (no
  re-sync was needed — every file already matched byte-for-byte).

## Known replay values (from the sealed run's `e2e-eval.json`)

Calling the PURE `lib/e2e-evaluator.cjs::scoreRun({ pipelineDocPath, state })`
against this fixture directory (with `state` loaded from `sentinel-state.json`)
reproduces:

- `e2e_score` = **30**
- `glitch_count` = **26**

Verified live on 2026-07-03 (`ok: true`, both assertions held).

## Test suite baseline

- **Command:** `node scripts/run-tests.cjs` (run from repo root
  `claude-code/Pipeline-Orchestrator/`)
- **Observed on 2026-07-03:** `257 passed / 5 failed / 262 total`

## Reconciliation note

The task brief referenced a `256 / 6 / 262` figure. The live run on 2026-07-03
produced `257 / 5 / 262` instead: the total is unchanged (262), but one test
that was previously counted as failing now passes, shifting one unit from the
fail column to the pass column. This `257 / 5` figure matches the current
v8.20.0 release baseline documented in `CLAUDE.md` ("Suíte 257/5"), so the
live number is the expected one and the `256 / 6` figure is stale. Note: no
explicit suite-count figure was found inside the sealed spec's own documents
(`.pipeline/docs/.../2026-06-29-telemetry-instrumentation-spec/`) nor in
`.kiro/specs/telemetry-instrumentation-gap/tasks.md`; the `256 / 6 / 262`
number originated only in the task brief. All numbers above were observed
live, never hardcoded from an assumption.
