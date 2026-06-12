# Spec: Claude Code Loop Hardening

Status: DRAFT for implementation in Claude Code Go mode
Owner: FX Studio AI
Repository: `fernandoxavier02/Pipeline-Orchestrator`
Target runtime: Claude Code by Anthropic
Date: 2026-06-12

## Purpose

This spec converts the June 2026 audit findings into an executable implementation plan for the Pipeline Orchestrator plugin. The correction is explicitly for Claude Code. Codex is not the target runtime for this remediation. Any Codex-named file touched during implementation must be treated only as a compatibility mirror or shared-library consumer, never as the source of product behavior.

The goal is to make the plugin safe, coherent, installable, updateable through the Claude Code marketplace, and available globally on the current machine for use in any Claude Code project.

## What must be fixed

The implementation must address these audit areas:

1. Version and release contract drift across `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, README, hooks, prompts and runtime exports.
2. Hook registration and packaging drift between `.claude/settings.json`, `hooks/hooks.json`, `.claude/hooks/*` and marketplace installation behavior.
3. Sentinel integrity gap: `sentinel-state-signer.cjs` exists but is not currently the enforced read/write path for `sentinel-state.json`.
4. Controller permissions drift: Claude Code agent prompts must not claim a tool is absent while frontmatter grants it.
5. Claude Code session-lock coverage gaps for slash commands and thin skills.
6. Gate decision vocabulary mismatch, especially documented non-canonical decisions that would fail the writer.
7. JSONL audit writer consistency and concurrency safety.
8. Test runner coverage gaps, including unit, compatibility, regression, hooks, packaging and watchdog tests.
9. Release process: GitHub publication, marketplace metadata update, tag or ref update, and local/global Claude Code plugin availability.
10. Watchdog verification that proves the pipeline executed according to this spec and did not silently skip key hardening gates.

## Loop Engineering context

This remediation must be implemented as a controlled engineering loop, not as a one-shot prompt.

For every group of tasks:

1. Establish acceptance behavior with ATDD.
2. Establish domain language and invariants with DDD.
3. Establish user-facing and runtime behavior with BDD.
4. Add failing tests first with TDD.
5. Implement the smallest change that makes the tests pass.
6. Run the group test suite.
7. Run an adversarial review in isolation.
8. If the adversarial review finds issues, send the findings back to the implementer or bugfix agent.
9. Repeat review and fix until clean.
10. If the third adversarial loop still finds issues, stop the current approach and create a new approach before continuing.

This is the core engineering loop:

```text
spec -> tests -> implementation -> local validation -> adversarial review -> fix loop -> watchdog -> release
```

The loop must not be infinite. The maximum is three fix loops per group. On the third failed review, the agent must change strategy, not keep patching the same shape.

## Files in this spec

- `requirements.md` defines mandatory behavior and acceptance criteria.
- `design.md` defines the target architecture and runtime decisions for Claude Code.
- `tasks.md` defines explicit implementation groups, each with ATDD, TDD, DDD, BDD and adversarial loop requirements.
- `watchdog-release-checklist.md` defines final validation, GitHub publication, marketplace update and global Claude Code availability checks.

## Non-goals

The following are explicitly outside the core scope:

- Rebuilding the plugin around Codex.
- Changing product behavior for Paperclip beyond keeping references consistent where needed.
- Removing existing Claude Code slash commands unless a command is provably broken and replaced by a compatible alias.
- Publishing to external package registries unless the existing release process already requires it.
- Making destructive local changes to the user's global Claude Code setup without backup and verification.

## Implementation rule for Claude Code

The implementing agent must treat Claude Code as the runtime source of truth.

Use these names consistently:

- Product/runtime: Claude Code by Anthropic.
- Plugin marketplace files: `.claude-plugin/*`.
- Runtime hooks: `.claude/hooks/*` and whichever manifest Claude Code actually consumes.
- Local global availability: the installed Claude Code plugin or marketplace cache visible to all projects on this machine.

Do not rename the product to Codex. Do not make Codex-specific behavior the primary test target. Shared libraries may retain compatibility tests only when they support Claude Code behavior.

## Final expected outcome

At the end of implementation:

1. The repo has a coherent version and marketplace contract.
2. Claude Code installs and runs the plugin with all security hooks active.
3. Sentinel state cannot be silently neutralized by unsigned or tampered state in strict mode.
4. Gate logs and protocol logs are serialized through a single safe writer with concurrency protection.
5. Session lock and edit protection cover every supported Claude Code entry point.
6. Tests cover unit, regression, hooks, compatibility, packaging and watchdog execution.
7. The marketplace metadata points to the released ref so users receive the update.
8. The local repository on drive D is reflected in the global Claude Code installation for use in any project on the computer.
9. The final watchdog proves that the implementation followed the engineering loop rather than bypassing it.
