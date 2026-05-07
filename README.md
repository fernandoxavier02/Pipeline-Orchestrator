<div align="center">
  <a href="https://fxstudioai.com">
    <img src="assets/logos/fx-studio-ai-logo.png" alt="FX Studio AI" width="420"/>
  </a>
</div>

<div align="center">
  <img src="assets/diagrams/hero-banner.svg" alt="Pipeline Orchestrator v5.0.0" width="100%"/>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/version-5.0.0-7C3AED?style=for-the-badge&logo=git&logoColor=white" alt="Version" />
  <img src="https://img.shields.io/badge/agents-19-0EA5E9?style=for-the-badge" alt="Agents" />
  <img src="https://img.shields.io/badge/pipelines-12-22C55E?style=for-the-badge" alt="Pipelines" />
  <img src="https://img.shields.io/badge/tests-166%2F0-F59E0B?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/platform-Claude_Code-000?style=for-the-badge" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-65a30d?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="#whats-new">What's New</a> &bull;
  <a href="#quickstart">Quickstart</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#pipeline-types">Pipelines</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#gate-system">Gates</a>
</p>

---

> **Note:** This repository is both the Pipeline Orchestrator plugin **and** the **FX-Studio-AI** marketplace hosting five plugins. Install the marketplace once to access them all. See <a href="#fx-studio-ai-suite">the suite section</a> at the bottom.

---

## The Problem We Solve

Today there is an abundance of tools to structure, plan, and specify software projects — Jira, Linear, Notion, Confluence, architecture decision records, and specification templates. They help teams decide *what* to build and *why*. But when it comes to the actual execution — translating those plans into production code safely — the industry relies on human discipline. And discipline degrades under pressure, time constraints, and long-running sessions.

Pipeline Orchestrator is an **end-to-end execution governance layer** that sits between your plan and your production code. It does not replace your planning tools. It closes the gap between "we have a spec" and "we shipped it safely."

### Why Execution Breaks Down

Long-running coding sessions suffer from a predictable degradation pattern:

- **Context accumulation** — the implementer holds too much state, misses contradictions
- **Confirmation bias** — the same mind that wrote the code reviews it, approving its own blind spots
- **Drifting requirements** — after hour three, the code no longer matches the original intent
- **Missing edge cases** — race conditions, auth bypasses, and SSOT conflicts slip through because no one attacked the code

Traditional CI/CD catches syntax errors and regressions. It does not catch architectural drift, security holes introduced in batch 7, or the fact that your implementation no longer matches the acceptance criteria you wrote in batch 1.

### How Pipeline Orchestrator Fixes It

**Periodic Workflow Reviews (Gates)** — The pipeline inserts mandatory checkpoints at every phase transition. Not ceremonial checkboxes: MANDATORY gates that cannot be skipped even with `--hotfix`, HARD gates that block until resolved, CIRCUIT BREAKER gates that halt the pipeline after 2 consecutive failures, and SOFT gates that log every skip and penalize your confidence score. The workflow is reviewed *while it runs*, not after it finishes.

**Adversarial Independence** — Every batch of code is reviewed by agents that receive **zero implementation context**. They do not know what you intended. They see only the result. They attack from security, architecture, and quality angles — simultaneously, in parallel — the way a real attacker or a hostile senior engineer would. This eliminates confirmation bias because the reviewer never shared the author's assumptions.

**Context Isolation** — The implementer's reasoning is never shared with reviewers. The final adversarial team is spawned in a single message with three parallel Agent calls, ensuring no sequential contamination. Each reviewer loads only relevant security checklists from `references/checklists/` and evaluates the code blind.

**Confidence Scoring** — The pipeline accumulates an objective quality signal across all phases: classification clarity, information completeness, design alignment, plan coverage, TDD coverage, and implementation quality. Skipped SOFT gates apply a penalty. The final score drives a Go/No-Go decision:

