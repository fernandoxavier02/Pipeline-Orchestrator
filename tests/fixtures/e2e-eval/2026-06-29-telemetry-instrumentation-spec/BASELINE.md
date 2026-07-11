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

## Known replay values (post-S2 recalibration, ruler_version 2)

This sealed run is a **spec-authoring** run. Before slice S2 it was scored
against the harsh 24-gate COMPLEXA+SPEC *processing* ruler, which manufactured
an artificially low fidelity — that mismeasurement is exactly the bug slice S2
(tasks 3.1–3.4) fixes. With the recalibrated selector wired through both the
E2E gate-coverage sub-score (task 3.3) and `generateFidelityReport` (task 3.4),
`scoreRun` now measures this run against the small recalibrated authoring set
`["SPEC_SEALED", "SPEC_REVIEW_FINDINGS"]` — both of which fired.

Observed live on 2026-07-04 (`ok: true`), full staged form
`scoreRun({ pipelineDocPath, repoRoot, state })` (writes `fidelity-report.json`):

- `e2e_score` = **85**  (was 30 under the harsh ruler)
- `glitch_count` = **2**  (was 26) — both `hygiene_violation`
  (`DISPATCH_REQUEST`, `DISPATCH_SERVICE`); the false `missing_gate` glitches
  the 24-gate ruler produced are gone
- `fidelity_score` = **1**
- `subscores.gate_coverage` = **1**  (equals `fidelity_score` — one shared selector)
- `subscores.step_completion` = **null**  (steps are N/A for a sealed authoring run)
- `expected.gates` = `["SPEC_SEALED", "SPEC_REVIEW_FINDINGS"]`  (length **2**)
- `ruler_version` = **2**
- written `fidelity-report.json`: `mandatory_expected` = **2**,
  `mandatory_triggered` = **2**, `fidelity_score` = **1**

Note on the doc's original 2-arg form `scoreRun({ pipelineDocPath, state })`
(no `repoRoot`): it likewise reports `e2e_score` = 85 and `glitch_count` = 2,
but its top-level `fidelity_score` stays **0**, because the recalibrated
fidelity producer (`generateFidelityReport`) is only invoked when `repoRoot`
is supplied. `gate_coverage` is 1 in both forms (it is computed locally from
the same recalibrated set). Use the full staged form above to observe the
recalibrated `fidelity_score`.

The harsh pre-S2 figures (`e2e_score` 30 / `glitch_count` 26 / `fidelity_score`
0) remain preserved **byte-for-byte** in the sealed snapshot files
(`e2e-eval.json`, `e2e-eval.md`, `fidelity-report.json`) as the historical
record of the mismeasurement that motivated this slice; those snapshot files
are intentionally left untouched.

## Test suite baseline

- **Command:** `node scripts/run-tests.cjs` (run from repo root
  `claude-code/Pipeline-Orchestrator/`)
- **Observed on 2026-07-04 (with the S2 reporter wiring applied):**
  `279 passed / 5 failed / 284 total`

## Reconciliation note

Two things shifted since the prior `257 / 5 / 262` (2026-07-03) figure, both
observed live and never hardcoded:

1. **Total grew 262 → 284.** The v8.21.0 slice-S2 frozen tests plus later
   regression files were added to the suite between 2026-07-03 and 2026-07-04.
2. **The S2 reporter wiring flipped `v8.21.0/F3_fidelity_same_selector.cjs`
   from RED to GREEN.** The first-act full-suite run (before any edit) observed
   `278 passed / 6 failed / 284 total` with F3 at `0 pass / 3 fail`; after
   task 3.4's additive `recalibratedExpected` override in
   `lib/fidelity-reporter.cjs`, the same suite observed
   `279 passed / 5 failed / 284 total` with F3 at `3 pass / 0 fail`.

The 5 remaining failures are the known pre-existing baseline, none from slice
S2: three Langfuse env tests (`v7.3.0/F8`, `F9`, `F10`), the score-writer test
(`v7.6.0/F2`), and the governed-fail-closed test (`v8.8.0/F4`
`dispatch-pending-gate`, inherited since v8.18.0). All numbers above were
observed live from `node scripts/run-tests.cjs`.
