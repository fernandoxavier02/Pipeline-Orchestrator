# Implementation Discipline Reference

> **SSOT** for scope control, minimal-diff discipline, anti-overengineering rules, dependency/config/contract/migration restrictions, test integrity, and evidence requirements that every code-changing batch must respect. Agents `plan-architect`, `executor-implementer-task`, `architecture-reviewer`, and `diff-discipline-reviewer` cross-reference this file. Introduced in v6.3.0.

This document is **referenced** by agents but does **not** add a new row to the 23-gate Mandatory Table in `references/gates.md`. Enforcement is structural — agents read these rules and emit their own verdicts. The discipline layer is additive across existing checkpoints (`MICRO-GATE`, `ADVERSARIAL_GATE`, `CHECKPOINT_FAIL`); it does **not** introduce a new gate.

---

## Severity Definitions

The Diff Discipline Reviewer emits one of three verdicts per batch. Each has a fixed hardness mapping:

| Verdict | Hardness | Meaning | Recovery |
|---------|----------|---------|----------|
| **PASS** | n/a | All scope / minimal-diff / discipline checks satisfied. Batch advances to the next stage. | None — proceed |
| **NEEDS_REDUCTION** | **SOFT** | Over-engineering without functional risk: extra abstraction, new module where local change sufficed, premature parameterization. The batch is **functionally correct** but exceeds the minimum needed to satisfy the requirement. Logged + user-acknowledged. No fix loop. | User decides: accept and proceed, or request reduction |
| **REJECTED** | **HARD** | Scope / contract / dependency / config / test-integrity violation. Examples: edits outside `allowed_files`, undeclared dependency, public-API contract change, weakened assertion, snapshot updated without justification. Triggers a fix loop. | Return to `executor-implementer-task` with findings; max **5** fix attempts (see "Interaction with ADVERSARIAL_BLOCK" below) |

`PASS` advances. `NEEDS_REDUCTION` advances after acknowledgment but pollutes the confidence score with a small penalty. `REJECTED` blocks.

---

## Scope Control Rules

The `CHANGE_CONTRACT` block (emitted by `plan-architect` inside `IMPLEMENTATION_PLAN`) defines the legal surface of every batch:

1. **`allowed_files`** — explicit allowlist of existing files the batch may modify. Anything outside this list is a scope violation regardless of how trivial the change looks.
2. **`allowed_new_files`** — explicit allowlist of paths the batch may **create**. New files outside this list trigger `REJECTED`.
3. **`forbidden_files`** — explicit denylist that overrides `allowed_files` if there is any overlap. Used for invariant guards (e.g., `references/gates.md` is always forbidden during v6.3.0 work).
4. **`forbidden_change_types`** — taxonomy of operations that are **never** allowed without explicit user approval, even on files inside `allowed_files`:
   - `unrequested_feature` — adding behavior the user did not ask for
   - `unrelated_refactor` — touching code outside the requested change for cleanup
   - `new_dependency_without_approval` — adding to `package.json` / equivalents
   - `public_api_contract_change_without_approval` — breaking exported signatures
   - `schema_migration_without_approval` — DB / data-model changes
   - `sensitive_config_change_without_approval` — secrets, env, CI workflows
   - `test_weakened_to_fit_implementation` — removing assertions to make impl pass
5. **`diff_budget`** — soft ceiling on volume. `max_files_expected`, `max_lines_expected`, `new_abstractions_allowed` (bool), `new_modules_allowed` (bool). Exceeding by >20% triggers `escalation_required_if`.

**Default values** in `plan-architect` template are `0` / `false` for every numeric / boolean field. A plan that does not customize them is declaring **"no changes at all"** — a deliberate fail-closed posture that forces every plan to make scope explicit.

**Canonical semantics for `0` (NORMATIVE — added v6.3.0 hardening pass):**

- `max_files_expected: 0` means **BLOCK ALL FILE MODIFICATIONS**. The reviewer MUST emit `REJECTED` if any file appears in `files_modified` and this value is `0`. It does NOT mean "no limit / unconstrained" — that interpretation is forbidden.
- `max_lines_expected: 0` means **BLOCK ALL LINE CHANGES**. Even a 1-line diff to a single file violates the contract if this value is `0`. Same forbidden interpretation.
- `new_abstractions_allowed: false` means **BLOCK ALL new abstractions** (any new class, interface, factory, strategy, etc.).
- `new_modules_allowed: false` means **BLOCK ALL new files**.

