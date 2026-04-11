<div align="center">
  <img src="assets/fx-studio-ai-logo.png" alt="FX Studio AI" width="600"/>
</div>

<h1 align="center">Pipeline Orchestrator</h1>

<p align="center">
  <strong>The AI agent pipeline that catches what humans miss.</strong><br/>
  <em>37 specialized agents. 12 pipeline types. 1 command.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.2.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/agents-37-7C3AED?style=for-the-badge" alt="Agents" />
  <img src="https://img.shields.io/badge/platform-Claude_Code-000?style=for-the-badge" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#pipeline-types">Pipeline Types</a> &bull;
  <a href="#agent-teams">Agent Teams</a> &bull;
  <a href="#commands">Commands</a> &bull;
  <a href="#architecture">Architecture</a>
</p>

---

## The Problem

You ship code. Tests pass. Linter is green. PR looks clean.

**Then production breaks.**

A silent auth bypass. A race condition under load. An SSOT conflict between two services that nobody noticed. The kind of bugs that code review *should* catch — but doesn't, because reviewers share the same context as the author.

**Pipeline Orchestrator solves this with adversarial independence.** Every batch of work is reviewed by agents that have *zero knowledge* of how the code was written. They see only the result. They attack it from security, architecture, and quality angles — simultaneously, in parallel, with no shared context.

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

```mermaid
flowchart TB
    subgraph Phase0["PHASE 0 — TRIAGE"]
        A["/pipeline task"] --> B["Task Orchestrator"]
        B --> C{"Classify"}
        C -->|"Bug Fix"| D["bugfix pipeline"]
        C -->|"Feature"| E["implement pipeline"]
        C -->|"Audit"| F["audit pipeline"]
        C -->|"UX"| G["ux-sim pipeline"]
        D & E & F & G --> H["Information Gate"]
        H --> I{"Gaps?"}
        I -->|"Yes"| J["Ask user ONE question"]
        J --> I
        I -->|"No"| K["CLEAR"]
    end

    subgraph Phase1["PHASE 1 — CONFIRM"]
        K --> L["Present Proposal"]
        L --> M{"User confirms?"}
        M -->|"adjust"| L
        M -->|"no"| N["EXIT"]
        M -->|"yes"| O["Plan Architect"]
    end

    subgraph Phase2["PHASE 2 — EXECUTE"]
        O --> P["Executor Controller"]
        P --> Q["Per-Batch Loop"]
        Q --> R["TDD: RED → GREEN"]
        R --> S["Checkpoint: build + tests"]
        S --> T{"Adversarial Gate"}
        T -->|"approved"| U["Independent Review"]
        U --> V{"Findings?"}
        V -->|"critical"| W["Fix Loop (max 3)"]
        W --> S
        V -->|"clean"| X["Next Batch"]
        X --> Q
    end

    subgraph Phase3["PHASE 3 — CLOSE"]
        X --> Y["Sanity Checker"]
        Y --> Z["Final Adversarial Team"]
        Z --> AA["Final Validator"]
        AA --> BB{"Decision"}
        BB -->|"GO"| CC["Ship it"]
        BB -->|"CONDITIONAL"| DD["Ship with notes"]
        BB -->|"NO-GO"| EE["Block"]
    end

    style Phase0 fill:#1a1a2e,stroke:#7C3AED,color:#fff
    style Phase1 fill:#16213e,stroke:#0ea5e9,color:#fff
    style Phase2 fill:#1a1a2e,stroke:#22c55e,color:#fff
    style Phase3 fill:#16213e,stroke:#f59e0b,color:#fff
```

### Adaptive Complexity

The pipeline adjusts its rigor automatically. No configuration needed.

| Complexity | Files | Batch Size | Sentinel | Design Review | Adversarial |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **SIMPLES** | 1-2 | All at once | 1 checkpoint | Skipped | 3 checklists |
| **MEDIA** | 3-5 | 2-3 tasks | 2 checkpoints | Optional | 5 checklists |
| **COMPLEXA** | 6+ | 1 task | 5 checkpoints | Automatic | 7 checklists |

---

## Pipeline Types

Six specialized pipeline families — each with **light** and **heavy** variants — cover every development scenario.

