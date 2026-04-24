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
