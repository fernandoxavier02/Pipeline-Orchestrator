# Changelog

All notable changes to the pipeline-orchestrator plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