```mermaid
flowchart LR
    subgraph Pipelines["12 PIPELINE VARIANTS"]
        direction TB
        BF["Bug Fix"] --- BFH["heavy: 4 agents"]
        BF --- BFL["light: 3 agents"]
        FT["Feature"] --- FTH["heavy: 3 agents"]
        FT --- FTL["light: 2 agents"]
        US["User Story"] --- USH["heavy: 3 agents"]
        US --- USL["light: 2 agents"]
        AU["Audit"] --- AUH["heavy: 4 agents"]
        AU --- AUL["light: 3 agents"]
        UX["UX Simulation"] --- UXH["heavy: 3 agents"]
        UX --- UXL["light: 2 agents"]
        AD["Adversarial"] --- ADH["heavy: 3 agents"]
        AD --- ADL["light: 2 agents"]
    end

    style Pipelines fill:#0d1117,stroke:#7C3AED,color:#fff
    style BF fill:#ef4444,stroke:#ef4444,color:#fff
    style FT fill:#22c55e,stroke:#22c55e,color:#fff
    style US fill:#3b82f6,stroke:#3b82f6,color:#fff
    style AU fill:#f59e0b,stroke:#f59e0b,color:#fff
    style UX fill:#ec4899,stroke:#ec4899,color:#fff
    style AD fill:#8b5cf6,stroke:#8b5cf6,color:#fff
```

| Pipeline | When | What Happens |
|----------|------|-------------|
| **Bug Fix** | Production bugs, regressions | Diagnostic → Root Cause Analysis → TDD Fix → Regression Suite |
| **Feature** | New capabilities, enhancements | Vertical Slice Planning → Implementation → Integration Validation |
| **User Story** | User-facing stories | Same team as Feature, scoped by acceptance criteria |
| **Audit** | Code health, compliance | Intake → Domain Analysis → Compliance Check → Risk Matrix |
| **UX Simulation** | User experience analysis | Persona Simulation ‖ Accessibility Audit → QA Validation |
| **Adversarial** | Security & architecture review | Security Scanner ‖ Architecture Critic → Consolidated Report |

---

## Agent Teams

### The 37-Agent Architecture

Pipeline Orchestrator deploys agents in three layers — each with a distinct role and zero context leakage between layers.

```mermaid
flowchart TB
    subgraph Core["CORE — Orchestration & Gates"]
        TO["Task Orchestrator"] --> IG["Information Gate"]
        IG --> DI["Design Interrogator"]
        DI --> PA["Plan Architect"]
        SN["Sentinel"] -.->|"validates every spawn"| TO
        SN -.-> IG
        SN -.-> DI
    end

    subgraph Executor["EXECUTOR — Implementation"]
        EC["Executor Controller"] --> EI["Implementer Task"]
        EC --> SR["Spec Reviewer"]
        EC --> QR["Quality Reviewer"]
        EC --> EF["Executor Fix"]
        CV["Checkpoint Validator"] --> EC
    end

    subgraph Quality["QUALITY — Independent Review"]
        RO["Review Orchestrator"] --> AB["Adversarial Batch"]
        RO --> AR["Architecture Reviewer"]
        FAO["Final Adversarial"] --> FSA["Security Adversarial"]
        FAO --> FAA["Architecture Adversarial"]
        FAO --> FQA["Quality Adversarial"]
        SC["Sanity Checker"] --> FV["Final Validator"]
    end

    subgraph TypeSpecific["TYPE-SPECIFIC — Domain Experts"]
        direction LR
        AuditTeam["Audit: intake → domain → compliance → risk"]
        BugfixTeam["Bugfix: diagnostic → root-cause → regression"]
        FeatureTeam["Feature: slice-planner → implementer → validator"]
        UXTeam["UX: simulator ‖ a11y-auditor → qa-validator"]
        AdvTeam["Adversarial: coordinator → scanner ‖ critic"]
    end

    Core --> Executor
    Executor --> Quality
    EC -->|"dispatches"| TypeSpecific

    style Core fill:#1e1b4b,stroke:#7C3AED,color:#fff
    style Executor fill:#052e16,stroke:#22c55e,color:#fff
    style Quality fill:#451a03,stroke:#f59e0b,color:#fff
    style TypeSpecific fill:#1e1b4b,stroke:#ec4899,color:#fff
```

### Type-Specific Teams by Pipeline

| Pipeline | Agents | Execution Flow |
|----------|--------|---------------|
| **Bug Fix Heavy** | 4 agents | `diagnostic` → `root-cause-analyzer` → `implementer` → `regression-tester` |
| **Bug Fix Light** | 3 agents | `diagnostic` → `implementer` → `regression-tester` |
| **Feature Heavy** | 3 agents | `vertical-slice-planner` → `implementer` → `integration-validator` |
| **Feature Light** | 2 agents | `vertical-slice-planner` → `implementer` |
| **Audit Heavy** | 4 agents | `intake` → `domain-analyzer` → `compliance-checker` → `risk-matrix` |
| **Audit Light** | 3 agents | `intake` → `compliance-checker` → `risk-matrix` |
| **UX Heavy** | 3 agents | `simulator` ‖ `a11y-auditor` → `qa-validator` |
| **UX Light** | 2 agents | `simulator` → `qa-validator` |
| **Adversarial Heavy** | 3 agents | `coordinator` → `security-scanner` ‖ `architecture-critic` |
| **Adversarial Light** | 2 agents | `coordinator` → `security-scanner` |

