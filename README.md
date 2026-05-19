<div align="center">
  <a href="https://fxstudioai.com">
    <img src="assets/logos/fx-studio-ai-logo.png" alt="FX Studio AI" width="420"/>
  </a>
</div>

<div align="center">
  <img src="assets/diagrams/hero-banner.svg" alt="Pipeline Orchestrator v6.3.0" width="100%"/>
</div>

<h1 align="center">Pipeline Orchestrator</h1>

<p align="center"><strong>The governance layer between your spec and your production code.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-6.3.0-7C3AED?style=for-the-badge&logo=git&logoColor=white" alt="Version" />
  <img src="https://img.shields.io/badge/agents-20-0EA5E9?style=for-the-badge" alt="Agents" />
  <img src="https://img.shields.io/badge/gates-32_(22_mandatory)-22C55E?style=for-the-badge" alt="Gates" />
  <img src="https://img.shields.io/badge/audit_coverage-95%25-F59E0B?style=for-the-badge" alt="Audit Coverage" />
  <img src="https://img.shields.io/badge/test_suites-31%2F31-EF4444?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/platform-Claude_Code-000?style=for-the-badge" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-65a30d?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> &bull;
  <a href="#how-we-fix-it">How We Fix It</a> &bull;
  <a href="#whats-new-in-v630">v6.3.0</a> &bull;
  <a href="#workflow-contracts--atdd--bdd--ddd-v610">ATDD · BDD · DDD</a> &bull;
  <a href="#install">Install</a> &bull;
  <a href="#pipeline-types">Pipelines</a> &bull;
  <a href="#agent-architecture">Architecture</a> &bull;
  <a href="#gate-system">Gates</a> &bull;
  <a href="#audit-reports">Audit</a>
</p>

---

> **Heads-up:** This repository is both the Pipeline Orchestrator plugin **and** the **FX-Studio-AI** marketplace hosting multiple plugins. Install the marketplace once to access them all. See <a href="#fx-studio-ai-suite">the suite section</a>.

---

## The Problem

There is no shortage of tools that help you decide *what* to build — Jira, Linear, Notion, ADRs, spec templates, Kiro. They handle the *plan*. But when AI takes the plan and turns it into production code, the industry relies on human discipline. **Discipline degrades under pressure, time constraints, and long-running sessions.**

<div align="center">
  <img src="assets/diagrams/problem-degradation.svg" alt="The long-session drift problem" width="100%"/>
</div>

Long AI coding sessions follow a predictable degradation curve:

- **Batches 1-3 (clean):** the AI follows the spec. Tests pass. Diff is tight.
- **Batches 4-7 (scope creep):** the AI starts "improving" adjacent code. *"Let me also refactor this related function..."*. Unrelated edits accumulate.
- **Batches 8-11 (drift):** new dependencies appear unannounced. A test failure turns into a weaker assertion instead of a fixed bug. The implementation no longer matches the original requirements.
- **Batches 12+ (contract broken):** the code passes CI but no longer solves the problem you asked it to solve. You discover this hours later, often in production.

Traditional CI/CD catches syntax errors and regressions. It does not catch architectural drift, weakened tests, scope creep in batch 7, or the fact that your AI added an unauthorized dependency three batches ago.

**Pipeline Orchestrator is an execution governance layer that sits between your plan and your production code.** It does not replace your planning tools. It closes the gap between *"we have a spec"* and *"we shipped it safely"*.

---

## How We Fix It

Five anchors keep long sessions on contract. Each one is independent — failures in one do not propagate. Together they form a defense in depth.

<div align="center">
  <img src="assets/diagrams/governance-flow.svg" alt="Pipeline Orchestrator governance flow" width="100%"/>
</div>

### 1. CHANGE_CONTRACT — Scope is declared *before* the code is written

Every plan emits an inline `CHANGE_CONTRACT` block listing exactly which files may be modified, which may be created, which are forbidden, and what categories of change require explicit approval (new dependency, public API change, schema migration, sensitive config edit, test weakening). The contract has a `diff_budget` ceiling — exceeding it by more than 20% triggers an escalation. **No more "I just refactored a bit while I was there."**

### 2. SCOPE LOCK CHECK — Runtime enforcement before every Write/Edit

