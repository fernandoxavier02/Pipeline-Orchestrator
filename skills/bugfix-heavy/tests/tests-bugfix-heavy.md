# Test Strategy — Bug Fix Heavy (11-step Skill)

This document orients test creation and execution across the 11 steps of `bugfix-heavy`. The strategy is calibrated for COMPLEXA bugs and production incidents: cross-cutting concerns, persistence, concurrency, multi-user impact, business rules, source-of-truth ambiguity. Adapted from Pulsar `TESTS_BUGFIX_HEAVY.md` plus the gap closures introduced by spec §21.2.

## Scope

The heavy tier covers bugs that exceed the light-tier envelope:
- More than 2 files affected, or diff > ~50 lines.
- Cross-cutting concerns: persistence, concurrency, idempotency, atomicity, cache, business rules, source of truth.
- Production incidents with user-visible severity.
- Intermittent / non-deterministic / timing-related failures.

Tests at this tier go beyond unit + RED→regression: they include integration, concurrency, property-based, transactional consistency, post-fix E2E, and after-all cold checkout.

## Test arc across the 11 steps

| Step | Test action | Output artifact |
|------|-------------|-----------------|
| 1 — Terrain Recon | Read-only mapping. No tests yet. | terrain map |
| 2 — Root Cause Consolidation | Author **multiple RED reproduction tests** (parallel/async/integration scenarios). | `red_test_files` |
| 3 — Domain Truth Model | Define **invariant property tests** + **transactional consistency tests** (specs, not yet executed). | `property_tests`, `transactional_consistency_tests` |
| 4 — Controlled Change Proposal (gate) | No new tests — proposal references existing. | — |
| 5 — Test Pre-Implementation | Instantiate FIX, REGRESSION, EDGE contracts; confirm RED status of fix tests + GREEN status of regression tests. | `test_files_created`, status confirmations |
| 6 — Execute Minimal Diff | Apply fix; FIX tests turn GREEN. | `fix_diff` |
| 7 — Sanity + Regression | Run full suite (unit + integration + concurrency + property + transactional). | `all_tests_status: PASSING` |
| 8 — Adversarial Review (3 parallel, gate) | Adversaries may propose extra tests. Findings consolidated. | findings + blockers |
| 9 — UX User Journey E2E (post-fix) | E2E tests exercising actual post-fix code path (mobile-first). | technical_checkpoints, post_fix_e2e_status |
| 10 — Pa de Cal (gate) | Verification checklist with evidence per item. | go_no_go |
| 11 — Final Validation After-All | Cold checkout test pass; mechanical sweep. | cold_checkout_tests_status, sweep_status |

## 1. Deep diagnostic & reproduction (steps 1–2)

1. **Map all flows**: identify every code path that leads to the bug, including async, parallel, and inter-service interactions. Diagram if needed.
2. **Multiple RED reproduction tests**: author multiple tests that fail, one per identified flow. Use integration tests for end-to-end reproduction and unit tests for isolating specific stages.
3. **Simulate real environments**: use mocks/fakes where appropriate, but also run at least one integration test against real DB and services (or staging) to capture behaviors that only appear under transactions or load.

## 2. Unit, integration, and concurrency tests (steps 5, 7)

1. **Unit**: cover happy and error paths for each function/method involved. Include extreme and invalid inputs.
2. **Integration**: validate component interactions (service → repository → DB). Catch contract drift.
3. **Concurrency**: when the bug is concurrent (race conditions, deadlocks), run tests with multiple threads/processes simulating simultaneous access. Verify idempotency and atomicity.

## 3. Properties and domain invariants (steps 3, 5, 7)

1. **Identify global invariants**: rules that must always be true ("no duplicate records", "an item has a single active state at a time"). For each invariant, write a test that fails if violated.
2. **Property-based tests**: for math / data transformations, define properties (commutativity, associativity, ordering preserved) and use property-testing frameworks to generate thousands of random cases. Frameworks: Hypothesis (Python), fast-check (TS/JS), jqwik / Kotest Property (JVM), QuickCheck (Haskell).
3. **Transactional consistency**: write tests where a transaction fails mid-way and assert no partial state is observable. Confirm rollback works for each multi-step persistence path identified in step 3.

