# Migration Guide: v4.x → v5.0

> **Status (2026-05-06, plugin v4.15.0):** v5.0 is **not yet released**. This guide documents the consolidated v4 lineage (v4.0 → v4.14), the breaking changes accumulated along the way, and the 7 Definition-of-Done criteria that gate v5.0. Use it today to upgrade between v4 minors and to understand what is still pending before v5.0 ships.
>
> See also: [`docs/v5-readiness-report.md`](./v5-readiness-report.md) for the per-criterion gap analysis.

---

## 1. Why this guide exists

v3 → v4 was a single hard cutover (orchestration moved from `SKILL.md` to an isolated `pipeline-controller` agent; main LLM lost Edit/Write during pipeline sessions). That migration is documented in [`docs/MIGRATION-v3-to-v4.md`](./MIGRATION-v3-to-v4.md) and remains valid.

v4 → v5 is **not** a single cutover. Between `v4.0.0` (2026-04-23) and `v4.14.0` (2026-05-06) the plugin shipped 28 releases that progressively added the foundation v5.0 will sit on top of: workflow imports from Pulsar, hook enforcement, the spec lifecycle, and a compat regression net. v5.0 itself flips the marketing label and turns on TRACE.md by default — but the technical heavy-lifting is already on `main`.

This guide is the consolidated map.

---

## 2. v4 lineage (v4.0 → v4.14) at a glance

| Version | Date | One-line theme |
|---------|------|----------------|
| `4.0.0-draft.1` | 2026-04-23 | Orchestration moved to `pipeline-controller` agent; main LLM blocked from Edit/Write during pipeline sessions |
| `4.0.0-draft.2` | 2026-04-24 | `edit-guard-hook` adds exec-window cooperative authorization (F-001) so N2 executors can write production code |
| `4.0.0-rc.1/.2` | 2026-04-24 | Atomic `tmp+rename` lock writes; `lstat` symlink defense on cleanup |
| `4.1.0` → `4.1.3` | 2026-04-26 → 2026-04-29 | Cold-start fix; exec-window pairing/TTL hardening; mtime-based liveness (LLM clock-skew immunity) |
| `4.2.0` → `4.2.1` | 2026-04-30 | Thin entry-point commands (`/bugfix`, `/feature`, `/userstory`, `/audit`, `/ux`); SEC-1+SEC-2 patches |
| `4.3.0` → `4.3.1` | 2026-05-01 | `/bugfix` migrated `commands/` → `skills/<name>/SKILL.md` (idiomatic format) |
| `4.4.0` → `4.4.1` | 2026-05-01 | **Slice 1.5** — Pulsar bugfix workflow imported as `bugfix-light` (8 steps) + `bugfix-heavy` (11 steps); exec-window Node wrapper |
| `4.5.0` | 2026-05-02 | **Slice 3a** — Pulsar audit workflow imported as `audit-light`/`audit-heavy` (9 steps each); report-only Iron Law |
| `4.6.0` → `4.6.1` | 2026-05-03 | **Slice 3b** — Pulsar feature workflow imported (single-skill-with-mode-flag in `4.6.0`, **REVERTED** in `4.6.1` to two skills `feature-light` + `feature-heavy` mirroring Pulsar 1:1) |
| `4.7.0` | 2026-05-03 | **Slice 3b polish** — frontmatter contract on all 26 step files; `/feature` thin entry-point; real workflow tests |
| `4.8.0` | 2026-05-03 | **Hook enforcement** — `skill-frontmatter-parser.cjs` shared module enforces `sequence_lock`/`gates_at`/`agent_type`/`sentinel_checkpoints` via 3 hooks (warn → deny rollout) |
| `4.9.0` → `4.9.2` | 2026-05-04 → 2026-05-04 | **Spec workflow Wave 2** — `spec-light` (6 steps) + `spec-heavy` (9 steps) + `spec-audit-only` (5 steps); FQDN drift correction; CI debt unblock |
| `4.10.0` | 2026-05-05 | **Wave 3** — Compat baselines graduated TEMPLATE → REAL for 5 fixtures |
| `4.11.0` | 2026-05-05 | **Wave 3-spec** — `type=Spec` first-class classification; 4-signal detection; AC-seeded ATDD |
| `4.12.0` | 2026-05-05 | **Wave 4-spec** — `/spec` thin entry-point + 3 pipeline composition refs |
| `4.13.0` | 2026-05-05 | **Wave 5-spec** — 6 spec gates added to registry (16 → 22); Inline Invariants 15 → 21; `mode_used` persistence |
| `4.14.0` | 2026-05-06 | **Wave 6-spec** — Integration tests (4 → 12); compat fixture for spec-heavy; 3 bad-variant spec fixtures |
| `4.15.0` | 2026-05-06 | **Wave 7-spec (this release)** — docs-only: this MIGRATION guide + `v5-readiness-report.md` |

