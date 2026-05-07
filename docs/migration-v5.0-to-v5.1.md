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

---

## Addendum (Unreleased) — Phase 1.5 trigger reconciliation

Originally introduced in v4.17.0 and reconciled in the upcoming patch (Achados 1-6). If your scripts or wrappers depended on the v4.16.0-era trigger ("plan-mode runs only on COMPLEXA or `--plan`"), there are subtle behavior changes you should know about.

### What's the canonical rule now

`Plan-mode runs automatically when (complexity in {MEDIA, COMPLEXA} OR type == Spec) AND --no-plan is NOT in args; on COMPLEXA the --no-plan override is logged but ignored.`

The string above is also stored in `tests/fixtures/phase-1-5-trigger.canonical.txt` and asserted against 5 surfaces by `tests/contracts/phase-1-5-trigger-string.test.cjs` on every CI run. If you fork or extend the plugin and edit the trigger anywhere, run that test to catch drift.

### v4.16.0 vs v4.17.0+ vs current behavior

| Invocation | v4.16.0 | v4.17.0 | Current (Achados 1-6 reconciled) |
|---|---|---|---|
| `/pipeline "small bug"` (SIMPLES) | skip plan | skip plan | skip plan |
| `/pipeline "medium feature"` (MEDIA) | **skip plan** | plan runs | plan runs |
| `/pipeline "medium feature" --no-plan` (MEDIA) | skip plan | skip + log justification | skip + log justification |
| `/pipeline "complex refactor"` (COMPLEXA) | plan runs | plan runs | plan runs |
| `/pipeline "complex refactor" --no-plan` (COMPLEXA) | skip plan | **plan runs anyway** + log override | plan runs anyway + log override |
| `/pipeline "draft a spec"` (Spec, SIMPLES) | skip plan | skip plan | **plan runs (NEW)** |
| `/pipeline "draft a spec" --no-plan` (Spec, SIMPLES) | skip plan | skip plan | skip + log justification |

### One concrete before/after example

**Before (v4.16.0 era):**
```
$ /pipeline-orchestrator:pipeline "refactor payment processor" --no-plan
# COMPLEXA classification → --no-plan honored → no plan-architect dispatch
# (No TRACE entry; the flag was treated as if the user said "skip planning")
```

**After (v4.17.0+ / current):**
```
$ /pipeline-orchestrator:pipeline "refactor payment processor" --no-plan
# COMPLEXA classification → --no-plan parsed but ignored → plan-architect runs
# TRACE.md gets a "Plan Mode" section:
#   plan_mode_skipped: false
#   plan_override_attempted: true
#   justification: <user's input when prompted>
```

If your script relied on `--no-plan` actually skipping planning at COMPLEXA, you have two options:

1. **Reclassify as MEDIA.** If the task isn't truly COMPLEXA, force `--media` and `--no-plan` together. The flag is honored at MEDIA.
2. **Accept the override semantics.** Plan runs in ~15-30s as a read-only research pass. The cost is small and the audit trail is more honest.

### Achado 7 caveat

The `type == Spec` cell in the matrix above is documented but not yet wired into the runtime classifier. See `docs/findings/achado-7-subagent-runtime.md` for the architectural blocker. In practice, the spec workflows (spec-light, spec-heavy, spec-audit-only) already classify their work as type=Spec, so the new behavior is reachable through those paths.

### How to find drift if you maintain a fork

Run `node --test tests/contracts/phase-1-5-trigger-string.test.cjs` after any edit to:
- `agents/core/pipeline-controller.md` (Phase 1.5 section + TRACE Plan-mode block)
- `commands/pipeline.md` (TOC, ASCII overview, Phase 1.5 detail)

The test fails fast with the offending surface name and a diff. There are 8 assertions across 5 surfaces.