## 4. Regression tests and side effects (step 7)

1. **Promote reproduction → regression**: every RED test from step 2 / step 5 is preserved in the suite as a regression. Failures must block CI from now on.
2. **Cover side effects**: write tests for adjacent behaviors that may be indirectly affected (cache invalidation, notifications, audit logs). Compare before/after.
3. **Performance monitoring**: if the bug was performance-related, include performance tests with explicit thresholds. Fail if exceeded.

## 5. Post-fix E2E (step 9)

After tests pass and adversarial review approves:
- Run E2E tests exercising the actual post-fix code path: happy path + error + retry + double-tap.
- Mobile-first when the user surface is mobile.
- Tools: Playwright / RTL (web), Espresso (Android), XCUITest (iOS).
- E2E here is post-fix verification — it confirms the user-perceived experience matches the contract.

## 6. After-all cold checkout (step 11)

The after-all sweep validates that:
- Tests pass on a freshly checked-out branch with no IDE/build caches.
- All artifacts (fix diff files, test files, regression promotion, audit log) are intact on disk.
- Commits are made on the right branch with correct messages.

This catches mechanical issues that the warm dev loop hides: lockfile drift, stale build caches, missing commits, dirty working tree.

## 7. File layout and organization

1. **Dedicated directories**: `tests/bugfixes/heavy/<bug-id>/{unit,integration,concurrency}/` to isolate each fix's test suite.
2. **Clear naming**: `BugDuplicateOrderTest.kt`, `BugRaceConditionTest.java`. Method names describe the contract: `shouldNotCreateDuplicateOrder_whenCalledConcurrently`.
3. **Run scripts**: provide commands or scripts (e.g. `gradle test --tests Bug...`, `npm test -- tests/bugfixes/heavy/<id>/`) for selective execution.

## 8. Tooling

1. **Dependency injection**: Dagger/Hilt (Android), Spring (JVM), or any DI framework — substitute real implementations with mocks in unit/integration tests.
2. **Concurrency utilities**: `ExecutorService`, `CountDownLatch`, `CyclicBarrier` (JVM) — synchronize threads to reproduce race conditions deterministically.
3. **Property-test data generation**: QuickCheck, Hypothesis, fast-check, Kotest Property — generate inputs to maximize coverage.

## 9. Reporting and documentation

1. **Document the bug**: original scenario, root cause, how each test verifies the solution. Keep documentation near the code or in the issue tracker.
2. **Attach results**: coverage reports, runtime, test logs in the PR. Demonstrates transparency, eases review.
3. **Lessons learned**: if the bug stemmed from a missing earlier test, propose additional tests for similar modules to prevent class-of-bugs.

## Expected output artifacts

After 11 steps complete with `go_no_go: GO|CONDITIONAL` + `sweep_status: GREEN|YELLOW`, deliverables are:

- **Code fix** — `fix_diff` (multiple files; bounded by step 4 proposal).
- **RED reproduction tests** — `red_test_files` (multiple, covering parallel/async/integration scenarios).
- **Property tests** — for invariants that generalize.
- **Transactional consistency tests** — for each multi-step persistence path.
- **FIX, REGRESSION, EDGE tests** — `test_files_created`.
- **Post-fix E2E test artifacts** — checkpoints + E2E test where feasible.
- **Audit trail** — `.pipeline/gate-decisions.jsonl` with AskUserQuestion answers from steps 4, 8, 10.
- **Cold checkout proof** — sweep_status from step 11.
- **PR description** — incorporates correction evidence, residual risks, observability hooks, rollback plan.

## Reference

- Pulsar source: `D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\heavy\TESTS_BUGFIX_HEAVY.md`
- Spec rationale (gaps + design): `designs/pipeline-orchestrator-v5-consolidated.md` §21
- Light-tier counterpart (lighter ceremony): `skills/bugfix-light/tests/tests-bugfix-light.md`