Full per-release detail in [`CHANGELOG.md`](../CHANGELOG.md).

---

## 3. Breaking changes accumulated since v3 (still relevant in v4 → v5)

These were locked-in at v4.0 and have **not** been relaxed since. They will **carry into v5.0 as-is** unless explicitly noted.

| # | Behavior change | First introduced | User-visible impact |
|---|-----------------|------------------|---------------------|
| 1 | Main LLM cannot Edit/Write outside `.pipeline/**` during a pipeline session | `4.0.0-draft.1` | Direct edits during a `/pipeline*` session are blocked by `edit-guard-hook`. Workaround: TTL expiry (2h default) or new session. |
| 2 | `MultiEdit` now also matched by edit-guard | `4.0.0-draft.2` | Scripts that bypassed v4.0 by using `MultiEdit` instead of `Edit/Write` no longer work. |
| 3 | exec-window cooperative authorization required for N2 production writes | `4.0.0-draft.2` | Custom controllers must write `.pipeline/sessions/<id>.exec-window` + paired `EXEC_WINDOW_OPEN` audit entry before spawning executor agents that touch production code. |
| 4 | exec-window TTL hard-capped at 60 min, default 5 min | `4.1.0` | Pre-`4.1` exec-windows with `ttl_minutes > 60` are rejected on read. |
| 5 | exec-window liveness uses filesystem `mtimeMs` | `4.1.3` | LLM-fabricated `opened_at`/`expires_at` are advisory only. Custom callers writing `ttl_minutes` is the supported path. |
| 6 | All entry-point commands (`/pipeline`, `/bugfix`, `/feature`, `/userstory`, `/audit`, `/ux`) trigger session-lock | `4.2.0` | Foreign plugins with a colliding `/audit` or `/ux` no longer hijack pipeline-orchestrator session locks (SEC-2 patched in `4.2.1`). |
| 7 | `/bugfix` command path moved `commands/bugfix.md` → `skills/bugfix/SKILL.md` | `4.3.0` | User invocation is unchanged (`/pipeline-orchestrator:bugfix`). External tooling that grepped `commands/bugfix.md` must update path. |
| 8 | `pipeline_variant` enum extended with bugfix/audit/feature/spec light & heavy variants | `4.4.0` (bugfix), `4.5.0` (audit), `4.6.1` (feature), `4.11.0` (spec) | Custom forks that hard-coded the v3 variant list need to extend their dispatch table. |
| 9 | Hook enforcement of SKILL.md frontmatter | `4.8.0` | Skills missing `sequence_lock`/`gates_at`/`sentinel_checkpoints` log `ENFORCEMENT_WARN` until 2026-05-17, then `permissionDecision: deny`. Override: `PIPELINE_ENFORCEMENT={warn,deny}`. |
| 10 | FQDN namespace correction: adversarial reviewers under `executor:type-specific:` (not `quality:`) | `4.9.0` | See section 5 below. |
| 11 | `type=Spec` is a first-class 6th task type | `4.11.0` | Custom classifiers that branch on `{Bug Fix, Feature, User Story, Audit, UX Simulation}` need to add `Spec`. |
| 12 | Gate registry grew 15 → 22 entries | `4.4.0` (initial) → `4.13.0` (final 22) | Inline Invariants in `commands/pipeline.md` MUST stay in sync with `references/gates.md` Registry; tests in `tests/unit/spec-gates-and-mode-persistence.test.js` enforce this. |
| 13 | `mode_used` field on `spec.json` (`slim` \| `full` \| `audit`) | `4.13.0` | Specs created pre-`4.13` lack the field — this is **expected** and triggers no gate. |

No deprecations have been removed. Every v4 entry-point still works at `v4.14.0`.

---

## 4. How to upgrade

### 4.1 Standard upgrade (any v4 minor → next)

```bash
# From the FX-Studio-AI marketplace
claude plugin update pipeline-orchestrator
```

That is it. Frontmatter migrations, hook injections, and reference doc updates are all picked up by the marketplace install. No settings file changes are required for any v4 → v4 transition.

### 4.2 First-time install on a fresh repo (cold start)

```bash
claude plugin add-marketplace https://github.com/fernandoxavier02/FX-Studio-AI
claude plugin add pipeline-orchestrator
/pipeline-orchestrator:bugfix [task]   # smoke
```