The implementer agent runs a 5-check gate before emitting any code-changing tool call. Targets outside `allowed_files`? Stops. Forbidden change type detected? Stops. Diff budget exhausted? Stops. On violation, the agent returns a structured `QUESTIONS` status with `question.context: scope_lock_violation` and asks you whether to expand the contract or redirect. **Backed by a JS PreToolUse hook (`scope-lock-hook.cjs`) so the enforcement holds even when the LLM tries to be clever.**

### 3. Adversarial Independence — Three reviewers attack each batch with zero implementation context

Every batch is reviewed by three parallel agents that never saw what the implementer intended. They see only the result. They evaluate from three angles simultaneously:

- **adversarial-batch** — security (auth bypass, injection, race conditions, sensitive data exposure)
- **architecture-reviewer** — patterns (SOLID, KISS, DRY, unrelated refactor, public contract drift)
- **diff-discipline-reviewer** (new in v6.3.0) — scope (minimal diff, over-engineering, weakened tests, dependency drift)

The three are spawned in a *single* parent message with three Agent tool calls — guaranteed parallel, guaranteed independent. No sequential contamination, no shared context. Each loads only the checklists it needs. **This is what kills confirmation bias.**

### 4. Gate Hierarchy — 22 mandatory checkpoints with formal hardness types

Gates are not ceremonial checkboxes. Each has a defined hardness that determines exactly how it behaves:

| Hardness | Behavior |
|---|---|
| **MANDATORY** | Never bypassed. Not even by `--hotfix` or `--force`. Applies regardless of mode. Reserved for structural integrity (SSOT) and domain-mandated security reviews. |
| **HARD** | Blocks until resolved. Pipeline stops at the gate; user must answer or the issue must be fixed. No silent skips. |
| **CIRCUIT_BREAKER** | After N consecutive failures (typically 2-3 attempts), pipeline halts and requires explicit reset. Prevents infinite loops. |
| **SOFT** | Recommended but skippable with explicit acknowledgment. Every skip is logged with a confidence penalty. |
| **AUDIT** (v6.2+) | Informational telemetry. Never blocks, never asks. Used for observability events that need first-class audit-trail entries. |

The full 32-row registry (22 mandatory + 10 contextual/soft) lives in [`references/gates.md`](references/gates.md). The 22-row Mandatory Gates by Complexity table is invariant — pinned by regression test `F1_gates_mandatory_section.cjs`, which fails the build if anyone changes the count.

### 5. Glass-Box Audit Trail — Every decision is recorded

Every pipeline run emits `TRACE.md` + `gate-decisions.jsonl` under `.pipeline-orchestrator/runs/<run-id>/`. Classification, design decisions, plan approval, every gate trigger, every fix loop, every adversarial finding. **Attachable to your PR. Validatable with a standalone Node script. HMAC-signed sentinel state to prevent tampering.** Auditable, reproducible, accountable.

```
GO:          confidence >= 0.80
CONDITIONAL: confidence >= 0.60
NO-GO:       confidence <  0.60
```

No gut feelings. No *"it looks fine to me."* A number, with the gate decisions that produced it.

---

## What's New in v6.3.0

> **Implementation Discipline Layer.** The biggest release since the v6.0.0 audit. v6.3.0 adds the structural mechanism that prevents the drift problem on the left of the page from ever reaching your production branch.

### Added