> **‖** = parallel execution with zero shared context

---

## Commands

| Command | Description |
|---------|-------------|
| `/pipeline [task]` | Full pipeline — triage, plan, execute, close |
| `/pipeline --hotfix [task]` | Emergency mode — reduced ceremony, production focus |
| `/pipeline --plan [task]` | Force implementation planning for any complexity |
| `/pipeline --grill [task]` | Force design interrogation for any complexity |
| `/pipeline review-only` | Adversarial review of current changes (no execution) |
| `/pipeline diagnostic [task]` | Classification + proposal only (dry run) |
| `/pipeline continue` | Resume an interrupted pipeline session |

### Complexity Overrides

| Flag | Effect |
|------|--------|
| `--simples` | Force SIMPLES — all tasks in one batch, light ceremony |
| `--media` | Force MEDIA — 2-3 tasks per batch, moderate ceremony |
| `--complexa` | Force COMPLEXA — 1 task per batch, full ceremony |

---

## Architecture

### Defense in Depth

Every layer of the pipeline has independent safety mechanisms. No single point of failure.

```mermaid
flowchart LR
    subgraph Gates["GATE SYSTEM"]
        direction TB
        M["MANDATORY\nSSOT conflicts\nSecurity domains"] ~~~ H["HARD\nInfo gaps\nTest approval\nCheckpoint fail"]
        H ~~~ CB["CIRCUIT BREAKER\n2x consecutive fail\n3x fix loop exhaust"]
        CB ~~~ S["SOFT\nAdversarial review\nFinal review\nCloseout confirm"]
    end

    style M fill:#dc2626,stroke:#dc2626,color:#fff
    style H fill:#ea580c,stroke:#ea580c,color:#fff
    style CB fill:#d97706,stroke:#d97706,color:#fff
    style S fill:#65a30d,stroke:#65a30d,color:#fff
```

| Gate Type | Can Skip? | User Override? | Example |
|-----------|:---------:|:--------------:|---------|
| **MANDATORY** | Never | No | SSOT conflict, auth/crypto domain review |
| **HARD** | No | Resolution only | Missing info, test approval, build failure |
| **CIRCUIT BREAKER** | No | Reset only | 2 consecutive failures, 3 fix attempts |
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

- Auto-classification & adaptive batching
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
│   │   ├── final-validator      # Go/No-Go decision (Pa de Cal)
│   │   └── finishing-branch     # Closeout options
│   ├── executor/                # 6 execution agents
│   │   ├── executor-controller  # Batch orchestration
│   │   ├── executor-implementer # Per-task implementation
│   │   ├── executor-fix         # Targeted fixes for findings
│   │   ├── executor-spec-reviewer
│   │   ├── executor-quality-reviewer
│   │   └── type-specific/       # 16 domain expert agents
│   │       ├── audit-*          # 4 audit specialists
│   │       ├── bugfix-*         # 3 bugfix specialists
│   │       ├── feature-*        # 3 feature specialists
│   │       ├── ux-*             # 3 UX specialists
│   │       └── adversarial-*    # 3 adversarial specialists
│   └── quality/                 # 7 review agents
│       ├── review-orchestrator  # Per-batch review coordination
│       ├── adversarial-batch    # Security checklist review
│       ├── architecture-reviewer
│       ├── design-interrogator
│       ├── plan-architect
│       ├── quality-gate-router  # TDD scenario generation
│       └── pre-tester           # RED phase test creation
├── commands/
│   └── pipeline.md              # The /pipeline command
├── references/
│   ├── pipelines/               # 12 pipeline variant definitions
│   ├── checklists/              # 7 security checklists
│   ├── team-registry.md         # Agent-to-team SSOT
│   ├── complexity-matrix.md     # Classification rules
│   └── glossary.md              # Term definitions
├── hooks/
│   └── hooks.json               # Sentinel PreToolUse hook
└── skills/
    └── pipeline/SKILL.md        # Auto-trigger skill
```

---

## Requirements

- [Claude Code](https://claude.com/claude-code) CLI or Desktop App
- No external dependencies — pure markdown agents

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
  <sub>37 agents working together so you don't have to.</sub>
</div>
