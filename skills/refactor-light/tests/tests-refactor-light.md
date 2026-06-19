# Test Strategy — Refactor Light (8-step Skill)

This document orients test creation and execution across the 8 steps of `refactor-light`. The core idea of a refactor's test strategy is the **characterization snapshot**: the same public-behavior tests run before any edit and after the last edit, with an IDENTICAL verdict as the proof that nothing observable changed. Structurally it mirrors `skills/bugfix-light/tests/tests-bugfix-light.md`, but the proof is inverted — bugfix promotes a RED test to a regression guard; refactor preserves a GREEN snapshot unchanged.

## Scope

The light tier targets SIMPLES/MEDIA restructures: at most ~2 files, ~50 lines diff, single-module blast radius, no public-surface change. The test strategy reflects this scope — it is enough to capture the current public behavior, restructure under a signed scope contract, and prove the behavior is identical afterward. Heavier coverage (cross-module characterization, adversarial review, post-refactor UX E2E, after-all sweep) lives in `refactor-heavy`.

## Test arc across the 8 steps

| Step | Test action | Output artifact |
|------|-------------|-----------------|
| 1 — Understand Scope | None (read-only). Identify the PUBLIC surface to characterize. | `public_surface` |
| 2 — Terrain + Impact | None (read-only). Enumerate invariants to preserve + regression risk. | `invariants_to_preserve`, `regression_risk` |
| 3 — Characterization Tests | Author tests that **PASS** against current code, binding ONLY to the public surface. This is the `before_snapshot`. | `characterization_test_files`, `before_snapshot` |
| 4 — Refactor Plan + REFACTOR_SCOPE_LOCK | None (gate). Sign the CHANGE_CONTRACT; abort if a forbidden change is proposed. | `change_contract` |
| 5 — Execute Minimal Diff | None (apply the restructure inside scope). | `refactor_diff` |
| 6 — Characterization Rerun | Re-run the SAME tests; compare to `before_snapshot`; require IDENTICAL over the public surface. | `after_snapshot`, `identical_verdict` |
| 7 — Complexity Gate | Decide whether light ceremony is sufficient or escalate to heavy. | `gate_decision` |
| 8 — Pa de Cal | Confirm build + characterization suite pass; final GO/NO-GO. | `go_no_go` |

## 1. Characterization vs RED (the central inversion)

A characterization test is the inverse of a TDD RED test. A RED test asserts behavior that does NOT exist yet and must FAIL until implemented. A characterization test asserts behavior that DOES exist today and must PASS — it photographs current behavior so a later rerun can prove the photograph still matches. In `refactor-light`, step 3 dispatches `pre-tester` in characterization mode (see `agents/quality/pre-tester.md` → "Characterization Mode") precisely to author MUST-PASS snapshots instead of MUST-FAIL tests.

## 2. Binding to the public surface only

The IDENTICAL check at step 6 binds ONLY to the PUBLIC behavior of the CHANGE_CONTRACT allowed-files surface — exported names, signatures, error codes, output formats, side-effects. Internal coverage-only tests are deliberately EXCLUDED: a restructure may legitimately move, rename, or split internal tests, and forcing those to be identical would block legitimate cleanup. Characterize what the outside world observes, not how the inside is wired.

## 3. The IDENTICAL / DIVERGED verdict (step 6)

1. **IDENTICAL** — every public-behavior characterization test has the same pass status and same compared values before and after. This is the GO condition for behavior preservation.
2. **DIVERGED** — at least one public result changed. A refactor must not change observable behavior, so this is a failure. The fix is to correct the restructure (back to step 5), NEVER to edit the characterization tests to fit the new behavior (that is `test_weakened_to_fit_implementation`). Two consecutive DIVERGED results trigger the STOP RULE.

## 4. Expected output artifacts

After the 8 steps complete with `go_no_go: GO`, the deliverables are:

- **Restructure diff** (≤2 files, ≤~50 lines) within the signed scope — `refactor_diff`.
- **Characterization tests** capturing the public surface — `characterization_test_files` (kept in the suite as living behavior documentation).
- **Before/after snapshots** with an `IDENTICAL` verdict — the audit proof of behavior preservation.
- **Signed CHANGE_CONTRACT** with allowed/forbidden columns + file scope.
- **Audit trail** — `.pipeline/gate-decisions.jsonl` with the REFACTOR_SCOPE_LOCK decision (step 4) and the AskUserQuestion answers from steps 7 and 8.

## Reference

- Signature gate: `references/gates.md` → `REFACTOR_SCOPE_LOCK`
- Characterization mode contract: `agents/quality/pre-tester.md` → "Characterization Mode"
- Design rationale: `docs/specs/2026-06-19-missing-pipeline-workflows-roadmap/design.md` → "Refactor workflow"
- Structural template: `skills/bugfix-light/tests/tests-bugfix-light.md`
- Heavy-tier counterpart (when escalating from step 7): `skills/refactor-heavy/tests/tests-refactor-heavy.md`