```
GO:          >= 0.80
CONDITIONAL: >= 0.60
NO-GO:       <  0.60
```

No gut feelings. No "it looks fine to me." A number.

**TRACE.md — Glass Box Audit Trail** — Every pipeline run emits a complete audit trail to `.pipeline-orchestrator/runs/<id>/TRACE.md`. Classification, pipeline definition, execution log, final verdict with confidence score and gate penalties. Attach it to your PR. Validate it with a standalone script. Auditable, reproducible, accountable.

**TDD by Default** — Tests are written BEFORE implementation (RED phase), approved by you, and validated after every batch. Not optional. Not an afterthought. If the pipeline touches code, it must prove the code works before claiming it works.

**Proportional Rigor** — A one-line typo fix does not get the same ceremony as a payment system rewrite. The pipeline automatically scales its depth by complexity: SIMPLES (light), MEDIA (moderate), or COMPLEXA (full adversarial team, 5 sentinel checkpoints, deep review). Zero configuration needed.

---

## What's New in v5.0

Version 5.0 is the first major release of Pipeline Orchestrator. Three years of iteration converged into this architecture:

| Feature | What Changed |
|---------|-----------|
| **TRACE.md** | Every pipeline emits a complete audit trail to `.pipeline-orchestrator/runs/<id>/TRACE.md` — attachable to PRs via standalone validator |
| **Auto Plan Mode** | MEDIA and COMPLEXA tasks trigger automatic planning without requiring the `--plan` flag |
| **Spec Pipeline** | Full specification lifecycle: Format Gate &rarr; Content Review &rarr; ATDD &rarr; Post-Impl Validation &rarr; Closure |
| **Suite 166/0/1** | 166 tests passing, 0 failing, 1 skipped — zero regressions since v4.16.0 baseline |

For migration from earlier versions, see <a href="docs/MIGRATION-v4-to-v5.md">MIGRATION-v4-to-v5</a>.

---

## What's New in v5.1

Version 5.1 makes spec-first development the default. The plugin now ships with its own spec lifecycle — no external Kiro install required — and `/pipeline` will not run a non-trivial task until a spec exists.

| Feature | What Changed |
|---------|-----------|
| **`/brainstorm` command** | New mandatory front-end. Runs init &rarr; requirements &rarr; design &rarr; tasks &rarr; validate-design &rarr; validate-gap &rarr; handoff inside a fresh per-run directory, then either chains into `/pipeline` or saves the run for later |
| **Per-run directory** | `pipeline-runs/<NNN>-<slug>/` replaces the loose `.kiro/specs/<feature>/` layout. Five fixed subfolders (`00-brainstorm`, `01-spec`, `02-validations`, `03-execution`, `attachments`) plus `manifest.yaml` give every run a complete audit trail in one place |
| **Self-contained spec skills** | 8 spec-lifecycle skills (`spec-init`, `spec-requirements`, `spec-design`, `spec-tasks`, `validate-design`, `validate-gap`, `review`, `verify-completion`) cloned into `skills/`. The plugin no longer depends on the user's Kiro install |
| **STEP 1.7 routing** | `/pipeline` now decides up-front whether to load an existing run-dir, dispatch `/brainstorm`, honor `--no-prep`, or bypass for SIMPLES tasks. Logged via gate `STEP_1_7_ROUTING`; a circuit breaker prevents recursion |
| **Pa de Cal pre-validation** | `verify-completion` runs before `final-validator`. If it returns FAIL, the new `STOP_BEFORE_PA_DE_CAL` gate halts the pipeline and writes a NO-GO `04-final-report.md` instead of letting Pa de Cal sign off on a broken state |
| **Per-task review skill** | The cloned `review` skill is now plugged into the executor's per-batch adversarial step, replacing the ad-hoc inline review prompt |

For users coming from v5.0 with existing `.kiro/specs/<feature>/` content, see <a href="docs/migration-v5.0-to-v5.1.md">migration-v5.0-to-v5.1</a>.

