# Implementation Discipline Layer (SSOT)

**Status:** v6.2.0 — Single Source of Truth for scope control, minimal-diff,
anti-overengineering, and test-integrity rules that every implementer,
quality reviewer, and architecture reviewer in this pipeline MUST follow.

**This is NOT a registered gate.** No row exists for it in
`references/gates.md` and the 22-gate registry count is intentionally
unchanged. The discipline is enforced inline by three existing agents:

| Agent | Where the rules are loaded | What it emits |
|-------|---------------------------|---------------|
| `plan-architect` | Phase 1.5 IMPLEMENTATION_PLAN | `CHANGE_CONTRACT` block |
| `executor-implementer-task` | Phase 2 — between MICRO-GATE and TDD GREEN | `SCOPE LOCK CHECK` stop / `QUESTIONS` status |
| `executor-quality-reviewer` | Phase 2 — before the Quality Checklist | `DIFF_DISCIPLINE_REVIEW` block |
| `architecture-reviewer` | Phase 2 — per-batch architecture pass | Additional `DISCIPLINE` findings folded into existing `ARCHITECTURE_FINDING` categories |

The verdict alphabet is shared across all four touchpoints:

| Verdict | Meaning | Action |
|---------|---------|--------|
| **PASS** | All discipline rules respected. Proceed. | continue pipeline |
| **NEEDS_REDUCTION** | Overengineering without functional risk — code works, but the diff exceeds the smallest safe change. Reduce, then re-review. | implementer revises, no fix-loop attempt counted as failure |
| **REJECTED** | A blocking rule was violated (scope creep into forbidden files, unrequested feature, hidden contract change, weakened test, etc.). | block batch; treat as ADVERSARIAL_BLOCK-equivalent recovery — escalate to executor-controller, may trigger fix loop |

---

## 1. Scope Control Rules

The implementer MUST stay strictly inside the CHANGE_CONTRACT issued by the
plan-architect for the current task:

1. **Files outside `allowed_files` are read-only.** Reading is permitted for
   context. Editing is not.
2. **New files outside `allowed_new_files` are forbidden.** If creation seems
   necessary, STOP and return `QUESTIONS` — do not invent the file.
3. **No "while I'm here" cleanups.** Renaming a variable, reformatting a
   block, sorting imports, "fixing a nit" — all forbidden unless the task
   asks for it.
4. **No piggy-backed refactors.** Restructuring code that the task does not
   touch is out of scope, even when "obviously better".
5. **No standardization or modernization passes.** Updating syntax (ES5 →
   ES2020), migrating typing styles, adopting a new pattern across files —
   all require their own ticket and their own plan.
6. **No unrequested features.** Adding a flag, hook, callback, log line, or
   metric that the task does not ask for is forbidden.

A finding here maps to **REJECTED** when it changes a file outside
`allowed_files`. It maps to **NEEDS_REDUCTION** when it touches in-scope
files but still expands behavior beyond the task description.

---

## 2. Minimal Diff Rules

1. **Define the smallest safe change first.** Plan-architect MUST state, in
   prose, the smallest change that completes the task safely. The diff must
   approximate that target.
2. **Respect `diff_budget`.** Both `max_files_expected` and
   `max_lines_expected` are advisory ceilings. Exceeding them by more than
   25% is a **NEEDS_REDUCTION** finding by default; doubling them is
   **REJECTED** absent an explicit escalation.
3. **One concern per file.** If a file change mixes the task's concern with
   an unrelated one, split the unrelated change out (or drop it).
4. **No helpers extracted prematurely.** Three similar lines is not yet a
   helper. Two real call sites are required before introducing a shared
   abstraction (Rule 4 below).
5. **No new modules or layers** unless `diff_budget.new_modules_allowed:
   true`. Adding a new file inside the same folder is a module-level
   decision and must be planned.
6. **Prefer additive edits.** Append a section, add a parameter with a
   safe default, branch on a new condition — these stay reversible. Avoid
   rewrites when an append suffices.

---

## 3. Anti-Overengineering Rules

1. **No abstractions without a second real use case.** If only one caller
   exists, hard-code the behavior. Generalize when the second caller
   arrives.
2. **No interfaces / strategy objects / dependency-injection scaffolding**
   for code that has a single implementation today.
3. **No configuration knobs for hypothetical futures.** Constants are fine;
   env-var/feature-flag plumbing is not, unless the task asks for it.
