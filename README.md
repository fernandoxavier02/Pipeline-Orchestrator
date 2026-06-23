<div align="center">
  <a href="https://fxstudioai.com">
    <img src="assets/logos/fx-studio-ai-logo.png" alt="FX Studio AI" width="380"/>
  </a>
</div>

<div align="center">
  <img src="assets/diagrams/hero-banner.svg" alt="Pipeline Orchestrator — governance layer for AI coding" width="100%"/>
</div>

<h1 align="center">Pipeline Orchestrator</h1>

<p align="center"><strong>A multi-agent governance layer that sits between your spec and your production code — and makes the AI follow a contract instead of its mood.</strong></p>

<p align="center">
  <a href="https://github.com/fernandoxavier02/Pipeline-Orchestrator/releases"><img src="https://img.shields.io/badge/version-8.13.0-7C3AED?style=flat-square&logo=git&logoColor=white" alt="Version"/></a>
  <img src="https://img.shields.io/badge/agents-20-0EA5E9?style=flat-square" alt="Agents"/>
  <img src="https://img.shields.io/badge/gates-49-22C55E?style=flat-square" alt="Gates"/>
  <img src="https://img.shields.io/badge/hooks-28-EC4899?style=flat-square" alt="Hooks"/>
  <img src="https://img.shields.io/badge/tests-188_files-F59E0B?style=flat-square" alt="Tests"/>
  <img src="https://img.shields.io/badge/observability-Langfuse_Cloud-FF6B6B?style=flat-square&logo=opentelemetry&logoColor=white" alt="Observability"/>
  <img src="https://img.shields.io/badge/platform-Claude_Code_+Cursor_+OpenCode-000?style=flat-square" alt="Platform"/>
  <img src="https://img.shields.io/badge/license-PolyForm_Shield_1.0.0-EC4899?style=flat-square" alt="License"/>
</p>

<div align="center">
  <img src="assets/diagrams/ecosystem.svg" alt="Pipeline Orchestrator ecosystem — Claude Code, Cursor, OpenCode, Langfuse, Paperclip" width="100%"/>
</div>

<p align="center">
  <a href="#the-problem">Problem</a> ·
  <a href="#the-solution">Solution</a> ·
  <a href="#pipeline-workflows">Workflows</a> ·
  <a href="#the-enforcement-layer">Enforcement</a> ·
  <a href="#the-gate-system">Gates</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#observability--langfuse">Langfuse</a> ·
  <a href="#paperclip-runtime">Paperclip</a> ·
  <a href="#quick-start">Install</a>
</p>

---

