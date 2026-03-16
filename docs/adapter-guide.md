# Adapter Guide

## Overview

The pipeline orchestrator is a multi-agent system for Claude Code that classifies tasks, manages execution in batches, and validates results through adversarial review. This guide walks you through integrating it into any project.

## Step 1: Identify Your Workflow

Before configuring the pipeline, answer these questions:

- **Specs/requirements**: Do you use specification documents? Where are they stored?
- **Patterns/conventions**: Do you maintain a file with coding patterns or conventions?
- **Build & test commands**: What commands build and test your project?
- **SSOT strategy**: Where does authoritative data live for key decisions (e.g., database schema, API contracts)?

The pipeline adapts its behavior based on your answers. Projects without specs still work -- the pipeline skips spec-related validation and focuses on code quality.

## Step 2: Configure pipeline.local.md

Create `.claude/pipeline.local.md` in your project root with a YAML frontmatter block:

```yaml
---
doc_path: ".pipeline/docs"
spec_path: "specs/"
build_command: "npm run build"
test_command: "npm test"
patterns_file: "PATTERNS.md"
---
```

### Common Configurations

**Node.js / TypeScript**
```yaml
---
doc_path: ".pipeline/docs"
build_command: "npm run build"
test_command: "npm test"
patterns_file: "docs/conventions.md"
---
```

**Python**
```yaml
---
doc_path: ".pipeline/docs"
build_command: "python -m py_compile src/**/*.py"
test_command: "pytest"
patterns_file: "docs/patterns.md"
---
```

**Rust**
```yaml
---
doc_path: ".pipeline/docs"
build_command: "cargo build"
test_command: "cargo test"
patterns_file: "CONTRIBUTING.md"
---
```

**Go**
```yaml
---
doc_path: ".pipeline/docs"
build_command: "go build ./..."
test_command: "go test ./..."
patterns_file: "docs/conventions.md"
---
```

If no config file exists, the pipeline auto-detects build/test commands from your project structure (e.g., `package.json`, `Cargo.toml`, `go.mod`).

## Step 3: Map Your Vocabulary

If your project uses different terminology, add a vocabulary section to your `pipeline.local.md`:

```yaml
---
vocabulary:
  task: "ticket"
  spec: "design-doc"
  requirement: "acceptance-criteria"
  checkpoint: "milestone"
---
```

The pipeline will use your terms in proposals and documentation output.

## Step 4: Customize Checklists

The pipeline ships with 6 adversarial checklists in `references/checklists/`:

| Checklist | Covers |
|-----------|--------|
| `auth.md` | Authentication and authorization |
| `input-validation.md` | Input sanitization and validation |
| `error-handling.md` | Error handling and recovery |
| `injection.md` | Injection attacks (SQL, XSS, command) |
| `data-integrity.md` | Data consistency and integrity |
| `crypto.md` | Cryptographic practices |

**To add custom checklists**: Create new `.md` files in `references/checklists/`. The adversarial reviewer automatically picks up any checklist in that directory.

**To remove checklists that do not apply**: Delete or rename the file (e.g., `crypto.md.disabled`). The pipeline only loads `.md` files.

## Step 5: First Run Walkthrough

### 5.1 Diagnostic mode (safe, no changes)

```
/pipeline diagnostic Fix the search results not loading
```

This runs classification and information-gate without executing anything. Review the output:
- Does the **type** (Bug Fix, Feature, Audit, etc.) match your intent?
- Does the **complexity** (SIMPLES, MEDIA, COMPLEXA) feel right?
- Did the **information-gate** catch any real gaps?

### 5.2 Full execution

```
/pipeline Fix the search results not loading
```

The pipeline will:
1. Classify the task and present a **proposal** for your confirmation
2. Ask clarifying questions if information is missing (information-gate)
3. Generate test scenarios and ask for your approval (quality-gate)
4. Execute implementation in batches with adversarial review after each batch
5. Run sanity checks (build + tests) and issue a final GO/NO-GO

### 5.3 Check generated docs

After execution, find documentation in your configured `doc_path`. Each run creates a timestamped folder with stage outputs (classifier, orchestrator, executor, adversarial, sanity, final).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Pipeline skips adversarial review | Task classified as SIMPLES | Use `--media` or `--complexa` to override |
| Information-gate asks too many questions | Vague task description | Provide more detail in your initial request |
| Build check fails repeatedly | Wrong `build_command` in config | Update `pipeline.local.md` with the correct command |
| Pipeline does not find tests | Wrong `test_command` or no test framework | Verify `test_command` runs successfully on its own |
| Checklists not loading | Files not in `references/checklists/` | Ensure `.md` extension and correct directory |
| Classification feels wrong | Ambiguous keywords in request | Use `--simples`, `--media`, or `--complexa` to force level |
