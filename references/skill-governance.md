# Skill Governance — Pipeline-Orchestrator

> **SSOT** for skill lifecycle rules within the Pipeline-Orchestrator plugin: semver policy for skills, lockstep between Claude and Cursor manifests, progressive disclosure for long skills, allowed-tools format guidance, and the audit log of patterns adopted from external sources. Introduced in v7.4.0.

> v8.20.0-glm port: references to `langfuse/skills` patterns below are historical — they document what was adopted from that ecosystem at v7.4.0. The Langfuse Cloud integration itself was removed from this port; the patterns adopted from observing `langfuse/skills` (progressive disclosure, separate manifests, etc.) remain in force.

This document is kept **separate from `CLAUDE.md`** so that general engineering rules and skill-specific lifecycle rules live in distinct documents. `CLAUDE.md` carries a short pointer to this file from its top-level table of contents; the operational detail lives here.

This is a governance document — it does **not** add a new gate to the 24-row Mandatory Gates table in `references/gates.md`. Enforcement is structural: contributors and review agents read these rules and emit verdicts via existing checkpoints (`SCOPE_LOCK_CHECK`, `DIFF_DISCIPLINE`, `ARCHITECTURE_REVIEW`, `CHANGE_CONTRACT`).

---

## Semver Policy for Skills

The plugin follows SemVer at the `plugin.json` level. Skill-level changes map onto that envelope as follows:

| Change to a skill | Plugin bump |
|---|---|
| Typo fix, prose clarification, formatting | **patch** (`x.y.Z`) |
| New example added, sequence_lock reordered without contract change | **patch** |
| New skill added (new entry-point) | **minor** (`x.Y.0`) |
| New required tool added to `allowed-tools` | **minor** (existing callers keep working; new behavior is additive) |
| Skill body restructured via progressive disclosure (split into `references/<topic>.md`) | **minor** when the public sequence_lock stays the same; **major** when callers must change how they invoke the skill |
| Skill removed, renamed, or its sequence_lock changes in a way callers must adapt to | **major** (`X.0.0`) |
| Skill `agent_type` swapped (e.g., `Skill` → `Agent`) | **major** |
| Lockstep bump (see below) when one manifest bumps but the other was untouched in this release | **same bump as the leading manifest** |

The same scale applies to references files that skills depend on: a contract change to `references/gate-request-protocol.md` is a **major** event because every subagent that emits `GATE_REQUEST` is bound by that contract.

## Lockstep Rule between Manifests

Two plugin manifests ship in this repository:

- `.claude-plugin/plugin.json` — consumed by the Claude Code marketplace and runtime.
- `.cursor-plugin/plugin.json` — consumed by the Cursor channel.

**Rule:** both manifests **must carry the same `version` field at all times.** A release that bumps one without bumping the other is a contract violation and will be rejected by the `F1-S4` regression test (`tests/regression/v7.4.0/F1_skill_governance.cjs`).

**Procedure:**

1. The release engineer decides the target version in `CHANGELOG.md`.
2. The version field is bumped in **both** manifests in the same commit (or in two adjacent commits in the same batch).
3. The `version_sync` regression test (`tests/regression/v7.2.0/F7_version_sync.cjs` and its v7.4.0 successor) verifies that `package.json`, `marketplace.json`, both `plugin.json` files, and the canonical-version row in `CLAUDE.md` are aligned.
4. If a Cursor-only or Claude-only patch is ever needed (e.g., Cursor channel ships a tooling-specific fix), the lockstep rule still applies — both files bump together; the unchanged channel just carries an empty changelog entry for that version.

Rationale: a single SemVer line lets downstream consumers reason about the plugin as one artifact regardless of which channel they install through, and prevents marketplace drift of the kind that produced the 97-commit gap healed in v4.1.3.

## Progressive Disclosure Pattern

A skill (or a referenced doc) becomes hard to maintain — and hard for a subagent to read selectively — past a certain size. The rule of thumb:

