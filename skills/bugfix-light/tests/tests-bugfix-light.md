# Test Strategy — Bug Fix Light (8-step Skill)

This document orients test creation and execution across the 8 steps of `bugfix-light`. The test strategy is the bridge that turns a bug report into a permanent regression guard. Adapted from Pulsar `TESTS_BUGFIX_LIGHT.md` plus the gap closures introduced by spec §21.1.

## Scope

The light tier targets SIMPLES/MEDIA bugs: at most 2 files modified, at most ~50 lines of diff, no cross-cutting persistence/concurrency/business-rule concerns at first glance. The test strategy reflects this scope — it is enough to reproduce, fix with TDD, protect invariants, and promote a regression. Heavier coverage (property tests at scale, full integration suites, adversarial review) lives in `bugfix-heavy`.

## Test arc across the 8 steps

| Step | Test action | Output artifact |
|------|-------------|-----------------|
| 1 — Understand Behavior | None (read-only). | — |
| 2 — Simple Bug Analysis | Author the **RED test** that reproduces the bug. Confirm it FAILS. | `red_test_file` |
| 3 — Impact Check | Enumerate invariants + edge cases. Identify which the RED test already covers; mark uncovered ones as candidates for adjacent tests in step 4. | `invariants` (with `covered_by_red_test` flag), `edge_cases` |
| 4 — Point Fix | Make minimal code change so RED → GREEN. Add adjacent unit tests ONLY for invariants/edges at risk and not yet covered. | `additional_unit_tests_added` |
| 5 — Post-Fix Validation | Run RED + adjacent + pre-existing tests on modified files. **Promote RED to regression** (file move, header comment, canonical commit). | `regression_test_path`, `promotion_commit_sha` |
| 6 — Persistence Quick Check | If persistence is relevant: rerun the fixed scenario twice; assert state stability; enumerate side effects. | `persistence_stable`, `side_effects_detected` |
| 7 — Complexity Gate | Decide whether tests so far are sufficient or escalation to heavy is needed. | `gate_decision` |
| 8 — Pa de Cal | Confirm build + relevant tests pass; final GO/NO-GO. | `go_no_go` |

## 1. Understand and reproduce the bug (steps 1-2)

1. **Collect context**: identify the incorrect behavior reported by the user / logs. Record preconditions (DB state, inputs, environment), executed steps, and the unexpected output.
2. **Author a RED test**: BEFORE modifying any code, write a unit or integration test that fails by reproducing the bug. Use a descriptive name (e.g. `test_returns_null_when_user_has_no_record`). The RED test must:
   - Initialize the necessary state (in-memory objects, fixtures).
   - Execute the buggy function/method/command.
   - Assert the expected (currently failing) result.
3. **Avoid coupling**: use dependency injection or mocks to isolate the unit under test. Mock external APIs / DBs / third-party services — except when the bug REQUIRES integration to surface.

## 2. Fix with TDD and unit tests (step 4)

1. **Apply TDD**: change the smallest possible amount of code until the RED test passes. Add adjacent tests only when an invariant or edge case from step 3 is at material risk and is not already covered.
2. **Cover boundary conditions**: numeric inputs (negative, zero, max); collections (empty, single-element); temporal (timezone, locale).
3. **Property tests when applicable**: for pure functions, describe properties that must always hold (e.g. "addition is commutative"). Use a property-testing framework if available.

## 3. Protect invariants and side effects (steps 3, 6)

1. **Identify domain invariants** in step 3: rules that must never be violated (e.g. "an entity never has a null ID"; "balance never goes negative"). Author specific tests validating those invariants pre- and post-fix.
2. **Verify side effects** in step 6: beyond the directly affected function, check that components depending on it still function. If persistence is involved, run the fixed scenario twice and confirm state stability (no duplicates, no drift).
3. **Persistence and transactions**: if the bug involved DB writes, write a simple persistence test ensuring data is saved correctly and transactions are atomic (no inconsistent state on failure).

## 4. Promote to regression (step 5 — gap closure)

1. **Promote the RED test**: after the fix is GREEN, the RED test moves from a repro location (e.g. `tests/repro/`) to the regression suite (e.g. `tests/regression/` or project equivalent). It must continue to run in CI from now on.
2. **Document why**: add a header comment in the promoted file naming the bug and explaining what it protects against. Reference the fix commit. The intent is to make removal/modification by future contributors a deliberate, visible action — not an accident.
3. **Canonical commit**: `git commit -m "test(regression): promote bug-<BUG-ID> repro to regression suite"`. Capture the commit SHA as `promotion_commit_sha`.

## 5. Test file layout and organization

1. **Location**: place tests in `tests/regression/` (or project equivalent like `tests/bugfixes/light/`), preserving project hierarchy where appropriate (e.g. `android/app/src/test/java/...`).
2. **File naming**: descriptive names (`bug_<BUG-ID>_user_without_record_regression_test.kt`).
3. **Automation**: ensure CI runs this suite on every change. Failures must block integration.

## 6. Expected output artifacts

After the 8 steps complete with `go_no_go: GO`, the deliverables are:

- **Code fix** (≤2 files, ≤~50 lines diff) — `fix_diff`.
- **Regression test** in the suite — `regression_test_path` (with header comment + canonical commit).
- **Adjacent unit tests** for at-risk invariants/edges added in step 4 — `additional_unit_tests_added`.
- **Persistence assessment** — `persistence_stable`, `side_effects_detected`, `duplication_risk`.
- **Audit trail** — `.pipeline/gate-decisions.jsonl` with the AskUserQuestion answers from steps 7 and 8.
- **Test report** confirming the suite passes — for inclusion in the PR description.

## Reference

- Pulsar source: `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\light\TESTS_BUGFIX_LIGHT.md`
- Spec rationale (gaps + design): `designs/pipeline-orchestrator-v5-consolidated.md` §21
- Heavy-tier counterpart (when escalating from step 7): `skills/bugfix-heavy/tests/tests-bugfix-heavy.md` (added in Phase 3 of Slice 1.5).
