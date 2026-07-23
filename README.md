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
  <a href="https://github.com/fernandoxavier02/Pipeline-Orchestrator/releases"><img src="https://img.shields.io/badge/version-8.28.0-7C3AED?style=flat-square&logo=git&logoColor=white" alt="Version"/></a>
  <img src="https://img.shields.io/badge/agents-50-0EA5E9?style=flat-square" alt="Agents"/>
  <img src="https://img.shields.io/badge/gates-49-22C55E?style=flat-square" alt="Gates"/>
  <img src="https://img.shields.io/badge/platform-Claude_Code_+Cursor_+OpenCode-000?style=flat-square" alt="Platform"/>
  <img src="https://img.shields.io/badge/license-PolyForm_Shield_1.0.0-EC4899?style=flat-square" alt="License"/>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> ·
  <a href="#the-solution">Solution</a> ·
  <a href="#quick-start">Install</a> ·
  <a href="#pipeline-workflows">Workflows</a> ·
  <a href="#under-the-hood">Under the hood</a> ·
  <a href="#documentation">Docs</a>
</p>

---

> **Heads-up:** this repository is both the Pipeline Orchestrator plugin **and** the **FX-Studio-AI** marketplace that hosts several plugins. Install the marketplace once to get them all — see [`docs/INSTALL.md`](docs/INSTALL.md).

---

## The Problem

Plenty of tools help you decide *what* to build — Jira, Linear, Notion, Kiro, ADRs. They handle the *plan*. But when an AI agent turns that plan into production code, the industry relies on human discipline. **Discipline degrades under pressure, time constraints, and long-running sessions.**

<div align="center">
  <img src="assets/diagrams/problem-degradation.svg" alt="The long-session drift curve" width="100%"/>
</div>

Long AI coding sessions drift on a predictable curve: the first few batches are clean, then scope creeps in, then dependencies appear unannounced and weakened assertions replace fixed bugs — until the code passes CI but no longer solves the problem you asked it to solve. Traditional CI catches syntax errors and regressions. It does **not** catch architectural drift, scope creep in batch 7, or an unauthorized dependency added three batches ago.

**Pipeline Orchestrator closes the gap between *"we have a spec"* and *"we shipped it safely."*** It does not replace your planning tools. It governs the execution.

## The Solution

Five independent anchors hold long sessions on contract. Failures in one do not propagate — together they form a defense in depth.

<div align="center">
  <img src="assets/diagrams/governance-flow.svg" alt="Five governance anchors" width="100%"/>
</div>

1. **CHANGE_CONTRACT** — every plan declares which files may be touched, which are forbidden, and which change categories need explicit approval. A diff budget escalates anything over the ceiling.
2. **SCOPE LOCK CHECK** — a runtime hook enforces that contract before every write. Out-of-scope target, forbidden change type, or exhausted budget → **denied**, even when the LLM tries to be clever.
3. **Adversarial independence** — every batch is attacked by three parallel reviewers (security, architecture, scope discipline) that never saw what the implementer *intended* — only the result. This is what kills confirmation bias.
4. **Gate hierarchy** — **49 checkpoints** across five hardness levels, many of them deterministic `DENY` hooks. The agent physically cannot advance past a red build, an unresolved info gap, or a `NO-GO`.
5. **Glass-box audit trail** — every run emits an HMAC-signed decision log, validatable with a standalone script and streamable to Langfuse. Every run ends with a number — `GO ≥ 0.80`, `CONDITIONAL ≥ 0.60`, `NO-GO < 0.60`. No gut feelings.

## Quick Start

```bash
# Once: register the FX-Studio-AI marketplace
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator

# Then: install the plugin
/plugin install pipeline-orchestrator@FX-studio-AI
```

Verify it is live (classifies without writing any code):

```
/pipeline-orchestrator:pipeline --diagnostic "add a hello-world endpoint"
```

NPM channel (restricted scope), updates, and observability setup: [`docs/INSTALL.md`](docs/INSTALL.md).

## Pipeline Workflows

One orchestrator, many workflows. The classifier reads your request, detects **type**, **complexity**, and **variant**, then routes to the right pipeline — a typo fix does not get the same ceremony as a payment-system rewrite.

