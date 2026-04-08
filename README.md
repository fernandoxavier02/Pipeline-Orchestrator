<div align="center">
  <img src="assets/fx-studio-ai-logo.png" alt="FX Studio AI" width="600"/>
</div>

<h1 align="center">Pipeline Orchestrator</h1>

<p align="center">
  <strong>Single-command multi-agent pipeline for Claude Code</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Claude_Code-7C3AED?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/language-JavaScript-F7DF1E?style=flat-square" alt="Language" />
</p>

---

## What It Does

Pipeline Orchestrator turns any task into a structured, multi-agent execution pipeline. It auto-classifies tasks by complexity, confirms the plan with you, then executes in adaptive batches with parallel sub-agents and adversarial review.

One command. Full lifecycle. No manual orchestration.

---

## How It Works

```
Phase 0 — Triage
  ├── Task classification (simple / medium / complex)
  ├── Information gate (missing context detection)
  └── Design interrogation (complex tasks only)

Phase 1 — Proposal + Confirmation
  └── Plan architect (complex / --plan)

Phase 2 — Execution in Batches
  ├── Executor controller (parallel sub-agents)
  └── Adversarial gate per batch (security / architecture / quality)

Phase 3 — Closure
  ├── Sanity checker (build + tests)
  ├── Final adversarial review
  ├── Final validator — Go / Conditional / No-Go
  └── Closeout (commit / PR / discard)
```

---

## Commands

| Command | Mode | Description |
|---------|------|-------------|
| `/pipeline [task]` | Full | All 4 phases — classification, planning, execution, closure |
| `/pipeline --simples [task]` | Simple | Force simple complexity |
| `/pipeline --media [task]` | Medium | Force medium complexity |
| `/pipeline --complexa [task]` | Complex | Full pipeline with design interrogation + detailed plan |
| `/pipeline --hotfix [task]` | Hotfix | Emergency — reduced validation, production focus |
| `/pipeline review-only` | Review | Adversarial review of current changes (no execution) |
| `/pipeline diagnostic [task]` | Diagnostic | Classification and proposal only, no execution |
| `/pipeline continue` | Continue | Resume pipeline from previous session |

---

## Features

- **Auto-classification** — analyzes task complexity and selects the appropriate pipeline depth
- **Adaptive batching** — groups work into parallelizable batches with dependency awareness
- **Adversarial review** — independent security, architecture, and quality gates per batch
- **Go/No-Go validation** — final gate before commit with explicit pass/conditional/fail states
- **TDD integration** — test-driven development enforced throughout execution
- **Session continuity** — resume interrupted pipelines with full context

---

## Installation

Distributed via the [FX Studio AI marketplace](https://github.com/fernandoxavier02/FX-Studio-AI) for Claude Code.

```bash
claude plugin add-marketplace https://github.com/fernandoxavier02/FX-Studio-AI
claude plugin add pipeline-orchestrator
```

---

## License

MIT

---

<div align="center">
  <strong>Built by <a href="https://github.com/fernandoxavier02">Fernando Xavier</a></strong>
  <br/>
  <a href="https://fxstudioai.com">FX Studio AI</a> — Business Automation with AI
</div>