- **`references/implementation-discipline.md`** — new SSOT covering severity definitions (PASS / NEEDS_REDUCTION / REJECTED), scope control, minimal-diff discipline, SOLID/KISS/DRY/YAGNI application rules, dependency/config/contract/migration restrictions, test integrity, evidence requirements, and bootstrap & self-applying behavior.
- **`CHANGE_CONTRACT` block in IMPLEMENTATION_PLAN** — `plan-architect.md` Rule 11 now mandates the contract for MEDIA/COMPLEXA plans. Defaults are fail-closed (`0 files`, `0 lines`, `no abstractions`, `no modules`) — every plan must customize them.
- **`## SCOPE LOCK CHECK` in `executor-implementer-task.md`** — fires before every `Write`/`Edit` (Read remains free). 5 checks; on violation returns `status: QUESTIONS` with `question.context: scope_lock_violation`. Includes 9-item anti-pattern list.
- **`agents/quality/diff-discipline-reviewer.md`** — NEW agent. Third parallel reviewer in `review-orchestrator`. `tools: Read, Grep, Glob` only (no Bash, no Edit, no Write — static-only inspection). Emits `DIFF_DISCIPLINE_REVIEW:` YAML with verdict, scope findings, minimal_diff findings, dependency/config/contract findings, test integrity findings, evidence. `REJECTED` is HARD with `max_fix_attempts=5` (independent from `ADVERSARIAL_BLOCK` max=3).
- **`.claude/hooks/scope-lock-hook.cjs`** — runtime PreToolUse:Write/Edit JS hook. Reads the active `CHANGE_CONTRACT` from `.pipeline/sessions/*.lock`, denies tool calls that violate `forbidden_files`/`allowed_files`. Defense in depth pair with the prose-level check.
- **3-way parallel wiring in `review-orchestrator.md`** — Step 1 table updated for SIMPLES/MEDIA/COMPLEXA; new `DIFF_DISCIPLINE_INPUT:` block; Step 3 `REVIEW_CONSOLIDATED` gains `diff_discipline:` field, `combined_findings.source: diff_discipline` enum value, and `fix_loop_counters:` sub-block with `adversarial_block_attempts` (max=3) and `diff_discipline_attempts` (max=5) tracked independently.
- **5 new check rows in `architecture-reviewer.md`** — abstraction without second real use case, new file where local change was enough, unnecessary architecture layer, unrelated refactor, public contract drift.
- **8 new regression tests** (`tests/regression/v6.3.0/F8-F15`) following the v6.1.0 static-assert pattern. **22 new hook unit tests** including 3 child-process smoke tests that exercise `main()` to catch runtime regressions.
- **Bootstrap Lock Invariant** — three layers of defense lock the `bootstrap.active` flag post-release: prose lock in `plan-architect.md` Rule 11 (NORMATIVE LOCK), CI test `F15_bootstrap_lock_invariant.cjs` pinning that no committed plan carries `bootstrap.active: true`, and `BOOTSTRAP_EXEMPTION_USED` audit event in `gate-decisions.jsonl`.

### Invariants preserved

- 22-row Mandatory Gates by Complexity table in `references/gates.md` — **untouched**. Pinned by `F1_gates_mandatory_section.cjs` (untouched in this release).
- 32-row Gate Registry — untouched. Pinned by new `F14_gates_md_unchanged_count.cjs` as defense in depth.
- `ADVERSARIAL_BLOCK` row — `max=3` unchanged. The new `max=5` is a property of the new agent's internal fix loop, not a modification of an existing gate.

### Validated by 4 adversarial review attempts

The release itself was shipped through the pipeline (dogfooded against the IFRS 16 reference project). Four parallel security + architecture + quality scanner passes converged to CLEAN consensus — but only after attempt 3 caught a CRITICAL regression introduced by hardening attempt 2 (a function rename mismatch that would have silently disabled the entire enforcement layer in production). The very mechanism we built caught its own ship-blocker. **The medicine works on itself.**

Full release notes: [`CHANGELOG.md`](CHANGELOG.md).

---

## Workflow Contracts — ATDD · BDD · DDD (v6.1.0)

Three first-class workflow contracts, each enforced by a dedicated agent step and pinned by a regression test. They are not optional patterns we hope agents follow — they are **emission requirements** the pipeline produces and validates.

### ATDD — Given/When/Then for every Acceptance Criterion

The `quality-gate-router` derives **at least one Given/When/Then scenario per Acceptance Criterion** in the spec, plus an additional non-spec branch (Step 1b) that captures Given/When/Then for MEDIA/COMPLEXA tasks that arrive without a spec. EARS continuations (`And`, `But`) are allowed. SIMPLES is exempt. The scenarios are presented to you in plain language before any test code is written; you approve, then the `pre-tester` emits failing tests (RED phase) that pin those scenarios.

**Enforced by:** `agents/quality/quality-gate-router.md` Step 1 (spec branch) + Step 1b (non-spec branch). **Test:** `tests/regression/v6.1.0/D5_atdd_quality_gate_router.cjs` — 10 / 10 PASS.

### BDD — Gherkin per Vertical Slice

