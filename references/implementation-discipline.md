# Implementation Discipline (SSOT)

**Status:** SSOT for scope control, minimal-diff enforcement, and anti-overengineering across the pipeline.
**Consumers:** `agents/quality/plan-architect.md`, `agents/executor/executor-implementer-task.md`, `agents/executor/executor-quality-reviewer.md`, `agents/quality/architecture-reviewer.md`.
**Not a registered gate.** This document defines verdicts (`PASS / NEEDS_REDUCTION / REJECTED`) emitted by existing reviewers; it does not add a row to `references/gates.md` (the 22-gate count is preserved).

This file answers one question: **what does it mean for an AI agent to change exactly what the user asked for, and nothing more?**

---

## 1. Scope control

The implementer changes only what the approved plan declared. Concretely:

1.1. **No edits outside `allowed_files`.** Every modified path MUST appear in `IMPLEMENTATION_PLAN.CHANGE_CONTRACT.allowed_files`.
1.2. **No new files outside `allowed_new_files`.** Creating a file that the plan did not list is a scope break, even if the new file is tiny.
1.3. **No unrequested feature.** Adding capability beyond the task's explicit success criteria is a scope break — even if "obviously useful."
1.4. **No unrelated refactor.** Renaming, restructuring, modernizing, or cleaning code that the task did not target is a scope break.
1.5. **No drive-by cleanup.** Removing dead code, fixing typos, or sorting imports in unrelated files is a scope break unless explicitly in the task.

## 2. Minimal diff

The implementer produces the smallest correct diff. Concretely:

2.1. **Smallest safe change** — if a one-line edit in an existing function solves the problem, do not introduce a new function, class, file, or module.
2.2. **`diff_budget` is binding** — `max_files_expected` and `max_lines_expected` from the plan are upper bounds. Exceeding either requires a STOP and a question to the controller.
2.3. **Prefer in-place edit over new file.** Adding a new file to host a single helper used in one place is overengineering.
2.4. **Prefer existing abstractions.** Before creating a helper/util/type/constant, grep the project for an equivalent. If one exists, use it.
2.5. **No speculative generality.** Do not introduce parameters, type generics, or extension points that have no current caller.

## 3. Anti-overengineering

3.1. **No abstraction without a second real use case.** Extracting an interface, base class, or strategy pattern for a single concrete user is YAGNI.
3.2. **No new architectural layer.** Adding a layer (service, repository, facade, adapter) is only justified if the task explicitly demands it OR if at least two existing call sites already need it.
3.3. **No new module to host trivial logic.** A function used once stays in the file that uses it.
3.4. **No premature decoupling.** Splitting one concept into multiple files because "it might change later" is not justified by the task.
3.5. **No design pattern application for its own sake.** A pattern is justified only by the problem at hand, not by stylistic preference.

## 4. SOLID / KISS / DRY / YAGNI

These are constraints, not goals.

4.1. **SRP** — each modified module has one reason to change. Splitting unrelated concerns into the same change is a violation.
4.2. **OCP** — extend without modifying existing public contracts when possible; if modifying is required, this is a contract change (see §6).
4.3. **LSP / ISP / DIP** — applied only when subtype/interface relationships already exist in the change scope. Do NOT introduce them speculatively.
4.4. **KISS** — choose the simplest implementation that meets the acceptance criteria. If a 3-line function passes the tests, do not write 30.
4.5. **DRY (semantic, not syntactic)** — duplication is forbidden when two pieces of code encode the **same business rule**. Two snippets that look similar but encode different rules are NOT duplication.
4.6. **YAGNI** — no parameter, branch, configuration knob, or code path lacks a current caller.

## 5. Dependency, config, contract, and migration restrictions

These changes are forbidden unless the task explicitly authorizes them:

5.1. **No new runtime dependency.** Adding to `package.json` `dependencies` or `devDependencies` requires explicit approval in the plan's `CHANGE_CONTRACT.escalation_required_if` field.
5.2. **No lockfile mutation.** `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` are off-limits.
5.3. **No CI / build config mutation.** `.github/workflows/*`, `Dockerfile`, `Makefile`, `tsconfig.json` build settings, bundler configs are off-limits.
5.4. **No env / secrets mutation.** `.env`, `.env.*`, anything under `config/secrets/`, or comparable paths.
5.5. **No schema migration.** Migrations under `migrations/`, `prisma/migrations/`, `alembic/versions/` are off-limits.
5.6. **No public API contract change.** Renaming an exported function, changing its signature, changing an HTTP route, or changing a serialized payload shape is a contract break — even if internal callers still work.
5.7. **No sensitive config change.** Auth providers, feature flags governing security, rate limits, encryption settings.

Any forbidden change discovered mid-task is a **STOP + QUESTIONS** event, not a "best-effort proceed."

## 6. Test integrity

Tests describe behavior; they are not adjustable to fit a broken implementation.

6.1. **No weakening tests to pass.** Loosening an assertion (e.g. `equal(actual, expected)` → `match(actual, /partial/)`) to make a failing test pass is forbidden.
6.2. **No deleting tests to pass.** Removing or disabling a failing test without separate explicit user approval is forbidden.
6.3. **No skip / `.skip` / `xit` injection.** Skipping a test is equivalent to deleting it.
6.4. **No snapshot rewrites without reason.** Updating snapshots requires a documented reason tied to an intentional behavior change.
6.5. **Tests added for new behavior.** Every new code path that implements task-required behavior MUST have a test asserting it.
6.6. **No assertion-on-trust.** Assertions check observable values, not "implementation must have happened."

## 7. Evidence

Reviewers cite evidence; implementers cite the plan.

7.1. **Every reviewer finding cites file:line + observed value** OR `npm test` failure output / `git diff` excerpt.
7.2. **No "looks like" findings.** "This looks duplicated" without a grep result is not a finding.
7.3. **No "could be better" findings.** Subjective preferences are not findings; only actual violations of §1-§6 are.

## 8. Verdict vocabulary

When a reviewer evaluates a diff against this discipline, the verdict is one of three values:

| Verdict | Meaning | Action |
|---|---|---|
| **PASS** | Diff respects §1-§7. Implementer can proceed to next step. | Continue. |
| **NEEDS_REDUCTION** | Diff has overengineering or excess (e.g. unnecessary new file/abstraction) but no functional risk, no contract break, no test integrity issue. | Implementer reduces diff (delete extracted helper, inline the new file, drop the speculative parameter) and the reviewer re-runs. |
| **REJECTED** | Diff has a blocking violation in §1 (scope), §5 (dependency/config/contract/migration), or §6 (test integrity), OR exceeds `diff_budget`. | Implementer STOPS. Controller routes to fix-loop or escalation. |

**Routing:** `NEEDS_REDUCTION` and `REJECTED` feed the existing executor-controller fix loop (max 3 attempts, then `FIX_LOOP_EXHAUSTED`). They do NOT introduce a new gate.

## 9. What this document is not

- **Not a gate.** No new row in `references/gates.md`. The 22-gate registry is locked.
- **Not a new agent.** No file under `agents/` is created by this discipline. The rules are enforced by existing agents in their existing roles.
- **Not optional for COMPLEXA.** For SIMPLES/MEDIA, reviewers apply §1-§7 proportionally (e.g. SIMPLES skips §3 architecture-reviewer pass). For COMPLEXA, all sections apply.
