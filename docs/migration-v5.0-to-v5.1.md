# Migration v5.0 → v5.1

## What changed

v5.1.0 introduces the `/pipeline-orchestrator:brainstorm` command and the `pipeline-runs/<NNN>-<slug>/` per-run directory. The 3 spec workflows (spec-light, spec-heavy, spec-audit-only) no longer read from `.kiro/specs/<feature>/`. They now read from `pipeline-runs/<run_id>/01-spec/`.

## Migration path for existing v5.0 users with .kiro/specs/

You have two options:

### Option 1 — Continue with brainstorm (recommended)
Restart the lifecycle from the new command. The brainstorm workflow generates a fresh spec under `pipeline-runs/<run_id>/01-spec/`:

```
/pipeline-orchestrator:brainstorm "<your task description>"
```

### Option 2 — Lift existing .kiro/specs into a prep run
If you have valuable spec content in `.kiro/specs/<feature>/` and want to preserve it:

```bash
# Allocate a fresh run-dir manually
mkdir -p pipeline-runs/001-<your-slug>/01-spec
mkdir -p pipeline-runs/001-<your-slug>/{00-brainstorm,02-validations,03-execution,attachments}

# Copy spec artifacts
cp .kiro/specs/<feature>/{spec.json,requirements.md,design.md,research.md,tasks.md} \
   pipeline-runs/001-<your-slug>/01-spec/

# Initialize manifest.yaml (use the schema from lib/run-manifest.cjs)
# ... populate manifest.yaml ...

# Resume the brainstorm workflow at step-08 (handoff)
/pipeline-orchestrator:brainstorm --resume 001-<your-slug>
```

Note: `.kiro/specs/<feature>/` content remains on disk after migration — the plugin no longer reads it but does not delete it.

## Why the change

- **Self-sufficiency**: v5.1 plugin no longer depends on the external Kiro skills installation. All 8 spec lifecycle skills are now cloned inside the plugin.
- **Per-run isolation**: each pipeline invocation gets its own directory with full audit trail (brainstorm → spec → validations → execution → final report) in one place.
- **Consistent path schema**: `pipeline-runs/<NNN>-<slug>/` is plugin-canonical. Removed the dependency on user's home `.kiro/` layout.

## Breaking change disclosure

Per strict SemVer, this is a breaking change to the path contract that arguably warrants a major version bump (v6.0.0). The decision to ship under v5.1.0 was made because:
- Existing `.kiro/specs/<feature>/` directories remain intact (no deletion, no auto-migration).
- The breakage manifests only when invoking the spec workflows — and even then, the failure is graceful (file-not-found error rather than data corruption).
- A clean migration path exists (above).

If you discover a corruption scenario this doc didn't anticipate, file a bug.