For Feature pipelines that decompose into vertical slices, `feature-vertical-slice-planner` Step 3b **emits a Gherkin `.feature` file per slice** at `.pipeline/artifacts/bdd/SLICE-NN.feature` (flat naming, padded slice numbers, `>= 100` slice IDs reserved for v6.2+). Each scenario maps 1:1 to an Acceptance Criterion. Gherkin syntax (`Feature:`, `Scenario:`, `Given/When/Then/And/But`) — copy-pasteable into Cucumber, Behave, SpecFlow, or read by humans.

**Enforced by:** `agents/executor/type-specific/feature-vertical-slice-planner.md` Step 3b. **Test:** `tests/regression/v6.1.0/D6_bdd_gherkin_output_contract.cjs` — 8 / 8 PASS.

### DDD — Lightweight Bounded Contexts on COMPLEXA

`plan-architect` Rule 10 mandates a **3-column Bounded Contexts table** in every COMPLEXA `IMPLEMENTATION_PLAN`: `Context | Aggregate Root | Key Invariants`. Deliberately lightweight — no Owner/Team/Status columns, no ubiquitous-language dictionary. Just the structural decisions that matter for the implementation: where the seams are, what each aggregate enforces. Missing on COMPLEXA emits a `BOUNDED_CONTEXT_MISSING` SOFT event into the audit trail. SIMPLES/MEDIA are exempt.

**Enforced by:** `agents/quality/plan-architect.md` Rule 10 + IMPLEMENTATION_PLAN YAML `bounded_contexts:` array. **Test:** `tests/regression/v6.1.0/D7_ddd_bounded_contexts_contract.cjs` — 9 / 9 PASS.

### Why this matters

Most "AI does TDD" tooling stops at *"the agent wrote some tests"*. Pipeline Orchestrator emits **contractual artifacts** that survive the pipeline: ATDD scenarios in plain language you approved, Gherkin files attachable to your QA tooling, Bounded Contexts that travel with the plan. **You read what was decided. Your QA team reads it. Six months later, the audit reads it.**

Full v6.1.0 design notes in [`CHANGELOG.md`](CHANGELOG.md) §6.1.0. Forward dependencies for v6.2+ documented (bdd_artifact consumer, gherkin_content persistence, SLICE-NN >=100 reservation).

---

## Install

The plugin ships through two channels. **Use the marketplace channel for normal Claude Code installs** — it is the public channel and requires no authentication. NPM is restricted (private scope, granular token required) and exists for internal/team installs that want package-manager lifecycle around the plugin source.

### Channel A — Marketplace (recommended, public)

```bash
# Once: register the FX-Studio-AI marketplace
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator

# Then: install the plugin
/plugin install pipeline-orchestrator@FX-studio-AI
```

Updates: `/plugin update pipeline-orchestrator@FX-studio-AI`.

### Channel B — NPM (restricted scope, team installs)

Published as **`@fx-studio-ai/pipeline-orchestrator`** under the `@fx-studio-ai` scope (`access: restricted` — private by user decision since v6.1.0; marketplace remains the public channel).

```bash
# Configure scoped registry auth (one-time, per machine)
echo "@fx-studio-ai:registry=https://registry.npmjs.org/" >> ~/.npmrc
echo "//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN" >> ~/.npmrc

# Install
npm install @fx-studio-ai/pipeline-orchestrator

# Or pin a specific version
npm install @fx-studio-ai/pipeline-orchestrator@6.3.0
```

Token requirements: granular token with **Bypass 2FA: enabled** on the `@fx-studio-ai` scope (your NPM account must be in `auth-and-writes` mode for the token to grant publish rights to maintainers).

### Verify activation

```
/pipeline-orchestrator:pipeline --diagnostic "add a hello-world endpoint"
```

If the plugin is live, you will see classification output (SIMPLES/MEDIA/COMPLEXA), pipeline variant selection, and `INFORMATION_GATE: CLEAR` — without any code being written.

After installing via either channel, `/pipeline-orchestrator:pipeline [task]` plus the thin variant entry-points (`/pipeline-orchestrator:bugfix`, `/pipeline-orchestrator:feature`, `/pipeline-orchestrator:audit`, `/pipeline-orchestrator:spec`) become available.

---

## How It Works

### Phase 0 — Triage