```bash
# v5.1 happy path
/pipeline-orchestrator:brainstorm "add OAuth login with refresh tokens"
# (lifecycle runs; user approves at gates; hands off to /pipeline)
/pipeline   # picks up the just-created run-dir automatically
```

---

## The Problem

You ship code. Tests pass. Linter is green. The PR looks clean.

**Then production breaks.**

A silent auth bypass. A race condition under load. An SSOT conflict between two services nobody noticed. The kind of bugs that code review *should* catch — but doesn't, because reviewers share the same context as the author.

**Pipeline Orchestrator solves this with adversarial independence.** Every batch of work is reviewed by agents that have *zero knowledge* of how the code was written. They see only the result. They attack from security, architecture, and quality angles — simultaneously, in parallel, with no shared context.

> *"The adversarial review on Batch 3 caught a privilege escalation path that three human reviewers missed."*

---

## Quickstart

```bash
# Add the FX Studio AI marketplace
claude plugin add-marketplace https://github.com/fernandoxavier02/FX-Studio-AI

# Install the plugin
claude plugin add pipeline-orchestrator

# Run your first pipeline
/pipeline fix the login timeout bug
```

That's it. The orchestrator classifies your task, selects the right pipeline, and executes — with TDD, adversarial review, and Go/No-Go validation.

---

## How It Works

Every task flows through 4 phases. The depth of each phase scales automatically with complexity.

<div align="center">
  <img src="assets/diagrams/pipeline-flow-animated.svg" alt="Pipeline Execution Flow" width="100%"/>
</div>

### Adaptive Complexity

The pipeline adjusts its rigor automatically. Zero configuration needed.

| Complexity | Files | Batch | Plan | Adversarial | Sentinel |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **SIMPLES** | 1-2 | All at once | Skipped | 3 checklists | 1 checkpoint |
| **MEDIA** | 3-5 | 2-3 tasks | Automatic | 5 checklists | 2 checkpoints |
| **COMPLEXA** | 6+ | 1 task | Automatic | 7 checklists + deep review | 5 checkpoints |

---

## Pipeline Types

Six specialized pipeline families — each with **light** and **heavy** variants — cover every development scenario.

> **Heavy** = full team (COMPLEXA/MEDIA). **Light** = reduced team with graceful degradation (SIMPLES).

| Pipeline | When to Use | What Happens |
|----------|-------------|---------------|
| **Bug Fix** | Production bugs, regressions | Diagnostic &rarr; Root Cause Analysis &rarr; TDD Fix &rarr; Regression Suite |
| **Feature** | New capabilities, enhancements | Vertical Slice Planning &rarr; Implementation &rarr; Integration Validation |
| **User Story** | User-facing stories | Same team as Feature, scoped by acceptance criteria |
| **Audit** | Code health, compliance | Intake &rarr; Domain Analysis &rarr; Compliance Check &rarr; Risk Matrix |
| **UX Simulation** | User experience analysis | Persona Simulation &parallel; Accessibility Audit &rarr; QA Validation |
| **Adversarial** | Security & architecture review | Security Scanner &parallel; Architecture Critic &rarr; Consolidated Report |
| **Spec** (v5.0) | Specifications and documentation | Format Gate &rarr; Content Review &rarr; ATDD &rarr; Post-Impl Validator &rarr; Closure |

---

## Architecture

### 19 Agents in 4 Layers

Pipeline Orchestrator deploys agents in four layers — each with a distinct role and **zero context leakage** between layers.

<div align="center">
  <img src="assets/diagrams/architecture-animated.svg" alt="19-Agent Architecture" width="100%"/>
</div>

### Type-Specific Teams by Pipeline

