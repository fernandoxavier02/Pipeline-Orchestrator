---
name: pipeline
description: Use when any non-trivial task needs structured execution with classification, TDD, adversarial review, and validation. Triggers on implementation requests, bug fixes, features, audits, or security reviews that affect 2+ files or require careful orchestration.
---

# Pipeline Orchestrator

Multi-agent TDD pipeline that classifies tasks, generates tests with user approval, implements with TDD, reviews adversarially, and validates before completion.

## When to Use

- Bug fixes affecting multiple files
- New features requiring design decisions
- Security-sensitive changes
- Audits and code reviews
- User stories needing translation to technical tasks

## When NOT to Use

- Single-file trivial changes (< 30 lines)
- Documentation-only updates
- Simple refactors with no behavioral change

## Quick Reference

| Mode | Command | Description |
|------|---------|-------------|
| Full | `/pipeline [request]` | Complete 6-stage execution |
| Diagnostic | `/pipeline diagnostic [request]` | Classification only (stops after stage 2) |
| Continue | `/pipeline continue` | Resume from stage 3 |
| Force level | `/pipeline --simples\|--media\|--complexa [request]` | Override classification |

## Pipeline Stages

```
1. Context Classifier    → SIMPLES / MEDIA / COMPLEXA
2. Orchestrator          → Selects pipeline type + persona
2.5 Quality Gate         → Test scenarios in plain language (USER APPROVAL)
2.6 Pre-Tester           → Automated tests that MUST FAIL (RED)
3. Executor              → Implements minimum code (GREEN)
4. Adversarial Reviewer  → Security + quality checklists (proportional)
5. Sanity Checker        → Build + tests + regression
6. Final Validator       → GO / CONDITIONAL / NO-GO
```

## Configuration

Create `.claude/pipeline.local.md` in your project for customization:

```yaml
---
doc_path: ".pipeline/docs"
spec_path: ".kiro/specs"
build_command: "npm run build"
test_command: "npm test"
patterns_file: "PATTERNS.md"
pipeline_recipes:
  - bugfix-light
  - bugfix-heavy
  - implement-light
  - implement-heavy
  - audit-light
  - audit-heavy
  - user-story-light
  - user-story-heavy
---
```

If no config exists, the pipeline auto-detects from `package.json`, `Makefile`, or common conventions.
