---
name: unblock
description: Read-only diagnostic for when a pipeline run is stuck or a hook blocked an action. Reads the real run state and prints (1) what is blocking, (2) the single next action, and (3) the safe cleanup command if a marker is genuinely orphaned. NEVER mutates state or disables enforcement. Invoked via `/pipeline-orchestrator:unblock`.
disable-model-invocation: true
allowed-tools: Bash, Read
argument-hint: (none)
---

# unblock — diagnostic for a stuck pipeline run

Use when a pipeline hook blocked an action (`INLINE_WORK_BLOCKED`, `DISPATCH_PENDING`, `PIPELINE_NOT_ARMED`, ...) OR a run appears stuck and the next step is unclear. This skill prints an honest, read-only diagnosis and the SINGLE next action — it never edits state, forces a close, or turns off enforcement.

## What to do

Run the diagnostic script from the project root (it discovers the active run via `PIPELINE_DOC_PATH` > `.pipeline/active-run.json` > newest-mtime fallback):

```
node scripts/unblock-diagnose.cjs
```

Then follow the `Next action:` line LITERALLY. That line comes from `lib/next-action.cjs::resolveNextAction` — it is the one executable exit for BOTH readers: a parent (which has the Agent tool) and a dispatched subagent (which does not, per Achado #7, so it emits a `DISPATCH_REQUEST` block instead).

## What NOT to do

- **Do NOT hand-edit `sentinel-state.json` or any signed state file.** A signature mismatch makes the hooks fail CLOSED (corrupt state) and deepens the block.
- **Do NOT disable enforcement** (`PIPELINE_*_ENFORCEMENT=warn`, deleting markers, forcing a close) to slip past a block. If the diagnosis shows a genuinely orphaned marker past its TTL, the script prints the exact safe-cleanup command — run THAT, nothing else.
- **Do NOT end your turn just to "wait"** when the diagnosis says a dispatched subagent is in flight (a legitimate background wait — the Stop gate exempts it). Stay in the turn so the dispatch result is received and processed.

## If the script says "no active run"

You are likely blocked by an orphaned `pipeline-arm-pending` marker (`PIPELINE_NOT_ARMED`). It expires by TTL (~30min) or on the next SessionStart cleanup; no code action is required. The operator may run the marker cleanup the script suggests if urgent.

## Reference

- Diagnostic logic: `scripts/unblock-diagnose.cjs`.
- Next-action resolver: `lib/next-action.cjs::resolveNextAction`.
- Live-pending + TTL agreement with the hooks: `.claude/hooks/edit-guard-hook.cjs` (`findLivePendingBlock`, `resolveHandshakeTimeoutMs`).