| Pipeline | Agents | Execution Flow |
|----------|--------|-------------------|
| **Bug Fix Heavy** | 4 | `diagnostic` &rarr; `root-cause` &rarr; `implementer` &rarr; `regression-tester` |
| **Bug Fix Light** | 3 | `diagnostic` &rarr; `implementer` &rarr; `regression-tester` |
| **Feature Heavy** | 3 | `slice-planner` &rarr; `implementer` &rarr; `integration-validator` |
| **Feature Light** | 2 | `slice-planner` &rarr; `implementer` |
| **Audit Heavy** | 4 | `intake` &rarr; `domain-analyzer` &rarr; `compliance-checker` &rarr; `risk-matrix` |
| **Audit Light** | 3 | `intake` &rarr; `compliance-checker` &rarr; `risk-matrix` |
| **UX Heavy** | 3 | `simulator` &parallel; `a11y-auditor` &rarr; `qa-validator` |
| **UX Light** | 2 | `simulator` &rarr; `qa-validator` |
| **Adversarial Heavy** | 3 | `coordinator` &rarr; `security-scanner` &parallel; `architecture-critic` |
| **Adversarial Light** | 2 | `coordinator` &rarr; `security-scanner` |
| **Spec Heavy** | 4 | `format-gate` &rarr; `content-reviewer` &rarr; `post-impl-validator` &rarr; `spec-closer` |
| **Spec Light** | 3 | `format-gate` &rarr; `content-reviewer` &rarr; `spec-closer` |

> **&parallel;** = parallel execution with zero shared context

---

## Gate System

### Defense in Depth

Every layer of the pipeline has independent safety mechanisms. No single point of failure.

<div align="center">
  <img src="assets/diagrams/gate-system-animated.svg" alt="Defense-in-Depth Gate System" width="100%"/>
</div>

| Gate Type | Can Skip? | User Override? | Example |
|-----------|:---------:|:--------------:|---------|
| **MANDATORY** | Never | No | SSOT conflict, auth/crypto domain review |
| **HARD** | No | Resolution only | Missing info, test approval, build failure |
| **CIRCUIT BREAKER** | No | Reset only | 2 consecutive failures, 3 fix attempts exhausted |
| **SOFT** | Yes (logged) | Yes | Adversarial review, final review |

### Sentinel — Pipeline Guardian

The Sentinel agent validates every phase transition and every agent spawn. It operates independently of the execution flow and cannot be bypassed.

- **5 mandatory checkpoints** across the pipeline lifecycle
- **PreToolUse hook** validates every `Agent` spawn against expected sequence
- **Coherence validation** at every phase boundary
- **Auto-correction** for minor deviations, hard block for anomalies

### Confidence Scoring

The pipeline accumulates a confidence score across all phases — an objective quality signal that feeds into the final Go/No-Go decision.

```
Confidence = avg(
  classification_clarity,    # Phase 0 — was the task type clear?
  info_completeness,         # Phase 0 — were all gaps resolved?
  design_alignment,          # Phase 0 — design decisions settled?
  plan_coverage,             # Phase 1.5 — does the plan cover everything?
  tdd_coverage,              # Phase 2 — are tests adequate?
  implementation_quality     # Phase 2 — code review quality?
) + gate_penalty             # Accumulated from skipped SOFT gates

GO:          >= 0.80
CONDITIONAL: >= 0.60
NO-GO:       <  0.60
```

---

## TRACE.md — Audit Trail

Every pipeline run emits an auditable TRACE.md file:

| Section | Content |
|---------|----------|
| **1. Classification** | task_type, complexity, confidence, pipeline_variant, flags |
| **2. Pipeline Definition** | phase_sequence, gates_expected, agents_planned, checkpoints |
| **3. Execution Log** | batches_executed, agents_invoked, gates_triggered, findings_count, fix_attempts |
| **4. Final Verdict** | verdict, confidence_score, gate_penalty, skipped_gates, trace_schema_version: 1 |

- Default path: `.pipeline-orchestrator/runs/<run-id>/TRACE.md`
- Standalone validator: `scripts/validate-trace.cjs` (pure Node.js, exit 0/1)
- Schema version: 1 (canonical field order guaranteed)