The `task-orchestrator` reads your request and classifies it by type (Bug Fix / Feature / Audit / UX / Spec), complexity (SIMPLES / MEDIA / COMPLEXA), and pipeline variant. The `information-gate` macro-gate asks clarifying questions for any critical missing info. On COMPLEXA tasks, the `design-interrogator` walks the design decision tree one question at a time.

**Gates:** `SSOT_CONFLICT` (MANDATORY), `INFO_GATE_BLOCKED` (HARD), `COMPLEXITY_GATE` (SOFT).

### Phase 1.5 — Planning (MEDIA + COMPLEXA + Spec)

The `plan-architect` enters Plan Mode (read-only research), maps the codebase, and emits an `IMPLEMENTATION_PLAN` with `CHANGE_CONTRACT`, task breakdown, dependency order, pattern references, risk assessment, and a Bounded Contexts section on COMPLEXA. You approve, adjust, or reject before any code is written.

**Gates:** `PLAN_REJECTED` (HARD), `BOUNDED_CONTEXT_MISSING` (SOFT), `CHANGE_CONTRACT_MISSING` (SOFT — promoted to HARD in v6.4.0).

### Phase 2 — Batch Execution with TDD

The `quality-gate-router` derives test scenarios from acceptance criteria; you approve them in plain language. The `pre-tester` writes them as failing tests (RED). The `executor-controller` then runs implementation in batches sized by complexity:

```
SIMPLES   → all tasks at once
MEDIA     → 2-3 tasks per batch
COMPLEXA  → 1 task per batch (maximum control)
```

Each batch follows: `micro-gate → SCOPE LOCK CHECK → implementer → spec-review → quality-review → checkpoint-validator`. After checkpoint passes, `review-orchestrator` spawns the three parallel adversarial reviewers (independent context, no implementation summaries). Findings trigger a fix loop bounded to 3 attempts for `ADVERSARIAL_BLOCK`, 5 for `diff-discipline-reviewer`'s `REJECTED`. After max, `FIX_LOOP_EXHAUSTED` halts the pipeline.

**Gates:** `TDD_APPROVAL` (HARD), `MICRO_GATE_GAP` (HARD), `CHECKPOINT_FAIL` (HARD), `ADVERSARIAL_BLOCK` (HARD), `ADVERSARIAL_GATE` (SOFT), `FIX_LOOP_EXHAUSTED` (CIRCUIT_BREAKER), `STOP_RULE` (CIRCUIT_BREAKER).

### Phase 3 — Closure (Pa de Cal)

`sanity-checker` runs the full build + tests + regression suite. The optional `final-adversarial-orchestrator` dispatches the three parallel reviewers one last time with zero shared context — recommended for COMPLEXA, automatic for MANDATORY-gate domains (auth/crypto/data). `final-validator` emits **Go / Conditional Go / No-Go** with the confidence score. `finishing-branch` offers four closeout options: commit, push+PR, keep uncommitted, discard.

**Gates:** `FINAL_ADVERSARIAL_GATE` (SOFT), `FINAL_ADVERSARIAL_REWORK` (HARD), `ADVERSARIAL_GATE_MANDATORY` (MANDATORY when auth/crypto/data touched), `CLOSEOUT_CONFIRM` (SOFT).

---

## Pipeline Types

The plugin scales depth automatically by complexity. A typo fix does not get the same ceremony as a payment system rewrite.

| Complexity | Threshold | Batch size | Plan mode | Adversarial | Sentinel checks | Wall-clock |
|---|---|---|---|---|---|---|
| **SIMPLES** | 1-2 files · <30 lines · 1 domain | all-at-once | skipped | 2 checklists | 2 of 5 | ~5-15 min |
| **MEDIA** | 3-5 files · 30-100 lines · 2 domains | 2-3 tasks | automatic | 5 checklists | 3-5 of 5 | ~30-60 min |
| **COMPLEXA** | 6+ files · >100 lines · 3+ domains | 1 task | mandatory | 7 checklists | all 5 | ~90-180 min |

Plus modes for non-standard runs: `--hotfix` (production emergency, reduced scope but never skipped gates), `--diagnostic` (classification + plan only, no code), `--continue` (resume from a previous run), `review-only` (final adversarial against uncommitted diff).

---

## Agent Architecture

<div align="center">
  <img src="assets/diagrams/architecture-animated.svg" alt="Agent architecture by phase and complexity" width="100%"/>
</div>