| Workflow | What it does | When it fires |
|---|---|---|
| **🐛 Bug Fix** | Terrain recon → ranked hypotheses → confirmed root cause → targeted fix → regression tests. | "fix", "debug", "broken", "production issue" |
| **✨ Feature** | Vertical slices, each implemented with per-slice TDD and cross-layer integration checks. | New capability, UI feature, full-stack addition |
| **🔍 Audit** | **Read-only.** Technology intake → domain analysis → compliance check → risk-matrix report. | "audit", "review this codebase" |
| **♿ UX Simulation** | **Read-only.** Persona journeys + WCAG 2.1 AA accessibility audit + friction catalog. | UX review, before a redesign |
| **📐 Spec Authoring** | Authors a brand-new specification end-to-end, adversarially reviews the *documents*, seals it as a contract, and stops before implementing. | Greenfield feature, design-first work |
| **👤 User Story** | Acceptance-criteria-driven, 10 steps. Lighter than Feature, stricter than a todo. | Well-scoped story with clear ACs |
| **🔧 Refactor** | Scope-locked internal rewrite — you cannot "refactor" into a feature by accident. | "refactor", "clean up" |
| **🎛 Pipeline (generic)** | The classifier + router itself. `/pipeline [task]` auto-detects and dispatches. | Anything ambiguous; the safe default |

Mode flags (`--hotfix`, `--diagnostic`, `--review-only`, `--light`/`--heavy`, …) and the four-phase flow are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Under the Hood

**50 agent definition files · 49 gates · 38 enforcement hooks · 34 skills · 15 commands · 311 test files.** The deep dives live in `docs/`:

- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — the four phases (triage → plan → TDD batches → closure), the agent roster, depth-by-complexity.
- **[`docs/ENFORCEMENT.md`](docs/ENFORCEMENT.md)** — the hook layer: scope lock, arming chain, anti-fabrication guard, gate hardness taxonomy, HMAC-signed audit trail.
- **[`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)** — opt-in Langfuse tracing: one run = one trace, per-agent spans, offline-first.
- **[`docs/PAPERCLIP-INTEGRATION.md`](docs/PAPERCLIP-INTEGRATION.md)** — running the same governance layer inside [Paperclip](https://paperclip.ing) autonomous agents, including the flow-mirror that turns a pipeline into a dependency-linked issue tree.

## Recent Releases

- **v8.28** — workflow-audit remediation slices (Achado #7 protocol SSOT, review consolidation, user-gate signature at the source) + this README/docs overhaul.
- **v8.27** — agent-registry SSOT + doc-parity locks (docs cannot drift from code) + HMAC-signed user-gate events.
- **v8.24** — next-action contract: a governed deny always names one reachable next action; new `/unblock` diagnostic skill.
- **v8.20–v8.23** — enforcement unblocking pack: anti-deadlock fixes across the hook layer + audit-trail anti-fabrication gate.
- **v8.0–v8.9** — spec-authoring takeover, universal plan-mode + adversarial review, deterministic enforcement (arming chain, step ledger, fix-loop caps).

Full history: [`CHANGELOG.md`](CHANGELOG.md).

## Documentation

- [`docs/INSTALL.md`](docs/INSTALL.md) — all install channels + verification.
- [`docs/diagrams/`](docs/diagrams/) — standalone interactive HTML diagrams.
- [`docs/audits/`](docs/audits/) — archived deep audits of the plugin itself.
- [`references/`](references/) — source-of-truth references: `gates.md`, `audit-trail.md`, `complexity-matrix.md`, `implementation-discipline.md`, `team-registry.md`.

## Contributing

Contributions welcome — this is an active project with a strong audit culture.

1. Read the [audit reports](docs/audits/) to understand the architectural decisions.
2. Every code change must pass the regression suite (`npm test`).
3. New subagents must declare the **Achado #7 runtime protocol** section.
4. New gates go into `references/gates.md` **and** the `commands/pipeline.md` Inline Invariants **and** a runtime test.
5. New writes to `gate-decisions.jsonl` must go through `lib/gate-decision-writer.cjs::appendGateDecision`.

## License

**PolyForm Shield License 1.0.0** © FX Studio AI. See [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md).

- ✅ Free for internal use, modification, redistribution, education, and personal use.
- ✅ Free to fork, study, and integrate into your own projects — commercial or not — as long as the result is not a competing product.
- ❌ Not permitted: repackaging or reselling Pipeline Orchestrator as a substitute for the original.

**Trademarks:** "Pipeline Orchestrator" and "FX Studio AI" are trademarks of FX Studio AI. Forks must use a different name.

---

<div align="center">
  <p><strong>Pipeline Orchestrator v8.28.0</strong> · 2026-07-23</p>
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