---

## Commands

| Command | Description |
|---------|-----------|
| `/pipeline [task]` | Full pipeline — triage, plan, execute, close |
| `/pipeline --hotfix [task]` | Emergency mode — reduced ceremony, production focus |
| `/pipeline --plan [task]` | Force implementation planning for any complexity |
| `/pipeline --grill [task]` | Force design interrogation for any complexity |
| `/pipeline --no-plan [task]` | Skip plan on MEDIA (logged); COMPLEXA ignores |
| `/pipeline review-only` | Adversarial review of current changes (no execution) |
| `/pipeline diagnostic [task]` | Classification + proposal only (dry run) |
| `/pipeline continue` | Resume an interrupted pipeline session |
| `/bugfix [task]` | Direct shortcut to bug fix pipeline |
| `/feature [task]` | Direct shortcut to feature pipeline |
| `/audit [task]` | Direct shortcut to audit pipeline |
| `/spec [task]` | Direct shortcut to spec pipeline (v5.0) |

### Complexity Overrides

| Flag | Effect |
|------|--------|
| `--simples` | Force SIMPLES — all tasks in one batch, light ceremony |
| `--media` | Force MEDIA — 2-3 tasks per batch, moderate ceremony |
| `--complexa` | Force COMPLEXA — 1 task per batch, full ceremony |

---

## Why Pipeline Orchestrator?

<table>
<tr>
<td width="50%">

### Without Pipeline Orchestrator

- Manual task breakdown
- Inconsistent review depth
- Shared context bias in reviews
- No structured adversarial testing
- "Ship and pray" deployment

</td>
<td width="50%">

### With Pipeline Orchestrator

- Auto-classification and adaptive batching
- Proportional review depth by complexity
- **Zero-context adversarial reviews**
- Security + Architecture + Quality gates
- Confidence-scored Go/No-Go decisions

</td>
</tr>
</table>

### Key Differentiators

**Context Isolation** — Review agents never see implementation reasoning. They attack the code blind, the way a real attacker would.

**Proportional Rigor** — A one-line typo fix doesn't get the same ceremony as a payment system rewrite. The pipeline scales automatically.

**Fail-Safe Gates** — MANDATORY gates cannot be bypassed, even by `--hotfix`. CIRCUIT BREAKERs stop the pipeline before damage compounds. Every skip is logged and penalizes the confidence score.

**TDD by Default** — Tests are written BEFORE implementation (RED phase), approved by the user, and validated after every batch. Not optional for code-changing pipelines.

**Glass Box** — TRACE.md generates a complete trail of every execution. Auditable, attachable to PRs, validatable.

---

## Quality Highlights

| Signal | Detail |
|---|---|
| **166 tests passing** | 149 unit + 17 integration — pure Node.js built-in test runner, zero external test dependencies |
| **5 compat mock + 8 hooks** | Full regression suite with zero regressions since v4.16.0 baseline |
| **Defense-in-depth security** | Atomic `tmp+rename` writes, fail-closed error paths, future-timestamp rejection (5s skew), stale-OPEN reuse rejection, Windows path case-folding, regex-validated session IDs |
| **Anti-prompt-injection by design** | Inline Invariants in the controller prompt **override** any contradicting `references/*.md` content — adversarial Grep results are treated as data, not instructions |
| **Independent adversarial review** | Three independent scanners (security + architecture + quality) review every batch with **zero implementation context** |
| **Reviewers compete in parallel** | Final adversarial team spawned simultaneously (single message, three Agent calls) to preserve independence and amortize wall time |
| **Verifiable claims only** | Every sanity assertion requires `command + actual output`; no assertions on trust |

---

## Project Structure