The plugin ships with **20 production agents** plus type-specific variants (47 agent definition files total across all execution paths). Phase 1.5 conditional planning, the per-task quality chain in Phase 2, and the three parallel adversarial reviewers in Phase 3 are the load-bearing patterns.

| Layer | Agents |
|---|---|
| **Core orchestration** | `task-orchestrator`, `information-gate`, `sentinel`, `pipeline-controller`, `brainstorm-controller`, `final-validator`, `finishing-branch`, `sanity-checker`, `checkpoint-validator`, `adversarial-batch` |
| **Quality (review + planning)** | `plan-architect`, `design-interrogator`, `pre-tester`, `quality-gate-router`, `review-orchestrator`, `architecture-reviewer`, `diff-discipline-reviewer` (new v6.3.0), `final-adversarial-orchestrator` |
| **Executor (top-level)** | `executor-controller`, `executor-implementer-task`, `executor-fix`, `executor-spec-reviewer`, `executor-quality-reviewer`, `spec-closer` |
| **Executor (type-specific variants)** | `feature-*` (3), `bugfix-*` (3), `audit-*` (4), `ux-*` (3), `spec-*` (3), `adversarial-*` (4) |
| **Brainstorm steps** | `step-00-intake`, `step-01-explore`, `step-01b-alternatives` |

Full agent registry: [`references/team-registry.md`](references/team-registry.md).

---

## Gate System

<div align="center">
  <img src="assets/diagrams/gate-system-animated.svg" alt="22-gate hardness taxonomy" width="100%"/>
</div>

Every phase transition crosses at least one gate. Each gate has a defined hardness that determines whether it blocks, asks, or merely advises.

| Hardness | Count | Behavior |
|---|---|---|
| **MANDATORY** | 3 | Never bypass. Cannot be skipped even with `--hotfix`. Failure halts the pipeline. |
| **HARD** | 13 | Blocks until resolved. Pipeline stops at the gate. User answers or issue is fixed. No silent skips. |
| **CIRCUIT_BREAKER** | 2 | After N consecutive failures (2-3 attempts), pipeline halts and requires explicit reset. Prevents infinite loops. |
| **SOFT** | 9 | Recommended but skippable with explicit acknowledgment. Every skip is logged with a confidence penalty. |
| **AUDIT** (v6.2+) | 5 | Informational telemetry. Never blocks, never asks. First-class audit-trail rows. |

Full registry in [`references/gates.md`](references/gates.md). Audit-trail invariants in [`references/audit-trail.md`](references/audit-trail.md). The 22-row Mandatory Gates by Complexity sub-table is pinned by regression test `F1` — adding a 23rd row fails the build.

---

## Architecture

| Layer | Component |
|---|---|
| **Commands** | `/pipeline`, `/brainstorm` — entry points (`commands/`) |
| **Controllers (N1)** | `pipeline-controller`, `brainstorm-controller`, `executor-controller` (`agents/core/`) |
| **Subagents** | 20 production agents + 27 type-specific variants across `agents/core/`, `agents/quality/`, `agents/executor/` |
| **Skills** | Variant entry-points: `bugfix-light`, `feature-heavy`, `spec-light`, `audit-heavy`, etc. (`skills/`) |
| **Hooks** | `sentinel-hook`, `dispatch-guard`, `edit-guard-hook`, `force-pipeline-agents`, `session-lock-hook`, `session-cleanup-hook`, `completion-checklist`, `skill-frontmatter-parser`, **`scope-lock-hook`** (new v6.3.0) — 9 hooks total (`.claude/hooks/`) |
| **Security libs** (v6.0.0+) | `sentinel-state-signer`, `jsonl-sanitizer`, `pipeline-local-parser`, `codex-operational-runtime` (`lib/`) |
| **References (SSOT)** | `gates.md`, `gate-request-protocol.md`, `audit-trail.md`, `confidence.md`, `complexity-matrix.md`, `implementation-discipline.md` (v6.3.0), `stale-thresholds.md`, `glossary.md` (`references/`) |
| **Tests** | 31 test suites: 39 regression tests in `tests/regression/v6.0.0`, 19 in `v6.1.0`/`v6.2.0`, 8 new in `v6.3.0` (F8-F15), 8 hook test suites in `.claude/hooks/__tests__/` |
| **Audit Reports** | `docs/audits/2026-05-15-ifrs16-deep-audit/` (10 files), `docs/audits/2026-05-18-clarification-overhaul-dogfood/` |