All four together (the unmodified template defaults) declare a contract that says "this plan changes nothing". Any plan that ships defaults untouched and then attempts any modification triggers `REJECTED` on the very first Write/Edit. This is intentional fail-closed design — the reviewer must NEVER reinterpret `0` as a permissive value. Tests in `tests/regression/v6.3.0/F15_*.cjs` pin this invariant.

---

## Minimal Diff Discipline

The smallest change that satisfies the requirement is the correct change. The reviewer flags every divergence from that minimum.

### Heuristics

- **One requirement → one surface.** If a single user requirement is being satisfied by edits across N unrelated files, that is suspicious. The reviewer asks: "could this have been done in one place?"
- **Three-line refactor rule.** If the diff includes a refactor that affects fewer than three usage sites, it is almost certainly premature. Wait for the third use case before extracting.
- **No drive-by cleanup.** Touching a file unrelated to the active requirement — even to "fix" obvious nits — is `unrelated_refactor` unless the contract explicitly permits it.
- **No speculative parameterization.** Adding `options` / `config` parameters "for future use" is YAGNI; reject.
- **No structural moves without cause.** Moving functions between files / modules without behavioral justification is `unrelated_refactor`.

### Static signals the reviewer checks

- Line count vs `diff_budget.max_lines_expected`
- File count vs `diff_budget.max_files_expected`
- New file paths vs `allowed_new_files`
- Edits in files NOT listed in `allowed_files`
- New abstractions (classes, interfaces, modules) when `new_abstractions_allowed: false`

---

## Anti-Overengineering (SOLID / KISS / DRY / YAGNI)

The reviewer applies four lenses, in order of cheapness:

### KISS (Keep It Simple, Stupid)
The simplest implementation that satisfies the requirement is preferred. Specifically:
- Prefer inline literals to constants extracted "for clarity" when used once
- Prefer a 5-line function over a 5-class hierarchy
- Prefer direct conditional logic over strategy / state-machine patterns when there are ≤2 branches
- Flag any "framework lite" being built inside the codebase

### YAGNI (You Aren't Gonna Need It)
Speculative code is `NEEDS_REDUCTION` at minimum, `REJECTED` if it expands the public surface. Specifically:
- No "in case we need it later" parameters
- No abstraction over a single concrete use case
- No feature flags for behavior the user did not ask for
- No backward-compatibility shims for changes the user wants to be breaking

### DRY (Don't Repeat Yourself) — applied with restraint
- Three or more occurrences of the same logic → extract.
- Two occurrences → leave inline. Two-data-points is not a pattern.
- Watch for *semantic* duplication (different names, same intent) — that is the duplication that hurts.

### SOLID (the relevant subset)
- **SRP** — a single batch that touches >2 unrelated responsibilities is a smell; split or justify in the contract.
- **OCP** — if the change requires modifying a class that should have been extensible, log as design debt (not a reject — but flag).
- **ISP** — adding methods to an existing interface "because it's there" is a violation when callers will not use them.
- **DIP** — flag direct instantiation of concrete classes in code that already has a DI seam.

LSP is rarely actionable in static review; defer to integration tests.

---

## Dependency / Config / Contract / Migration Restrictions

These five categories require **explicit user approval** in the plan's `escalation_required_if` block — they cannot be done implicitly. The reviewer treats any of them as `REJECTED` unless they appear in the approved contract.

### Dependency restrictions
- `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.mod`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, and equivalents are in the canonical `forbidden_files` default. Adding a dependency requires explicit approval recorded in the plan.
- Bumping an existing dependency version is treated as a dependency change.
- Removing a dependency is **allowed** if the removal is in scope; document why.

### Config restrictions
- `.env`, `.env.*`, `*.yaml` under `config/`, `settings.json`, `tsconfig.json`, `.eslintrc*`, `.prettierrc*` are sensitive. Touching them requires explicit allowance.
- CI workflows (`.github/workflows/*`, `.gitlab-ci.yml`, `circleci.yml`) are forbidden by default.
- Build configs (`webpack.config.*`, `vite.config.*`, `rollup.config.*`) are sensitive — flag.

### Contract restrictions (public API)
- Exported function signatures, exported types, public class interfaces, REST endpoint URL/body shape, GraphQL schema, gRPC `.proto` files — all are public contracts.
- Removing, renaming, or changing the type of an exported symbol is a breaking change. Adding a new exported symbol is additive (allowed). Changing semantics without changing signature is the worst class — flag specifically.

### Migration restrictions
- Schema migrations, data backfills, irreversible data transformations require explicit approval and a rollback plan.
- Adding a column with `NOT NULL` and no default is a migration risk on a populated table — flag.

