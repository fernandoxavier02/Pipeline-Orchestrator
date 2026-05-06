# v5.0 Readiness Report

**Snapshot date:** 2026-05-06 (post-Wave-8-spec)
**Plugin version at snapshot:** `v4.17.0`
**Report owner:** pipeline-orchestrator core
**Status:** v5.0 **READY for `rc.1` tag** — 7 of 7 DoD criteria are DONE.

---

## TL;DR

Wave 8-spec (`v4.17.0`) closed Criteria #2, #3, and #6 in a single release. Criterion #5 (publish v5.1 milestone) was closed `2026-05-06` post-tag with [milestone #1 — v5.1 Pipeline Declarativo (Slice 5)](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) and 3 placeholder issues (#16 YAML grammar, #17 dispatch table design, #18 interpreter spike). Next step is `git tag v5.0.0-rc.1` followed by 1–2 weeks of feedback before `v5.0.0`.

Recommended sequence: **tag `v5.0.0-rc.1`** → 1–2 weeks of feedback → tag `v5.0.0`.

---

## 1. The 7 criteria — status table

> Source: `designs/pipeline-orchestrator-v5-consolidated.md` §8.

| # | Criterion (one-line) | Verification command/method | Status | Evidence |
|---|----------------------|----------------------------|--------|----------|
| 1 | 5 commands in `/help` | `claude /help \| grep pipeline-orchestrator` returns ≥5 lines | ✅ DONE | `/pipeline`, `/bugfix`, `/feature`, `/audit`, `/ux` shipped across `4.2.0`–`4.7.0`. `/spec` (`4.12.0`) is a 6th, ahead of DoD. |
| 2 | TRACE.md in user repo by default | After any pipeline run, `git status` shows `.pipeline-orchestrator/runs/<id>/TRACE.md` | ✅ DONE | `v4.17.0` (Wave 8-spec) added `references/trace-schema/v1.md` (SSOT, schema_version=1) and wired the writer into `agents/core/pipeline-controller.md` Phase 3 closure (Step 3b-post). Default emit path is `.pipeline-orchestrator/runs/<run-id>/TRACE.md` in user repo; `pipeline-orchestrator.persist_runs: 'private'` opt-out writes to `~/.claude/data/...`. Verified by `tests/integration/trace-writer.test.js` (7/7 PASS). |
| 3 | TRACE.md attachable to PR without manual editing | Standalone validator passes against fixture-generated TRACE | ✅ DONE | `v4.17.0` (Wave 8-spec) added `scripts/validate-trace.cjs` (pure-Node, exit 0/1, stderr diff). Verified against `tests/fixtures/trace/happy-path.md` (exit 0) and `tests/fixtures/trace/corrupt-frontmatter.md` (exit 1). 5/5 unit tests PASS. |
| 4 | Compat suite green for 5 canonical scenarios | `npm run test:compat` exits 0 | ✅ DONE | `v4.10.0` graduated all 5 fixtures TEMPLATE → REAL. `v4.14.0` added a 6th TEMPLATE (`spec-fixture`) intentionally. Suite at `v4.17.0`: 5 PASS / 1 SKIPPED, exit 0. |
| 5 | v5.1 milestone published with YAML interpreter commitment | Public issue tracker has milestone "v5.1 — Pipeline Declarativo (Slice 5)" with target ≤ Q+2; link in v5.0 CHANGELOG | ✅ DONE | [Milestone #1](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) opened `2026-05-06` (target Q3 2026, due 2026-09-30) with 3 placeholder issues — #16 YAML grammar prototype, #17 dispatch table design, #18 interpreter spike. Linked from CHANGELOG `[4.17.0]`. |
| 6 | Plan-mode-enforcer auto-triggers on MEDIA/COMPLEXA | `/pipeline-orchestrator:bugfix [task with domains_touched=2]` log shows plan-architect invoked before implementation | ✅ DONE | `v4.17.0` (Wave 8-spec) extended `commands/pipeline.md` Phase 1.5 trigger from `complexity == COMPLEXA` to `complexity ∈ {MEDIA, COMPLEXA} AND --no-plan ausente`. Asymmetric override semantics: MEDIA + `--no-plan` = skip + log justification in TRACE; COMPLEXA + `--no-plan` = plan runs anyway, override logged. Design §8 prose corrected. 5/5 trigger tests PASS. |
| 7 | `pipeline-controller` declares spawn tools explicitly | Frontmatter declares `tools: [Agent, Task, Read, Write, Bash, Glob, Grep, AskUserQuestion]` | ✅ DONE | Verified `2026-05-03` per `designs/pipeline-orchestrator-v5-consolidated.md` §15 + §17.3 #9 RESOLVED. |

**Tally:** 7 DONE / 0 PARTIAL / 0 OPEN. v5.0.0-rc.1 unblocked.

---

## 2. Gap analysis — what each open/partial criterion needs

### Criterion #2 (TRACE.md default) — PARTIAL → DONE

**Gap:** A single Markdown file aggregating the per-run audit trail is missing. The data exists; the writer does not.

**What it takes to close:**
- Schema author (1 file): `references/trace-schema/v1.md` — fields, ordering, `schema_version=1`, examples.
- Writer wired into `pipeline-controller` Phase 3 closure: read `gate-decisions.jsonl`, `confidence-score.yaml`, agent phase docs → emit `TRACE.md` to `.pipeline-orchestrator/runs/<run-id>/TRACE.md` (note: path lives in user repo, **not** `.pipeline/`).
- Settings: `pipeline-orchestrator.persist_runs: 'private'` opt-out flag declared in `.claude/pipeline.local.md` schema (default = repo).
- Tests: 1 happy-path fixture (run any `/bugfix` smoke, assert `TRACE.md` ends up in repo `git status`).

**Estimated effort:** Wave 8 batch A (1 day). No agent/skill changes; only `pipeline-controller` + 1 new reference + 1 new test.

### Criterion #3 (TRACE.md attachable to PR) — PENDING → DONE

**Gap:** Once #2 lands, validation that the file conforms to schema_version=1 has to be standalone (so a PR reviewer can check it without running the pipeline).

**What it takes to close:**
- Validator script: `scripts/validate-trace.cjs` taking a TRACE.md path, returning exit 0/non-0 with diff.
- Test: feed it the Wave 8 batch A fixture; expect exit 0.
- Also feed it a corrupted-frontmatter fixture; expect exit 1.

**Estimated effort:** Wave 8 batch B (½ day). Bundled with #2.

### Criterion #5 (v5.1 milestone) — DONE

Closed `2026-05-06` post-`v4.17.0` tag:
- [Milestone #1](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) — "v5.1 — Pipeline Declarativo (Slice 5)" — target Q3 2026 (due 2026-09-30).
- 3 placeholder issues attached: [#16 YAML grammar prototype](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/16), [#17 dispatch table design](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/17), [#18 interpreter spike](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/18).
- Linked from `CHANGELOG.md [4.17.0]` section.

### Criterion #6 (plan-mode-enforcer auto) — PARTIAL → DONE

**Gap:** Three things:
1. MEDIA + (any) auto-triggers `EnterPlanMode`. Today only COMPLEXA + `--plan` does.
2. Bypass requires explicit `--no-plan` flag.
3. Bypass logs an entry in TRACE.md justifying the skip.

Item 3 depends on #2/#3 (TRACE.md writer must exist).

**What it takes to close:**
- `commands/pipeline.md` Phase 1.5 trigger condition extended: `complexity ∈ {MEDIA, COMPLEXA}` AND `--no-plan` not in args.
- New `--no-plan` flag in modes table.
- `pipeline-controller` writes a `plan_mode_skipped: true, justification: <user input>` field to TRACE.md when `--no-plan` is set.
- Tests: 1 MEDIA without `--no-plan` → plan ran; 1 MEDIA with `--no-plan` → no plan, justification logged; 1 COMPLEXA without `--no-plan` → plan ran; 1 COMPLEXA with `--no-plan` → plan ran anyway (override blocked at COMPLEXA per §8 prose — verify in design before implementing).

**Estimated effort:** Wave 8 batch C (½ day after #2 lands).

---

## 3. What is NOT a blocker

To keep the picture honest, items that are **sometimes confused** with v5.0 blockers but are not:

- **`/spec` entry-point** (`v4.12.0`): a 6th command, ahead of DoD. Adds value, removes nothing.
- **Spec lifecycle agents** (`v4.9.0`–`v4.14.0`): the entire spec workflow including 22-gate registry, mode_used persistence, integration tests, and bad-variant fixtures. None are gated by v5.0 DoD.
- **Pulsar workflow imports** (`v4.4.0` / `v4.5.0` / `v4.6.1` / `v4.7.0`): the 6 backing skills are stable. Not part of DoD.
- **Hook enforcement** (`v4.8.0`): warn-mode auto-promotes to deny on `2026-05-17`. Not part of DoD; will be in deny mode by the time v5.0 ships either way.
- **Compat fixture #6 (`spec-fixture`)** in TEMPLATE state at `v4.14.0`: intentional, replaces no existing fixture, and DoD #4 only requires the 5 original scenarios green.
- **The 11 deferred debts** (10 MEDIUM Wave 3 → `v4.13.1`; ARCH-WAVE6-1 → `v4.14.1`): housekeeping patches, not blocking v5.0.

---

## 4. Recommended path to v5.0 (post Wave-8-spec, post-milestone-#1)

All technical and administrative blocks closed. Single remaining step:

| Order | Action | Wave / patch | Estimated calendar | Unblocks |
|-------|--------|--------------|---------------------|----------|
| 1 | Tag `v5.0.0-rc.1`, accept 1–2 weeks of feedback, then tag `v5.0.0` | release admin | ~10 calendar days | v5.0 |

The 11 deferred debts (`v4.13.1` + `v4.14.1`) can ship in parallel — they do **not** block v5.0 and v5.0 does **not** block them.

### Self-hosted dogfood findings (Wave 8-spec, 2026-05-06)

`v4.17.0` was developed by running `/pipeline-orchestrator:pipeline` on its own canonical repo. The dogfood revealed two issues worth fixing in `v5.0.0-rc.1`:

1. **`sentinel-hook.cjs` cwd-discovery brittleness.** The hook discovers `sentinel-state.json` via `process.cwd()/.pipeline/docs/`. When Claude Code is launched from a parent directory rather than the repo root, no candidate path resolves and non-bootstrap sub-agent spawns are blocked. Mitigation in v4.17.0 development was a controller-direct edit pivot. Long-term fix candidates: `CLAUDE_PROJECT_ROOT` env-var fallback, marker-file discovery (`.claude/`, `.claude-plugin/`, or `.git/`), or argv-based passthrough from the plugin runtime.
2. **JavaScript regex `\Z` gotcha.** `/^### Phase 3: Closure[\s\S]*?(?=^## |\Z)/m` silently treats `\Z` as literal `Z`, breaking on the word "ZERO" in the Step 3b-pre UX text. Fixed in `tests/integration/trace-writer.test.js` to use slice + H2 boundary search. May appear in other audit-style tests; flagged for retrospective.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TRACE.md schema needs a v2 within 6 months | Medium | Medium | Ship `schema_version=1` defensively; design rev-bump path now. |
| `--no-plan` bypass abused (users routinely skip planning) | Medium | High (defeats the DoD #6 spirit) | Require non-empty justification string; surface count in TRACE.md and CI summary. |
| YAML interpreter (Slice 5 / v5.1) ships later than Q+2 | Medium | Low (DoD #5 only requires the milestone, not delivery) | Milestone date is the commitment; the deliverable can slide by 1 quarter without breaking v5.0. |
| Milestone #1 ships less than 30% of placeholder issues by Q3 2026 | Medium | Low (DoD #5 only requires the milestone exists, not delivery) | Re-evaluate milestone scope at v5.1 kickoff; can slip 1 quarter without breaking v5.0. |

---

## 6. Sign-off conditions

This report is current at `v4.17.0` (post Wave 8-spec + milestone #1). It expires when any of the following happens:

1. `v5.0.0-rc.1` is tagged → archive snapshot, generate `v5-rc1-feedback-report.md`.
2. The DoD list in `designs/pipeline-orchestrator-v5-consolidated.md` §8 changes (an 8th criterion, or a renumbering) → regenerate this report.
3. `v5.0.0` itself ships → archive to `docs/archive/v5-readiness-report-2026-05-06.md`.

Until then, this is the operating snapshot.

---

*Originally generated as part of Wave 7-spec (`v4.15.0`); regenerated after Wave 8-spec (`v4.17.0`) and milestone #1 publication. See [`docs/MIGRATION-v4-to-v5.md`](./MIGRATION-v4-to-v5.md) for the full v4 lineage and breaking-change matrix.*