The cold-start regression fixed in `v4.1.0` (PR #3) is fenced by `sentinel-hook.test.cjs` test `[6b]`; the smoke run above also exercises the bootstrap whitelist.

### 4.3 Custom paths (uncommon)

If your repo overrides any of these via `.claude/pipeline.local.md`:

```yaml
---
doc_path: ".pipeline/docs"           # default, no change
build_command: "npm run build"
test_command: "npm test"
spec_path: "specs/"                  # v4.11+ also accepts ".kiro/specs/"
patterns_file: "PATTERNS.md"
---
```

The `spec_path` resolution order changed in `4.11.0` (added Kiro `.kiro/specs/` as the first preference, then `specs/`, then `docs/specs/`). If your repo had `spec_path: "specs/"` declared explicitly, your override still wins — fallback only kicks in when the field is absent.

### 4.4 Settings — nothing changes

`settings.json` does not host pipeline-orchestrator config. All plugin settings live in:
- The plugin's own `.claude-plugin/plugin.json` (read-only at runtime).
- The user's optional `.claude/pipeline.local.md` overrides above.
- Per-session `.pipeline/sessions/*` state files (cleared by Stop hook).

No environment variables are required. The single optional one is `PIPELINE_ENFORCEMENT={warn,deny}` for the `4.8.0` hook enforcement override.

---

## 5. FQDN mapping (old → new)

The `4.9.0` release silently corrected a namespace drift in 4 occurrences across the spec workflow files. **The canonical FQDN for the three adversarial reviewers is under `executor:type-specific:`, not `quality:`.**

| Old (incorrect, removed in `4.9.0`) | New (canonical, current) |
|--------------------------------------|--------------------------|
| `pipeline-orchestrator:quality:adversarial-architecture-critic` | `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic` |
| `pipeline-orchestrator:quality:adversarial-security-scanner` | `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner` |
| `pipeline-orchestrator:quality:adversarial-quality-reviewer` | `pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer` |
| `pipeline-orchestrator:quality:adversarial-review-coordinator` | `pipeline-orchestrator:executor:type-specific:adversarial-review-coordinator` |

`final-adversarial-orchestrator` itself stays under `quality:` (it is context-aware; it dispatches the three zero-context children which live under `executor:type-specific:`). Same exception pattern documented in `references/glossary.md` "Agent Naming Convention" entry from `v3.5.0`.

If you have custom dispatch tables or external scripts referring to the old paths, search-and-replace per the table above. The `dispatch-guard.cjs` hook (since `v3.6.0`) emits a corrective message when the wrong FQDN is invoked, so existing pipelines still recover gracefully — but cleaning the references avoids the warn log.

---

## 6. DoD v5.0 status (as of `v4.15.0`)

The 7 criteria for tagging v5.0 live in `designs/pipeline-orchestrator-v5-consolidated.md` §8. Snapshot today:

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | 5 commands listed in `/help` | ✅ DONE | `/pipeline-orchestrator:{pipeline,bugfix,feature,audit,ux}` all shipped (`4.2.0`–`4.7.0`). `/spec` (`4.12.0`) is a 6th, not in the original DoD set. |
| 2 | TRACE.md in user repo by default | ⚠️ PARTIAL | Per-pipeline `gate-decisions.jsonl` + `confidence-score.yaml` are written today, but the consolidated `TRACE.md` artifact (schema_version=1) is not yet generated. Slice 2 work. |
| 3 | TRACE.md attachable to a PR without manual editing | ❌ PENDING | Blocked on Criterion #2. |
| 4 | Compat suite green for 5 canonical scenarios | ✅ DONE | `4.10.0` graduated all 5 fixtures TEMPLATE → REAL. `4.14.0` added a 6th TEMPLATE fixture (`spec-fixture`) intentionally. |
| 5 | v5.1 milestone published with YAML interpreter commitment | ❌ OPEN — REQUIRES Issue #11 | The "v5.1 — Pipeline Declarativo (Slice 5)" milestone has not been opened in the public issue tracker yet. This is the primary blocker for v5.0 tagging. |
| 6 | Plan-mode-enforcer auto-triggers EnterPlanMode on MEDIA/COMPLEXA | ⚠️ PARTIAL | `plan-architect` agent runs on COMPLEXA + `--plan` flag. Auto-trigger on MEDIA without flag is not yet wired. `--no-plan` bypass + TRACE.md justification is not implemented (depends on Criterion #2). |
| 7 | `pipeline-controller` declares spawn tools explicitly | ✅ DONE | Frontmatter declares `tools: [Read, Write, Glob, Grep, Agent, AskUserQuestion, Task, Bash]` (8 tools, model `opus`). Verified `2026-05-03` per `designs/pipeline-orchestrator-v5-consolidated.md` §15. |

**Gating summary:** 3 DONE, 2 PARTIAL, 2 PENDING/OPEN. v5.0 tagging is blocked on Criterion #5 first (Issue #11), then on Criteria #2/#3/#6 which form a single delivery (TRACE.md + plan-mode-enforcer). See [`docs/v5-readiness-report.md`](./v5-readiness-report.md) for the recommended ordering.

---

## 7. Compatibility matrix — consumer projects

Two consumer projects are tracked publicly. This table captures whether each one needs an active migration step or just a routine plugin update on the next pull.

| Consumer | Current state | Action required to consume `v4.15.0` |
|----------|---------------|--------------------------------------|
| **FX Studio AI Trading** (this developer's primary host) | Pinned via marketplace; uses `/pipeline-orchestrator:pipeline` and the per-type entry-points | No action. Marketplace update reaches it on next `claude plugin update`. |
| **Pulsar** (source of bugfix/audit/feature workflow imports — Slices 1.5/3a/3b) | Independent project; provided the canonical `Heavy/` + `Ligth/` directory structures that Slices 1.5/3a/3b mirrored 1:1 | No action. Pulsar is the **source**, not a consumer of the imported skills; no installation of pipeline-orchestrator is required there. |
| **Custom forks (any)** | Forks that vendored the plugin pre-`4.9.0` and reference adversarial reviewers under `quality:` | Search-and-replace per the FQDN mapping table in section 5 above. Hooks emit corrective messages, so behavior is graceful — but cleaning the strings is recommended. |
| **Custom forks (any)** | Forks that vendored pre-`4.13.0` and parse the gate registry | Re-read `references/gates.md` (now 22 entries, was 15 → 16 → 22 across `4.x`). Custom validation that hard-coded the count needs to update. |

No consumer project has been blocked by a v4 → v4 transition since `v4.0.0`. The only forced re-install scenario remains v3 → v4 (covered by [`docs/MIGRATION-v3-to-v4.md`](./MIGRATION-v3-to-v4.md)).

---

## 8. What a v5.0 release will (and will not) change

When v5.0 ships:

**Will change:**
- `TRACE.md` will be written to `.pipeline-orchestrator/runs/<run-id>/TRACE.md` by default (DoD #2/#3).
- `EnterPlanMode` auto-triggers on MEDIA + COMPLEXA without explicit flag (DoD #6); bypass requires `--no-plan` + TRACE justification.
- The marketing label flips: "v5.0 — Pipeline as Code (RC)" with milestone "v5.1 — Pipeline Declarativo (Slice 5)" linked from the CHANGELOG (DoD #5).
- `plugin.json` `version` becomes `5.0.0`.

**Will NOT change:**
- The 4-phase flow (0 → 1 → 2 → 3) and gate model. v5.0 is additive on top of the v4.14 surface.
- Any FQDN mapping. The corrections from `4.9.0` are final.
- Hook enforcement contract from `4.8.0`. `PIPELINE_ENFORCEMENT={warn,deny}` override remains.
- Workflow imports from `4.4.0` / `4.5.0` / `4.6.1` / `4.7.0`. The 6 backing skills (`bugfix-{light,heavy}`, `audit-{light,heavy}`, `feature-{light,heavy}`) are stable.
- Spec workflow from `4.9.0` / `4.11.0` / `4.12.0` / `4.13.0`. `mode_used` semantics are locked.

In short: a v4.14 user upgrading to v5.0 gains TRACE.md and plan-mode-auto-trigger, gains nothing else, loses nothing.

---

## 9. Rollback

```bash
claude plugin remove pipeline-orchestrator
claude plugin install pipeline-orchestrator@<previous-version>
```

Every release between `v4.0.0` and `v4.15.0` is a valid rollback target. The lock file format, audit trail JSONL schema, and reference doc layout have not been changed in a backwards-incompatible way since `v4.0.0`. Rolling back from `v4.15.0` to `v4.14.0` is a no-op for any active session — `v4.15.0` only adds documentation files.

---

## 10. Known issues forwarded into v5.0

Two items deferred during the v4 lineage will be picked up under v5.0 / v5.1, not by an intervening v4 patch:

- **TRACE.md generator** — Slice 2 work. Schema design is in `references/audit-trail.md`; the writer is not yet implemented. v5.0 DoD #2/#3.
- **YAML pipeline interpreter** — Slice 5 work, intentionally deferred to v5.1 per DoD #5. v5.0 only commits to publishing the milestone.

Two technical debts are queued as patch releases between `v4.15.0` and v5.0 — both already triaged, neither blocking:

- `v4.13.1` — 10 MEDIUM findings carried forward from Wave 3 review.
- `v4.14.1` — `ARCH-WAVE6-1` test-helper duplication (`shouldEscalate` between Wave 5 and Wave 6 test files).

These do not gate v5.0; they are housekeeping.

---

*Last updated: 2026-05-06 (plugin `v4.15.0`).*