### Sensitive config restrictions
- Secrets, API keys, tokens, certificates — never committed; reviewer rejects on detection.
- Permission / RBAC changes — require explicit approval.

---

## Test Integrity Rules

Tests document the contract. Weakening them to fit a flawed implementation is the worst form of regression.

1. **Tests added for changed behavior.** If the batch changes observable behavior, at least one test must cover the new behavior. Missing tests are `NEEDS_REDUCTION` at minimum.
2. **No assertion weakening.** Replacing `.toBe(true)` with `.toBeTruthy()`, removing `.toHaveBeenCalledTimes(N)` constraints, or replacing exact-match assertions with loose ones is `REJECTED` unless explicitly justified in commit / PR.
3. **No snapshot updates without justification.** `--updateSnapshot` without a comment explaining what changed is suspicious; the reviewer flags snapshot diffs that change >5 lines without an accompanying comment.
4. **No skipping / xtest.** Adding `.skip` / `xtest` / `xit` / `.todo` to a previously running test is `REJECTED` unless paired with a comment + issue link.
5. **No silent failure tolerance.** Replacing `expect(x).toBe(true)` with `if (x) ...` to "make tests pass" is `REJECTED`.
6. **No coverage degradation as goal.** Adding `/* istanbul ignore */` or coverage exclusions in source code is sensitive — flag.

The reviewer reads `*.test.*`, `*.spec.*`, `__tests__/**`, `tests/**` diffs statically for these signals. It does **not** run the test suite — `checkpoint-validator` already does that.

---

## Evidence Requirements

Every reviewer finding must cite **file:line** evidence. Findings without evidence are themselves rejected by the orchestrator. Acceptable forms:

- `agents/executor/executor-implementer-task.md:52` — exact line
- `references/gates.md:25-40` — line range
- `tests/regression/v6.3.0/F9_*.cjs` (when the entire file is the evidence)

Forbidden forms:
- "the code is unclear" (no location)
- "this looks like over-engineering" (no specific construct)
- "could be simpler" (no proposal)

A finding must contain: **(a)** what is wrong, **(b)** where it lives, **(c)** what would satisfy the rule. Without (a)+(b)+(c) the finding is data, not a verdict.

---

## Bootstrap & Self-Applying Behavior

This discipline layer was created in v6.3.0. The plan that **created** the layer (the v6.3.0 plan itself) was the first plan to use `CHANGE_CONTRACT`. There is an unavoidable bootstrap window:

| Task window | SCOPE LOCK CHECK status | Notes |
|---|---|---|
| T1 — create `references/implementation-discipline.md` | Not yet enforced | This very file. SSOT being born |
| T2 — add `CHANGE_CONTRACT` schema to `plan-architect.md` | Not yet enforced | The schema is being declared |
| T3 — add `SCOPE LOCK CHECK` to `executor-implementer-task.md` | Not yet enforced | The enforcement mechanism is being built |
| T4 onward | **Enforced** | After T3 commits, every subsequent task in v6.3.0 (and every plan in v6.4.0+) is governed by `SCOPE LOCK CHECK` |

This is a one-time exception. Future plans (v6.4.0+) inherit a fully-enforced pipeline and cannot replay the bootstrap relaxation. The bootstrap status is **self-applying**: `plan-architect` records `CHANGE_CONTRACT.bootstrap.active: true` in the v6.3.0 plan, and the same agent in v6.4.0 sets it to `false` and refuses to override.

### Bootstrap Lock Invariant (NORMATIVE — hardened 2026-05-19 per SEC-1 consensus finding)

The bootstrap flag has **three layers of defense** preventing future abuse:

1. **Prose lock in `agents/quality/plan-architect.md` Rule 11.** The agent prompt explicitly states: setting `bootstrap.active: true` on a non-bootstrap plan is itself a `forbidden_change_type` (alongside `unrequested_feature`, etc.). LLM-level enforcement.
2. **Regression test pin (`tests/regression/v6.3.0/F15_bootstrap_lock_invariant.cjs`).** The test asserts that **no committed plan or template** in the repo carries `bootstrap.active: true` other than the explicit v6.3.0 reference (the historical plan archived in `.pipeline/docs/Pre-Complexa-action/2026-05-19-batch-adversarial-discipline/03-plan-architect.md`). Any new plan that ships `bootstrap.active: true` fails CI.
3. **Audit obligation.** Every plan emitted with `bootstrap.active: true` MUST be logged to `gate-decisions.jsonl` with `event: "BOOTSTRAP_EXEMPTION_USED"`, hardness `AUDIT`, and a justification field explaining why the bootstrap is necessary. Auditors reviewing this trail must see the exemption is one-time and tied to the v6.3.0 release.

