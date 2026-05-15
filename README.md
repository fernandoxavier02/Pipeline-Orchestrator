<div align="center">

  <a href="https://fxstudioai.com">
    <img src="assets/logos/fx-studio-ai-logo.png" alt="FX Studio AI" width="420"/>
  </a>

# Pipeline Orchestrator

**End-to-end execution governance for Claude Code.**
TDD, adversarial review, gated phases, glass-box audit trail.

  <p>
    <img src="https://img.shields.io/badge/version-6.0.0-7C3AED?style=for-the-badge&logo=git&logoColor=white" alt="Version" />
    <img src="https://img.shields.io/badge/agents-26-0EA5E9?style=for-the-badge" alt="Agents" />
    <img src="https://img.shields.io/badge/gates-22%2F22-22C55E?style=for-the-badge" alt="Gates" />
    <img src="https://img.shields.io/badge/audit_coverage-95%25-F59E0B?style=for-the-badge" alt="Coverage" />
    <img src="https://img.shields.io/badge/regression_tests-39-EF4444?style=for-the-badge" alt="Tests" />
    <img src="https://img.shields.io/badge/platform-Claude_Code-000?style=for-the-badge" alt="Platform" />
    <img src="https://img.shields.io/badge/license-MIT-65a30d?style=for-the-badge" alt="License" />
  </p>

  <p>
    <a href="docs/diagrams/index.html"><strong>📊 Visual Documentation</strong></a> ·
    <a href="#install">Install</a> ·
    <a href="#how-it-works">How It Works</a> ·
    <a href="#whats-new-in-v600">What's New</a> ·
    <a href="docs/audits/2026-05-15-ifrs16-deep-audit/INDEX.md">Audit Reports</a>
  </p>

</div>

---

## Visual documentation

Open these HTML files directly in any browser — they are fully self-contained with a professional design system.

