# Batch 6 To-Do (carry-overs from earlier batches)

## From Batch 4 architecture review (F5)

- **CRITICAL — backward compatibility for `.kiro/specs/<feature>/`**: v5.1.0 repoints all spec-* paths to `pipeline-runs/<run_id>/01-spec/`. This is a breaking change under a minor bump.
  - Decision needed in Batch 6: (a) bump to v6.0.0, OR (b) add deprecation period with fallback support, OR (c) ship migration doc + accept the breakage as a documented v5.1 behavior change.
  - Recommended: (c) — write `docs/migration-v5.0-to-v5.1.md` describing how to either copy `.kiro/specs/<feature>/` into a new `pipeline-runs/<NNN>-<slug>/01-spec/`, OR restart from `/pipeline-orchestrator:brainstorm`. Add deprecation note to README v5.1 release notes.