### Bonus: standalone HTML diagrams

For interactive deep-dives with cross-navigation (open directly in any browser):

- [`docs/diagrams/index.html`](docs/diagrams/index.html) — catalog
- [`docs/diagrams/pipeline-overview.html`](docs/diagrams/pipeline-overview.html) — 4 phases + execution modes
- [`docs/diagrams/achado-7-protocol.html`](docs/diagrams/achado-7-protocol.html) — emit-and-hoist subagent protocol
- [`docs/diagrams/gate-hierarchy.html`](docs/diagrams/gate-hierarchy.html) — gates by hardness
- [`docs/diagrams/audit-history.html`](docs/diagrams/audit-history.html) — v5.2 → v6.3 audit timeline

---

## Why You Would Use This

If any of these sound like your week, you are the target user.

- *"I asked the AI for a simple validation rule. Three hours later it had refactored my entire validation layer."* → **CHANGE_CONTRACT + SCOPE LOCK CHECK** prevents the refactor before it starts.

- *"The tests pass, but I have no idea what the AI actually changed in batch 7."* → **diff-discipline-reviewer** flags scope violations and over-engineering per batch.

- *"My security review missed an auth bypass because the reviewer trusted the implementer's intent."* → **3-way parallel adversarial review with zero implementation context** finds bypasses the implementer never imagined.

- *"I need to attach an audit trail to this PR for compliance."* → **TRACE.md + gate-decisions.jsonl** ships with every run. HMAC-signed sentinel state, standalone validator script.

- *"The AI added a new dependency to satisfy a test. I want a system that asks me first."* → **`forbidden_change_types: new_dependency_without_approval`** is a contract default. Violation is a HARD gate.

- *"I want to ship fast on small tasks AND have full ceremony on payment systems."* → **Proportional rigor**: SIMPLES gets light, COMPLEXA gets full adversarial team. Auto-detected, no configuration.

- *"My team accepts AI PRs but no one knows what was actually decided along the way."* → **Glass-box audit trail** records every gate, every decision, every adversarial finding, every fix loop.

- *"I need Gherkin files my QA team can run in Cucumber, not handwritten tests."* → **BDD Gherkin emission per slice** ships `.feature` files at `.pipeline/artifacts/bdd/SLICE-NN.feature`. ATDD scenarios derive Given/When/Then from your acceptance criteria automatically.

- *"On COMPLEXA tasks, the plan never captures where the architectural seams are."* → **DDD lightweight Bounded Contexts** mandated in Rule 10: a 3-column table per COMPLEXA plan (Context · Aggregate Root · Invariants). Missing → SOFT audit event.

This is not "AI safety" theater. It is structural discipline applied at the place where AI output meets your production branch.

---

## Audit Reports

The v6.0.0 release ships 10 archived audit reports under [`docs/audits/2026-05-15-ifrs16-deep-audit/`](docs/audits/2026-05-15-ifrs16-deep-audit/):

| File | Purpose |
|---|---|
| [`INDEX.md`](docs/audits/2026-05-15-ifrs16-deep-audit/INDEX.md) | Reading order + executive summary |
| [`_canonical_contract.md`](docs/audits/2026-05-15-ifrs16-deep-audit/_canonical_contract.md) | Audit ground truth (22 gates, 45 agents) |
| [`_decision_table.md`](docs/audits/2026-05-15-ifrs16-deep-audit/_decision_table.md) | Unified gate response policy |
| [`FINAL_CONSOLIDATED_REPORT.md`](docs/audits/2026-05-15-ifrs16-deep-audit/FINAL_CONSOLIDATED_REPORT.md) | Phase B+D matrix (7×N gates, 7×45 dispatch) |
| [`PANEL_FINAL.md`](docs/audits/2026-05-15-ifrs16-deep-audit/PANEL_FINAL.md) | 3-persona panel consolidation |
| [`FASE_H_FINDINGS.md`](docs/audits/2026-05-15-ifrs16-deep-audit/FASE_H_FINDINGS.md) | Second-pass deep audit (hooks + anti-injection POCs) |
| [`FASE_H_ADDENDUM.md`](docs/audits/2026-05-15-ifrs16-deep-audit/FASE_H_ADDENDUM.md) | Runtime dispatches Phase 3 + fix loop + skills |
| [`FASE_H_FINAL.md`](docs/audits/2026-05-15-ifrs16-deep-audit/FASE_H_FINAL.md) | Coverage consolidation + false-positive retraction |
| [`FASE_I_FINAL.md`](docs/audits/2026-05-15-ifrs16-deep-audit/FASE_I_FINAL.md) | Residual coverage + 3 security libraries |
| [`COMPARISON_v5.2_vs_v5.3.md`](docs/audits/2026-05-15-ifrs16-deep-audit/COMPARISON_v5.2_vs_v5.3.md) | Pre/post comparison with runtime evidence |