The combination is intentional: prose alone is insufficient because LLMs can be coerced; CI alone is insufficient because a plan can be re-emitted without committing; the audit trail closes the loop by recording every invocation.

**v6.4.0 milestone:** when the next minor release ships, F15 must be updated to additionally assert that `plan-architect.md` declares `bootstrap.active: true` as a `forbidden_change_type` (LLM-level lock).

---

## Interaction with the 23-Gate Mandatory Table

`references/gates.md` defines a 23-row Mandatory Gates by Complexity table (pinned by `tests/regression/v6.1.0/F1_gates_mandatory_section.cjs`). The discipline layer **does not** add a row to this table. Specifically:

- The Diff Discipline Reviewer is a **new agent**, not a new gate. Agents are listed in `references/team-registry.md`; gates are in `references/gates.md`.
- The `REJECTED` verdict from Diff Discipline triggers an internal fix loop that **reuses** the existing `ADVERSARIAL_BLOCK` machinery (return to implementer, re-run review). It does not register as a distinct gate row.
- The `NEEDS_REDUCTION` verdict logs a `SOFT` event to `gate-decisions.jsonl` under the `DIFF_DISCIPLINE_NEEDS_REDUCTION` topic, but this is a telemetry event in the existing `ADVERSARIAL_GATE` (SOFT) row, not a new row.
- F1 invariant: 23 Mandatory rows. F14 invariant (added in v6.3.0): 35 Registry rows. The discipline layer preserves both counts.

This is by design — the user constraint when commissioning v6.3.0 was explicit: "no new gate added to the registry". The discipline layer is enforced **structurally** by agents reading this SSOT and the per-plan `CHANGE_CONTRACT`, not by adding a new control-flow gate.

---

## Interaction with ADVERSARIAL_BLOCK

`ADVERSARIAL_BLOCK` (defined in `references/gates.md`) is a **HARD** gate with `max=3` fix attempts. It fires when adversarial reviewers (security-scanner, etc.) emit Critical findings. After 3 failed attempts, the pipeline escalates via `FIX_LOOP_EXHAUSTED` (CIRCUIT_BREAKER).

The Diff Discipline Reviewer introduces an **independent** fix loop with `max=5`. The two loops are deliberately separate:

| Aspect | ADVERSARIAL_BLOCK | Diff Discipline (REJECTED) |
|---|---|---|
| Triggering finding | Critical (security, correctness) | Scope / discipline violation |
| max fix attempts | **3** | **5** |
| Escalation gate | `FIX_LOOP_EXHAUSTED` | Same gate, but counted independently |
| Hardness | HARD | HARD |
| Logged as | `ADVERSARIAL_BLOCK` rows | `DIFF_DISCIPLINE_REJECTED` events (AUDIT class) + state in `REVIEW_CONSOLIDATED.fix_loop_counters.diff_discipline_attempts` |

The choice of `max=5` (vs `max=3`) reflects a different risk profile: discipline violations are typically **structural** (wrong file, wrong abstraction) and benefit from more iterations because the fix is mechanical (delete code, narrow scope). Adversarial findings are typically **semantic** (logic bug, missing validation) and after 3 attempts indicate the approach is wrong — more iterations of the same approach won't help, the design itself needs to change.

**Counter ordering.** `review-orchestrator.md` Step 3 maintains both counters in parallel:
```yaml
fix_loop_counters:
  adversarial_block_attempts: 0-3
  diff_discipline_attempts: 0-5
```
Either counter reaching its max triggers `FIX_LOOP_EXHAUSTED`. The user is told **which** counter exhausted, so the proposed alternatives can be loop-specific.

---

## When This Document Is Loaded

| Agent | Section(s) consulted |
|---|---|
| `plan-architect` | All sections — to authoring `CHANGE_CONTRACT` correctly |
| `executor-implementer-task` | Scope Control Rules, Anti-Overengineering, Bootstrap (for SCOPE LOCK CHECK self-check) |
| `architecture-reviewer` | Anti-Overengineering, Minimal Diff Discipline (for new check rows) |
| `diff-discipline-reviewer` | All sections — this is its primary contract |
| `review-orchestrator` | Interaction with ADVERSARIAL_BLOCK (for counter management) |

Other agents may reference this file for context but are not bound by it operationally.

---

## Versioning

| Version | Date | Change |
|---------|------|--------|
| v1.0 | 2026-05-19 | Initial release with v6.3.0. Bootstrap window declared (T1-T3 unenforced; T4 onward enforced). Future plans inherit fully-enforced state |