> **Heads-up:** this repository is both the Pipeline Orchestrator plugin **and** the **FX-Studio-AI** marketplace that hosts several plugins. Install the marketplace once to get them all — see [the suite section](#fx-studio-ai-suite).

---

## The Problem

Plenty of tools help you decide *what* to build — Jira, Linear, Notion, Kiro, ADRs. They handle the *plan*. But when an AI agent turns that plan into production code, the industry relies on human discipline. **Discipline degrades under pressure, time constraints, and long-running sessions.**

<div align="center">
  <img src="assets/diagrams/problem-degradation.svg" alt="The long-session drift curve" width="100%"/>
</div>

Long AI coding sessions drift on a predictable curve: the first few batches are clean, then scope creeps in ("let me also refactor this…"), then dependencies appear unannounced and weakened assertions replace fixed bugs, and eventually the code passes CI but no longer solves the problem you asked it to solve. Traditional CI catches syntax errors and regressions. It does **not** catch architectural drift, scope creep in batch 7, or an unauthorized dependency added three batches ago.

**Pipeline Orchestrator closes the gap between *"we have a spec"* and *"we shipped it safely."*** It does not replace your planning tools. It governs the execution.

---

## The Solution

Five independent anchors hold long sessions on contract. Failures in one do not propagate — together they form a defense in depth.

<div align="center">
  <img src="assets/diagrams/governance-flow.svg" alt="Five governance anchors" width="100%"/>
</div>

**1 · CHANGE_CONTRACT** — Every plan declares exactly which files may be touched, which are forbidden, and which change categories need explicit approval (new dependency, public API change, schema migration, test weakening). A `diff_budget` ceiling escalates anything over 20%. *No more "I just refactored a bit while I was there."*

**2 · SCOPE LOCK CHECK** — A runtime `PreToolUse` hook (`scope-lock-hook.cjs`) enforces the contract before every `Write`/`Edit`/`Bash`. Target outside `allowed_files`? **Denied.** Forbidden change type? **Denied.** Diff budget exhausted? **Denied.** The enforcement holds even when the LLM tries to be clever.

**3 · Adversarial independence** — Every batch is attacked by three parallel reviewers that never saw what the implementer *intended* — only the result: `adversarial-batch` (security), `architecture-reviewer` (patterns), `diff-discipline-reviewer` (scope). Spawned in a single parent message with three `Agent` calls: guaranteed parallel, guaranteed independent. This is what kills confirmation bias.

**4 · Gate hierarchy** — **49 checkpoints** across five hardness levels, several of them deterministic `DENY` hooks (v8.5–v8.9). The agent physically cannot advance past a red build, an unresolved info gap, or a `NO-GO`.

**5 · Glass-box audit trail** — Every run emits `TRACE.md` + `gate-decisions.jsonl` under `.pipeline-orchestrator/runs/<run-id>/`, **HMAC-signed** against tampering, validatable with a standalone Node script, and streamable to **Langfuse Cloud** for cross-run analytics. Every decision is recorded. Every run ends with a number — `GO ≥ 0.80`, `CONDITIONAL ≥ 0.60`, `NO-GO < 0.60`. No gut feelings.

---

## Key Features

- **Deterministic enforcement (v8.5–v8.9)** — the recent headline. Flow rules that used to be prompt-only are now code-enforced gates: a red build blocks advancement, two consecutive failures halt the pipeline, any touch of auth/crypto/payment/data makes adversarial review **mandatory** with no warn-escape, and `NO-GO`/rejected-plan/open-critical verdicts stop the right agent.
- **Spec-authoring takeover (v8.0)** — `/pipeline-orchestrator:spec` no longer just processes an existing spec. It **authors a new one** end-to-end: brainstorm clarification → proactive ideation → forced design interrogation → Kiro lifecycle → adversarial document review → sealed contract, then stops before implementing.
- **Adversarial review at two levels** — per-batch three-way parallel review during execution, plus an optional final three-reviewer sweep with zero shared context before the `Pa de Cal` (final validation).
- **Proportional rigor** — a typo fix does not get the same ceremony as a payment system rewrite. Auto-detected: SIMPLES is light, COMPLEXA gets the full adversarial team.
- **First-class observability** — opt-in **Langfuse Cloud** tracing with two env vars; per-subagent spans carry `phase`, `agent_name`, `plugin_version`, `run_id`. On-disk JSONL for compliance, dashboard for trends.
- **Runs inside Paperclip** — the same governance layer drives autonomous agents on [Paperclip](https://paperclip.ing) via the `claude_local` adapter and a flow-mirror that turns any pipeline into a dependency-linked tree of issues.
- **Offline-first** — absent credentials mean zero SDK calls, zero network. The Langfuse hook short-circuits in under 100 ms.

---

## Pipeline Workflows

One orchestrator, many workflows. The `task-orchestrator` reads your request, classifies it by **type**, **complexity**, and **variant**, then routes to the right pipeline. Each pipeline scales depth automatically (`-light` / `-heavy`).

<div align="center">
  <img src="assets/diagrams/workflows.svg" alt="Pipeline types — Bug Fix, Feature, Audit, UX, Spec, User Story, Refactor, generic" width="100%"/>
</div>

| Workflow | What it does | When it fires |
|---|---|---|
| **🐛 Bug Fix** | Terrain recon → ranked hypotheses → confirmed root cause → targeted fix → regression tests for adjacent breakage. | "fix", "debug", "investigate", "broken", "production issue" |
| **✨ Feature** | Vertical-Slice Architecture: plans slices, implements each with per-slice TDD, validates cross-layer integration. | New capability, UI feature, full-stack addition |
| **🔍 Audit** | **Read-only.** Four phases: technology intake → domain analysis → compliance check → risk-matrix report. Never edits production code. | "audit", "review this codebase", compliance assessment |
| **♿ UX Simulation** | **Read-only.** Builds persona matrix, simulates user journeys, runs WCAG 2.1 AA accessibility audit, catalogs friction. | UX review, accessibility audit, before redesign |
| **📐 Spec Authoring** | Authors a brand-new specification end-to-end (Kiro lifecycle), adversarially reviews the *documents*, then **seals it as a contract** and stops before implementing. | Greenfield feature, when you need the design interrogated first |
| **👤 User Story** | Acceptance-criteria-driven, 1:1 Pulsar shape (10 steps). Lighter than Feature, stricter than a todo. | Well-scoped story with clear acceptance criteria |
| **🔧 Refactor** | Scope-locked internal rewrite. The first production write is **denied** until `REFACTOR_SCOPE_LOCK` lands in the gate log — you cannot "refactor" into a feature by accident. | "refactor", "clean up", restructure without behavior change |
| **🎛 Pipeline (generic)** | The classifier + router itself. `/pipeline [task]` auto-detects the type and complexity, then dispatches. | Anything ambiguous; the safe default |

Three flows run **inside every pipeline**, not as separate types: the **brainstorm** (intake → explore → alternatives → ideation), the **spec lifecycle** (init → requirements → validate-gap → design → validate-design → tasks), and the **3-way adversarial review**.

**Mode flags** modulate any pipeline: `--hotfix` (production emergency, reduced scope, never skips MANDATORY gates), `--diagnostic` (classify + plan only, no code), `--continue` (resume a previous run), `--review-only` (final adversarial against an uncommitted diff), `--light`/`--heavy` (force depth), `--plan`/`--no-plan` (Plan Mode control), `--strict-spec`, `--on=paperclip`.

---

## How It Works

Every non-trivial request flows through four phases.

### Phase 0 — Triage
`task-orchestrator` classifies your request by **type** (Bug Fix / Feature / Audit / UX / Spec / User Story / Refactor), **complexity** (SIMPLES / MEDIA / COMPLEXA), and **variant**. `information-gate` blocks on critical missing info; on COMPLEXA, `design-interrogator` walks the trade-off tree one question at a time.

### Phase 1.5 — Planning
`plan-architect` enters Plan Mode (read-only), maps the codebase, and emits an `IMPLEMENTATION_PLAN` with the `CHANGE_CONTRACT`, task breakdown, dependency order, risk assessment, and (on COMPLEXA) a Bounded Contexts table. You approve, adjust, or reject before any code is written.

### Phase 2 — Batch execution with TDD
`quality-gate-router` derives test scenarios from acceptance criteria; you approve them in plain language. `pre-tester` writes them as failing tests (RED). `executor-controller` runs implementation in batches sized by complexity. Each batch: `micro-gate → SCOPE LOCK CHECK → implementer → spec-review → quality-review → checkpoint` → then the three parallel adversarial reviewers. Findings trigger a bounded fix loop (max 3 attempts per cycle, max 4 cycles per batch, with a two-level `ADVERSARIAL_LOOP_BREAKER` that can escalate to a blank-slate `REIMPLEMENT`).

### Phase 3 — Closure (Pa de Cal)
`sanity-checker` runs build + tests + regression. The optional `final-adversarial-orchestrator` re-runs the three reviewers with zero shared context. `final-validator` emits **GO / CONDITIONAL GO / NO-GO** with the confidence score. `finishing-branch` offers four closeout options: commit, push+PR, keep uncommitted, discard.

---

## The Enforcement Layer

This is what separates Pipeline Orchestrator from prompt-only governance. The rules are not advice the agent *may* follow — they are hooks that run on every tool call and **deny** the action if it breaks contract. Twenty-eight `.cjs` hooks in `.claude/hooks/`, twelve of them deterministic `DENY` gates.

<div align="center">
  <img src="assets/diagrams/enforcement-hooks.svg" alt="The enforcement layer — 28 hooks, 12 deterministic DENY" width="100%"/>
</div>

**SCOPE LOCK CHECK (`scope-lock-hook.cjs`)** runs before every `Write`/`Edit`/`Bash` write. It compares the target against the active `CHANGE_CONTRACT`:

- target file not in `allowed_files` → **DENY**
- change type in `forbidden_change_types` (`new_dependency_without_approval`, `public_api_change`, `schema_migration`, `test_weakening`) → **DENY**
- cumulative `diff_budget` exceeded → **DENY**

**The arming chain (v8.7–v8.8)** means the agent cannot do real work until a pipeline run is *armed* and *runs in order*: `pipeline-arm-gate` blocks until `pipeline-arm-writer` stamps the arm-pending marker (HMAC-signed via the sentinel-state signer — a tampered marker reads as *not armed*); `step-ledger-gate` then enforces that steps run in ledger order; `dispatch-pending-gate` blocks any parent work while a subagent handshake is pending; `gate-log-gate` rejects events that don't flow through the SSOT writer. Refactor pipelines add `REFACTOR_SCOPE_LOCK` — the first production write is denied until that marker lands.

**Glass-box audit trail.** Every gate decision is written through `lib/gate-decision-writer.cjs::appendGateDecision` (direct `fs.appendFile` is flagged `REJECTED` by the diff-discipline reviewer) into `gate-decisions.jsonl` with HMAC integrity. `scripts/validate-trace.cjs` is a standalone Node script that re-verifies a run end-to-end — you can attach its output to a PR for compliance. The `sentinel-state` signature is verified two-tier: unsigned is tolerated (warn), a bad signature fails closed under `PIPELINE_HMAC_STRICT`.

**Achado #7 protocol.** Every subagent declares its runtime protocol (`GATE_REQUEST` / `DISPATCH_REQUEST`) because the Claude Code harness strips interactive tools (`AskUserQuestion`, `EnterPlanMode`, `Agent`) from subagent contexts. The protocol makes parent↔child handshakes explicit instead of relying on tools that silently disappear. New subagents must declare this section — it is a contribution requirement.

---

## The Gate System

<div align="center">
  <img src="assets/diagrams/gate-system-animated.svg" alt="Gate system — 49 checkpoints, five hardness levels" width="100%"/>
</div>

Every phase transition crosses at least one gate. Each gate has a defined **hardness** that determines whether it blocks, asks, or merely records.

| Hardness | Behavior |
|---|---|
| **MANDATORY** | Never bypassed — not even by `--hotfix`. Structural integrity (SSOT) and domain-mandated security reviews. |
| **HARD** | Blocks until resolved; clear resolution path (answer, approve, fix). |
| **CIRCUIT_BREAKER** | Halts after N consecutive failures; requires explicit reset. Prevents infinite loops. |
| **SOFT** | Recommended; skippable with explicit acknowledgment (logged, confidence penalty). |
| **AUDIT** | Informational telemetry; never blocks. First-class audit-trail row. |

Mandatory-gate counts scale with complexity: **SIMPLES 11 · MEDIA 13 · COMPLEXA 18** (SIMPLES was raised from 6 in v8.6, when plan mode + adversarial review became universal). Full registry in [`references/gates.md`](references/gates.md). The mandatory-gates table is pinned by a regression test that parses the doc and the matching constant in `lib/fidelity-reporter.cjs` and fails the build if they ever disagree — so the docs cannot silently drift from the code.

---

## Architecture

<div align="center">
  <img src="assets/diagrams/architecture-animated.svg" alt="Agent architecture — four layers, 20 production agents" width="100%"/>
</div>

**20 production agents** across four layers, plus type-specific variants (50 agent definition files in total). Full roster in [`references/team-registry.md`](references/team-registry.md).

- **Core orchestration** — `pipeline-controller`, `task-orchestrator`, `information-gate`, `sentinel`, `brainstorm-controller`, `spec-controller`, `checkpoint-validator`, `sanity-checker`, `final-validator`, `finishing-branch`.
- **Quality · planning & review** — `plan-architect`, `design-interrogator`, `quality-gate-router`, `pre-tester`, `review-orchestrator`, plus the three parallel reviewers (`adversarial-batch`, `architecture-reviewer`, `diff-discipline-reviewer`).
- **Executor** — `executor-controller`, `executor-implementer-task`, `executor-fix`, `executor-spec-reviewer`, `executor-quality-reviewer`, `spec-closer`.
- **Type-specific variants & brainstorm** — `feature-*`, `bugfix-*`, `audit-*`, `ux-*`, `spec-*`, `user-story-*`, `adversarial-*`, and the brainstorm steps (`intake → explore → alternatives → ideation`).

**33 skills**, **14 commands**, and the **28 enforcement hooks** above complete the surface. The hook layer is where prompt-only rules became unbreakable.

---

## Observability · Langfuse

Pipeline Orchestrator ships with first-class [Langfuse](https://langfuse.com) integration — the open-source LLM observability platform. It is **opt-in and offline-first**: with no credentials, the hook short-circuits in under 100 ms and makes zero network calls.

**Activate with two environment variables:**

```bash
export LANGFUSE_ENABLED=true
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_HOST=https://us.cloud.langfuse.com   # or your self-hosted URL
# optional:
export LANGFUSE_SAMPLE_RATE=1.0   # 0.0 disables tracing; 1.0 traces every run
export PIPELINE_TRACING_SCOPE=full   # agent-only (default) | agent-plus-skill | full
```

**What you see.** Each pipeline run becomes a single Langfuse **trace**; each subagent dispatch becomes a **span** carrying structured metadata — `run_id`, `task_type`, `complexity`, `phase`, `agent_name`, and `plugin_version`. Every gate decision, `GATE_REQUEST`, and adversarial finding lands as a scored event, so you can slice performance by agent, by phase, or by gate hardness.

**One run, one trace.** Earlier versions fragmented a single run across N traces when subagents forked processes. Since v7.5.0 the Langfuse carrier is keyed by `runId` (with graceful PPID/mtime fallback), and since v7.9.3 spans are resolved by phase + agent so you stop seeing `unknown`. The `langfuse-hook.cjs` also enforces project isolation via the plugin `.env`, so traces land in the right Langfuse project.

**On-disk mirror.** The same data is written to `gate-decisions.jsonl` and the run-log under `.pipeline-orchestrator/runs/<run-id>/`. The on-disk copy is your compliance artifact; the Langfuse dashboard is your trend view across runs.

**Bundled, not boilerplate.** `langfuse` 3.x is a `bundledDependencies` entry in `package.json`, so an npm install carries the SDK — no extra network step in air-gapped teams.

---

## Paperclip Runtime

[Paperclip](https://paperclip.ing) is an open-source platform for running autonomous AI agents — you provision a company of agents, they pick up issues, and work flows through dependencies. Pipeline Orchestrator runs **inside** Paperclip with effective parity to Claude Code standalone, so the same governance layer that guards your interactive sessions also guards the autonomous ones.

**The `claude_local` adapter.** Paperclip orchestrates its own agent lifecycle; the adapter exposes the plugin's agents, skills, and hooks to that lifecycle. Your plugin-defined `pipeline-controller`, `task-orchestrator`, adversarial reviewers, and gates all execute inside a Paperclip agent run.

**The flow-mirror (v7.9.0).** Any pipeline can be mirrored into a Paperclip **tree of issues** linked by `blockedByIssueIds` — each task, batch, and adversarial review becomes an issue with its dependencies wired. You watch the pipeline as a board; the orchestrator updates issues as it advances. The fidelity of the mirror is itself measured (`skills/measure-paperclip-fidelity`) and sealed with a **HMAC run-seal** (`lib/run-seal.cjs`) so a forged run cannot pass as governed.

**Company provisioning.** `setup-paperclip` runs `references/paperclip/scripts/provision-pipeline-company.cjs`, which creates a Paperclip company with **47 agent roles** and **11 skills**, name-agnostic (no hardcoded UUIDs). An existing live deployment runs ~50 agents on `codex_local` / `gpt-5.x`.

**Ten Paperclip entry-points** mirror the pipeline flows: `paperclip-audit`, `paperclip-bugfix`, `paperclip-feature`, `paperclip-hotfix`, `paperclip-overview`, `paperclip-refactor`, `paperclip-review`, `paperclip-spec`, `paperclip-user-story`, `paperclip-ux`. Start any flow with `--on=paperclip`. Full setup in [`docs/PAPERCLIP-INTEGRATION.md`](docs/PAPERCLIP-INTEGRATION.md).

---

## Quick Start

The plugin ships through two channels. **Use the marketplace for normal installs** — it is public and needs no auth. NPM is restricted (private scope) for internal/team installs.

### Channel A — Marketplace (recommended, public)

```bash
# Once: register the FX-Studio-AI marketplace
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator

# Then: install the plugin
/plugin install pipeline-orchestrator@FX-studio-AI
```

Updates: `/plugin update pipeline-orchestrator@FX-studio-AI`.

### Channel B — NPM (restricted scope, team installs)

Published as `@fx-studio-ai/pipeline-orchestrator` (`access: restricted` — private by design since v6.1.0; the marketplace remains the public channel).

```bash
echo "@fx-studio-ai:registry=https://registry.npmjs.org/" >> ~/.npmrc
echo "//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN" >> ~/.npmrc
npm install @fx-studio-ai/pipeline-orchestrator
```

The token needs **Bypass 2FA: enabled** on the `@fx-studio-ai` scope.

### Verify it is live

```
/pipeline-orchestrator:pipeline --diagnostic "add a hello-world endpoint"
```

If active, you will see classification (SIMPLES/MEDIA/COMPLEXA), variant selection, and `INFORMATION_GATE: CLEAR` — without any code being written.

### Turn on observability (optional)

See the [Langfuse section](#observability--langfuse) for the full env-var set. Minimal: `LANGFUSE_ENABLED=true` plus your public/secret keys and host.

---

## Pipeline Types · Depth by Complexity

The plugin scales depth automatically by complexity.

| Complexity | Threshold | Batch size | Plan mode | Adversarial | Wall-clock |
|---|---|---|---|---|---|
| **SIMPLES** | 1-2 files · <30 lines · 1 domain | all-at-once | required | required (universal since v8.6) | ~5-15 min |
| **MEDIA** | 3-5 files · 30-100 lines · 2 domains | 2-3 tasks | automatic | 3-way parallel | ~30-60 min |
| **COMPLEXA** | 6+ files · >100 lines · 3+ domains | 1 task | mandatory | 3-way + final sweep | ~90-180 min |

---

## Tests

```bash
npm test
```

188 test files spanning regression suites from v6.0.0 through v8.9.0 (Achado #7 protocol, telemetry hygiene, Phase 0 hardening, concurrent-safe tracing, implementation discipline, deterministic enforcement) plus the hook unit suites. The release gate also wires in the Paperclip flow-mirror and packaging tests.

---

## FX Studio AI Suite

This repository hosts the **FX-Studio-AI** marketplace. Install once to access multiple plugins:

- **pipeline-orchestrator** (this plugin) — execution governance
- **skill-advisor** — intelligent toolchain orchestrator (recommends skills/plugins/MCPs)
- *more in the marketplace*

```bash
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator
/plugin list
```

---

## Documentation & Changelog

- **[`CHANGELOG.md`](CHANGELOG.md)** — full release history, version by version (v1 → v8.9.0).
- **[`docs/diagrams/`](docs/diagrams/)** — standalone interactive HTML diagrams (pipeline overview, gate hierarchy, the Achado #7 subagent protocol, audit history).
- **[`docs/audits/`](docs/audits/)** — archived deep audits (IFRS 16 reference project, clarification-overhaul dogfood, enforcement-determinism audits).
- **[`references/`](references/)** — source-of-truth references: `gates.md`, `audit-trail.md`, `complexity-matrix.md`, `implementation-discipline.md`, `skill-governance.md`, `team-registry.md`.
- **[`docs/PAPERCLIP-INTEGRATION.md`](docs/PAPERCLIP-INTEGRATION.md)** — running the plugin inside Paperclip.

### Recent releases at a glance

- **v8.9.0** — flow-determinism gates Wave 1+2: red-build block, STOP_RULE counter, sensitive-domain mandatory review, generic phase-verdict gates (A1–A9).
- **v8.7–v8.8** — deterministic enforcement layer: arm-gate, step-ledger, fix-loop cap, gate-log guard, signed arm-pending marker. The agent cannot do real work until a run is armed and runs in order.
- **v8.6** — adversarial loop-breaker + universal SIMPLES scope (plan mode + adversarial now run on every task).
- **v8.0** — spec-authoring takeover: `/spec` authors a new specification from scratch and seals it as a contract.

Older lineage (v5 → v7.14) and the full detail of each release live in the [`CHANGELOG.md`](CHANGELOG.md).

---

## Contributing

Contributions welcome — this is an active project with a strong audit culture.

1. Read the [audit reports](docs/audits/) to understand the architectural decisions.
2. Every code change must pass the regression suite (`npm test`).
3. New subagents must declare the **Achado #7 runtime protocol** section.
4. New gates go into `references/gates.md` **and** the `commands/pipeline.md` Inline Invariants **and** a runtime test.
5. New writes to `gate-decisions.jsonl` must go through `lib/gate-decision-writer.cjs::appendGateDecision` — direct `fs.appendFile` is flagged `REJECTED` by the diff-discipline reviewer.

---

## License

**PolyForm Shield License 1.0.0** © FX Studio AI. See [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md).

- ✅ Free for internal use, modification, redistribution, education, and personal use.
- ✅ Free to fork, study, and integrate into your own projects — commercial or not — as long as the result is not a competing product.
- ❌ Not permitted: repackaging or reselling Pipeline Orchestrator as a substitute for the original.

**Trademarks:** "Pipeline Orchestrator" and "FX Studio AI" are trademarks of FX Studio AI. Forks must use a different name.

---

<div align="center">
  <p><strong>Pipeline Orchestrator v8.9.0</strong> · 2026-06-20</p>
  <p>Built by <a href="https://github.com/fernandoxavier02">FX Studio AI</a> · <a href="https://github.com/fernandoxavier02/Pipeline-Orchestrator">Source</a> · <a href="https://github.com/sponsors/fernandoxavier02">Sponsor</a></p>
  <p>
    <a href="https://claude.com/claude-code">Claude Code</a> ·
    <a href="https://cursor.com">Cursor</a> ·
    <a href="https://github.com/sst/opencode">OpenCode</a> ·
    Observability by <a href="https://langfuse.com">Langfuse</a> ·
    Autonomous runtime on <a href="https://paperclip.ing">Paperclip</a>
  </p>
  <p><em>"AI follows a contract, not its mood — and now you can watch it do so in real time."</em></p>
</div>
