# Migration Guide: v3.x → v4.0.0

## Summary of change

v4 moves pipeline orchestration into an isolated `pipeline-controller` agent. The main LLM loses the ability to bypass the pipeline — it literally cannot Edit/Write code during an active session (blocked by hook).

## User-visible changes

| What | v3.8 | v4.0 |
|------|------|------|
| Invocation | `/pipeline-orchestrator:pipeline [task]` | **Unchanged** |
| Main LLM can Edit during session | Yes | **No (blocked)** |
| Pipeline phases always run | Usually (bypass possible) | **Always (enforced)** |
| Token cost for trivial tasks | Low (bypass) | Higher (full pipeline) |
| Token cost for complex tasks | High | Similar (disk offload of N2 outputs) |

## If you want to edit outside pipeline during session

Options:
1. Wait for TTL (2h default)
2. Delete `.pipeline/sessions/{session_id}.lock` manually
3. Run a new Claude Code session (locks are per session_id)

## Rollback

```bash
# Revert to v3.8.0
cd ~/.claude
plugins remove pipeline-orchestrator
plugins install pipeline-orchestrator@3.8.0
```

Or swap the fork back to the cache version manually.

## Known issues in v4.0.0-draft.1

- Context exhaustion recovery (Phase 2 → checkpoint → resume) is designed but not battle-tested. Report issues if `/pipeline continue` fails to resume.
- Hook fail-safe: if `session-lock-hook.cjs` fails, the session proceeds WITHOUT lock (degraded mode). Not a security issue — it's UX degradation only.
- REVIEW-ONLY mode (`/pipeline review-only`) currently requires an explicit file list argument — v4 controller does not have Bash/git access to auto-detect uncommitted files. See `tests/test_pipeline_controller.md` Known Limitations for details.

## Compatibility with N2 agents and references

All 37 N2 agents and all `references/*.md` are unchanged. If you've customized any, your edits carry over.

## Known cooperative limitation (v4.0.0-draft.2, F-001)

Starting with `4.0.0-draft.2`, the `edit-guard-hook` supports **exec-window cooperative authorization**: when `pipeline-controller` spawns an N2 executor agent that needs to Edit/Write production code outside `.pipeline/`, it first writes a short-lived `.pipeline/sessions/{session_id}.exec-window` file. The hook then allows those edits for that session while the window is active.

This is **cooperative authorization, not cryptographic protection**:

- A compromised or misaligned main LLM could technically create the exec-window file itself and authorize its own edits — the hook has no way to distinguish "controller-spawned executor" from "main LLM impersonating an executor."
- Mitigations are user-visible, not hook-enforced:
  - **Short TTL (30 min)** auto-closes stale windows.
  - **Human-readable contents** (`purpose`, `spawning_agent`, timestamps) appear in `git diff` during review.
  - **Audit trail**: every `EXEC_WINDOW_OPEN` / `EXEC_WINDOW_CLOSE` is appended to `.pipeline/gate-decisions.jsonl`.
- **Integrity relies on user diff review**, not on the hook. If you see an unexpected `*.exec-window` file in a diff, treat it as a red flag.

This is a deliberate v4 trade-off: strict hook-level enforcement would require signing (keys, verification, key management) that Claude Code does not currently expose to plugin hooks. The cooperative model is sufficient for honest-agent workflows; a future version may add signing once the platform supports it.