The audit was performed against the **IFRS 16 lease accounting** reference project (Python/FastAPI + TypeScript/React) using seven git worktrees and a 3-persona adversarial panel.

v6.2.0 added a dogfood audit at [`docs/audits/2026-05-18-clarification-overhaul-dogfood/`](docs/audits/2026-05-18-clarification-overhaul-dogfood/) — a real MEDIA scenario against `contracts.py:232`, 14 telemetry events, 4 anti-invention blockers surfaced (streaming/PII/cap/timeout) that the legacy 7-question template would have left for downstream invention.

---

## Tests

31 test suites total — all PASS:

```
tests/regression/v6.0.0/         13 suites · Achado #7 protocol + libs + stale thresholds
tests/regression/v6.1.0/          5 suites · ATDD + BDD + DDD + cross-cutting docs + F1 gates
tests/regression/v6.2.0/          5 suites · Clarification overhaul + alternatives
tests/regression/v6.3.0/          8 suites · F8-F15 implementation discipline layer
.claude/hooks/__tests__/          8 suites · sentinel + dispatch-guard + scope-lock + ...
```

Run the full suite:

```bash
npm test
```

Result: **31 passed / 0 failed / 31 total**. Zero regressions across versions.

---

## Versioning

```
v6.0.0 (2026-05-15) — MAJOR — audit + hardening, 22/22 gates runtime, 39 tests, coverage 30% → 95%
v6.1.0 (2026-05-15) — MINOR — ATDD/BDD/DDD workflow contracts (D5/D6/D7) + 4 tests
v6.2.0 (2026-05-18) — MINOR — Pre-execution clarification overhaul + alternatives brainstorming
v6.3.0 (2026-05-19) — MINOR — Implementation Discipline Layer + 3-way adversarial review
```

Full lineage in [`CLAUDE.md`](CLAUDE.md). Tagged releases on GitHub. Marketplace updates within minutes of tag.

---

## FX Studio AI Suite

This repository is both the Pipeline Orchestrator plugin **and** the FX-Studio-AI marketplace hosting multiple plugins. Install the marketplace once to access them all:

- **pipeline-orchestrator** (this plugin) — execution governance
- **skill-advisor** — intelligent toolchain orchestrator (recommends skills/plugins/MCPs)
- *more in the marketplace*

```bash
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator
/plugin list
```

---

## Contributing

Contributions welcome. This is an active project with a strong audit culture.

1. Read the [audit reports](docs/audits/2026-05-15-ifrs16-deep-audit/INDEX.md) to understand the architectural decisions.
2. Pick an issue from the backlog or open a new one.
3. Every code change must pass the regression suite (`npm test` → 31/31 PASS).
4. New subagents must declare the **ACHADO #7 RUNTIME PROTOCOL** section.
5. New gates must be added to `references/gates.md` registry AND `commands/pipeline.md` Inline Invariants AND covered by a runtime test.
6. New plans (v6.3.0+) must declare `CHANGE_CONTRACT` with `bootstrap.active: false` — the bootstrap flag is locked by `F15_bootstrap_lock_invariant.cjs`.

---

## License

MIT © FX Studio AI

---

<div align="center">
  <p><strong>Pipeline Orchestrator v6.3.0</strong> · 2026-05-19</p>
  <p>Built by <a href="https://github.com/fernandoxavier02">FX Studio AI</a> · <a href="https://github.com/fernandoxavier02/Pipeline-Orchestrator">Source on GitHub</a></p>
  <p><em>"AI follows a contract, not its mood."</em></p>
</div>