4. **No retry / fallback / "robustness" wrappers** beyond what the task
   describes. They hide errors instead of solving them.
5. **No new patterns** for problems already solved in the codebase. Reuse
   the existing pattern, even if it is not your favorite.
6. **No speculative validation** for inputs that internal callers cannot
   produce. Validate at system boundaries only.

These are **NEEDS_REDUCTION** findings by default — the code may work, but
the surface area is too large for the task.

---

## 4. SOLID / KISS / DRY / YAGNI Checks

| Principle | Discipline check |
|-----------|------------------|
| **SRP** (Single Responsibility) | Each modified file still has one reason to change. New responsibilities go to new files only when `diff_budget.new_modules_allowed` is true. |
| **OCP** (Open / Closed) | Behavior is extended via composition before modification, but ONLY when the change introduces a real second extension point. No speculative `BaseFoo`/`AbstractBar` hierarchies. |
| **LSP** (Liskov) | When subtyping, every subtype honors the parent's contract. If you cannot, the refactor was unnecessary — back it out. |
| **ISP** (Interface Segregation) | Do not invent fat interfaces. Three-method interfaces beat one ten-method interface, but zero new interfaces beat both unless required. |
| **DIP** (Dependency Inversion) | Inject dependencies only when there is a second real implementation (test doubles do not count by themselves — call the unit directly when possible). |
| **KISS** | The simplest solution that satisfies the task wins. Cleverness is a tax. |
| **DRY** | Eliminate genuine duplication. Do NOT eliminate shape-similar code that has different reasons to change — that is coincidental duplication and re-coupling it creates worse drift. |
| **YAGNI** | Build only what the task requires. "We will need it later" is a smell, not a justification. |

A clear violation of any of these is **NEEDS_REDUCTION** unless it also
masks a functional risk (e.g., a hidden contract change), in which case it
is **REJECTED**.

---

## 5. Dependency / Config / Contract / Migration Restrictions

The following changes are NEVER allowed without explicit escalation
(plan-architect must mark them in `CHANGE_CONTRACT.escalation_required_if`
and the user must approve):

