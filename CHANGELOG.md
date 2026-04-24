# Changelog

All notable changes to the pipeline-orchestrator plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0-draft.1] - 2026-04-23

### BREAKING

- **Orchestration moved from SKILL.md to `pipeline-controller` agent.** Main LLM no longer orchestrates; it spawns the controller and waits for the final PIPELINE COMPLETE block.
- **Main LLM loses Edit/Write permissions during pipeline sessions.** New `edit-guard-hook` blocks direct file edits outside `.pipeline/` when a session lock is active. Intentional — eliminates the bypass observed in v3.8 where main LLM rationalized "this task is too small for pipeline" and edited directly.
- **SKILL.md shrunk from ~900 lines to ~30 lines.** Full workflow spec moved to `agents/core/pipeline-controller.md`. v3 SKILL preserved as `skills/pipeline/SKILL.v3-reference.md`.

### Added

- `agents/core/pipeline-controller.md` — N1 orchestrator agent, isolated context, tools: Read/Write(.pipeline/**)/Agent/AskUserQuestion
- `.claude/hooks/session-lock-hook.cjs` — UserPromptSubmit hook; creates `.pipeline/sessions/{id}.lock` on `/pipeline` invocation
- `.claude/hooks/edit-guard-hook.cjs` — PreToolUse(Edit|Write) hook; blocks edits outside `.pipeline/` when lock active
- `tests/test_pipeline_controller.md` — BDD scenarios for manual validation
- `.claude/hooks/__tests__/session-lock-hook.test.cjs` — 16 unit tests (TDD + adversarial fix pass)
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs` — 15 unit tests (TDD + adversarial fix pass)
- `.claude/hooks/__tests__/smoke-hooks.sh` — 3 stdin-driven smoke tests for hooks integration
- `.claude/hooks/dispatch-guard.cjs` updated to register `pipeline-controller` FQN

### Unchanged

- All 37 N2 agents (task-orchestrator, information-gate, executor-controller, review-orchestrator, final-validator, etc.)
- All `references/*.md` (gates, audit-trail, confidence, complexity-matrix, sentinel-integration)
- Legacy hooks: `force-pipeline-agents.cjs`, `completion-checklist.cjs`, `sentinel-hook.cjs`, `dispatch-guard.cjs`

### Migration from v3.x

See `docs/MIGRATION-v3-to-v4.md` for upgrade path and rollback instructions.

## [3.8.0] - 2026-04-17

### Added
- **Inline `AskUserQuestion` examples in `commands/pipeline.md`** for all 4 user-decision touchpoints (Phase 1 proposal, TDD scenario approval, per-batch adversarial gate, final adversarial gate). Each example shows the complete structured call with options, `(Recomendado)` labels where applicable, and descriptions explaining trade-offs. Eliminates the prior pattern of "Ask via AskUserQuestion." as a bare reference without shape guidance.
- **USER INTERACTION PROTOCOL blocks added to 11 edge-case agents** (v3.7.0 covered 5 user-facing agents; v3.8.0 extends to agents that may ask in edge cases): `executor-controller`, `executor-implementer-task`, `executor-fix`, `feature-implementer`, `bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`, `pre-tester`, `ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`. Total coverage: **16 agents** with explicit protocol blocks.

### Fixed
- **Protocol coverage gap from v3.7.0 audit.** v3.7.0 mandated `AskUserQuestion` + recommendation-first globally, but only 5 agents had the detailed block in their spec. Edge-case agents (e.g. executor-implementer-task raising a micro-gate gap, or bugfix-root-cause-analyzer needing evidence-confirmation input) could fall back to prose under LLM improvisation. v3.8.0 closes this gap with targeted blocks in each agent's spec, tailored to its specific interaction mode.

### Notes
- No breaking changes. MINOR bump because the new inline examples and per-agent blocks extend the public contract surface of the controller spec.
- The 12 "pure output" agents (revisores, classificador, zero-context scanners, coordinators) were deliberately not updated — they return structured YAML to the controller and never prompt the user directly. Adding the block there would be misleading bloat. They remain as-is.
- Agent coverage inventory: `information-gate`, `design-interrogator`, `plan-architect`, `quality-gate-router`, `finishing-branch` (v3.7.0) + `executor-controller`, `executor-implementer-task`, `executor-fix`, `feature-implementer`, `bugfix-*` (3), `pre-tester`, `ux-*` (3) (v3.8.0) = 16 agents with USER INTERACTION PROTOCOL blocks.

## [3.7.0] - 2026-04-17

### Added
- **`USER INTERACTION PROTOCOL`** section near the top of `commands/pipeline.md` (right after AGENT DISPATCH PROTOCOL). Mandates that every user decision point in the pipeline use the `AskUserQuestion` tool to render arrow-key selectable options — NEVER free-form prose. For technical questions (multiple viable approaches with trade-offs), the first option must be the agent's recommendation labeled `(Recomendado)` with reasoning in the option description. For confirmation questions (binary yes/no), the recommendation is optional.
- **Agent-level USER INTERACTION PROTOCOL blocks** added to the 5 user-facing agents:
  - `information-gate` — technical vs factual gaps, both via `AskUserQuestion`
  - `design-interrogator` — always recommendation-first (every question is technical by design)
  - `plan-architect` — approve/adjust/reject with plan as recommendation
  - `quality-gate-router` — one `AskUserQuestion` per test scenario, approve as recommendation
  - `finishing-branch` — closeout options (commit/push/keep/discard) with context-dependent recommendation; double-confirm for destructive actions
- Glossary entry **`User Interaction Protocol (v3.7.0+)`** codifying the contract.

### Fixed
- **Prose-prompt anti-pattern** eliminated. Prior versions documented `Ask via AskUserQuestion` but did not explicitly forbid the text-answer alternative. In observed usage, agents occasionally rendered prompts like `"Qual opção prefere? (A / B / C)"` in markdown output and waited for a typed response — which is error-prone and breaks deterministic gate handling. v3.7.0 makes the prohibition explicit with an anti-pattern table.

### Notes
- No breaking changes. All existing `AskUserQuestion` usages continue to work. MINOR bump because the protocol section is a new public contract surface.
- The `(Recomendado)` suffix is Portuguese to match the existing localization convention (options are user-visible in the terminal).

## [3.6.0] - 2026-04-17

### Added
- **`.claude/hooks/dispatch-guard.cjs`** — new `PreToolUse:Skill` hook that intercepts LLM controllers invoking `Skill(<agent-leaf>)` when they meant `Agent(subagent_type: "pipeline-orchestrator:...:<agent-leaf>")`. Denies the call and returns a corrective message with the correct fully-qualified `subagent_type`. Prevents the Phase 0a stall where `Skill(task-orchestrator)` produced `Unknown skill: task-orchestrator` with no guidance on how to fix it.
- **`.claude/hooks/__tests__/dispatch-guard.test.cjs`** — BDD scenario suite (Given/When/Then format) with 7 scenarios and 20+ assertions covering: task-orchestrator deflection, all four folder classes (core, executor, type-specific, quality), legitimate third-party skills pass, plugin-namespaced skills pass, type-confusion guards, non-Skill tools ignored, corrective-message actionability.
- **`AGENT DISPATCH PROTOCOL`** section at the top of `commands/pipeline.md` — makes the dispatch contract visible before any flow instructions. Documents the correct `Agent(subagent_type: "pipeline-orchestrator:<folder>:<leaf>")` pattern with a table of common agent mappings, plus the three known wrong invocations (`Skill`, `SlashCommand`, missing prefix).
- **`hooks.json` PreToolUse:Skill matcher** wired to `dispatch-guard.cjs`.

### Fixed
- **Definitive fix for "Skill(task-orchestrator) → Unknown skill"** LLM-controller confusion observed in production use. Prior versions relied on agent-description prose like *"I'll use the task-orchestrator"* which LLMs occasionally interpreted as a Skill tool call. v3.6.0 addresses this with: (a) runtime hook that denies with actionable corrective message, (b) explicit AGENT DISPATCH PROTOCOL section at the top of the controller spec, (c) BDD test coverage proving the deflection works for all four agent folder classes.

### Notes
- No breaking changes. All existing Agent-tool invocations continue to work identically.
- MINOR bump 3.5.0 → 3.6.0: adds a new runtime hook capability + public protocol section. The AGENT_LEAF_TO_FQN table in `dispatch-guard.cjs` is the source of truth for the 37 agent mappings; adding/removing/moving an agent requires updating this table plus its regression-test entries.
- BDD format validation: each scenario reads as a behavioral specification. Assertions map 1:1 to Given/When/Then prose. No hidden steps.

## [3.5.0] - 2026-04-17

### Added
- **`references/audit-trail.md`** — extracted Phase Transition Summary block template + Gate Decision Log JSONL format (with 8 parse/sanitization rules) from `references/gates.md`. Definitions and operational mechanics now evolve independently. Resolves NAME-1 from v3.4.0 self-test.
- **Table of Contents** in `commands/pipeline.md` — 4-section orientation block with line anchors and reference-file mapping. Resolves QUAL-1 from v3.4.0 self-test.
- **Frontmatter exception doc** on `adversarial-review-coordinator.md` — documents why this `adversarial-*` agent is context-aware (dispatches zero-context children). Resolves ARCH-2 from v3.4.0 self-test per the glossary Agent Naming Convention.
- **`ref: v3.5.0`** field in `marketplace.json` source for pipeline-orchestrator — explicit git-tag pin for supply-chain safety. Partial resolution of SEC-B1-01 (other two plugins in the marketplace deferred).
- **Hook regression tests** expanded 54 → 73 assertions: corrupted-state WARN (RISK-2), `discoverStatePath()` happy path (TEST-1), suffix-match alias branch (TEST-2), extended type-confusion vectors (boolean, object with toString, nested array — SEC-B3-02 codification).

### Fixed
- **RISK-2**: `sentinel-hook.cjs` now emits `SENTINEL WARN` to stderr when the state file exists but cannot be parsed (partial write, concurrent-write race, corruption). Previously was silent fail-open. Still exits 0 for backwards compat.
- **SEC-1 (v3.5 round 2 self-fix)**: parse-error stderr WARN now uses `path.basename()` and the error `name` (e.g. `ParseError`) instead of the absolute path and full error message — avoids leaking secrets that could sit mid-rotation in a partial state file.
- **Test hygiene (QUAL-1 / SEC-3 v3.5)**: test 17 (`discoverStatePath` happy path) replaced a 50 ms busy-wait CPU spin with `fs.utimesSync` to set deterministic mtimes. Eliminates Windows NTFS mtime-granularity flake.
- **Test cleanup (QUAL-2 v3.5)**: `tempDir()` factory now registers a `process.on('exit')` handler that removes all `sentinel-hook-test-*` directories at the end of the run. Stops accumulating OS temp-dir debt across CI runs.
- **QUAL-1 / QUAL-2 (pipeline.md cleanup)**: CRITICAL REMINDERS consolidated from 25 items to 13 by grouping related invariants into 6 concern categories (Infrastructure, Process, Control flow, Review, Evidence, Sentinel). No invariant dropped.
- **CLAR-1 HOTFIX table contradiction**: the `User confirm` row for HOTFIX previously read `Auto-proceed` while the prose required a single emergency confirmation question. Row now reads `1 emergency-confirmation question only`.
- **DEAD-1**: HOTFIX row in the Phase 3b-pre recommendation table clarified with a note explaining that HOTFIX already reduces per-batch adversarial to 2 checklists.
- **ARCH-1 (v3.5 self-fix)**: "Controller-only writes" rule de-duplicated. Previously appeared in `gates.md`, `audit-trail.md`, AND `commands/pipeline.md`. Removed from `gates.md` (a definitions file should not host operational mechanics).
- **Controller self-label**: `PIPELINE CONTROLLER v3.4` → `v3.5` aligned with manifest version.
- **hooks.json SessionStart prompt**: `Pipeline Orchestrator v3.4.0 loaded` → `v3.5.0 loaded`.

### Changed
- **Doc structure:** `references/gates.md` is now definitions-only (Hardness Taxonomy + Gate Registry, 49 lines). Operational audit mechanics live in the new `references/audit-trail.md`. All Grep redirects in `commands/pipeline.md` updated to point at the correct file.
- **Inline Invariants scope (v3.4.0 SEC-1 extension):** now covers `references/audit-trail.md` alongside `references/gates.md` and `references/confidence.md`.
- `pipeline.md` grew from 909 to 938 lines net (+ToC, -consolidated reminders) but is materially more navigable.

### Notes
- No breaking changes. All existing `subagent_type` paths continue to work. Existing `gate-decisions.jsonl` format unchanged — the file moved between reference docs, not its schema.
- Version bump 3.4.0 → 3.5.0 (MINOR): adds new public reference file `references/audit-trail.md` consumed via Grep, plus documentation and test-coverage improvements. Backwards compatible.
- 15 deferred findings from v3.4.0 self-test addressed: 2 HIGH fixed (SEC-B1-01 partial, TEST-1), 6 MEDIUM fixed (RISK-2, QUAL-1, QUAL-2, CLAR-1, NAME-1, ARCH-2), 4 LOW fixed (DEAD-1, SEC-B3-02 codification, SEC-B3-03 review, partial others). Remaining LOW deferred to future releases.

## [3.4.0] - 2026-04-17

### Added
- **Inline Invariants block in `commands/pipeline.md`**: authoritative list of gate names + hardness that overrides any Grep-loaded content from `references/`. Closes SEC-1 from the v3.3.0 self-test (extraction refactor created an untrusted Grep-loaded surface).
- **`references/gates.md`**: SSOT for the Gate Hardness Taxonomy, the full 15-gate Registry, the Phase Transition Summary template, and the Gate Decision Log JSONL format with its 8 parse/sanitization rules. Extracted from `commands/pipeline.md`.
- **`references/confidence.md`**: SSOT for the confidence score calculation, scoring rules, per-phase update contract, and persistence format. Extracted from `commands/pipeline.md`.
- Glossary entries: `Zero-Context Agent`, `Agent Naming Convention` (adversarial-* ⇒ zero-context; executor-* ⇒ context-aware), and `Residual Risk: LLM Prompt Injection` (defense-in-depth rationale).
- `sentinel-hook.cjs` trust-assumption header comment documenting what the hook protects against and what is out-of-scope (expects controller to provide integrity tokens, file locking, etc.).
- Hook regression tests expanded 31 → 54 assertions: near-miss stdin inputs, type-confusion guards, string/number `schema_version` normalization, `AGENTS` constant block, `runHook` `opts.cwd` isolation.

### Fixed
- **SEC-3**: `sentinel-hook.cjs` now emits `SENTINEL WARN` to stderr on unknown `schema_version` instead of silently allowing. Backwards compatible (still exits 0). Operators now detect version mismatches and state-file corruption.
- **SEC-B3-01 (v3.4.0 self-fix)**: `schema_version` as JSON string (`"1"` vs `1`) no longer bypasses the version check. Normalized via `Number()`.
- **Type-confusion guard**: non-string `subagent_type` (numeric, array, object, null) no longer crashes the hook with `.startsWith()` on a non-string.
- **ARCH-002 (v3.3.0 self-test)**: `commands/pipeline.md` controller self-label `PIPELINE CONTROLLER v3.1` → `v3.3` → `v3.3`/v3.4 chain resolved; label now follows the manifest version.
- **ARCH-003 (v3.3.0 self-test)**: duplicate `Mode:` line in the `final-adversarial-orchestrator` OBSERVABILITY banner removed.
- **RISK-003 (v3.3.0 self-test)**: contradiction between the intensity table and Rule 3 in `final-adversarial-orchestrator.md` resolved — Rule 3 now tracks the table.
- **QUAL-2 (v3.3.0 self-test)**: `Step 2f` label (which lived inside Phase 3) renamed to `Step 3-pre`.
- **ARCH-2 (v3.4.0 self-fix)**: `Step 3b-post` renamed to `Step 3b-pre` because it runs BEFORE `Step 3b` (final-validator).
- **ARCH-1 / QUAL-1 (v3.4.0 self-fix)**: duplicated inline Gate Registry table in `pipeline.md` removed; the extracted SSOT in `references/gates.md` is now the single authoritative source.
- **ARCH-2 (v3.4.0 self-fix)**: dangling "Step 1c" cross-reference in `references/confidence.md` replaced with the step-name-independent "pre-decision validation step."
- **Stale threshold log text**: the stale-state warning previously said `threshold: 60s` but the constant was 300s; the text is now derived from the constant.
- **Test hygiene**: `process.chdir()` replaced with `spawnSync({ cwd })` in tests 6/7 — removes a global side effect that could leak across tests. Subagent type paths centralized in a frozen `AGENTS` constant object.

### Changed
- **Marketplace manifest**: `pipeline-orchestrator` source field `"./"` → pinned `{"source": "url", "url": "..."}` matching the other two plugins in the marketplace. Unpinned ref (commit SHA pinning) is deferred — consistent with marketplace convention.
- **Intensity table in `final-adversarial-orchestrator.md`**: headers translated from mixed PT/EN to pure English (`Disponível`/`Recomendação`/`Intensidade` → `Available`/`Recommendation`/`Intensity`).
- **Trust model (SEC-2)**: `sentinel-hook.cjs` header now documents explicit trust assumption on `sentinel-state.json` and the controller-level mitigations that are out-of-hook-scope. No runtime change; documentation-only.

### Notes
- No breaking changes. Existing pipelines and `subagent_type` paths continue to work. The Grep-redirect pattern in `commands/pipeline.md` means LLM controllers running the skill now perform one extra grep per gate/confidence lookup — negligible at these file sizes.
- `commands/pipeline.md` reduced from 999 → 909 lines (-9%). Remaining size largely comes from the 4-phase flow spec, CRITICAL REMINDERS, and output format templates — extracting those would require coordinated test updates and is deferred.
- Version bump 3.3.0 → 3.4.0 (MINOR): adds new public reference files (`references/gates.md`, `references/confidence.md`) consumed by Grep, plus backwards-compatible hook hardening. Nothing existing was renamed or removed in a breaking way.

## [3.3.0] - 2026-04-17

### Added
- **ARCH-003 / ADV-001**: New `adversarial-quality-reviewer` agent (`pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer`). Context-independent (ZERO prior context) quality-focused reviewer for maintainability, clarity, testability, dead-code detection, and naming. Paired with `adversarial-security-scanner` and `adversarial-architecture-critic` in the `final-adversarial-orchestrator` trio.
- Regression test suite at `.claude/hooks/__tests__/sentinel-hook.test.cjs` — 14 test cases / 31 assertions codifying the public contract of `sentinel-hook.cjs` (bootstrap whitelist, state-file divergence, circuit breaker, stale-state detection, new-agent routing). No external dependencies; runs under vanilla Node.

### Fixed
- **ADV-002**: `final-adversarial-orchestrator` no longer delegates to per-task / per-batch reviewers (`adversarial-batch`, `architecture-reviewer`, `executor-quality-reviewer`) which run WITH context. The three final-review slots now point to the three context-independent adversarial scanners: `adversarial-security-scanner`, `adversarial-architecture-critic`, `adversarial-quality-reviewer`. This eliminates the silent dependency on external-plugin agents (e.g., `code-review:code-reviewer`) that was observed in v3.2.1 when the LLM controller improvised to fill the missing quality slot.
- Architecture diagram in `commands/pipeline.md` updated to name the three final-review agents explicitly.

### Changed
- README Project Structure tree now shows `type-specific/` as 17 domain expert agents (was 16) and documents the four adversarial specialists (coordinator + security + architecture + quality).

### Notes
- No breaking changes. Existing pipelines continue to work. The new agent is only invoked by `final-adversarial-orchestrator`; per-batch review flows are unchanged.
- `sentinel-hook.cjs` source was not modified in this release — the root cause of the v3.2.1 `PreToolUse:Agent` blocked spawns was the spec depending on agents that did not exist, not the hook itself. The hook's narrow scope (intercepting only `pipeline-orchestrator:*` agents) is preserved as intentional.

## [3.2.1] - 2026-04-17

### Fixed
- **ARCH-002**: Corrected ambiguous executor agent count in README Project Structure tree. Line 254 now reads `# 5 + feature-implementer (type-specific/)` instead of `# 6 execution agents`, accurately reflecting that `feature-implementer.md` lives under `executor/type-specific/` for pipeline reuse rather than as a standalone executor.
- **DOC-003**: Aligned README `core/` tree with filesystem — added missing `adversarial-batch` entry (8/8 agents now listed).
- **DOC-004**: Aligned README `quality/` tree with filesystem — removed misplaced `adversarial-batch` (it lives in `core/`), added missing `final-adversarial-orchestrator` (7/7 agents now listed).
- **DOC-005**: Bumped README version badge from `version-3.2.0-blue` to `version-3.2.1-blue` to match the manifest version.

### Documentation
- Added missing release date to the `[3.2.0]` CHANGELOG entry per Keep a Changelog 1.1.0.

## [3.2.0] - 2026-04-16

- Initial public release tracked in this changelog. See git history for prior changes.
