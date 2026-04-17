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

**Review Orchestrator** — An independent agent that coordinates per-batch code review. Spawned by pipeline.md (not executor-controller) to ensure zero context contamination from the implementation phase. Dispatches adversarial-batch and architecture-reviewer in parallel.

**Adversarial Gate** — A user-facing checkpoint that informs the user before adversarial review begins. The user can approve, skip (if not mandatory), or adjust checklists. Mandatory when the batch touches auth, crypto, data-model, or payment domains.

**Final Adversarial Review** — An optional (recommended) end-of-pipeline review that examines ALL changes as a whole. Three independent reviewers (security, architecture, quality) run in parallel with zero prior context. Catches cross-batch issues invisible to per-batch reviews.

**Context Contamination** — When an agent that participated in implementation also influences the review (directly or by framing), introducing implicit bias. The review-orchestrator pattern prevents this by creating a clean context boundary.

**Consensus Finding** — An issue identified independently by 2+ reviewers in the final adversarial review. Higher confidence than single-reviewer findings.

**Zero-Context Agent** — An agent that receives ONLY a file list (or minimal metadata) as input and forms its own understanding by reading the code directly. It does NOT receive implementation summaries, design rationale, prior review findings, or task descriptions. Zero-context agents eliminate confirmation bias and simulate the perspective of a reviewer who never saw the discussion that produced the code.

**Agent Naming Convention** — Two explicit naming contracts in the `agents/` tree:
- In `agents/executor/type-specific/`, agents prefixed `adversarial-*` (`adversarial-security-scanner`, `adversarial-architecture-critic`, `adversarial-quality-reviewer`) are **zero-context** reviewers dispatched by `final-adversarial-orchestrator`. `adversarial-review-coordinator` in the same folder is itself context-aware but dispatches zero-context children.
- In `agents/executor/` top level, agents prefixed `executor-*` (`executor-controller`, `executor-fix`, `executor-implementer-task`, `executor-quality-reviewer`, `executor-spec-reviewer`) are **context-aware** per-task agents that run inside `executor-controller`, with full knowledge of the task, implementation, and prior review results.
- In `agents/executor/type-specific/`, the other prefixes (`audit-*`, `bugfix-*`, `feature-*`, `ux-*`) are **context-aware** domain specialists dispatched by `executor-controller` based on task type.
- When a new reviewer is added, the `adversarial-*` prefix is reserved for zero-context operation. An `adversarial-*` file that runs with context must document why in its spec frontmatter. Conversely, a zero-context reviewer that does NOT use the `adversarial-*` prefix must document why.

**Vertical Slice** — An end-to-end feature increment that delivers value across all layers (backend → frontend → test). Each slice can be validated independently.

**SSOT (Single Source of Truth)** — Each piece of data, rule, or configuration has exactly ONE authoritative source. If two sources exist for the same thing, the pipeline blocks until the conflict is resolved.

**Residual Risk: LLM Prompt Injection** — Any agent in this plugin that reads project files (including pipeline-authored spec files, configuration, and reviewed source) is vulnerable to prompt-injection content embedded in those files. The `ANTI-PROMPT-INJECTION (MANDATORY)` block in every adversarial agent's spec is a textual instruction to the LLM, not a runtime guard. Mitigations built into the plugin: (a) Zero-Context Agents reduce the attack surface by receiving only file lists; (b) the Inline Invariants block in `commands/pipeline.md` overrides Grep-loaded content that disagrees with it; (c) `sentinel-state.json` tampering is detectable but not prevented (hook emits stderr WARN on unknown schema versions). What is NOT mitigated: an attacker who can write to a reviewed file can attempt to influence the reviewing agent's output through embedded directives. Treat this as a known residual risk at the LLM layer — the defense is defense-in-depth (multi-reviewer consensus, sentinel sequence validation, human-visible gate decisions) rather than a single enforcement point.

## Architecture

**Spec** — A requirements document containing user stories, acceptance criteria (EARS format), design decisions, and implementation tasks. The foundation for structured implementation.

**Contract** — An agreed interface between components: API signatures, data formats, response structures. Contracts are sacred — changes require explicit versioning and backward compatibility.

**Business Rule / Domain Constraint** — Logic that encodes how the business operates: pricing rules, access policies, workflow sequences. Must be validated server-side, never only in the UI.

**Non-Invention Rule** — The principle that missing information must never be filled with assumptions. When critical details are absent, the pipeline STOPS and asks the user instead of guessing.

**Verification-Before-Claim** — Every assertion that something "works" or "passes" must include the actual command executed and its output. No "should work" or "probably fixed."
