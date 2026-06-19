# Test Strategy — Refactor Heavy (11-step Skill)

This document orients test creation and execution across the 11 steps of `refactor-heavy`. The core idea is the same as the light tier — a **characterization snapshot** run before and after the restructure, with an IDENTICAL public-behavior verdict as the proof of behavior preservation — extended for cross-module scope with independent adversarial review, a post-refactor UX journey check, and a cold-checkout after-all sweep. Structurally it mirrors `skills/bugfix-heavy/tests/tests-bugfix-heavy.md`, with the proof inverted: bugfix proves a defect is fixed; refactor proves nothing observable changed.

## Scope

The heavy tier targets COMPLEXA / cross-module restructures: more than ~2 files, more than ~50 lines diff, blast radius crossing module boundaries, subtle/cross-cutting invariants. The test strategy adds, over the light tier: coupling-sensitive characterization (ordering, transactions, cache/SSOT), a 3-parallel adversarial review of the diff, a post-refactor UX user-journey E2E, and a cold-checkout re-verification of the IDENTICAL snapshot.

## Test arc across the 11 steps

| Step | Test action | Output artifact |
|------|-------------|-----------------|
| 1 — Understand Scope | None (read-only). Identify the PUBLIC surface + modules in scope. | `public_surface`, `modules_in_scope` |
| 2 — Terrain + Impact | None (read-only). Enumerate invariants + cross-module couplings + regression risk. | `invariants_to_preserve`, `cross_module_couplings`, `regression_risk` |
| 3 — Characterization Tests | Author tests that **PASS** against current code, binding ONLY to the public surface, incl. coupling-sensitive behavior. This is the `before_snapshot`. | `characterization_test_files`, `before_snapshot` |
| 4 — Refactor Plan + REFACTOR_SCOPE_LOCK | None (gate). Sign the cross-module CHANGE_CONTRACT; abort if a forbidden change is proposed. | `change_contract` |
| 5 — Execute Minimal Diff | None (apply the restructure inside scope, kept building between steps). | `refactor_diff` |
| 6 — Characterization Rerun | Re-run the SAME tests; require IDENTICAL over the public surface. | `after_snapshot`, `identical_verdict` |
| 7 — Complexity / Risk Confirmation | None (synthesis). Build the adversarial focus list. | `adversarial_focus`, `residual_risks` |
| 8 — Final Adversarial Review | 3 parallel reviewers (security + architecture + quality) scrutinize the diff. | `consolidated_blockers`, `gate_decision` |
| 9 — UX User Journey E2E | Walk in-scope user journeys post-refactor; confirm PRESERVED. | `journey_status` |
| 10 — Pa de Cal | Synthesize all evidence; final GO/NO-GO. | `go_no_go` |
| 11 — Final Validation After-All | Cold-checkout characterization rerun + mechanical sweep. | `cold_checkout_characterization_status`, `sweep_status` |

## 1. Characterization vs RED (the central inversion)

A characterization test is the inverse of a TDD RED test: a RED test asserts not-yet-existing behavior and must FAIL; a characterization test photographs existing behavior and must PASS, so a later rerun proves the photograph still matches. Step 3 dispatches `pre-tester` in characterization mode (see `agents/quality/pre-tester.md` → "Characterization Mode") to author MUST-PASS snapshots. For the heavy tier the snapshot additionally captures coupling-sensitive behavior (ordering, atomicity, cache/SSOT) that a cross-module move could perturb.

## 2. Binding to the public surface only

The IDENTICAL check (step 6) and the cold-checkout rerun (step 11) bind ONLY to the PUBLIC behavior of the CHANGE_CONTRACT allowed-files surface. Internal coverage-only tests are EXCLUDED — a cross-module restructure may legitimately move, rename, or split internal tests. Characterize what the outside world observes, not how the inside is wired.

## 3. Two IDENTICAL checks — warm (step 6) and cold (step 11)

The heavy tier verifies behavior preservation twice. Step 6 runs the snapshot warm, immediately after the diff, to gate progress. Step 11 re-runs it on a COLD checkout (fresh worktree, clean install) to catch problems the warm environment hides — most importantly an import cycle or build-order issue introduced by a cross-module move. A cold DIVERGED or FAILING is a RED sweep status even if step 6 was IDENTICAL.

## 4. Adversarial review of a behavior-preserving change (step 8)

An IDENTICAL characterization verdict proves the public outputs did not change; it does NOT prove the restructure is sound. Step 8's three reviewers look for what the snapshot cannot see: a relocated auth check, a coupling leak across the new module boundary, a layering violation, dead code left by an inline, or a "cleaner" shape that is actually less readable. The fix for a BLOCKER is to correct the diff (back to step 5) and re-verify IDENTICAL — never to weaken the characterization tests.

## 5. Expected output artifacts

After the 11 steps complete with `go_no_go: GO` and `sweep_status: GREEN`, the deliverables are:

- **Cross-module restructure diff** within the signed scope — `refactor_diff`.
- **Characterization tests** capturing the public surface incl. coupling-sensitive behavior — `characterization_test_files`.
- **Two IDENTICAL verdicts** (warm step 6 + cold step 11) — the audit proof of behavior preservation.
- **Adversarial findings** with all BLOCKERs resolved — `consolidated_blockers`.
- **UX journey result** — `journey_status` PRESERVED / N/A.
- **Signed CHANGE_CONTRACT** with allowed/forbidden columns + cross-module file scope.
- **Audit trail** — `.pipeline/gate-decisions.jsonl` with REFACTOR_SCOPE_LOCK (step 4), adversarial (step 8), and Pa de Cal (step 10) entries.

## Reference

- Signature gate: `references/gates.md` → `REFACTOR_SCOPE_LOCK`
- Characterization mode contract: `agents/quality/pre-tester.md` → "Characterization Mode"
- Design rationale: `docs/specs/2026-06-19-missing-pipeline-workflows-roadmap/design.md` → "Refactor workflow"
- Structural template: `skills/bugfix-heavy/tests/tests-bugfix-heavy.md`
- Light-tier counterpart (when complexity allows): `skills/refactor-light/tests/tests-refactor-light.md`
