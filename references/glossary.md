# Glossary

Terms used throughout the Pipeline Orchestrator plugin.

---

## Pipeline Concepts

**Pipeline** — An automated sequence of specialized agents that classify, implement, review, and validate a task. Each pipeline variant defines which agents run and in what order.

**DIRETO** — Direct execution without a pipeline. Used for trivial (SIMPLES) tasks that need only a build check. No orchestration overhead.

**Pa de Cal** — "Final shovel" — the last validation gate that issues a Go/Conditional/No-Go decision. Named for the definitive nature of the decision: once issued, the pipeline is complete.

**Proportionality** — The principle that validation rigor scales with risk. Simple tasks get light checks; complex tasks get full governance. Prevents both under-validation and over-engineering.

## Classification

**SIMPLES** — Low-complexity task affecting 1-2 files, <30 lines. Executes via DIRETO (no pipeline).

**MEDIA** — Medium-complexity task affecting 3-5 files, 30-100 lines. Uses Light pipeline variant with batches of 2-3 tasks.

**COMPLEXA** — High-complexity task affecting 6+ files, >100 lines. Uses Heavy pipeline variant with 1 task per batch and full adversarial review.

## Gates

**Macro-Gate** — Information gap detection that runs ONCE after classification, BEFORE pipeline selection. Checks for missing context based on task type and affected domains. Blocks until critical gaps are resolved.

**Micro-Gate** — Per-task checklist that the implementer verifies BEFORE writing any code. Checks that target files exist, behavior is explicit, numeric values are defined, and data paths are specified.

**Defense-in-Depth** — The combination of macro-gate + micro-gate ensures information completeness at two levels: pipeline-wide (strategic) and per-task (tactical).

## Execution

**Batch Execution** — Grouping tasks for processing. Batch size adapts to complexity: SIMPLES = all at once, MEDIA = 2-3, COMPLEXA = 1. Each batch gets its own checkpoint and adversarial review.

**Checkpoint** — Build + test validation that runs after each batch completes. Proportional to complexity (build-only for SIMPLES, full regression for COMPLEXA).

**Fix Loop** — When adversarial review finds issues, a fresh executor-fix subagent attempts to resolve them. Maximum 3 attempts; the 3rd must use a different approach. If all 3 fail, the pipeline stops and escalates.

**Stop Rule** — 2 consecutive build/test failures halt the pipeline and escalate to the user. Prevents infinite retry loops.

## Quality

**TDD (Test-Driven Development)** — RED → GREEN → REFACTOR. Tests are written first (RED = they fail), then minimum code is implemented (GREEN = they pass), then code is cleaned up (REFACTOR = still passes).

**Adversarial Review** — Security-focused code review using specialized checklists (auth, input validation, error handling, injection, data integrity, crypto, business logic). Intensity is proportional to complexity.

**Vertical Slice** — An end-to-end feature increment that delivers value across all layers (backend → frontend → test). Each slice can be validated independently.

**SSOT (Single Source of Truth)** — Each piece of data, rule, or configuration has exactly ONE authoritative source. If two sources exist for the same thing, the pipeline blocks until the conflict is resolved.

## Architecture

**Spec** — A requirements document containing user stories, acceptance criteria (EARS format), design decisions, and implementation tasks. The foundation for structured implementation.

**Contract** — An agreed interface between components: API signatures, data formats, response structures. Contracts are sacred — changes require explicit versioning and backward compatibility.

**Business Rule / Domain Constraint** — Logic that encodes how the business operates: pricing rules, access policies, workflow sequences. Must be validated server-side, never only in the UI.

**Non-Invention Rule** — The principle that missing information must never be filled with assumptions. When critical details are absent, the pipeline STOPS and asks the user instead of guessing.

**Verification-Before-Claim** — Every assertion that something "works" or "passes" must include the actual command executed and its output. No "should work" or "probably fixed."
