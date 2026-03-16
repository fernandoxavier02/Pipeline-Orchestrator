# Pipeline Orchestrator - Claude Code Plugin

A multi-agent TDD pipeline for Claude Code that classifies tasks, orchestrates execution with proportional validation, and ensures quality through adversarial review.

## Features

- **Automatic Classification**: Tasks classified as SIMPLES/MEDIA/COMPLEXA based on scope, risk, and complexity
- **TDD Workflow**: Test scenarios approved by user -> tests written (RED) -> code implemented (GREEN)
- **Proportional Validation**: Rigor scales with complexity - simple tasks get light checks, complex ones get full governance
- **Adversarial Review**: Security and quality checklists proportional to risk level
- **Non-Invention Rule**: Pipeline pauses when information is missing instead of guessing
- **Full Documentation**: Every stage documents its analysis and decisions

## Installation

### Option 1: Clone and link locally

```bash
git clone https://github.com/YOUR-USER/pipeline-orchestrator.git ~/.claude/plugins/pipeline-orchestrator
```

### Option 2: Add to `.claude/settings.json`

```json
{
  "plugins": [
    "~/.claude/plugins/pipeline-orchestrator"
  ]
}
```

## Usage

### Full Pipeline
```
/pipeline Fix the login bug that causes double redirect
```

### Diagnostic Only (no implementation)
```
/pipeline diagnostic Add export feature to reports
```

### Resume from Stage 3
```
/pipeline continue
```

### Force Classification Level
```
/pipeline --simples Fix typo in error message
/pipeline --media Add pagination to user list
/pipeline --complexa Redesign authentication flow
```

## Architecture

```
User Request
    |
    v
1. Context Classifier    -> SIMPLES / MEDIA / COMPLEXA
2. Orchestrator          -> Selects pipeline (Direct/Light/Heavy)
2.5 Quality Gate         -> Test scenarios (USER APPROVAL REQUIRED)
2.6 Pre-Tester           -> Automated tests (RED)
3. Executor              -> Implementation (GREEN)
4. Adversarial Reviewer  -> Security checklists (proportional)
5. Sanity Checker        -> Build + tests + scope check
6. Final Validator       -> GO / CONDITIONAL / NO-GO
```

## Pipeline Agents

| Agent | Role | Model |
|-------|------|-------|
| task-orchestrator | Entry point, classifies type/persona/severity | opus |
| context-classifier | Classifies complexity, collects context | sonnet |
| orchestrator-documenter | Selects pipeline, prepares execution | sonnet |
| quality-gate-router | Generates plain-language test scenarios | opus |
| pre-tester | Converts scenarios to automated tests (RED) | opus |
| executor-controller | Orchestrates per-task implementation | opus |
| executor-implementer-task | Implements ONE task with TDD | opus |
| executor-spec-reviewer | Verifies implementation matches spec | sonnet |
| executor-quality-reviewer | Checks SOLID/KISS/DRY/YAGNI | sonnet |
| adversarial-reviewer | Security and edge case review | sonnet |
| sanity-checker | Build, tests, regression | haiku |
| final-validator | Consolidates, issues Go/No-Go | sonnet |
| finishing-branch | Git operations (merge/PR/discard) | sonnet |

## Configuration

Create `.claude/pipeline.local.md` in your project to customize:

```yaml
---
doc_path: ".pipeline/docs"
spec_path: ".kiro/specs"
build_command: "npm run build"
test_command: "npm test"
patterns_file: "PATTERNS.md"
---
```

If no config file exists, the pipeline auto-detects from your project structure.

## Proportionality Table

| Level | Files | Lines | Adversarial | Sanity | Final |
|-------|-------|-------|-------------|--------|-------|
| SIMPLES | 1-2 | <30 | Optional | Build only | Minimal |
| MEDIA | 3-5 | 30-100 | Proportional | Build + Tests | Standard |
| COMPLEXA | 6+ | >100 | Complete (7 checklists) | Full + Regression | Complete |

## Key Principles

1. **Non-Invention**: Never guess missing information. Ask.
2. **Incremental Questions**: One question at a time, never dump 5+.
3. **Stop Conditions**: Explicit conditions that halt execution.
4. **Verification Before Claim**: Every "it works" needs evidence (command + output).
5. **Proportionality**: Match rigor to complexity. Don't over-engineer simple tasks.

## License

MIT