- If a `SKILL.md` body exceeds **~250 lines** OR covers more than **2 distinct axes** (e.g., "what the skill does" + "how it logs telemetry" + "how it interacts with sentinel"), split it.
- Keep the **entry-point** (`SKILL.md`) thin: identity, sequence_lock, dispatch table, gates_at, sentinel_checkpoints, pointers to detail files.
- Push the detailed prose into `references/<topic>.md`. Each topic file owns one axis: contract, protocol, examples, recovery, telemetry, etc.
- Subagents can then `Grep` the entry-point cheaply and pull only the topic files they actually need, preserving context budget.

This is the same pattern adopted from `langfuse/skills`: their long skills ship as a thin manifest plus a `docs/` sub-tree. The v7.4.0 batch is the first wave of adoption inside this plugin; subsequent batches will migrate skills that currently exceed the 250-line threshold (tracked in the adoption log below).

## Allowed-Tools Guidance

Skill frontmatter declares the tools the skill may invoke. Two forms are valid:

- **Scalar form** — `allowed-tools: Read` or `allowed-tools: "Read, Grep, Glob"` — a single string with comma-separated tool names. Used by thin entry-point skills that mainly dispatch to a single agent or run a single read pattern.
- **YAML list form** — `allowed-tools: ["Read", "Grep", "Glob", "Edit"]` — explicit array. Used by substantive skills that mix multiple tool patterns and benefit from a one-per-line audit view.

**Choice criterion:** use scalar for thin dispatchers (one or two tools, single role) and the list form for skills with three or more tools or with role-specific tool sets that maintainers should read line-by-line.

**Do not normalize for the sake of normalization.** Switching every existing skill from scalar to list, or vice-versa, in a single sweep is exactly the kind of `unrelated_refactor` that `references/implementation-discipline.md` forbids. Pick the form that fits the skill role; leave the rest alone unless that specific skill is already being touched for an unrelated reason.

## Pattern Adoption Tracking

This section is the audit log of patterns imported from external skill ecosystems. Each row records what was adopted, what was deliberately deferred or skipped, and the rationale. The expectation is that this log grows over time and is reviewed during major releases.

### v7.4.0 — `langfuse/skills` survey

| Pattern observed in langfuse/skills | Decision | Rationale |
|---|---|---|
| Thin `SKILL.md` + `references/<topic>.md` progressive disclosure | **Adopted** | Matches our context-budget pressure; will be applied to skills above the 250-line threshold in subsequent batches. |
| Separate Cursor and Claude plugin manifests in the same repo | **Adopted** | This release creates `.cursor-plugin/plugin.json` as a lockstep mirror of `.claude-plugin/plugin.json`. |
| Standalone `references/skill-governance.md` outside `CLAUDE.md` | **Adopted** | This very document. |
| Scalar `allowed-tools` for short skills, list form for long skills | **Adopted** as guidance | See "Allowed-Tools Guidance" above; no forced normalization. |
| Skill-level changelog files (`skills/<name>/CHANGELOG.md`) | **Deferred** | Our plugin uses a single root `CHANGELOG.md`; introducing per-skill changelogs is a structural change that needs its own discussion and migration. Will revisit when a skill is ported across plugin boundaries and its history matters in isolation. |
| Per-skill semver pin (skill declares its own `version` independent of plugin) | **Skipped** | Adds a second axis of versioning without a current consumer demand. Plugin-level SemVer is sufficient until two consumers need to pin specific skill versions. |
| Auto-generated skill index page | **Deferred** | Useful but cosmetic; out of scope for v7.4.0. Tracked for a future docs-only minor release. |

## When to Bump

Decision tree for picking the version bump on a release:

1. **Did any skill or referenced contract file change in a way callers must adapt to?** → **major**.
2. **Was a new skill added, a new tool added to an existing skill's `allowed-tools`, or a new gate row added to `references/gates.md`?** → **minor**.
3. **Was the change limited to prose, comments, formatting, telemetry hygiene, examples, or test fixtures?** → **patch**.
4. **Did only one of the two `plugin.json` files bump?** → align the other to the same number in the same release (lockstep rule above). There is no scenario where the two manifests legitimately diverge.
5. **Is this a license-only change?** → still a **major** per SemVer convention even if no code changes (precedent: v7.0.0 PolyForm Shield 1.0.0 bump).

When in doubt, prefer the larger bump — a too-large bump is harmless to consumers; a too-small bump that hides a breaking change is a contract violation.