1. **New runtime dependencies.** Any addition to `package.json`,
   `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.
2. **Lockfile changes.** `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`,
   `poetry.lock`, `Cargo.lock`. These are out of scope for code tasks.
3. **CI / build / env / config changes.** `.github/workflows/*`,
   `Dockerfile`, `Makefile`, `.env*`, `tsconfig.json`, `eslint.config.*`,
   `prettierrc*`, `vite.config.*`, `next.config.*` and similar.
4. **Schema or data migrations.** Anything under `migrations/`, `prisma/`,
   `alembic/`, SQL DDL diffs, or a change that requires a backfill.
5. **Public API contract changes.** Renaming or removing exported symbols,
   changing public function signatures, changing HTTP route paths or
   payload shapes, breaking event-bus topic schemas. Even "compatible"
   additions require explicit approval — additive endpoints become support
   surface.
6. **Sensitive config changes.** Authentication providers, CORS rules,
   rate-limit policies, encryption keys, secret stores.

A violation here is always **REJECTED**. The implementer MUST stop and
return `QUESTIONS` before touching any of these surfaces.

---

## 6. Test Integrity Rules

1. **Tests are written for the requested behavior, not adjusted to the
   implementation.** If the test no longer reflects the requirement, the
   implementation is wrong — not the test.
2. **No test deletion without justification.** Removing or marking a test
   `.skip` requires the task description to ask for it; otherwise it is a
   **REJECTED** finding.
3. **No assertion weakening.** Changing `toBe` to `toBeTruthy`, replacing
   exact strings with regex `/.+/`, dropping a property check — all
   forbidden unless explicitly required.
4. **No snapshot updates without semantic reason.** Snapshots regenerate
   when the underlying behavior changes intentionally. Snapshot churn that
   has no explanation in the diff is **REJECTED**.
5. **New behavior MUST be covered.** If the diff changes observable
   behavior and no test was added, the reviewer raises
   `tests_added_for_changed_behavior: false`.
6. **No try/except or empty catch as a "fix"** to make a failing test
   pass. Hiding the error breaks the next caller. This is **REJECTED**.
7. **No fake fallbacks.** Returning a hard-coded default to silence an
   exception, returning an empty list to dodge a `null`, swallowing
   `Promise.reject` — all forbidden.

---

## 7. Evidence Requirements

Every discipline finding MUST carry concrete evidence so it is auditable
and so the fix loop has something to act on:

- **file:line** anchors for every claim.
- **Diff anchors** (changed file, removed line, added line) when claiming
  scope expansion.
- **Grep / Glob** output when claiming duplication or a missing existing
  abstraction — the grep command and its actual output, not a paraphrase.
- **CHANGE_CONTRACT excerpt** when claiming an `allowed_files` /
  `allowed_new_files` / `forbidden_change_types` violation.
- **Task description excerpt** when claiming "this was not requested".
- **No vague verdicts.** "Looks over-engineered" without naming the
  specific abstraction or line range is not actionable — the reviewer must
  point to the construct.

---

## 8. Severity Taxonomy

| Verdict | Trigger | Pipeline effect |
|---------|---------|----------------|
| **PASS** | All rules respected. | Continue to next step. |
| **NEEDS_REDUCTION** | Overengineering, premature abstraction, mild scope creep inside `allowed_files`, exceeding `diff_budget` by less than 100%, cosmetic noise. | Implementer reduces the diff. Re-review. Does NOT consume a fix-loop attempt unless reduction is refused. |
| **REJECTED** | Any item under "Blocking conditions" below. | Block batch. Behaves like `ADVERSARIAL_BLOCK` recovery: the executor-controller spawns `executor-fix` (max 3 attempts) or escalates to the user. Does NOT add a new registered gate row. |

---

## 9. Blocking conditions (REJECTED)

A reviewer or implementer MUST classify as **REJECTED** when any of the
following hold. These are non-negotiable:

- A modified file is outside `CHANGE_CONTRACT.allowed_files`.
- A created file is outside `CHANGE_CONTRACT.allowed_new_files`.
- Any item under §5 (dependency / config / contract / migration) changed
  without prior escalation.
- A test was deleted, skipped, weakened, or had its snapshot updated
  without semantic reason (§6).
- Code introduces a fake fallback or empty catch to mask an error.
- A public API contract changed without escalation.
- A new agent was created in the same change.
- A new registered gate was added to `references/gates.md` (the 22-gate
  count is locked).
- `diff_budget.max_files_expected` exceeded by 100% or more.
- An unrequested feature is included.

---

## 10. Non-blocking warnings (NEEDS_REDUCTION)

These are recoverable findings — the implementer reduces the diff and
proceeds:

- New abstraction introduced with only one call site today.
- Helper extracted prematurely (three similar lines, two would-be callers).
- Minor naming or formatting changes inside in-scope files that the task
  did not request.
- Extra logging / metrics / tracing not asked for, that does not break
  anything but expands surface area.
- `diff_budget` exceeded by 25–99% without an escalation note.
- A second test added that duplicates coverage already provided.
- Cosmetic refactor inside `allowed_files` that does not change behavior.

Non-blocking warnings accumulate as `DIFF_DISCIPLINE_REVIEW` entries with
verdict `NEEDS_REDUCTION` and a list of specific reductions to apply.

---

## 11. How agents consume this SSOT

- `agents/quality/plan-architect.md` — declares `CHANGE_CONTRACT` in the
  IMPLEMENTATION_PLAN output and quotes the SSOT as its source for
  forbidden-change-types and diff_budget defaults.
- `agents/executor/executor-implementer-task.md` — runs `SCOPE LOCK
  CHECK` against the CHANGE_CONTRACT before any code is written.
- `agents/executor/executor-quality-reviewer.md` — runs the
  `Diff Discipline Review` step before the Quality Checklist and emits
  `DIFF_DISCIPLINE_REVIEW` with the verdict alphabet defined here.
- `agents/quality/architecture-reviewer.md` — adds explicit checks for
  unjustified abstraction, unjustified new file, semantic duplication,
  unnecessary layer, unrelated refactor, and public contract drift, with
  evidence requirements per §7.

The final-adversarial-orchestrator and its three zero-context scanners are
intentionally NOT modified — they continue to operate with no
implementation context, which preserves their independence guarantee.

---

## 12. Versioning

| Version | Date | Change |
|---------|------|--------|
| v6.2.0 | 2026-05-17 | Initial. SSOT introduced; four agents updated to consume it. No new agent, no new gate. |