| Diagram | What it shows |
|---------|----------------|
| **[📊 docs/diagrams/index.html](docs/diagrams/index.html)** | Visual documentation index — start here |
| **[🔁 Pipeline Overview](docs/diagrams/pipeline-overview.html)** | The four phases (0 → 1 → 1.5 → 2 → 3), complexity routing, six execution modes |
| **[🔌 Achado #7 Protocol](docs/diagrams/achado-7-protocol.html)** | How subagents emit GATE_REQUEST / DISPATCH_REQUEST / PLAN_MODE_REQUEST blocks when their runtime is stripped |
| **[🛡 22-Gate Hierarchy](docs/diagrams/gate-hierarchy.html)** | All 22 gates by hardness — MANDATORY / HARD / CIRCUIT_BREAKER / SOFT |
| **[📋 Audit History](docs/diagrams/audit-history.html)** | The v5.2 → v6.0 audit: 4 phases (B/D/H/I), 12/12 CRITICAL findings, 8 commits, 39 tests |

---

## The problem we solve

Today there is an abundance of tools to structure, plan, and specify software projects — Jira, Linear, Notion, Confluence, ADRs, specification templates. They help teams decide *what* to build and *why*. But when it comes to **execution** — translating those plans into production code safely — the industry relies on human discipline. Discipline degrades under pressure, time constraints, and long sessions.

Pipeline Orchestrator is an **end-to-end execution governance layer** that sits between your plan and your production code. It does not replace your planning tools. It closes the gap between *"we have a spec"* and *"we shipped it safely"*.

### Why long coding sessions degrade

- **Context accumulation** — the implementer holds too much state, misses contradictions
- **Confirmation bias** — the same mind that wrote the code reviews it, approving its own blind spots
- **Drifting requirements** — after hour three, the code no longer matches the original intent
- **Missing edge cases** — race conditions, auth bypasses, SSOT conflicts slip through because no one *attacked* the code

Traditional CI/CD catches syntax errors and regressions. It does not catch architectural drift, security holes introduced in batch 7, or the fact that your implementation no longer matches the acceptance criteria you wrote in batch 1.

### How Pipeline Orchestrator fixes it

| Feature | What it does |
|---------|---------------|
| **22-gate registry** | Mandatory checkpoints at every phase transition. 3 MANDATORY (never bypass), 11 HARD (block until resolved), 3 CIRCUIT_BREAKER (N strikes & halt), 5 SOFT (ask & log). [See gate hierarchy →](docs/diagrams/gate-hierarchy.html) |
| **Adversarial independence** | Three independent reviewers (security, architecture, quality) run **in parallel** with zero shared context. The reviewer never read the implementer's reasoning, eliminating confirmation bias. |
| **TDD by default** | Tests are written BEFORE implementation (RED), approved by you in plain language, validated after every batch. Not optional. |
| **Proportional rigor** | SIMPLES (1-2 files) gets a light pipeline. COMPLEXA (6+ files, sensitive domain) gets the full team. Zero configuration. |
| **TRACE.md audit trail** | Every run emits a glass-box audit document to `.pipeline-orchestrator/runs/<id>/TRACE.md`. Attach to a PR. Validate with `scripts/validate-trace.cjs`. |
| **Confidence scoring** | Objective signal across all phases. GO ≥ 0.80, CONDITIONAL ≥ 0.60, NO-GO < 0.60. No gut feelings — a number. |

---

## Install

```bash
# In Claude Code
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator
/plugin install pipeline-orchestrator
```

After install you get six top-level commands:

| Command | Mode |
|---------|------|
| `/pipeline-orchestrator:pipeline [task]` | FULL — all four phases through Pa de Cal |
| `/pipeline-orchestrator:pipeline diagnostic [task]` | DIAGNOSTIC — classify only, no execution |
| `/pipeline-orchestrator:pipeline continue` | CONTINUE — resume a paused pipeline |
| `/pipeline-orchestrator:pipeline review-only` | REVIEW-ONLY — adversarial team on dirty tree |
| `/pipeline-orchestrator:pipeline --hotfix [task]` | HOTFIX — emergency bypass, reduced scope |
| `/pipeline-orchestrator:brainstorm [task]` | BRAINSTORM — 9-step spec lifecycle pre-execution |

Plus flags for fine control: `--grill`, `--plan`, `--no-plan`, `--force-level=SIMPLES|MEDIA|COMPLEXA`, `--light`, `--heavy`. [Full command reference →](docs/diagrams/pipeline-overview.html#execution-modes)

---

## How it works

```
                              /pipeline [task]
                                     │
                ┌────────────────────┴────────────────────┐
                ▼                                          ▼
         ┌─────────────┐                            ┌─────────────┐
         │  PHASE  0   │  Automatic Triage          │   Phase 0   │
         │             │  task-orchestrator         │             │
         │   Triage    │  → information-gate        │             │
         │             │  → design-interrogator?    │             │
         └──────┬──────┘                            └─────────────┘
                │  ORCHESTRATOR_DECISION
                ▼
         ┌─────────────┐
         │  PHASE  1   │  Proposal + Confirmation
         │  Proposal   │  AskUserQuestion (Yes/Adjust/No)
         └──────┬──────┘
                │  user confirms
                ▼
         ┌─────────────┐
         │ PHASE 1.5   │  Planning (MEDIA/COMPLEXA/Spec)
         │  Planning   │  plan-architect in Plan Mode
         └──────┬──────┘
                │  IMPLEMENTATION_PLAN approved
                ▼
         ┌─────────────────────────────────────────┐
         │              PHASE  2                    │
         │       Batched Execution + TDD            │
         │                                          │
         │   ┌────────────────────────────────┐    │
         │   │  per task:                      │    │
         │   │  micro-gate → implementer →     │    │
         │   │  spec-review → quality-review → │    │
         │   │  checkpoint-validator           │    │
         │   └────────────────────────────────┘    │
         │   ┌────────────────────────────────┐    │
         │   │  per batch:                     │    │
         │   │  ADVERSARIAL_GATE →              │    │
         │   │    security ‖ architecture ‖    │    │
         │   │    quality (parallel)            │    │
         │   │  fix loop (max 3)                │    │
         │   └────────────────────────────────┘    │
         └────────────────────┬────────────────────┘
                              │  batches complete
                              ▼
         ┌─────────────────────────────────────────┐
         │              PHASE  3                    │
         │              Closure                     │
         │                                          │
         │  sanity-checker → FINAL_ADVERSARIAL →    │
         │  final-validator (GO/COND/NO-GO) →       │
         │  finishing-branch (CLOSEOUT_CONFIRM)     │
         └─────────────────────────────────────────┘
                              │
                              ▼
                         TRACE.md
                       PIPELINE COMPLETE
```

For an interactive version with the full diagram and per-phase breakdown, see **[docs/diagrams/pipeline-overview.html](docs/diagrams/pipeline-overview.html)**.

---

## What's new in v6.0.0

Version 6.0.0 is a **major release** following a comprehensive external audit of v5.2.0 over the IFRS 16 reference project. Four hardening waves resolved **all 12 CRITICAL findings**, exercised **22 of 22 registry gates in runtime**, and shipped three new security mitigation libraries.

### Highlights

| What | Before (v5.2.0) | After (v6.0.0) |
|------|------------------|------------------|
| Subagents with explicit Achado #7 protocol | 2 of 19 | **16 of 19** |
| Gates exercised in runtime | 5 of 22 | **22 of 22** |
| Hook test suites green | 6 of 7 | **7 of 7** |
| Regression tests | 13 | **39** (+200%) |
| Audit coverage | 30% | **95%** |
| CRITICAL findings open | 4 acknowledged | **0** |

### New security libraries (Fase I)

Three drop-in libraries that mitigate audit findings. Stand-alone, with full unit test coverage:

- **`lib/sentinel-state-signer.cjs`** — HMAC-SHA256 signature for `sentinel-state.json`. Mitigates H1-002 (sentinel-hook fail-open admitted). [Read details →](docs/audits/2026-05-15-ifrs16-deep-audit/FASE_I_FINAL.md#i4--hmac-signature-do-sentinel-state)
- **`lib/jsonl-sanitizer.cjs`** — Safe append API for `gate-decisions.jsonl` and `protocol-events.jsonl`. Mitigates B1-005 / H6-001 (JSONL injection demonstrated breaking parse).
- **`lib/pipeline-local-parser.cjs`** — Strict parser for `.claude/pipeline.local.md`. Mitigates H6-002 (RCE potential via shell metacharacters in `build_command`).

### Subagent protocol hardening

16 subagents now declare the **ACHADO #7 RUNTIME PROTOCOL** section explicitly in their `.md` spec. When the Claude Code harness strips `AskUserQuestion` / `Agent` / `EnterPlanMode` from a subagent's runtime, the agent emits a structured YAML block instead. The parent parses and dispatches. [See protocol diagram →](docs/diagrams/achado-7-protocol.html)

The 16 fixed: `information-gate`, `plan-architect`, `design-interrogator`, `pre-tester`, `executor-fix`, `executor-implementer-task`, `spec-closer`, `feature-implementer`, `bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`, `ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`, `architecture-reviewer`, `sanity-checker`, `checkpoint-validator`.

### STALE_THRESHOLD nomenclature canonical (I7)

The plugin had three different "stale" values (5min / 10min / 24h) with ambiguous naming. All three are correct for **distinct concepts**, but the naming was confusing. v6.0.0 ships a canonical SSOT (`references/stale-thresholds.md`) and renamed constants:

- `STALE_SPAWN_THRESHOLD_MS` (5min) — controller forgot to update state between dispatches
- `STALE_HEARTBEAT_THRESHOLD_MS` (10min) — lock owner is dead
- `STALE_CONTEXT` (24h) — `/pipeline continue` on old context

Old constant names (`STALE_THRESHOLD_MS`, `STALE_HEARTBEAT_MS`) preserved as deprecated aliases through v6.0.x; removal scheduled for v6.1.0.

### Breaking changes

1. **Subagent output format** — Subagents that previously emitted prose questions now emit structured YAML blocks. External tools parsing tool results must look for `=== GATE_REQUEST v1 ===` / `=== PLAN_MODE_REQUEST v1 ===` / `=== DISPATCH_REQUEST v1 ===` blocks.
2. **Constant rename** — see I7 above. Migration: switch to canonical names.
3. **Worked-example schema** — 16 subagents now use `multi_select` (snake_case) and `recommended: true` field. Programmatic consumers must update.

No behavioral change for users invoking `/pipeline-orchestrator:pipeline` or `/pipeline-orchestrator:brainstorm` — the plugin behaves as before; v6.0.0 hardens the runtime contract.

[Full CHANGELOG →](CHANGELOG.md)

---

## Architecture

| Layer | Component |
|-------|-----------|
| **Commands** | `/pipeline`, `/brainstorm` — entry points |
| **Controllers (N1)** | `pipeline-controller`, `brainstorm-controller`, `executor-controller` |
| **Core agents** | `task-orchestrator`, `information-gate`, `sentinel`, `final-validator`, `finishing-branch`, `sanity-checker`, `checkpoint-validator`, `adversarial-batch` |
| **Quality agents** | `plan-architect`, `design-interrogator`, `pre-tester`, `quality-gate-router`, `review-orchestrator`, `architecture-reviewer`, `final-adversarial-orchestrator` |
| **Executor (type-specific)** | `feature-*`, `bugfix-*`, `audit-*`, `ux-*`, `spec-*`, `adversarial-*` |
| **Brainstorm step agents** | `step-00-intake`, `step-01-explore` |
| **Hooks** | `sentinel-hook`, `dispatch-guard`, `edit-guard-hook`, `force-pipeline-agents`, `session-lock-hook`, `session-cleanup-hook`, `completion-checklist`, `skill-frontmatter-parser` |
| **Security libs** (v6.0.0+) | `sentinel-state-signer`, `jsonl-sanitizer`, `pipeline-local-parser` |
| **References (SSOT)** | `gates.md`, `gate-request-protocol.md`, `audit-trail.md`, `confidence.md`, `complexity-matrix.md`, `stale-thresholds.md`, `glossary.md` |

---

## Audit reports

The v6.0.0 release ships with 9 archived audit reports under `docs/audits/2026-05-15-ifrs16-deep-audit/`:

- **`INDEX.md`** — reading order + summary
- **`_canonical_contract.md`** — audit ground truth
- **`_decision_table.md`** — unified gate response policy
- **`FINAL_CONSOLIDATED_REPORT.md`** — Phase B+D matrix (7×N gates, 7×45 dispatch)
- **`PANEL_FINAL.md`** — 3-persona panel consolidation (Anthropic Senior Auditor + Claude Code Engineer + Redteam)
- **`FASE_H_FINDINGS.md`**, **`FASE_H_ADDENDUM.md`**, **`FASE_H_FINAL.md`** — second-pass deep audit
- **`FASE_I_FINAL.md`** — residual coverage + security libraries
- **`COMPARISON_v5.2_vs_v5.3.md`** — pre/post comparison with runtime evidence

The audit was performed against the **IFRS 16 lease accounting** reference project (Python/FastAPI + TypeScript/React) using seven git worktrees and a 3-persona adversarial panel. See **[Audit History diagram →](docs/diagrams/audit-history.html)** for the visual timeline.

---

## Tests

Regression suite under `tests/regression/v6.0.0/`:

```
D2_test_subagent_protocol.cjs      16 tests · Achado #7 protocol in 16 subagents
D2_subagent_protocol_compliance.feature    Gherkin BDD
D9_test_orphan_cleanup_spec.cjs     1 test · ORPHAN_CLEANUP mode in sentinel.md
I4_I5_I6_lib_test.cjs              14 tests · HMAC signer + JSONL sanitizer + parser
I7_stale_thresholds_consistency.cjs 8 tests · SSOT + canonical names + cross-refs
eval_C4_diagnostic.feature         Gherkin BDD for DIAGNOSTIC mode
```

Run the full suite:

```bash
node tests/regression/v6.0.0/D2_test_subagent_protocol.cjs
node tests/regression/v6.0.0/D9_test_orphan_cleanup_spec.cjs
node tests/regression/v6.0.0/I4_I5_I6_lib_test.cjs
node tests/regression/v6.0.0/I7_stale_thresholds_consistency.cjs
for t in .claude/hooks/__tests__/*.test.cjs; do node "$t"; done
```

Total: **39 regression tests** + **7 hook test suites** all PASS.

---

## FX Studio AI suite

This repository is both the Pipeline Orchestrator plugin **and** the FX-Studio-AI marketplace hosting five plugins. Install the marketplace once to access them all:

- **pipeline-orchestrator** (this plugin) — execution governance
- **skill-advisor** — intelligent toolchain orchestrator
- *more in the marketplace*

```bash
/plugin marketplace add fernandoxavier02/Pipeline-Orchestrator
/plugin list
```

---

## Contributing

Contributions welcome. This is an active project with a strong audit culture.

1. Read the **[audit reports](docs/audits/2026-05-15-ifrs16-deep-audit/INDEX.md)** to understand the architectural decisions
2. Pick an issue from the **[backlog](notes/v5.3.0-audit-backlog.md)** or open a new one
3. Every code change must pass the regression suite
4. New subagents must declare the **[ACHADO #7 RUNTIME PROTOCOL](docs/diagrams/achado-7-protocol.html)** section
5. New gates must be added to `references/gates.md` registry AND `commands/pipeline.md` Inline Invariants AND covered by a runtime test

---

## License

MIT © FX Studio AI

---

<div align="center">

  <p><strong>Pipeline Orchestrator v6.0.0</strong> · 2026-05-15</p>
  <p>Built by <a href="https://github.com/fernandoxavier02">FX Studio AI</a> · <a href="https://github.com/fernandoxavier02/Pipeline-Orchestrator">Source on GitHub</a></p>

</div>
