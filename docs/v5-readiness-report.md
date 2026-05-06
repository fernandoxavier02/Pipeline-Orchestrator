# v5.0 Readiness Report

**Snapshot date:** 2026-05-06
**Plugin version at snapshot:** `v4.15.0`
**Report owner:** pipeline-orchestrator core
**Status:** v5.0 **NOT READY** — 2 of 7 DoD criteria are open, 2 are partial.

---

## TL;DR

v5.0 cannot be tagged today. The blocking item is **Criterion #5 (publish v5.1 milestone)** — that is administrative and resolves with Issue #11. After that, the technical block is the **TRACE.md + plan-mode-enforcer trio** (Criteria #2, #3, #6) which form a single delivery best handled in Wave 8. The compat suite (Criterion #4) and the entry-point set (Criterion #1) are already green; the controller-tools declaration (Criterion #7) was closed `2026-05-03`.

Recommended sequence: **Issue #11 → Wave 8 (TRACE.md + plan-mode auto-trigger)** → tag `v5.0.0-rc.1` → 1–2 weeks of feedback → tag `v5.0.0`.

---

## 1. The 7 criteria — status table

> Source: `designs/pipeline-orchestrator-v5-consolidated.md` §8.

| # | Criterion (one-line) | Verification command/method | Status | Evidence |
|---|----------------------|----------------------------|--------|----------|
| 1 | 5 commands in `/help` | `claude /help \| grep pipeline-orchestrator` returns ≥5 lines | ✅ DONE | `/pipeline`, `/bugfix`, `/feature`, `/audit`, `/ux` shipped across `4.2.0`–`4.7.0`. `/spec` (`4.12.0`) is a 6th, ahead of DoD. |
| 2 | TRACE.md in user repo by default | After any pipeline run, `git status` shows `.pipeline-orchestrator/runs/<id>/TRACE.md` | ⚠️ PARTIAL | Per-run `gate-decisions.jsonl` + `confidence-score.yaml` are written today. The consolidated `TRACE.md` artifact (with `schema_version=1`) is not yet generated — Slice 2 work. |
| 3 | TRACE.md attachable to PR without manual editing | Standalone validator passes against fixture-generated TRACE | ❌ PENDING | Blocked on #2. |
| 4 | Compat suite green for 5 canonical scenarios | `npm run test:compat` exits 0 | ✅ DONE | `v4.10.0` graduated all 5 fixtures TEMPLATE → REAL. `v4.14.0` added a 6th TEMPLATE (`spec-fixture`) intentionally. Suite at `v4.14.0`: 5 PASS / 1 SKIPPED, exit 0. |
| 5 | v5.1 milestone published with YAML interpreter commitment | Public issue tracker has milestone "v5.1 — Pipeline Declarativo (Slice 5)" with target ≤ Q+2; link in v5.0 CHANGELOG | ❌ OPEN | Milestone has not been opened. **Tracked as Issue #11 in this repo.** |
| 6 | Plan-mode-enforcer auto-triggers on MEDIA/COMPLEXA | `/pipeline-orchestrator:bugfix [task with domains_touched=2]` log shows `EnterPlanMode` invoked before implementation | ⚠️ PARTIAL | `plan-architect` runs on COMPLEXA + `--plan` flag. Auto-trigger on MEDIA without flag is wired conceptually in `commands/pipeline.md` Phase 1.5 but does **not** force `EnterPlanMode`. `--no-plan` bypass + TRACE.md justification is not implemented (depends on #2). |
| 7 | `pipeline-controller` declares spawn tools explicitly | Frontmatter declares `tools: [Agent, Task, Read, Write, Bash, Glob, Grep, AskUserQuestion]` | ✅ DONE | Verified `2026-05-03` per `designs/pipeline-orchestrator-v5-consolidated.md` §15 + §17.3 #9 RESOLVED. |

**Tally:** 3 DONE / 2 PARTIAL / 2 OPEN-or-PENDING.

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

### Criterion #5 (v5.1 milestone) — OPEN → DONE

**Gap:** A GitHub milestone in this repo titled "v5.1 — Pipeline Declarativo (Slice 5)" with a target date ≤ 2026-Q3 (Q+2 from today's Q2-2026), and a backlinked entry in the v5.0 CHANGELOG.

**What it takes to close:**
- Open Issue #11 (already triaged in `MEMORY.md` as the next logical step).
- Create the milestone (manual GitHub action — no code).
- Add 3-5 placeholder issues under it (YAML grammar prototype, interpreter spike, dispatch table for declarative steps).
- Reference the milestone URL in the v5.0 CHANGELOG section once it exists.

**Estimated effort:** ½ day, fully administrative.

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

## 4. Recommended path to v5.0

The shortest credible path is 3 sequential steps. Anything else either blocks on the same dependencies or duplicates work.

| Order | Action | Wave / patch | Estimated calendar | Unblocks |
|-------|--------|--------------|---------------------|----------|
| 1 | Open Issue #11; publish v5.1 milestone with 3–5 placeholder issues | (admin only) | ½ day | DoD #5 |
| 2 | Wave 8 batches A+B+C — TRACE.md schema + writer + validator + plan-mode auto-trigger + `--no-plan` bypass | Wave 8 (`v4.16.0` candidate, additive) | 2–3 days | DoD #2, #3, #6 |
| 3 | Tag `v5.0.0-rc.1`, accept 1–2 weeks of feedback, then tag `v5.0.0` | release admin | ~10 calendar days | v5.0 |

The 11 deferred debts (`v4.13.1` + `v4.14.1`) can ship in parallel with step 2 if a contributor wants to take them — they do **not** block v5.0 and v5.0 does **not** block them. Most natural ordering: ship `v4.13.1` then `v4.14.1` then start Wave 8, but the dependency is one-way (Wave 8 doesn't need either).

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TRACE.md schema needs a v2 within 6 months | Medium | Medium | Ship `schema_version=1` defensively; design rev-bump path now. |
| `--no-plan` bypass abused (users routinely skip planning) | Medium | High (defeats the DoD #6 spirit) | Require non-empty justification string; surface count in TRACE.md and CI summary. |
| YAML interpreter (Slice 5 / v5.1) ships later than Q+2 | Medium | Low (DoD #5 only requires the milestone, not delivery) | Milestone date is the commitment; the deliverable can slide by 1 quarter without breaking v5.0. |
| Issue #11 stays open >2 weeks after v4.15.0 | Low | Medium (administratively blocks v5.0) | Owner-assign Issue #11 the same day v4.15.0 ships. |

---

## 6. Sign-off conditions

This report is current at `v4.15.0`. It expires when any of the following happens:

1. Issue #11 closes → re-tally Criterion #5.
2. Wave 8 ships → re-tally Criteria #2, #3, #6.
3. The DoD list in `designs/pipeline-orchestrator-v5-consolidated.md` §8 changes (an 8th criterion, or a renumbering) → regenerate this report.
4. v5.0.0 itself ships → archive to `docs/archive/v5-readiness-report-2026-05-06.md`.

Until then, this is the operating snapshot.

---

*Generated as part of Wave 7-spec, `v4.15.0`. See [`docs/MIGRATION-v4-to-v5.md`](./MIGRATION-v4-to-v5.md) for the full v4 lineage and breaking-change matrix.*
