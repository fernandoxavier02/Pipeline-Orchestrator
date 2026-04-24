---
name: pipeline
description: "Automated multi-agent pipeline for any project. Use when ANY task needs structured execution — bug fixes, features, audits, user stories, UX reviews. A single /pipeline command auto-classifies, confirms with user, then executes with TDD, batch processing, context-independent adversarial review with user gates, final adversarial team (3 parallel agents), and Go/No-Go validation. Always use this for tasks affecting 2+ files or requiring careful orchestration. Even if the user doesn't mention 'pipeline' — if the task is non-trivial, this skill applies."
---

# Pipeline Orchestrator

Single-command multi-agent pipeline that auto-classifies tasks, executes in adaptive batches with TDD, context-independent adversarial review with user gates, final adversarial team (3 parallel agents), then validates before completion.

## When to Use

- Bug fixes affecting multiple files
- New features requiring design decisions
- Security-sensitive changes
- Audits and code reviews
- User stories needing translation to technical tasks
- UX simulation and journey testing

## When NOT to Use

- Single-file trivial changes (< 30 lines)
- Documentation-only updates
- Simple refactors with no behavioral change

## Quick Reference

| Mode | Command | Description |
|------|---------|-------------|
| Full | `/pipeline [task]` | Complete 4-phase execution |
| Diagnostic | `/pipeline diagnostic [task]` | Classification + proposal only |
| Continue | `/pipeline continue` | Resume from Phase 2 |
| Force level | `/pipeline --simples\|--media\|--complexa [task]` | Override classification |
| Grill | `/pipeline --grill [task]` | Force design interrogation for any complexity |
| Plan | `/pipeline --plan [task]` | Force implementation planning for any complexity |
| Hotfix | `/pipeline --hotfix [task]` | Emergency bypass with reduced validation for production incidents |
| Review-only | `/pipeline review-only` | Final adversarial review on current uncommitted changes |

## Pipeline Phases

```
Phase 0: Automatic Triage
  task-orchestrator (classify) → information-gate (detect gaps)
  → design-interrogator (COMPLEXA auto | --grill flag)

Phase 1: Proposal + Confirmation
  Present classification → user confirms (yes/no/adjust)

Phase 1.5: Implementation Planning (Conditional)
  plan-architect (COMPLEXA auto | --plan flag) → EnterPlanMode → plan → approve

Phase 2: Batch Execution
  TDD: quality-gate-router → pre-tester (RED)
  Implementation: executor-controller (adaptive batches)
    Per batch: micro-gate → implement → checkpoint
  Review: ADVERSARIAL GATE → review-orchestrator (independent)
    Per batch: adversarial + architecture in parallel → fix loop

Phase 3: Closure
  sanity-checker → FINAL ADVERSARIAL GATE (recommended)
  → final-adversarial-orchestrator (3 parallel reviewers)
  → final-validator (Pa de Cal) → finishing-branch
```

## Configuration

Create `.claude/pipeline.local.md` in your project:

```yaml
---
doc_path: ".pipeline/docs"
spec_path: "specs/"
build_command: "npm run build"
test_command: "npm test"
patterns_file: "PATTERNS.md"
---
```

If no config exists, the pipeline auto-detects from `package.json`, `Makefile`, or common conventions.

## Pipeline Variants

5 types × 2 intensities = 10 variants (see `references/pipelines/`):

| Type | Light (MEDIA) | Heavy (COMPLEXA) |
|------|---------------|-------------------|
| Bug Fix | bugfix-light | bugfix-heavy |
| Feature | implement-light | implement-heavy |
| User Story | user-story-light | user-story-heavy |
| Audit | audit-light | audit-heavy |
| UX Simulation | ux-sim-light | ux-sim-heavy |

SIMPLES tasks use DIRETO (direct execution without pipeline).

## Key Safety Features

- **Defense-in-depth gates:** macro-gate (after classification) + micro-gate (per task)
- **Context-independent review:** review-orchestrator has ZERO implementation context
- **Adversarial gate:** user is informed and asked before every adversarial review
- **Final adversarial team:** 3 parallel independent reviewers catch cross-batch issues
- **Per-batch adversarial review:** catches issues early, not just at the end
- **Fix loop cap:** max 3 attempts, 3rd must use different approach, then escalates
- **Stop rule:** 2 consecutive build/test failures → pipeline stops
- **Non-invention:** never guesses missing information — asks the user
- **Design interrogation:** walks design decision tree for COMPLEXA tasks (or `--grill`), resolving trade-offs before implementation
- **Implementation planning:** plan-architect enters read-only Plan Mode for COMPLEXA tasks (or `--plan`), creating a structured blueprint before any code is written

## Requirements

- **Claude Code** v1.0+ (CLI)
- **git** required for `/pipeline review-only` mode
- **bash** shell available in PATH
- Works on: macOS, Linux, Windows (WSL or Git Bash)
- No runtime dependencies — pure markdown plugin