```
pipeline-orchestrator/
├── agents/
│   ├── core/                    # 8 orchestration agents
│   │   ├── task-orchestrator    # Entry point — classifies tasks
│   │   ├── information-gate     # Detects missing context
│   │   ├── sentinel             # Pipeline guardian
│   │   ├── checkpoint-validator # Build + test verification
│   │   ├── sanity-checker       # Final sanity verification
│   │   ├── adversarial-batch    # Per-batch security checklist review
│   │   ├── final-validator      # Go/No-Go decision (Pa de Cal)
│   │   └── finishing-branch     # Closeout options
│   ├── executor/                # 5 executor agents + type-specific
│   │   ├── executor-controller  # Batch orchestration
│   │   ├── executor-implementer # Per-task implementation
│   │   ├── executor-fix         # Targeted fixes for findings
│   │   ├── executor-spec-reviewer
│   │   ├── executor-quality-reviewer
│   │   └── type-specific/       # 17 domain expert agents
│   └── quality/                 # 7 review agents
├── commands/
│   ├── pipeline.md              # /pipeline command (full classifier)
│   ├── bugfix.md                # /bugfix shortcut
│   ├── feature.md               # /feature shortcut
│   ├── audit.md                 # /audit shortcut
│   └── spec.md                  # /spec shortcut (v5.0)
├── references/
│   ├── checklists/              # 7 security checklists
│   ├── pipelines/               # 15 pipeline variant definitions
│   ├── gates.md                 # Hardness Taxonomy + 22-gate Registry
│   ├── team-registry.md         # Agent-to-team SSOT mapping
│   ├── complexity-matrix.md     # Classification rules
│   ├── trace-schema/v1.md       # TRACE.md schema (v5.0)
│   └── glossary.md              # Term definitions
├── skills/                      # 14 skill definitions
│   ├── pipeline/                # Main skill
│   ├── bugfix-light/            # 8 prescriptive steps
│   ├── bugfix-heavy/            # 11 prescriptive steps
│   ├── feature-light/           # 13 steps
│   ├── feature-heavy/           # 13 steps
│   ├── audit-light/             # 9 steps
│   ├── audit-heavy/             # 9 steps
│   ├── spec-light/              # 6 steps (v5.0)
│   ├── spec-heavy/              # 9 steps (v5.0)
│   └── spec-audit-only/         # 5 steps (v5.0)
├── hooks/
│   └── hooks.json               # Sentinel PreToolUse hook
├── scripts/
│   └── validate-trace.cjs       # Standalone TRACE.md validator (v5.0)
└── tests/
    ├── unit/                    # 19 unit test suites
    ├── integration/             # 3 integration test suites
    ├── compat/                  # Compat regression runner
    └── fixtures/                # Test fixtures
```

---

## Requirements

- [Claude Code](https://claude.com/claude-code) CLI or Desktop App
- No external dependencies — pure markdown agents

---

## FX Studio AI Suite

Pipeline Orchestrator is one of five plugins in the **FX-Studio-AI** marketplace. They form a coherent workflow:

1. **[cc-toolkit](https://github.com/fernandoxavier02/cc-mastery)** — Onboarding and diagnostics. Get your Claude Code setup in order.
2. **[skill-advisor](https://github.com/fernandoxavier02/skill-advisor)** — Discovery and routing. Use the tools you already have, effectively.
3. **Pipeline Orchestrator** (this repo) — Adversarial review. Ship production code safely.
4. **[engineering-context](https://github.com/fernandoxavier02/engineering-context)** — Engineering rules, anti-pattern mining, stack detection.
5. **[tts-minimax](https://github.com/fernandoxavier02/tts-minimax)** — Bring-your-own-key TTS for spoken responses.

Install the marketplace once, use any combination.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <br/>
  <strong>Built by <a href="https://github.com/fernandoxavier02">Fernando Xavier</a></strong>
  <br/>
  <a href="https://fxstudioai.com">FX Studio AI</a> — Business Automation with AI
  <br/><br/>
  <sub>19 agents working together so you don't have to.</sub>
</div>
