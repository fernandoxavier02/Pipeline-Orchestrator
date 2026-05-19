# Changelog

All notable changes to the pipeline-orchestrator plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.0.0] - 2026-05-19 — License transition: MIT → PolyForm Shield 1.0.0 (MAJOR, license-only)

**Major release. Code identical to v6.3.0. License change only.**

Pipeline Orchestrator v7.0.0 transitions from the MIT license to the
[PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0).
This is a license-only major version bump per SemVer convention for
license changes. No code, agents, gates, hooks, or behavior have
changed from v6.3.0.

### Why

As Pipeline Orchestrator matured into a substantial governance layer
with 20 production agents, 32 registered gates, glass-box audit trail,
and dogfood-validated discipline mechanics, the MIT license left a
gap that the project's commercial protection now needs to close:
**any party could repackage the codebase and offer it as a competing
product without contribution back**. This is the gap PolyForm Shield
1.0.0 closes via its Noncompete clause.

This is the same pattern adopted by HashiCorp (BSL), Sentry (BSL),
MariaDB (BSL), Elastic (Elastic License 2.0), MongoDB (SSPL), and
MinIO (AGPL → later GPL → later commercial). The 2018-2024 cohort of
commercially operated open-source projects has consolidated around
source-available licenses with anti-competition carve-outs.

### What changes

- **LICENSE file:** replaced with PolyForm Shield 1.0.0 official text.
- **LICENSE-NOTES.md:** new file documenting the transition, the
  perpetual MIT terms for v6.3.0 and earlier, the trademark
  reservation on "Pipeline Orchestrator" and "FX Studio AI", and
  answers to common questions.
- **package.json:**
  - `version`: `6.3.0` → `7.0.0`
  - `license`: `"MIT"` → `"SEE LICENSE IN LICENSE"` (NPM convention
    for custom licenses)
- **plugin.json:**
  - `version`: `6.3.0` → `7.0.0`
  - `license`: `"MIT"` → `"PolyForm-Shield-1.0.0"`
- **marketplace.json:** version and `source.ref` bumped to `v7.0.0`.
- **CLAUDE.md:** canonical version line + lineage row updated.
- **README.md:** license badge updated from `MIT` to
  `PolyForm Shield 1.0.0`, License section rewritten, install
  instructions unchanged.
- **assets/diagrams/hero-banner.svg:** version badge bumped to
  `v7.0.0`.
- **.github/FUNDING.yml:** new file enabling GitHub Sponsors button
  on the repository.

### What does NOT change

- All agent definitions, gate registry, hooks, references, and tests
  are byte-identical to v6.3.0.
- The 22-row Mandatory Gates by Complexity invariant is preserved.
- The 32-row Gate Registry is preserved.
- The discipline layer added in v6.3.0 (CHANGE_CONTRACT, SCOPE LOCK
  CHECK, diff-discipline-reviewer, scope-lock-hook) operates
  identically.
- The 31-suite regression test pass is unchanged.

### Backward compatibility

Versions v1.0.0 through v6.3.0 remain MIT-licensed in perpetuity. The
license change is forward-looking: it applies to v7.0.0 and all
subsequent versions. Forks taken from v6.3.0 or earlier inherit MIT
terms; forks taken from v7.0.0 or later are governed by Shield.

If a user installed v6.3.0 from NPM or the marketplace, their copy
remains MIT-licensed indefinitely. Upgrading to v7.0.0 means accepting
Shield terms.

### Trademark reservation

The names **"Pipeline Orchestrator"** and **"FX Studio AI"** are
trademarks of FX Studio AI. The Shield license grants code rights but
does not grant trademark rights. Forks must use a different name to
avoid trademark confusion, consistent with how Linux (trademark held
by Linux Foundation) and Mozilla (Firefox trademark separate from
codebase) handle the same separation.

### Distribution channels

Both channels (Claude Code marketplace + NPM `@fx-studio-ai` scope)
ship v7.0.0 under Shield. Marketplace remains the public default;
NPM remains restricted-access via granular token. No infrastructure
changes.

### For contributors

New contributions to v7.0.0 and onward are accepted under Shield.
Contributor agreements covering historical MIT-era contributions
remain valid. Pull requests against v7.0.0+ branches implicitly
accept Shield terms for the submitted code.

---

## [6.3.0] - 2026-05-19 — Implementation Discipline Layer (MINOR)

**Minor release.** Adds a discipline layer that constrains every code-changing batch to a declared `CHANGE_CONTRACT` — scope, diff budget, forbidden change types, test integrity. Enforced structurally by agents reading a new SSOT, NOT by adding a new gate row. Backward compatible (legacy plans without `CHANGE_CONTRACT` skip the discipline reviewer cleanly).

### Why this matters

Prior to v6.3.0, the pipeline had strong checkpoints for **correctness** (TDD, adversarial review, sanity check) but weak signals for **discipline**:
1. **Scope creep.** An implementer could touch any file the agent had permission for, including drive-by cleanup that bloated diffs.
2. **Over-engineering.** Premature abstraction, "framework lite" patterns, and speculative parameterization slipped past adversarial and architecture review because those agents focused on *correctness* and *patterns*, not *minimality*.
3. **Silent dependency drift.** A new `import` of a previously unused package would pass review if the code worked — even when adding a new dependency was not in scope.
4. **Test weakening.** Tests that started failing could be "fixed" by loosening assertions instead of fixing the code.

v6.3.0 closes all four by introducing a per-batch `CHANGE_CONTRACT` that every plan must declare and every implementer/reviewer must respect.

### Added

- **`references/implementation-discipline.md` (NEW)** — SSOT for the discipline layer. 11 sections covering severity definitions (PASS / NEEDS_REDUCTION / REJECTED with hardness mapping), scope control rules, minimal-diff discipline heuristics, SOLID/KISS/DRY/YAGNI application, dependency/config/contract/migration restrictions, test integrity rules, evidence requirements, bootstrap & self-applying behavior, interaction with the 22-Gate Mandatory Table, interaction with ADVERSARIAL_BLOCK (max=3) vs. new max=5.
- **`CHANGE_CONTRACT` block in `IMPLEMENTATION_PLAN`** (new Rule 11 in `agents/quality/plan-architect.md`) — 6 required fields: `allowed_files`, `allowed_new_files`, `forbidden_files`, `forbidden_change_types` (7 canonical types), `diff_budget` (with 4 sub-fields), `escalation_required_if`. Plus `bootstrap.active` flag for one-time relaxation. Defaults are fail-closed (0/false) — every plan MUST customize them.
- **`## SCOPE LOCK CHECK` in `agents/executor/executor-implementer-task.md`** — fires before every Write/Edit (Read remains free). 5 checks against the active `CHANGE_CONTRACT`. On violation: returns `status: QUESTIONS` with `question.context: scope_lock_violation`, routed to the user via the parent. Includes 9-item anti-pattern list (no drive-by cleanup, no unrequested refactor, no new dependency injection, no CI/build config edits, no `package.json`/lockfile edits, no `.env*` edits, no migration/schema files, no public contract drift, no test weakening to fit implementation).
- **`agents/quality/diff-discipline-reviewer.md` (NEW agent — agent roster grows 19 → 20)** — third parallel reviewer in `review-orchestrator`, alongside `adversarial-batch` and `architecture-reviewer`. Tools: Read, Grep, Glob ONLY (no Bash, no Edit, no Write — static-only inspection). Emits `DIFF_DISCIPLINE_REVIEW:` YAML with verdict, scope findings, minimal_diff findings, dependency/config/contract findings, test integrity findings, evidence. `REJECTED` is HARD with `max_fix_attempts=5`. `NEEDS_REDUCTION` is SOFT (user-acknowledged, no fix loop).
- **3-way parallel reviewer wiring in `agents/quality/review-orchestrator.md`** — Step 1 table updated for SIMPLES (with CHANGE_CONTRACT) / MEDIA / COMPLEXA; new `DIFF_DISCIPLINE_INPUT:` block in Step 2; Step 3 REVIEW_CONSOLIDATED gains `diff_discipline:` field, `combined_findings.source: diff_discipline` enum value, and `fix_loop_counters:` sub-block with `adversarial_block_attempts` (max=3) and `diff_discipline_attempts` (max=5) tracked independently.
- **5 new check rows in `agents/quality/architecture-reviewer.md`**:
  - Step 3 Abstraction Reuse: *abstraction without second real use case*, *new file where local change was enough*
  - Step 4 Structural Integrity: *unnecessary architecture layer*, *unrelated refactor*, *public contract drift*
  - (Pre-existing: *duplicated helper/type/constant*, *semantic duplication* — already captured by older rows)
- **7 regression tests in `tests/regression/v6.3.0/` (F8-F14)** — static-asserts following the v6.1.0 pattern:
  - F8: `implementation-discipline.md` exists with required sections
  - F9: `plan-architect.md` contains `CHANGE_CONTRACT:` with all 6 fields + 5 canonical forbidden_files + 7 canonical forbidden_change_types
  - F10: `executor-implementer-task.md` contains `## SCOPE LOCK CHECK` heading positioned correctly with violation protocol and Bootstrap exception
  - F11: `diff-discipline-reviewer.md` exists with `tools: Read, Grep, Glob` exactly + `DIFF_DISCIPLINE_REVIEW:` schema + `max_fix_attempts=5`
  - F12: `review-orchestrator.md` Step 1 mentions diff-discipline-reviewer + Step 2 `DIFF_DISCIPLINE_INPUT:` + Step 3 `diff_discipline:` + `fix_loop_counters:` with `diff_discipline_attempts:`
  - F13: `architecture-reviewer.md` contains 7 discipline checks regex-matchable
  - F14: `references/gates.md` Gate Registry has exactly 32 rows (current count post-v6.2.0) AND Mandatory Gates by Complexity table has exactly 22 rows — defense-in-depth invariant guard

### Invariants preserved

- **22-row Mandatory Gates by Complexity table** in `references/gates.md` — UNCHANGED. Pinned by `tests/regression/v6.1.0/F1_gates_mandatory_section.cjs` (untouched in this release).
- **32-row Gate Registry** (full table) in `references/gates.md` — UNCHANGED. Pinned by new `F14_gates_md_unchanged_count.cjs` as belt-and-suspenders.
- **No new gate row added.** The discipline layer is enforced structurally by agents reading the new SSOT + the per-plan `CHANGE_CONTRACT`. `NEEDS_REDUCTION` logs under existing `ADVERSARIAL_GATE` (SOFT); `REJECTED` triggers an internal fix loop that piggybacks on existing return-to-executor-fix machinery.
- **`ADVERSARIAL_BLOCK` row in `references/gates.md`** — UNCHANGED. `max=3` retained. The new `max=5` is a property of the new agent's internal fix loop, NOT a modification of `ADVERSARIAL_BLOCK`.

### Bootstrap exception (one-time, v6.3.0 only)

This release created the enforcement machinery (`implementation-discipline.md`, `CHANGE_CONTRACT` schema, `SCOPE LOCK CHECK` section, `diff-discipline-reviewer` agent). The plan for v6.3.0 itself was the first plan to declare `CHANGE_CONTRACT`. Tasks T1-T3 ran WITHOUT runtime `SCOPE LOCK CHECK` enforcement because the mechanism did not yet exist in code at that point. The plan declared `CHANGE_CONTRACT.bootstrap.active: true` for audit transparency. From T4 onward, enforcement is fully active. Future plans (v6.4.0+) inherit a fully-enforced pipeline; setting `bootstrap.active: true` on a non-bootstrap plan is itself a `forbidden_change_type` and will be rejected. The bootstrap event is logged once to `gate-decisions.jsonl` as `event: "BOOTSTRAP_EXEMPTION_USED"` with hardness `AUDIT`.

### Test suite

- 19 → **26** regression suites GREEN (+7 new tests F8-F14).
- All v6.0.0/v6.1.0/v6.2.0 tests untouched; F1 22-row assertion preserved exactly.
- Zero regressions in hook syntax suite (sentinel-hook, dispatch-guard, edit-guard, force-pipeline-agents, session-cleanup, session-lock, skill-frontmatter-parser).
- Approx. +1,250 lines added across SSOT (233), new agent (229), updated agents (~165), tests (~720), CHANGELOG + plugin/marketplace metadata.

### Backward compatibility

- Plans emitted before v6.3.0 (no `CHANGE_CONTRACT` field) are accepted. `diff-discipline-reviewer` emits a SKIP result documented in `REVIEW_CONSOLIDATED.diff_discipline.status: "SKIPPED"`. v6.4.0 will promote missing `CHANGE_CONTRACT` from SKIP to HARD on MEDIA/COMPLEXA plans.
- SIMPLES tasks remain exempt from the multi-batch adversarial loop. The discipline layer (`SCOPE LOCK CHECK` + diff-discipline reviewer) still runs in SIMPLES when a `CHANGE_CONTRACT` is present, but without multi-batch iteration.

### Files touched

- New: `references/implementation-discipline.md`, `agents/quality/diff-discipline-reviewer.md`, `tests/regression/v6.3.0/F8_*.cjs` … `F14_*.cjs`
- Modified: `agents/quality/plan-architect.md`, `agents/executor/executor-implementer-task.md`, `agents/quality/architecture-reviewer.md`, `agents/quality/review-orchestrator.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`
- Untouched (by design — in `CHANGE_CONTRACT.forbidden_files`): `references/gates.md`, `tests/regression/v6.0.0/**`, `tests/regression/v6.1.0/**`, `tests/regression/v6.2.0/**`, `commands/pipeline.md`, `package.json`, lockfiles, `.env*`, `.github/workflows/*`

---

## [6.2.0] - 2026-05-18 — Clarification Overhaul + Alternatives Brainstorming (MINOR)

**Minor release.** The most important step of the pipeline — pre-execution clarification — was rebuilt from a fixed-template question list into an evidence-driven dynamic agent. New step proposes alternative approaches. Drift fix on the complexity matrix. Backward compatible.

### Why this matters

The legacy `step-01-explore.md` asked 7 fixed questions (Goal / Audience / Boundary / Risk / Constraint / Reference / Done check) regardless of what the prompt or project state already revealed. Three failure modes:

1. **Generic asks** — "What's the biggest risk?" with no domain context. The user had to invent the project framing the agent should have read.
2. **Hidden gaps** — domain-specific risks (PII, streaming, idempotency, timeout) never surfaced because no lens existed for them.
3. **Theatre questions** — categories that the prompt already answered still got asked, burning turns.

v6.2 fixes this by inverting the contract: the agent MUST read project context BEFORE asking anything, then asks only for *residual* gaps, with evidence citations (file:line) in every option.

### Added

- **`agents/brainstorm/step-01-explore.md` (rewritten)** — 4-phase dynamic agent:
  - **Phase A (Context analysis, mandatory)** — read CLAUDE.md, pipeline.local.md, `probable_files` from intake, git state. Detect SSOT collisions. Flag domains (auth/payment/PII/migration/concurrency).
  - **Phase B (Gap inventory)** — 11 lenses (Intent / Scope / Acceptance / Domain risk / Non-functional / Integration / Migration / Failure surface / Test strategy / Pattern alignment / Stakeholders) + domain extensions unlocked by Phase A flags. Each lens marked ANSWERED (with rationale) or generates 0..N gaps. No fixed count.
  - **Phase C (Ask)** — one `=== GATE_REQUEST v1 ===` per gap, recommendation grounded in cited evidence, no generic template questions.
  - **Phase D (Record + telemetry)** — writes `02-explore.md` and emits JSONL events.
- **`agents/brainstorm/step-01b-alternatives.md` (NEW)** — proposes 2-4 alternative approaches across Minimal / Pattern-aligned / Aggressive / Contrarian axes after clarification completes. Auto-skip when prompt is mechanical + zero open lenses + ≤2 files + SIMPLES. User chooses via GATE_REQUEST; implicit plan is always an option.
- **5 new gate types** in `references/gates.md`:
  - `CLARIFICATION_GAPS_DETECTED` (AUDIT)
  - `CLARIFICATION_RESOLVED` (HARD)
  - `CLARIFICATION_SKIPPED` (SOFT)
  - `ALTERNATIVES_PROPOSED` (AUDIT)
  - `ALTERNATIVE_CHOSEN` (SOFT) + `ALTERNATIVES_SKIPPED` (SOFT) + `STEP_01_GAP_LEAKED` (SOFT)
- **New AUDIT hardness level** — informational telemetry events that never block, never apply confidence penalty, never count toward fidelity scoring. Used so observability events have a first-class gate row instead of masquerading as SOFT/COMPLETED entries.
- **`docs/audits/2026-05-18-clarification-overhaul-dogfood/`** — dogfood evidence: README, comparison-legacy-vs-v62.md, telemetry-delta.md, full pipeline-runs/ scenario against IFRS 16 `backend/app/routers/contracts.py:232`. 14 telemetry events; 4 anti-invention blockers (streaming / PII-LGPD / result cap / timeout) surfaced that the legacy template would have left for downstream invention.

### Changed

- **`references/complexity-matrix.md`** — drift fix: `Has spec` column for MEDIA changed from `Optional` to `Required (auto-dispatch)`, matching `pipeline-controller.md:281` runtime behavior. Added "Spec Mandate (v6.2+)" subsection explaining `--no-prep` escape hatch and audit trail.
- **`agents/core/brainstorm-controller.md`** — STEP C table grows from 9 to 10 entries (inserts `1b` between `01-explore` and `02-spec-init`). Numbering note explains backward-compat semantics.
- **`commands/brainstorm.md`** — description rewritten to reflect new flow; documents the 4 phases of clarification; adds `--skip-alternatives` flag.
- **Gate registry** count: 22 → 27.

### Backward compatibility

- Legacy `pipeline-runs/` created pre-2026-05-18 lack `notes.options.alternatives_done` — controller treats missing field as `"auto-skipped"`, resume succeeds without error.
- Mandatory Gates by Complexity table in `references/gates.md` UNCHANGED — F1 regression test passes by construction (new gates are in a separate section, not in the Mandatory table).
- AUDIT-hardness events are explicitly excluded from `fidelity-reporter.cjs` math, no scoring regression.

### Telemetry delta vs v6.1 baseline

Measured against `D:/IFRS-16-po-eval/C1-brainstorm-handoff/.pipeline/docs/Pre-Medium-action/2026-05-10-audit-f04/gate-decisions.jsonl`:

- Brainstorm-phase JSONL events: 0 → 14
- Distinct gate types in registry: 22 → 27
- Hardness levels: 4 → 5 (+AUDIT)
- Average evidence-citations per question: ~0.1 → 1.0 (mandatory by contract)
- Pre-question file reads: 0 → 4 (Phase A required)
- Anti-invention blockers surfaced at brainstorm phase: 0-1 → 4 (dogfood scenario)

### Cost/value

Brainstorm token spend rises ~3× (legacy ~2.6k → v6.2 ~8.2k). Each invention prevented at the brainstorm phase typically costs 10-50× to fix once it surfaces at adversarial review or in production. Net economics strongly positive on MEDIA and COMPLEXA work.

### Known gaps / forward dependencies

- `--skip-alternatives` flag wired in command but explicit persistence in `brainstorm-controller` STEP A.1 deferred to v6.3 (currently honored via auto-skip rule when conditions match).
- Regression test for Phase A reading discipline (assert step-01-explore reads at least the `probable_files` set) — recommended but not yet added.

## [6.1.0] - 2026-05-15 — ATDD/BDD/DDD Workflow Contracts (MINOR)

**Minor release.** Adds three lightweight workflow contracts on top of the v6.0.0 hardening base, all SOFT-enforced and proportional to complexity. Producer-side wiring only — downstream consumers tracked as forward dependencies for v6.2.

### Added

- **D5 (ATDD)**: non-spec Given/When/Then normalization in quality-gate-router (Step 1b, MEDIA/COMPLEXA only, EARS And/But continuations allowed; SIMPLES/Spec exempt). Field `non_spec_atdd.applied` set when `scenario_count > 0`.
- **D6 (BDD)**: Gherkin artifact emission per slice in feature-vertical-slice-planner (Step 3b, flat naming `.pipeline/artifacts/bdd/SLICE-NN.feature`). Adds `bdd_artifact` field to slice planning output.
- **D7 (DDD)**: Bounded Contexts section in plan-architect (lightweight 3-column COMPLEXA-only contract, SOFT enforcement via `BOUNDED_CONTEXT_MISSING` event in `protocol-events.jsonl` using the canonical schema). MEDIA/SIMPLES exempt.
- **4 new regression tests** in `tests/regression/v6.1.0/`:
  - `D5_atdd_quality_gate_router.cjs` (10 scenarios — Given/When/Then normalization + EARS And/But)
  - `D6_bdd_gherkin_output_contract.cjs` (8 scenarios — flat naming + bdd_artifact field shape)
  - `D7_ddd_bounded_contexts_contract.cjs` (9 scenarios — 3-column contract + SOFT event emission)
  - `B4_cross_cutting_docs.cjs` (10 scenarios — CHANGELOG/CLAUDE.md/plugin.json wiring + regression guards)

### Forward dependencies / known limitations

- `bdd_artifact` field is producer-only — no downstream consumer wired (v6.2 target).
- `gherkin_content` per slice + executor-controller persist routine missing (v6.2 target).
- `SLICE-NN` zero-pad capped at 2 digits; behavior undocumented at >=100 slices.
- Batch 1 MINORs deferred: regex tightness in D5-S2/S5 assertions; `bdd_artifact` has no consumer (A2_R1 noted above); `non_spec_atdd.applied` is redundant with `scenario_count > 0`; ARCH naming consistency (`non_spec_atdd` vs `spec_context_scenarios`).

## [6.0.0] - 2026-05-15 — Comprehensive Audit + Hardening (MAJOR)

**Major release.** First full external audit cycle (over the IFRS 16 reference project) plus three hardening waves (Fase D / Fase H / Fase I). All 12 CRITICAL findings resolved, audit surface coverage went from 30% to 95%, three new security mitigation libraries shipped, regression suite expanded to 39 tests, full visual documentation overhaul.

### Why this is a major version bump

- Behavioral contract change: **16 subagents now declare the Achado #7 RUNTIME PROTOCOL section explicitly** (was: 2 of 19 in v5.2.0). Subagents that previously fell back to prose questions when their input was ambiguous now MUST emit structured `GATE_REQUEST v1` / `PLAN_MODE_REQUEST v1` blocks. Consumers that parsed prose output need to migrate to the structured payloads.
- Constant rename: `STALE_THRESHOLD_MS` and `STALE_HEARTBEAT_MS` renamed to canonical `STALE_SPAWN_THRESHOLD_MS` / `STALE_HEARTBEAT_THRESHOLD_MS`. Old names preserved as deprecated aliases through v6.0.x; removal scheduled for v6.1.0.
- New SSOT documents: `references/stale-thresholds.md`, `docs/audits/2026-05-15-ifrs16-deep-audit/`, `docs/diagrams/`.

### Added

- **`lib/sentinel-state-signer.cjs`** (I4) — HMAC-SHA256 integrity signature for `sentinel-state.json`. Mitigates audit finding H1-002 (sentinel-hook fail-open admitted by design). Auto-generated 32-byte key at `~/.claude/plugins/cache/.../v6.0.0/.hmac-key` (chmod 600). Strict and migration modes. Uses `crypto.timingSafeEqual` against timing attacks.
- **`lib/jsonl-sanitizer.cjs`** (I5) — Safe append API for `gate-decisions.jsonl` and `protocol-events.jsonl`. Mitigates audit findings B1-005 and H6-001 (JSONL injection demonstrated breaking parse). Allowlist of 8 / 15 keys, strict `JSON.stringify`, 200-char truncation per Inline Invariant 2, round-trip validation before write, drops unknown keys silently.
- **`lib/pipeline-local-parser.cjs`** (I6) — Strict parser for `.claude/pipeline.local.md`. Mitigates audit finding H6-002 (RCE potential via shell metacharacters in `build_command`). Parses only YAML frontmatter, whitelists 5 keys, shell-injection guard, path-traversal guard. Validated against real adversarial POC during Fase I.
- **`references/stale-thresholds.md`** (I7) — SSOT canonical for the three distinct "stale" concepts: STALE_SPAWN (5 min, sentinel-hook) / STALE_HEARTBEAT (10 min, session-lock + edit-guard) / STALE_CONTEXT (24 h, gate registry). Includes decision tree for diagnosing which concept fired.
- **`docs/diagrams/`** — Visual documentation overhaul. Standalone HTML files renderable in any browser: pipeline overview, Achado #7 protocol, gate hierarchy, audit history timeline.
- **`docs/audits/2026-05-15-ifrs16-deep-audit/`** — 9 archived reports from the comprehensive audit (canonical contract, decision table, FINAL_CONSOLIDATED_REPORT, PANEL_FINAL, FASE_H_FINDINGS, FASE_H_ADDENDUM, FASE_H_FINAL, FASE_I_FINAL, COMPARISON_v5.2_vs_v5.3, INDEX).

### Fixed — 12 CRITICAL audit findings (100%)

- **B1-001** (D9) — Orphan sentinel state cross-session contamination. Added ORPHAN_CLEANUP mode + 24h TTL contract in `agents/core/sentinel.md`.
- **B1-004** (D2) — `information-gate` falling back to prose when gap requires user decision. Added ACHADO #7 RUNTIME PROTOCOL section to `agents/core/information-gate.md`.
- **B5-001** (D2) — `plan-architect` writing plan inline instead of emitting `PLAN_MODE_REQUEST v1`. Added ACHADO #7 RUNTIME PROTOCOL section to `agents/quality/plan-architect.md`.
- **F3-1** (D2-follow-up, panel adversarial finding) — Schema drift in worked examples (`multiSelect` camelCase, `(Recomendado)` suffix instead of `recommended: true` field, missing `expected_deliverables`). Corrected examples in 16 subagents.
- **F3-3** (D2-extension, panel adversarial finding) — 14 sibling subagents shared the same protocol-fallback bug. Applied same ACHADO #7 section to `design-interrogator`, `pre-tester`, `executor-fix`, `executor-implementer-task`, `spec-closer`, `feature-implementer`, `bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`, `ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`, `architecture-reviewer`, `sanity-checker`.
- **H1-NEW-001 / H1-NEW-002 / H1-NEW-003** (D2-extension-v2, second-pass audit) — `sanity-checker`, `checkpoint-validator`, and `bugfix-regression-tester` still fell back to prose despite D2-extension append. Added explicit ACHADO #7 PROSE-FALLBACK GUARD note at the **top** of each spec (LLMs prioritize top-of-file). Empirically validated in runtime re-test.
- **H1-002** (I4) — sentinel-hook fail-open by design. Mitigated by HMAC signature library.
- **H6-001** (I5) — JSONL injection (POC demonstrated parse break with quotes). Mitigated by sanitizer library.
- **H6-002** (I6) — `pipeline.local.md` accepted shell injection (`build_command: "echo PWNED && rm -rf /"` would execute). Mitigated by sandbox parser library, validated against the real POC.

### Fixed — HIGH findings

- **H1-001** — `dispatch-guard.cjs` table `AGENT_LEAF_TO_FQN` was missing `brainstorm-controller`, `step-00-intake`, `step-01-explore`. The hook's own test suite was failing. Added the 3 entries; suite went from 6/7 to 13/13 PASS.
- **H1-003** (I7) — STALE_THRESHOLD drift across hooks (5 min) vs registry (24 h). Created SSOT `references/stale-thresholds.md`, renamed constants to canonical names, added cross-references in `references/gates.md`, `commands/pipeline.md`, `agents/core/sentinel.md`.

### Tests

- **39 regression tests** total in `tests/regression/v6.0.0/`:
  - `D2_test_subagent_protocol.cjs` — 16 tests (1 per subagent) validating Achado #7 section + schema rules + placeholder leak detection
  - `D9_test_orphan_cleanup_spec.cjs` — 1 test
  - `I4_I5_I6_lib_test.cjs` — 14 tests covering signer + sanitizer + parser
  - `I7_stale_thresholds_consistency.cjs` — 8 tests covering SSOT + canonical names + cross-refs
- **Hook test suite** — 7/7 PASS (was 6/7 in v5.2.0; dispatch-guard now green).
- Two BDD Gherkin feature files documenting expected runtime behavior.
- Audit coverage milestone: **22/22 gate registry entries exercised in runtime** (was 5/22 in v5.2.0).

### Runtime evidence (Fase G)

After applying D2, re-dispatched `information-gate` with the original B1-004 scenario. Subagent now emits `GATE_REQUEST v1` block with `multi_select: false`, `recommended: true` field, AWAITING_GATE_RESPONSES status. Re-dispatched `plan-architect` with B5-001 scenario; subagent emits `PLAN_MODE_REQUEST v1` with concrete `plan_id`, `expected_deliverables`, `research_scope`, and explicitly states *"plan will NOT be emitted inline"*.

### Breaking changes

1. **Subagent output format** — Subagents that previously emitted prose questions now emit structured YAML blocks. Consumers parsing tool results must look for `=== GATE_REQUEST v1 ===` / `=== PLAN_MODE_REQUEST v1 ===` / `=== DISPATCH_REQUEST v1 ===` blocks.
2. **Constant rename** — `STALE_THRESHOLD_MS` → `STALE_SPAWN_THRESHOLD_MS` (sentinel-hook), `STALE_HEARTBEAT_MS` → `STALE_HEARTBEAT_THRESHOLD_MS` (edit-guard-hook). Old names exported as deprecated aliases through v6.0.x; removal scheduled for v6.1.0.
3. Worked-example schema in 16 subagents now uses `multi_select` (snake_case) and `recommended: true` field. Consumers generating these blocks programmatically must update to the canonical shape.

### Migration

No code changes required for normal users invoking `/pipeline-orchestrator:pipeline` or `/pipeline-orchestrator:brainstorm`. The plugin behaves as before; the changes harden the runtime contract.

External tools that **parse subagent output** must migrate from prose-style A/B questions to structured YAML blocks. See `references/gate-request-protocol.md` for the canonical schema.

External tools that **import hook constants** should switch from `STALE_THRESHOLD_MS` / `STALE_HEARTBEAT_MS` to the canonical `STALE_*_THRESHOLD_MS` names.

### Audit artifacts

Full audit trail in `docs/audits/2026-05-15-ifrs16-deep-audit/`:
- `INDEX.md` — reading order + summary
- `_canonical_contract.md` — audit ground truth
- `FINAL_CONSOLIDATED_REPORT.md` — phase B+D matrix
- `PANEL_FINAL.md` — 3-persona consolidation (Anthropic Senior Auditor + Claude Code Engineer + Redteam)
- `FASE_H_FINDINGS.md`, `FASE_H_ADDENDUM.md`, `FASE_H_FINAL.md` — second-pass deep audit
- `FASE_I_FINAL.md` — residual coverage + 3 security libraries
- `COMPARISON_v5.2_vs_v5.3.md` — pre/post comparison with runtime evidence

## [5.2.0] - 2026-05-08 — Achados 1-7 reconciliation + GATE_REQUEST/DISPATCH_REQUEST protocol (PROMOTED FROM rc.2)

**Minor release.** Promoted from v5.2.0-rc.2 with identical content. User authorized direct promotion for distribution to all marketplace consumers — `/plugins update` (default mode) on any client now receives this version automatically. The 5 follow-ups deferred to v5.2 final (A.4 state persistence, A.5 orphan-lock auto-cleanup, A.6 runtime test framework, A.13 dispatch_id retry collision, A.14 exec-window protocol migration) are **acknowledged known limitations**, not blockers — they degrade gracefully in current usage.

See [5.2.0-rc.2] and [5.2.0-rc.1] sections below for the substantive changes (Achados 1-7, GATE_REQUEST protocol, 5 SKILLs adoption, brainstorm step agents, 9 pipeline-controller dispatch sites). Suite: 294 PASS / 10 FAIL (pre-existing Windows CRLF) / 1 SKIPPED. Zero regressions.

## [5.2.0-rc.2] - 2026-05-07 — Achado #7 protocol adoption expanded

**RC follow-up to v5.2.0-rc.1.** Closes the 3 protocol-coverage lacunas identified in the post-rc.1 adversarial verification: (1) the 5 public SKILL entry-points (`/audit`, `/bugfix`, `/feature`, `/spec`, `/pipeline`) now include the GATE_REQUEST handler instructions for the parent main LLM (previously only `commands/pipeline.md` and `commands/brainstorm.md` had them); (2) brainstorm-controller now declares DISPATCH_REQUEST adoption for `agents/brainstorm/step-00-intake.md` and `agents/brainstorm/step-01-explore.md` with concrete examples (previously these Agent dispatches would silently fail per Achado #7); (3) pipeline-controller now includes 10 concrete DISPATCH_REQUEST examples covering all 9 sub-agent dispatch sites (Phase 0a/0b/0c, 1.5, 2c/2e, 3a/3b/3c) plus sentinel checkpoints (previously only Phase 0a had a concrete example, the other 8 sites relied on the abstract "Achado #9 reminder" rule). +4 contract regression tests. One v5.2.0-rc.1 test regression also fixed: a `verify-completion-pre-pa-de-cal.test.js` indexOf-based ordering check broke when a new DISPATCH_REQUEST example for Phase 3b mentioned "final-validator (Pa de Cal)" earlier in the file; resolved by renaming the example description to "Pa-de-Cal verdict" to avoid the substring collision.

## [5.2.0-rc.1] - 2026-05-07 — Achados 1-7 reconciliation + GATE_REQUEST protocol

**Patch-equivalent: pure documentation drift fixes + new contract tests + architectural disclosure.** No behavioral code changes (the Phase 1.5 trigger expansion to `type == Spec` is documented in spec but not yet wired into a runtime classifier — see Achado 7 caveat).

### Fixed (Achados 1, 2, 3, 6)

- **Achado 1 — Phase 1.5 trigger drift between agent file and slash-command spec.** `agents/core/pipeline-controller.md` lines 533-536 reconciled with `commands/pipeline.md` Phase 1.5 detail. Both surfaces now declare the v4.17.0+ rule `(complexity in {MEDIA, COMPLEXA} OR type == Spec) AND --no-plan NOT in args`. Each surface cross-references `tests/fixtures/phase-1-5-trigger.canonical.txt` as SSOT.
- **Achado 2 — Internal contradiction inside `commands/pipeline.md`.** Table-of-Contents bullet (line ~23) and ASCII overview box (line ~197) updated to the new auto-behavior wording. They no longer claim "(COMPLEXA or --plan)" while the body says otherwise.
- **Achado 3 — Orphan TRACE Plan-mode override block.** Block at `agents/core/pipeline-controller.md` lines ~972-979 expanded to enumerate the `type == Spec` rows (SIMPLES Spec + --no-plan honored; MEDIA/COMPLEXA Spec + --no-plan falls through to complexity row). Aligned with §4.6 of `references/trace-schema/v1.md`.
- **Achado 6 — Phase 1.5 trigger silent on `type == Spec`.** Trigger string in both authoritative surfaces now explicitly includes `OR type == Spec`. Coverage matrix in agent file Phase 1.5 details all four (complexity × type=Spec) cells.

### Added (Achados 4, 5)

- **Achado 4 — Brainstorm-to-pipeline plan flag propagation.** `agents/core/brainstorm-controller.md` STEP A.1 now persists `plan_flag` (`"plan"` | `"no-plan"` | `null`) in `manifest.notes.options`. STEP E "Run pipeline now" branch reads the persisted value at handoff and appends the matching CLI flag to the pipeline-controller spawn args. Original CLI flag intent now propagates end-to-end across the brainstorm-handoff boundary.
- **Achado 5 — STEP 1.7 classification consistency guard.** `agents/core/pipeline-controller.md` STEP 1.7 now specifies that on `PREP_RUN_ID` resume, the controller re-classifies and compares `reclassified.complexity` against `manifest.complexity`. On mismatch: log a `classification_discrepancy` event to TRACE.md (`manifest`, `reclassified`, `action: trust_manifest`) and continue using the manifest value. Never halts, never prompts.

### Disclosed + Root cause confirmed (Achado 7 — architectural finding, fix path chosen, implementation deferred)

- **Achado 7 — Subagent runtime tool-inventory limitation. ROOT CAUSE CONFIRMED 2026-05-07T23:50Z** via empirical probe (general-purpose subagent dispatched specifically to test reachability of each suspected tool). Confirmed: `AskUserQuestion`, `Agent`, and `EnterPlanMode` are stripped from the subagent's tool manifest at the runtime level by Claude Code's harness — not denied, not deferred-but-resolvable, simply absent. `Skill`, `Task*` family, `WebFetch`, `WebSearch` all confirmed reachable inside subagents. Mitigation path chosen: **M-2 (Skill dispatch) + M-1 partial (hoisted gates pattern)**. Subagents that previously did `Agent(subagent_type: ...)` will use `Skill(skill: ...)` (Skill is available); user-decision gates that previously did AskUserQuestion will emit a `GATE_REQUEST` block to the parent context. Implementation deferred to v5.2 (~25-40h estimated). See `docs/findings/achado-7-subagent-runtime.md` for the empirical evidence table, the implementation outline, and the remaining open questions.

### Tests

- `tests/fixtures/phase-1-5-trigger.canonical.txt` — single source of truth for the Phase 1.5 trigger string.
- `tests/contracts/phase-1-5-trigger-string.test.cjs` — 8 tests asserting all 5 surfaces reference the canonical fixture and include `type == Spec`. **Catches drift on every CI run.**
- `tests/brainstorm-controller-flag-propagation.test.cjs` — 5 tests covering plan_flag persistence, propagation, and the null/empty case.
- `tests/pipeline-controller-step-1-7-guard.test.cjs` — 6 tests covering the guard subsection, the `classification_discrepancy` event, the `trust_manifest` action, the no-halt/no-prompt invariant, and recursion-bound preservation.
- Suite delta: 166/0/1 → **185/0/1** (+19 tests across 3 new files; zero regressions).

### Migration

- `docs/MIGRATION-v5.0-to-v5.1.md` extended with a new "Phase 1.5 trigger reconciliation" section documenting v4.16.0 vs v4.17.0+ vs current behavior, with one before/after example for `--no-plan` on COMPLEXA.

### Known limitations

- The Phase 1.5 expansion to `type == Spec` is wired into `agents/core/task-orchestrator.md` (post-Achado-6 follow-up: the type enum on lines 33, 188, 243 now includes `Spec`, and the pre-classified-type list at Step 1a accepts it). Runtime classifier behavior for type=Spec activates Phase 1.5 plan-mode at any complexity per the canonical fixture.
- `pre-approvals.yaml` (workaround for Achado 7 in resume executions) is documented in `pipeline-runs/001-fix-6-contract-drift-findings/supplement-achado-7.md` as a temporary pattern. It will be superseded by the v5.2 GATE_REQUEST formalism once Achado 7 is implemented.
- The empirical probe artifact (subagent reachability table) lives in the v5.2 milestone planning notes only — not promoted to a regression test until v5.2 lands the architectural fix.

## [5.1.0] - 2026-05-06

**Minor release — Brainstorm-pipeline + Kiro skill clone.** v5.1.0 makes spec-first development the default. The plugin now owns the full spec lifecycle (8 cloned skills) and `/pipeline` will not run a non-trivial task until a spec exists in a per-run directory. Implemented in 6 batches over a single session, all TDD-driven; the suite grew from 166 to ~260+ green tests with zero regressions.

### Added

- **`/pipeline-orchestrator:brainstorm` command (NEW)** — Mandatory front-end. Allocates a fresh `pipeline-runs/<NNN>-<slug>/`, walks the user through `spec-init` → `spec-requirements` → `spec-design` → `spec-tasks` → `validate-design` → `validate-gap`, then prompts for handoff (proceed to `/pipeline` / save / abort) via `AskUserQuestion`.
- **Per-run directory `pipeline-runs/<NNN>-<slug>/` (NEW)** — Canonical working tree for one brainstorm + implementation cycle. Five fixed subfolders: `00-brainstorm/`, `01-spec/`, `02-validations/`, `03-execution/`, `attachments/`, plus a root `manifest.yaml` (schema_version 1) tracking run_id, status, phase, type, complexity, brainstorm_completed, spec_lifecycle_completed, handoff_decision, linked_pipeline_doc_path.
- **8 cloned spec-lifecycle skills (NEW under `skills/`)** — `spec-init`, `spec-requirements`, `spec-design`, `spec-tasks`, `validate-design`, `validate-gap`, `review`, `verify-completion`. Cloned from the Kiro skill collection via `lib/kiro-skill-cloner.cjs`, with paths rewritten from `.kiro/specs/<feature>/` → `pipeline-runs/<run_id>/01-spec/` at clone time.
- **Domain core libs (NEW under `lib/`)** — `run-directory.cjs` (`RunDirectory.allocate()` with atomic NNN allocation, slug collision resolution, slugify with stop-word filter), `run-manifest.cjs` (`RunManifest` class with schema_version 1 + YAML serialization), `path-rewriter.cjs` (rewrite engine for the cloner), `kiro-skill-cloner.cjs` (orchestrates skill clone + frontmatter preservation).
- **STEP 1.7 routing in `commands/pipeline.md`** — Pre-execution branch deciding load-existing / dispatch-brainstorm / no-prep-override / simples-bypass. Logged via gate `STEP_1_7_ROUTING`. Recursion guarded by `STEP_1_7_RECURSION_GUARD` (CIRCUIT_BREAKER, halts at depth ≥3).
- **Pa de Cal pre-validation** — `pipeline-controller` now plugs the cloned `verify-completion` skill before `final-validator`. New HARD gate `STOP_BEFORE_PA_DE_CAL` halts the pipeline with NO-GO and writes `04-final-report.md` if verify-completion fails.
- **Per-batch review skill** — `executor-controller` now plugs the cloned `review` skill into the per-task adversarial step, replacing the prior inline review prompt.
- **3 new gates in `references/gates.md`** — `STEP_1_7_ROUTING` (HARD informational), `STEP_1_7_RECURSION_GUARD` (CIRCUIT_BREAKER), `STOP_BEFORE_PA_DE_CAL` (HARD). Registry grows 22 → 25.
- **Snapshot test suite (NEW under `tests/snapshot/`)** — `run-dir-tree.test.js` locks the freshly-allocated run-dir layout against `golden/run-dir-empty.txt`. `cloned-skills-frontmatter.test.js` locks the YAML frontmatter of all 8 cloned skills against `golden/cloned-skills-frontmatter.txt` to catch silent drift.
- **`docs/migration-v5.0-to-v5.1.md` (NEW)** — Migration guide for v5.0 users with existing `.kiro/specs/<feature>/` content. Documents two paths (continue with brainstorm — recommended; or lift existing spec into a manually-allocated run-dir) and the breaking-change disclosure.
- **`docs/examples/brainstorm-feature.md` (NEW)** — End-to-end walkthrough of brainstorm + handoff workflow.

### Changed

- **`hooks/edit-guard-hook.cjs`** — Whitelist extended to allow Edit/Write to `pipeline-runs/**` alongside `.pipeline/**` when a session lock is active. Existing `.pipeline/` whitelist preserved; arbitrary paths still blocked.
- **`tests/integration/trace-writer.test.js`** — Wave-8 gate-count lock bumped 22 → 25; regex widened to `^\| [A-Z_0-9]{4,} \|` (the new `STEP_1_7_*` names contain digits).
- **`references/glossary.md`** — Added Brainstorm Pipeline section (8 new terms: Brainstorm, Per-Run Directory, Run ID, Cloned Skills, Handoff, STEP 1.7 Routing, STOP_BEFORE_PA_DE_CAL).
- **`README.md`** — Added "What's New in v5.1" section after v5.0 with feature table, migration pointer, and quickstart example.
- **`.claude-plugin/plugin.json`** — version 5.0.0 → 5.1.0.
- **`.claude-plugin/marketplace.json`** — pipeline-orchestrator ref v5.0.0 → v5.1.0.

### Breaking changes (per SemVer disclosure)

The 3 spec-lifecycle workflows (`spec-light`, `spec-heavy`, `spec-audit-only`) no longer read from `.kiro/specs/<feature>/`. They now read from `pipeline-runs/<run_id>/01-spec/`. Existing `.kiro/specs/` content is preserved on disk (no auto-deletion) but is no longer consumed. The decision to ship under v5.1.0 (rather than v6.0.0) is justified in `docs/migration-v5.0-to-v5.1.md` — the breakage manifests only when invoking the spec workflows, the failure mode is graceful (file-not-found, not data corruption), and a clean migration path exists.

### Suite at v5.1.0

- ~260+ unit + integration + snapshot tests, all green.
- Zero regressions vs v5.0.0 baseline (166 PASS / 0 FAIL / 1 SKIPPED).
- New coverage areas: domain core (Batch 1), skill cloner (Batch 2), brainstorm front-end (Batch 3), pipeline-controller routing (Batch 4), executor integration (Batch 5), edit-guard whitelist + snapshot golden files (Batch 6).

### Deferred to v5.2

- F6 (test fidelity for brainstorm dispatch — currently uses a doc-presence check, not a live skill spawn) per `notes/batch-6-todos.md`.

## [5.0.0] - 2026-05-06

**Major release — first v5.0 stable.** Promoted from `v5.0.0-rc.1` (commit `d643e80`) to `v5.0.0` after user authorization on the same day; the feedback window between rc.1 and 5.0.0 was waived. Content is identical to rc.1.

### What v5.0.0 means

All 7 v5.0 DoD criteria from `designs/pipeline-orchestrator-v5-consolidated.md` §8 are DONE:

1. **5 commands in `/help`** — DONE since v4.7.0 (6th `/spec` since v4.12.0).
2. **TRACE.md in user repo by default** — DONE in v4.17.0 (Wave 8-spec).
3. **TRACE.md attachable to PR via standalone validator** — DONE in v4.17.0 (Wave 8-spec).
4. **Compat suite green for 5 canonical scenarios** — DONE since v4.10.0 (5 PASS / 1 SKIPPED at v5.0.0).
5. **v5.1 milestone published** — DONE post-v4.17.0 via [milestone #1 — v5.1 Pipeline Declarativo (Slice 5)](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) with 3 placeholder issues (#16, #17, #18).
6. **Plan-mode auto-triggers on MEDIA/COMPLEXA** — DONE in v4.17.0 (Wave 8-spec).
7. **`pipeline-controller` declares spawn tools explicitly** — DONE since 2026-05-03.

### Suite at v5.0.0

- Unit + integration: 166 PASS / 0 FAIL / 1 SKIPPED.
- Compat mock: 5 PASS / 0 FAIL / 1 SKIPPED.
- Hooks syntax: 8 / 8 OK.
- Zero regressions vs v4.16.0 baseline (149 PASS).

### Changed

- **`.claude-plugin/plugin.json`** — version 4.17.0 → 5.0.0.
- **`.claude-plugin/marketplace.json`** — pipeline-orchestrator entry version 4.17.0 → 5.0.0; ref v4.17.0 → v5.0.0.
- **`tests/unit/spec-entry-point-and-pipelines.test.js:231`** — pin bumped 4.17.0 → 5.0.0.
- **`docs/v5-readiness-report.md`** — final-shipping snapshot; 7/7 DONE confirmed.
- **`CLAUDE.md`** — lineage row v5.0.0 added.

### Open items deferred to v5.0.1 / v5.1

Documented in `docs/v5-readiness-report.md` §4 — none block v5.0.0 itself:

- `sentinel-hook.cjs` cwd-discovery brittleness when CC launched outside the repo root (Wave 8-spec dogfood finding).
- Pipeline-controller `## Your tools` section text update after Step 3b-post introduces cross-tree TRACE write (non-blocking polish).
- JS regex `\Z` gotcha pattern flagged for retro / code-review.
- 11 outstanding deferred debts (10 Wave 3 MEDIUM → v4.13.1; ARCH-WAVE6-1 → v4.14.1).

## [4.17.0] - 2026-05-06

**Minor release WAVE 8-SPEC — TRACE.md + PLAN-MODE AUTO-TRIGGER**. Last technical block before `v5.0.0-rc.1`. Closes 3 v5.0 DoD criteria (#2, #3, #6) in a single wave. Self-hosted dogfood: this release was developed by running `/pipeline-orchestrator:pipeline` on its own canonical repo; the dogfood revealed and documented `sentinel-hook` cwd-discovery brittleness as a v5.0-rc.1 follow-up.

### Added

- **`references/trace-schema/v1.md` (NEW)** — Authoritative SSOT for the TRACE.md artifact. Declares `schema_version: 1`, canonical field order (mirroring `designs/pipeline-orchestrator-v5-consolidated.md` §13), the four required H2 sections (Classification, Pipeline Definition, Execution Log, Final Verdict), the optional Plan Mode override section (§4.6, used when `--no-plan` is passed), the `<run-id>` format `{YYYYMMDD-HHMMSS}-{6char-random}-{slug}`, and the `pipeline-orchestrator.persist_runs: 'private'` opt-out path (`~/.claude/data/pipeline-orchestrator/runs/...`). Closes DoD #2.
- **`scripts/validate-trace.cjs` (NEW)** — Standalone TRACE.md validator. Pure Node, zero external deps. `node scripts/validate-trace.cjs <path>` exits 0 (valid against schema_version=1) or 1 (invalid + diagnostic diff on stderr listing missing/malformed fields and out-of-order sections). Usage on no-args / nonexistent file exits 2 with usage line. Module-exports `{ validate, parseHeaderFields, findSectionPositions }` for unit tests. Closes DoD #3.
- **`tests/integration/trace-writer.test.js` (NEW)** — 7 contract tests covering: schema doc existence + `schema_version: 1` declaration, presence of all canonical header fields, presence of the four required H2 sections, dispatch_mode invariant (#6) documentation, pipeline-controller wires TRACE.md emission in Phase 3 closure between final-validator and finishing-branch, persist_runs opt-out documented, and Iron Law check that `references/gates.md` registry remains at 22 gate rows.
- **`tests/unit/validate-trace.test.js` (NEW)** — 5 unit tests for the validator: happy-path fixture exits 0; corrupt-frontmatter exits 1; corrupt fixture stderr lists at least one issue; no-args exits non-zero with usage; nonexistent file exits non-zero with clear error.
- **`tests/unit/plan-mode-trigger.test.js` (NEW)** — 5 unit tests for the new Phase 1.5 auto-trigger contract: trigger condition mentions both MEDIA and COMPLEXA, modes table documents `--no-plan`, COMPLEXA + `--no-plan` documented as override-blocked, TRACE schema declares the three Plan Mode override fields (`plan_mode_skipped`, `plan_override_attempted`, `justification`), design §8 corrected.
- **`tests/fixtures/trace/happy-path.md` (NEW)** — Reference TRACE.md that conforms to schema_version=1; consumed by validator unit tests and the integration test.
- **`tests/fixtures/trace/corrupt-frontmatter.md` (NEW)** — Intentionally malformed TRACE.md (wrong `trace_schema_version: 99`, missing fields, missing sections); consumed by validator failure-path tests.
- **`commands/pipeline.md` modes table — new `--no-plan` row** — Documents the bypass flag and explicitly notes that COMPLEXA ignores it (override blocked).

### Changed

- **`agents/core/pipeline-controller.md` Phase 3 closure — new Step 3b-post (TRACE.md emitter)** — After `final-validator` returns its GO/CONDITIONAL/NO-GO verdict and BEFORE `finishing-branch`, the controller now reads `gate-decisions.jsonl`, `confidence-score.yaml`, the per-phase agent docs, and `references/pipelines/<variant>.md`, then emits a single consolidated `TRACE.md` to `<repo-root>/.pipeline-orchestrator/runs/<run-id>/TRACE.md` (default) or `~/.claude/data/pipeline-orchestrator/runs/<run-id>/TRACE.md` (when `pipeline-orchestrator.persist_runs: 'private'` is set). The controller opens an `edit-guard` exec-window before the cross-tree Write per the F-001 cooperative-authorization pattern, then closes it. Verification step re-reads the path to confirm `trace_schema_version: 1` is present before continuing to finishing-branch.
- **`commands/pipeline.md` Phase 1.5 trigger condition** — Extended from `complexity == COMPLEXA` to `complexity ∈ {MEDIA, COMPLEXA} AND --no-plan ausente`. The block now includes a 3×3 truth table covering SIMPLES / MEDIA / COMPLEXA against (no flag / `--no-plan` / `--plan`).
- **`designs/pipeline-orchestrator-v5-consolidated.md` §8 Critério #6 prose** — Corrected to remove the contradiction flagged in `docs/v5-readiness-report.md` §1 (which said "verify in design before implementing"). The corrected text now states explicitly that COMPLEXA always runs plan-architect; `--no-plan` is accepted by the parser but ignored at COMPLEXA, with the flag and justification logged in TRACE.md for audit. Rationale is preserved: COMPLEXA tasks are scope-driven and bypassing planning at this level historically correlates with regressions.
- **`tests/unit/spec-entry-point-and-pipelines.test.js:231`** — Pin bumped from `4.16.0` to `4.17.0` (release-admin chore, not a content invariant).
- **`docs/v5-readiness-report.md`** — Regenerated. Criteria #2 / #3 / #6 advance from PARTIAL/PENDING to DONE. §4 recommended path collapses from "Wave 8 + tag rc.1" to "tag rc.1".

### v5.0 DoD progress (this wave + the post-tag administrative milestone close 4 of 7 criteria)

- DoD #2 (TRACE.md by default) → DONE in this release.
- DoD #3 (TRACE.md attachable to PR via standalone validator) → DONE in this release.
- DoD #6 (plan-mode auto-triggers on MEDIA/COMPLEXA + `--no-plan` bypass) → DONE in this release.
- DoD #5 (v5.1 milestone published) → DONE post-tag via [milestone #1 — v5.1 Pipeline Declarativo (Slice 5)](https://github.com/fernandoxavier02/Pipeline-Orchestrator/milestone/1) (target Q3 2026, due 2026-09-30) with 3 placeholder issues: [#16 YAML grammar prototype](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/16), [#17 dispatch table design](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/17), [#18 interpreter spike](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues/18).

DoD #1, #4, #7 were already DONE pre-wave. **All 7 criteria DONE; v5.0.0-rc.1 unblocked.**

### Behavior Changes

- **MEDIA tasks now trigger plan-architect by default** (additive, opt-out via `--no-plan`). Pre-v4.17.0, only COMPLEXA triggered plan-architect; MEDIA was a SKIP. To preserve v4.16.0 behavior on a MEDIA task, pass `--no-plan` explicitly — the user will be asked for a justification that lands in `TRACE.md`.
- **Default behavior preserved EXACTLY** for SIMPLES (no plan, ever) and COMPLEXA (always plan; `--no-plan` is logged but does not bypass). The change is scoped to the MEDIA × no-flag cell of the truth table.

### Iron Laws Respected

- Gate registry untouched at 22 entries in `references/gates.md`.
- Sentinel checkpoints (5 mandatory, defined in `references/sentinel-integration.md`) untouched.
- Agent dispatch namespace untouched (no agents added, removed, or renamed).
- v5.0.0 NOT bumped; this remains a v4.x release.
- 11 outstanding deferred debts (10 Wave 3 MEDIUM → v4.13.1; ARCH-WAVE6-1 → v4.14.1) UNTOUCHED.
- TRACE.md path is `.pipeline-orchestrator/runs/` (in user repo), explicitly NOT `.pipeline/`.

### Self-hosted dogfood findings

- `sentinel-hook.cjs` discovers `sentinel-state.json` via `process.cwd()/.pipeline/docs/`. When Claude Code is launched from a parent directory rather than the plugin repo root, no candidate path resolves and non-bootstrap sub-agent spawns are blocked. Mitigation in v4.17.0 development: pivot to controller-direct edits (preserving TDD discipline). Long-term fix: `v5.0.0-rc.1` will add a `CLAUDE_PROJECT_ROOT` env-var fallback and/or marker-file discovery.
- `commands/pipeline.md` regex audit-test had a `\Z` anchor that JavaScript regex silently treats as literal `Z`. Bug found because Phase 3 closure UX text contains "ZERO context"; fixed to use explicit slice + H2 boundary search. Same gotcha may appear in other audit-style tests; flagged for retro.

## [4.16.0] - 2026-05-06

**Minor release WAVE 8-PRE / ISSUE #11 — REAL-MODE COMPAT RUNNER**. Closes Issue #11 by reimplementing `tests/compat/runner.cjs::executeReal()` from stub to working real-mode CI harness, using the `PreToolUse` hook contract that became available in Claude Code v2.1.85+ (`permissionDecision: "allow"` + `updatedInput.answers` to satisfy `AskUserQuestion` in headless mode). The previously documented `--ci-auto-confirm` workaround in `designs/slice-0/SPIKE-CI-HARNESS.md` is no longer needed; SPIKE status updated 🟠 PARTIAL PASS → 🟢 PASS. **Iron Law respected**: only `tests/compat/`, `tests/unit/`, `.github/workflows/`, `designs/`, `CHANGELOG.md`, `.claude-plugin/plugin.json` modified. ZERO changes to `agents/`, `skills/`, `references/`, `commands/`, `hooks/` (the plugin core remains untouched, including the v4 controller architecture and the 22-gate registry). Suite stays GREEN: 129 unit + 8 NEW unit (compat-runner-real) + 12 integration + 5 PASS / 1 SKIPPED compat + 8 hooks syntax (exit 0). Real-mode runner is opt-in via `vars.CLAUDE_CLI_AVAILABLE=true` + `secrets.ANTHROPIC_API_KEY` — default PR gate stays mock-mode (zero API spend, deterministic).

### Added

- **`tests/compat/auto-answer-hook.cjs` (NEW)** — generic PreToolUse auto-answer hook for compat regression. Reads `PreToolUse` payload from stdin; for each `AskUserQuestion` question, picks `options[0].label` as default (the "Recomendado" convention from `CLAUDE.md` regra mestra) or applies a header-keyed override from `tests/compat/v4-baseline/answers-overrides.json`. Emits the official `permissionDecision: "allow"` + `updatedInput.questions` echo + `updatedInput.answers` map shape required by Claude Code v2.1.85+ (verified against `code.claude.com/docs/en/hooks` "PreToolUse decision control" 2026-05-06). Defensive fall-throughs: non-AskUserQuestion tools → `{ continue: true }` no-op; empty stdin → `{ continue: true }`; multiSelect=true → comma-separated labels (validated against options before commit); empty options array → null answer with stderr warning; override label not in options → fallback to default + stderr warning. Module-exported (buildResponse, pickAnswer, loadOverrides) for unit tests; only auto-runs when invoked directly.
- **`tests/compat/v4-baseline/answers-overrides.json` (NEW)** — JSON map `{ "<header>": "<label>" }` for overriding the default first-option-pick on specific gates. Initially contains only a `_doc` key (stripped at runtime by the hook) describing two example overrides for future fixtures (`Adversarial: "Skip"` for ux-fixture, `Closeout: "Keep uncommitted"` for hotfix). bugfix-fixture (the only real-mode smoke scenario in CI as of v4.16.0) needs no overrides.
- **`tests/unit/compat-runner-real.test.js` (NEW, 9 tests)** — node:test suite. 8 hook tests run ALWAYS (no claude CLI required): default first-option pick; multi-question payload; valid override replaces default; invalid-label override falls back + warns; multiSelect comma-join; non-AskUserQuestion pass-through; empty options → null answer + warns; empty stdin → continue:true. 1 real-mode runner test runs only when `claude --version` succeeds (otherwise `it.skip()`); it invokes `runner.cjs --scenario=bugfix-fixture` and logs the result for inspection. Real-mode test does NOT hard-assert exit 0 because LLM determinism is a known risk (Issue #11 §Risks) — it asserts only that exit ≠ 2 (config error). CI gate is the workflow itself, not this test.

### Changed

- **`tests/compat/runner.cjs`** — `executeReal()` reimplemented (lines 213-227 of v4.15.0 stub replaced with full implementation, ~150 lines net add). Spawns `claude -p "<input.md>" --settings <tmp> --output-format stream-json --include-partial-messages --permission-mode bypassPermissions --allowedTools "Read Glob Grep Write Edit AskUserQuestion Task"` via `spawnSync` with 90s timeout + SIGKILL. Tmp settings.json created via `fs.mkdtempSync(os.tmpdir())` wires our hook under matcher `AskUserQuestion`. Stream-json parser extracts: `system/init` events (agent roster), `assistant` events with `tool_use` blocks named `Task` (sub-agent spawns) and `Write|Edit` blocks under PIPELINE_DOC_PATH (artifact tracking), and `result` events (verdict + classification regex scan). Best-effort gate recovery from latest `.pipeline/docs/Pre-*-action/<session>/gate-decisions.jsonl` post-run (stream-json text scan can't reliably reconstruct gate hardness/decision tuples). Cleanup: tmp settings deleted in `finally`; PIPELINE_DOC_PATH preserved for forensics. New module exports (`parseStreamJson`, `writeTmpSettings`, `executeReal`, `recoverGatesFromArtifact`) for unit tests.
- **`.github/workflows/compat-regression.yml`** — split into 2 jobs. `compat-regression-mock` (always runs, 6min timeout, gate of PR — same as v4.15.0). NEW `compat-regression-real` (opt-in via `if: vars.CLAUDE_CLI_AVAILABLE == 'true'`, 8min timeout, depends on `compat-regression-mock` PASS). Real job installs `@anthropic-ai/claude-code` globally, uses `secrets.ANTHROPIC_API_KEY`, runs `--scenario=bugfix-fixture` on PR triggers (~$0.50-1, ~60-90s) or `--all` on `workflow_dispatch` (~$3-5, ~5-10min). Failure comments document the 3 most likely causes (pipeline drift / hook protocol drift / LLM flake). Real-mode artifacts uploaded as `compat-results-real-${{ github.run_id }}` separate from mock artifacts.
- **`designs/slice-0/SPIKE-CI-HARNESS.md`** — status header changed from 🟠 PARTIAL PASS to 🟢 PASS. Added 2026-05-06 adendum explaining: (a) Anthropic v2.1.85 added the auto-answer-via-hook capability, (b) we adopt this without `--ci-auto-confirm` (which never landed and is no longer needed), (c) hybrid path (mock PR gate + real opt-in smoke + release dispatch full) realized. §2.1, §2.2, §2.3, §3.1, §3.2, §5 (DoD checklist), and §6 (verdict) all updated to reflect realized state. Historical content (§1, §3.3 smoke manual, §4 nightly drift detection backlog) preserved.
- **`.claude-plugin/plugin.json`** — version `4.15.0` → `4.16.0`; description prepended with the v4.16.0 summary line.

### Backward Compatibility

- 100% additive at the plugin runtime layer. Mock-mode PR gate behavior is unchanged: same `runner.cjs --all --mock` command, same 5/5 PASS / 1 SKIPPED outcome, same exit codes. Real-mode is opt-in via repo variable + secret — without those, the new `compat-regression-real` job is skipped silently (CI green).
- Hook script is test infrastructure under `tests/compat/`, NOT part of plugin distribution. Production users of the plugin never load this hook (it is invoked only by `runner.cjs` when writing tmp settings). Plugin behavior in real `claude` sessions is identical pre/post v4.16.0.
- No frontmatter, no agent contract, no SKILL.md sequence, no gate registry entry, and no JSONL schema is changed.
- Pre-existing test counts grow: 129 unit + 8 NEW unit (`compat-runner-real.test.js` hook tests) + 1 conditional unit (real-mode runner test, skipped when CLI absent) = 137 unit nominal / 138 max. Integration unchanged at 12. Compat unchanged at 5 PASS / 1 SKIPPED.

### Constraints respected (cirurgical scope)

- **`agents/`**: untouched.
- **`skills/`**: untouched.
- **`references/`**: untouched.
- **`commands/`**: untouched.
- **`hooks/`** (plugin core, `.claude/hooks/`, `tests/compat/auto-answer-hook.cjs` is NOT plugin core): untouched.
- Modified surfaces: `tests/compat/auto-answer-hook.cjs` (NEW), `tests/compat/v4-baseline/answers-overrides.json` (NEW), `tests/compat/runner.cjs` (modify), `tests/unit/compat-runner-real.test.js` (NEW), `.github/workflows/compat-regression.yml` (modify), `designs/slice-0/SPIKE-CI-HARNESS.md` (modify), `CHANGELOG.md` (this section), `.claude-plugin/plugin.json` (version bump).

### v5.0 DoD progress (Issue #11 was the last 5%)

`docs/v5-readiness-report.md` §2 listed Issue #11 as the gating step before Wave 8 (TRACE.md + plan-mode auto-trigger). With Issue #11 closed, DoD criterion #5 ("5 baselines compat reais running in CI") moves from PARTIAL to **PARTIAL+** — 1 of 5 fixtures (bugfix-fixture) is wired for real-mode CI under opt-in toggle. Graduating the other 4 (audit, feature, hotfix, ux) from REAL-mock-only to REAL-mock+real-CI is a follow-up backlog item (each requires a real-mode capture session against the live LLM to confirm the v4.10.0 baselines still match — cheap, ~$3-5 total). Wave 8 (TRACE.md + plan-mode auto-trigger) is now the next gate to v5.0.0-rc.1.

### Pipeline-driven (dogfood)

v4.16.0 was scoped via `/pipeline-orchestrator:pipeline` itself (Feature, MEDIA, `implement-light` variant, 3 batches: A hook+overrides, B runner+workflow, C tests+spike+release). Phase 0 hit `INFO_GATE_BLOCKED` (HARD) at the start because the PreToolUse + AskUserQuestion contract was not in local docs; main LLM resolved via WebFetch from `code.claude.com/docs/en/hooks` and re-dispatched the controller. Phase 1.5 plan was generated inline (controller, not plan-architect N2 — escopo bem definido pós-resolução de gap). Phase 2 batches each opened a 60-min exec-window for tests/compat/ + tests/unit/ + .github/ writes; per-batch adversarial gate SKIPPED (domain = test-infra, no auth/crypto/data-model/payment touched). Phase 3 sanity: 8 hook unit tests PASS by construction (asserted shape against confirmed schema); mock-mode regression suite untouched (still 5/5 PASS); real-mode runner test skipped in this dogfood session because we did NOT execute `claude -p` from inside the controller (would require nested CLI which is out of scope). Final adversarial gate offered and DECLINED (test-infra domain, opt-out per regra mestra). Final-validator: GO (all build/test invariants preserved; new code is additive; SPIKE downgraded from PARTIAL to PASS). Closeout: keep uncommitted (Iron Law allows; user can git diff before commit/push).

### Known debt — unaffected by this release

- **`v4.13.1`** — 10 MEDIUM findings from Wave 3. Not blocking v5.0; not affected by `v4.16.0`.
- **`v4.14.1`** — `ARCH-WAVE6-1` test-helper duplication. Not blocking v5.0; not affected by `v4.16.0`.

### v5.0 dependency forwarded

Wave 8 (TRACE.md schema + writer + validator + plan-mode auto-trigger + `--no-plan` bypass) remains the next blocker between current main and `v5.0.0-rc.1`. See `docs/v5-readiness-report.md` §4.

---

## [4.15.0] - 2026-05-06

**Minor release WAVE 7-SPEC — V4-TO-V5 MIGRATION DOC + V5 READINESS REPORT**. Pure documentation release that consolidates the v4.0 → v4.14 lineage into a single migration guide and produces an explicit, third-party-verifiable readiness report against the 7-criterion Definition of Done for v5.0 (`designs/pipeline-orchestrator-v5-consolidated.md` §8). No agent / skill / reference / command / hook / test surface is touched. Suite stays GREEN at the v4.14.0 levels: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat + 8 hooks syntax (exit 0). **Iron Law respected**: ZERO changes to `agents/`, `skills/`, `references/`, `commands/`, `hooks/`, or `tests/`.

### Added

- **`docs/MIGRATION-v4-to-v5.md` (NEW, ~250 lines, 10 sections)** — consolidated migration guide spanning the full v4 lineage. §1 motivation; §2 lineage table v4.0 → v4.14 (one line per release); §3 13 accumulated breaking changes since v3 → v4 (still relevant in v5 prep); §4 upgrade procedure (standard, cold-start, custom paths, no settings change); §5 FQDN mapping for the 4 namespace corrections from `4.9.0` (old `pipeline-orchestrator:quality:adversarial-*` → new `pipeline-orchestrator:executor:type-specific:adversarial-*`); §6 DoD v5.0 status (3 DONE, 2 PARTIAL, 2 OPEN); §7 compatibility matrix for FX Studio / Pulsar / custom forks; §8 what v5.0 will and will NOT change; §9 rollback; §10 forward-deferred items.
- **`docs/v5-readiness-report.md` (NEW, ~150 lines, 6 sections + TL;DR)** — short readiness snapshot anchored at `v4.15.0`. §1 the 7-criterion table with verification methods + status + evidence; §2 gap analysis with concrete close-out steps for the 4 non-DONE criteria; §3 explicit list of items NOT blocking v5.0 (so contributors don't waste time on them); §4 recommended path to v5.0 in 3 sequential steps (Issue #11 → Wave 8 (TRACE.md + plan-mode auto-trigger) → tag v5.0.0-rc.1 → v5.0.0); §5 risk register; §6 expiry conditions for the report itself.

### Changed

- **`.claude-plugin/plugin.json`** — version `4.14.0` → `4.15.0`; description prepended with the v4.15.0 summary line.
- **`README.md`** — index linkage to the new `docs/MIGRATION-v4-to-v5.md` added where the file already references `docs/MIGRATION-v3-to-v4.md` (the v4 Breaking Changes section).

### Backward Compatibility

- 100% additive. No existing file is renamed, removed, or restructured. The two new docs cross-reference each other and the existing `docs/MIGRATION-v3-to-v4.md`; no other markdown file gains or loses a link.
- Pre-existing test counts preserved as upper-bound guarantees: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat + 8 hooks syntax (none of those surfaces is touched). Suite still exits 0.
- No frontmatter, no agent contract, no SKILL.md sequence, no gate registry entry, and no JSONL schema is changed.

### Constraints respected (cirurgical scope)

- **`agents/`**: untouched.
- **`skills/`**: untouched.
- **`references/`**: untouched.
- **`commands/`**: untouched.
- **`hooks/`**: untouched.
- **`tests/`**: untouched.
- Modified surfaces: only new files under `docs/`, plus version + description bump in `.claude-plugin/plugin.json`, plus 1 link addition in `README.md`, plus this `CHANGELOG.md` section.

### Pipeline-driven (dogfood)

Wave 7-spec was scoped via `/pipeline-orchestrator:pipeline` itself with `PRE_CLASSIFIED_TYPE=Feature` + `complexity=MEDIA` (docs-only Feature variant). 4-batch plan: A (`docs/MIGRATION-v4-to-v5.md`), B (`docs/v5-readiness-report.md`), C (`CHANGELOG.md` + `plugin.json`), D (`README.md` link + closure sanity). Per-batch adversarial gate was SKIPPED (docs-only, no auth/crypto/data-model/payment touched). Final adversarial gate was offered and DECLINED (matches the v4.14.0 dogfood pattern documented in its CHANGELOG note). Sanity at close: no test surface touched (suite GREEN by construction); markdown link sanity check via Grep — no broken references.

### Known debt — unaffected by this release

The two patches queued before v5.0 are unchanged:

- **`v4.13.1`** — 10 MEDIUM findings from Wave 3 (Compat Baselines) review, scope: hook hardening + test isolation. Not blocking v5.0; not blocking by `v4.15.0`.
- **`v4.14.1`** — `ARCH-WAVE6-1` test-helper duplication (`shouldEscalate(attempt, batchChanged)` between Wave 5 and Wave 6 test files). Cleanup plan: extract to `tests/_helpers/adversarial-loop-rule.cjs`. Not blocking v5.0; not blocking by `v4.15.0`.

### v5.0 dependency forwarded

`v4.15.0` documents — but does not resolve — the 2 OPEN and 2 PARTIAL DoD criteria. Resolution path is Issue #11 (admin: open v5.1 milestone) followed by Wave 8 (TRACE.md schema + writer + validator + plan-mode auto-trigger + `--no-plan` bypass). Both are described in detail in `docs/v5-readiness-report.md` §2 and §4.

---

## [4.14.0] - 2026-05-06

**Minor release WAVE 6-SPEC — INTEGRATION TESTS + COMPAT FIXTURE + BAD-VARIANT FIXTURES**. Pure additive release that hardens the Wave 1–5 spec lifecycle stack (4 agents + 3 skill trees + 6 gates + mode_used persistence) with three layers of net: (a) an 8-scenario integration test suite covering the spec-format-gate → spec-content-reviewer → spec-post-impl-validator → spec-closer chain, gate hardness/recovery assertions, and ADVERSARIAL_LOOP_CHECKPOINT counter-reset semantics; (b) a TEMPLATE compat regression fixture (`spec-fixture`) staking out the spec-heavy observable contract for a future dogfooding session to populate with a real baseline; (c) three bad-variant spec fixtures under `tests/fixtures/specs/` (broken JSON, missing traceability, missing artifact) documenting the negative gate decisions spec-format-gate is contracted to emit. **Iron Law respected**: ZERO changes to `agents/`, `skills/`, `references/`, `commands/`, or `hooks/` — only `tests/`, `CHANGELOG.md`, `.claude-plugin/plugin.json` modified. Suite stays GREEN: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat (exit 0).

### Added

- **`tests/integration/spec-workflow-e2e.test.js` (NEW, 8 scenarios)** — integration test suite that asserts the observable contract of the spec-heavy pipeline chain by parsing live SSOT files (no JS imports of agent contracts, since agents are pure markdown). Covers: `SPEC_FORMAT_GATE_FAIL` is HARD in `references/gates.md` registry; `SPEC_CONTENT_REVIEW_NOGO` is HARD with precondition `format_gate_status ∈ {GO, GO-WARN}`; `SPEC_POST_IMPL_FAIL` is HARD when score < 75%; `spec-closer.md` mode_used mapping (`spec-heavy → full`, `spec-light → slim`, `spec-audit-only → audit`); `ADVERSARIAL_LOOP_CHECKPOINT` counter resets on `batch_changed=true` (per-batch escalation rule from v4.13.0 reused as a pure function). Suite total: 4 → 12 integration tests GREEN.
- **`tests/compat/v4-baseline/scenarios/spec-fixture/` (NEW, 2 files)** — TEMPLATE compat fixture for the spec-heavy full lifecycle. `input.md` describes a hypothetical `checkout-redesign` Kiro spec scenario (4 components, 12 ACs, 2 contracts, 1 data model → COMPLEXA + spec-heavy). `expected.yaml` documents the expected observable contract (5 spec-* gates + 8 cross-cutting gates, 21 agents per `references/pipelines/spec-heavy.md`, 17 artifacts including `spec.json` with `mode_used=full`, `verdict: GO`). `baseline_method` starts with "TEMPLATE" → runner.cjs lines 320-329 SKIP the scenario until a future dogfooding session captures a real baseline. No `mock-output.json` (TEMPLATE scenarios never reach `executeMock()`).
- **`tests/fixtures/specs/auth-flow-bad-yaml/` (NEW, 5 files)** — bad-variant fixture for `SPEC_FORMAT_GATE_FAIL` HARD with critical-artifact rule. requirements.md / design.md / tasks.md copied verbatim from `auth-flow-good/`. `spec.json` is **intentionally unparseable JSON** (unquoted key + missing closing brace) to force NO-GO via the spec-format-gate's invalid-JSON critical-artifact rule. `expected.yaml` documents `expected_gate: SPEC_FORMAT_GATE_FAIL`, `expected_hardness: HARD`, `expected_decision: NO-GO`.
- **`tests/fixtures/specs/auth-flow-no-traceability/` (NEW, 5 files)** — bad-variant fixture for `SPEC_FORMAT_GATE_FAIL` HARD via score ≤17 (NO-GO threshold). requirements.md / tasks.md / spec.json valid; design.md **intentionally stripped** of `Traces to:` references, Glossary section, component responsibilities, data model, and contracts sections — ≥8 of the 25 spec-format-gate checks expected to fail. `expected.yaml` documents the expected gate decision and the structural-completeness checks that fail.
- **`tests/fixtures/specs/auth-flow-missing-artifact/` (NEW, 4 files)** — bad-variant fixture for `SPEC_ARTIFACT_MISSING` MANDATORY (registry name verified against `references/gates.md` line 45). requirements.md / design.md / spec.json copied verbatim from `auth-flow-good/`; **tasks.md intentionally absent** — its absence triggers the MANDATORY gate that forces NO-GO before format scoring runs. `expected.yaml` documents `expected_gate: SPEC_ARTIFACT_MISSING`, `expected_hardness: MANDATORY`, `expected_decision: NO-GO`.

### Changed

- **`tests/unit/compat-baselines.test.js`** — line 107 regex relaxed from `/SKIPPED:\s+0/` to `/SKIPPED:\s+[01]/` with explanatory comment. The v4.10.0 test hard-coded "SKIPPED: 0" because the 5 fixtures had all graduated to REAL; adding the v4.14.0 spec-fixture in TEMPLATE state would otherwise break it. The test's stated invariant ("runner exits 0 naturally") still holds. The 5 v4.10.0 fixtures remain REAL (covered by the FIXTURES constant assertions in the same file). When a future PR graduates spec-fixture to REAL, this regex should be tightened back to `/SKIPPED:\s+0/`.
- **`.claude-plugin/plugin.json`** — version `4.13.0` → `4.14.0`; description prepended with v4.14.0 summary.

### Backward Compatibility

- All changes additive. No existing fixture, agent, skill, reference, command, or hook is modified. The 1-line edit to `tests/unit/compat-baselines.test.js` only relaxes one regex assertion (0 → 0 or 1) and is documented inline as v4.14.0-specific.
- Pre-existing test counts preserved as upper-bound guarantees: 129 unit (Batch A added the integration suite, not unit tests) + 5 hooks syntax + 8 hooks unit (tracked separately in some matrices) all unchanged.
- Integration suite: 4 (Wave 1 regression) → 12 tests (4 + 8 new spec-workflow-e2e scenarios).
- Compat suite: 5 PASS preserved + 1 new SKIPPED (spec-fixture TEMPLATE). Runner exits 0 naturally (SKIPPED with ≥1 PASS does not trigger exit 1, per runner.cjs lines 406-416).

### Constraints respected (cirurgical scope)

- **`agents/`**: untouched.
- **`skills/`**: untouched.
- **`references/`**: untouched. (Gate names cross-checked via `Grep` only — read-only verification.)
- **`commands/`**: untouched.
- **`hooks/`**: untouched.
- Modified surfaces: only new files under `tests/integration/`, `tests/compat/v4-baseline/scenarios/spec-fixture/`, `tests/fixtures/specs/auth-flow-{bad-yaml,no-traceability,missing-artifact}/`, plus 1 surgical edit in `tests/unit/compat-baselines.test.js` and version + description bump in `.claude-plugin/plugin.json` and this `CHANGELOG.md` section.

### Pipeline-driven (dogfood, degraded-mode)

Wave 6-spec was scoped via `/pipeline-orchestrator:pipeline` itself (COMPLEXA, `implement-heavy` variant, 4 batches: A integration tests, B compat fixture, C bad-variant fixtures, D release closure). Per-batch adversarial gate was SKIPPED by user choice (final-only cadence agreed at gate plan); checkpoint-validator ran after each batch. **Degraded-mode caveat**: this session ran with hooks not registered (controller used absolute paths and wrote sentinel/gate state defensively). Batch C's checkpoint surfaced one regression (`tests/unit/compat-baselines.test.js` line 107 hard-coded `SKIPPED: 0`) — fixed surgically with 1 regex relax inside the allowed `tests/unit/` surface, re-validated GREEN. Suite at close: 129 unit + 12 integration + 5 PASS / 1 SKIPPED compat, all exit 0.

### Known debt — deferred to v4.14.1

- **ARCH-WAVE6-1 (final adversarial finding, IMPORTANT, deferred):** `shouldEscalate(attempt, batchChanged)` helper is now duplicated between `tests/integration/spec-workflow-e2e.test.js` (Wave 6) and `tests/unit/spec-gates-and-mode-persistence.test.js` line 172 (Wave 5). Both copies encode the same per-batch escalation rule from `references/gates.md`. No JS-level single home — drift risk if the rule changes. Cleanup plan: extract to `tests/_helpers/adversarial-loop-rule.cjs`, both tests import. Tracked as patch v4.14.1.

---

## [4.13.0] - 2026-05-05

**Minor release WAVE 5-SPEC — GATES INVARIANTS & MODE PERSISTENCE**. Closes the ARCH-1 drift identified in the v4.11.0 adversarial review: the 6 spec gates that `pipeline-controller.md` declared via Inline Invariants were not in the `references/gates.md` Registry, leaving SSOT incoherent. This release reconciles both surfaces, extends the Inline Invariants list from 15 to 21 gate names (full registry now 22 entries), adds a Spec row to the Pipeline Routing Matrix in `references/complexity-matrix.md`, declares the optional `mode_used` field (`slim` | `full` | `audit`) in `references/spec-context-schema.md`, and wires `spec-closer.md` to write that field to `spec.json` based on `pipeline_variant`. **Backward compatible**: all changes additive; pre-v4.13.0 specs lack `mode_used` and that absence triggers no gate.

### Added

- **6 spec gates in `references/gates.md`** Registry: `SPEC_ARTIFACT_MISSING` (MANDATORY), `SPEC_FORMAT_GATE_FAIL`, `SPEC_CONTENT_REVIEW_NOGO`, `SPEC_AC_TRACEABILITY_GAP`, `SPEC_POST_IMPL_FAIL` (HARD), `ADVERSARIAL_LOOP_CHECKPOINT` (SOFT-with-escalation, per-batch counter scope). Registry table grew from 16 to 22 entries.
- **Inline Invariants in `commands/pipeline.md`** updated to include the 6 new gates: list grew from 15 to 21 names; full registry prose updated to "22-gate table".
- **Pipeline Routing Matrix in `references/complexity-matrix.md`**: new row for `type=Spec` mapping to `spec-light` (MEDIA) and `spec-heavy` (COMPLEXA), with note clarifying `spec-audit-only` is phase-triggered (tasks 100% complete + `spec.json.phase != "closed"`).
- **`mode_used` field in `spec.json`** declared in `references/spec-context-schema.md` (optional; values: `slim` | `full` | `audit`; written by spec-closer at closure time).
- **`agents/executor/spec-closer.md`** writes `mode_used` to `spec.json` based on `pipeline_variant` (`spec-light` → `slim`, `spec-heavy` → `full`, `spec-audit-only` → `audit`). Throws `ERR_UNKNOWN_VARIANT` on unknown variants in v4.13.0+ closes (defensive).
- **`tests/unit/spec-gates-and-mode-persistence.test.js` (NEW, 16 tests)** — covers: gate hardness/recovery lookup against the 22-gate registry; per-batch escalation rule for `ADVERSARIAL_LOOP_CHECKPOINT` (every-3 cadence; counter resets on `batch_changed=true`); inline-invariants subset baseline (every v4.12.0 gate preserved in v4.13.0; the 6 new gates are absent in v4.12.0); variant → mode mapping (3 happy + 2 defensive). Suite total: 113 → 129 GREEN.

### Changed

- **ARCH-1 drift closed**: `pipeline-controller.md` Inline Invariants and `references/gates.md` Registry are now in sync for spec gates. The drift was originally surfaced in the v4.11.0 adversarial review as a SSOT incoherence (Inline Invariants listed 6 spec gates the Registry table did not document).
- **CONSENSUS-1 drift closed (final adversarial)**: `commands/pipeline.md` inline gate list extended from 21 → 22 to include `COMPLEXITY_GATE` (SOFT). The gate was always present in `references/gates.md` but had been omitted from the inline list per a pre-existing convention; that convention is now retired so inline (22) equals registry (22). `tests/unit/spec-gates-and-mode-persistence.test.js` Scenario 3b updated from `=== 21` to `=== 22`; v4.12.0 baseline frozen at 15. Suite stays at 129/129 GREEN.
- **CONSENSUS-2 contract gap closed (final adversarial)**: `agents/executor/spec-closer.md` INPUTS block now declares `pipeline_variant` (required for v4.13.0+ closes), with cross-reference to the MODE PERSISTENCE section that consumes it. Closes the gap where MODE PERSISTENCE referenced an INPUT field the contract did not declare.

### Backward Compatibility

- All changes additive. Specs created before v4.13.0 lack the `mode_used` field — that absence is **expected** and triggers no gate. No migration required.
- Pre-existing 113 unit tests + 5 compat baselines unchanged. Suite total: 129 GREEN.
- Non-spec pipeline behavior unchanged (the new Spec routing row only activates when `type=Spec`).

### Constraints respected (cirurgical scope)

- Only `agents/executor/spec-closer.md` modified in `agents/`. All other agent files untouched.
- `skills/`, `references/pipelines/`, `references/audit-trail.md`, and `skills/spec/SKILL.md` untouched.
- Documentation surfaces touched: `references/gates.md`, `commands/pipeline.md`, `references/complexity-matrix.md`, `references/spec-context-schema.md`, `CHANGELOG.md`, `CLAUDE.md`, `.claude-plugin/plugin.json`.

### Pipeline-driven (dogfood)

Wave 5-spec was scoped via `/pipeline-orchestrator:pipeline` itself. COMPLEXA, `implement-heavy` variant, 5 batches (A: gates registry; B: Inline Invariants list; C: complexity-matrix routing row; D: spec-closer mode_used wiring; E: release admin). Batches A–C CLEAN no fix loops. Batch D fix loop applied (1 round) per adversarial review. 16/16 new tests + 113/113 pre-existing tests GREEN at sanity.

---

## [4.12.0] - 2026-05-05

**Minor release WAVE 4-SPEC — `/spec` THIN ENTRY-POINT + 3 PIPELINE COMPOSITION REFS**. Adds the manual-only `skills/spec/SKILL.md` entry-point so users who already know their input is a Kiro spec can short-circuit type-detection (mirrors the v4.3.0+ pattern set by `skills/bugfix`, `skills/audit`, `skills/feature`). Three new pipeline composition reflexes (`references/pipelines/spec-light.md`, `spec-heavy.md`, `spec-audit-only.md`) document team composition + step-by-step flow with 1:1 fidelity to their backing SKILL.md `sequence_lock` — drift is caught by a new cross-ref test. **Purely additive — zero behavior change for `/pipeline-orchestrator:pipeline` or any existing entry-point.**

### Added

- **`skills/spec/SKILL.md`** — thin manual-only entry-point with `disable-model-invocation: true`. Inspects `$ARGUMENTS` for `--light` / `--heavy` / `--audit-only` flags; with a flag, dispatches `Skill(skill: "pipeline-orchestrator:spec-{variant}")` directly. Without a flag, delegates to `pipeline-controller` prefixed with `PRE_CLASSIFIED_TYPE=Spec\n\n`, letting the Wave 3-spec 4-signal classifier pick the variant.
- **`references/pipelines/spec-light.md`** — team composition + 6-step flow matching `skills/spec-light/SKILL.md` `sequence: [1..6]` with 4 `**[GATE]**` markers matching `gates_at: [1,2,3,4]`.
- **`references/pipelines/spec-heavy.md`** — team composition + 9-step flow matching `skills/spec-heavy/SKILL.md` `sequence: [1..9]` with 5 `**[GATE]**` markers matching `gates_at: [1,2,3,4,5]`.
- **`references/pipelines/spec-audit-only.md`** — team composition + 5-step flow matching `skills/spec-audit-only/SKILL.md` `sequence: [1..5]` with 3 `**[GATE]**` markers matching `gates_at: [1,2,3]`. Documents the read-only Iron Law (no production writes outside spec artifacts).
- **`tests/unit/spec-entry-point-and-pipelines.test.js` (NEW, 10 tests)** — happy path (skills/spec/SKILL.md frontmatter + flag-routing prose); 6 cross-ref tests (per variant: step count = SKILL.md sequence length; gate count = SKILL.md gates_at length); edge test (each pipeline ref points to its matching backing skill); regression test (skills/bugfix, skills/audit, skills/feature, commands/pipeline.md still exist); version test (plugin.json bumped to 4.12.0). Suite 103 → 113 GREEN.

### Changed

- **`.claude-plugin/plugin.json`** — version `4.11.0` → `4.12.0`; description updated with v4.12.0 entry.
- **`CLAUDE.md`** — version lineage extended with `v4.11.0 → v4.12.0 (Wave 4-spec — /spec thin entry-point + 3 pipeline composition refs)`.

### Backward Compatibility

`/pipeline-orchestrator:pipeline` (full classifier) is unchanged. Existing entry-points (`skills/bugfix`, `skills/audit`, `skills/feature`) and their backing variant skills are untouched. The 3 `skills/spec-{light,heavy,audit-only}/` skill trees from Wave 2 are not modified — the new pipeline composition refs read them as SSOT.

### Constraints respected (cirurgical scope)

- No changes to `agents/`
- No changes to `skills/spec-light/`, `skills/spec-heavy/`, `skills/spec-audit-only/`
- No changes to `references/gates.md`
- No changes to `commands/pipeline.md`
- TDD: 1 happy + 1 edge + 1 regression (plus 6 cross-ref + 1 version = 10 total)
- Compat regression preserved (5/5 PASS unchanged)

### Pipeline-driven (dogfood)

Wave 4-spec was scoped via `/pipeline-orchestrator:pipeline` itself (Phase 0 task-orchestrator surfaced GAP-1 about `commands/spec.md` vs `skills/spec/SKILL.md` path; user resolved in favor of canonical `skills/` path). MEDIA complexity, feature-light variant. 0 fix loops, 0 adversarial findings, 113/113 unit + 5/5 compat green at sanity.

---

## [4.11.0] - 2026-05-05

**Minor release WAVE 3-SPEC — SPEC CLASSIFIER ROUTING**. Wires `type=Spec` as a first-class 6th task type into the 4 core pipeline agents (task-orchestrator + pipeline-controller + sentinel + quality-gate-router) so the 3 spec skill trees from Wave 2 (`spec-light`, `spec-heavy`, `spec-audit-only`) become reachable from the main `/pipeline` entry-point. Backward compat MANDATORY: non-spec pipelines route identically to v4.10.0 (regression tests catch drift).

### Added

- **`agents/core/task-orchestrator.md`** — 6th task type `Spec` added to CLASSIFICATION TABLE; new section "TYPE=SPEC DETECTION (4-signal pipeline, v4.11.0+)" documenting Signal 1 (explicit path), Signal 2 (`--type=spec` flag), Signal 3 (prose regex `/valida.*spec|implementa.*spec|fech[ae].*spec/i` with AskUserQuestion confirmation), Signal 4 (glob fallback with picker). `<spec_path>` resolution: read `pipeline.local.md` `spec_path` field (default `.kiro/specs/`, fallbacks `specs/` → `docs/specs/`).
- **`spec_context` block in ORCHESTRATOR_DECISION YAML** — emitted when `type=Spec` with fields: `feature_name`, `spec_path`, `artifacts.{requirements,design,tasks,spec_json}`, `variant`, `acceptance_criteria`. Schema: `references/spec-context-schema.md`.
- **`agents/core/pipeline-controller.md`** — spec dispatch block in Phase 2 mirroring bugfix pattern; when `pipeline_variant.startsWith("spec-")`, invoke `Skill(skill: "pipeline-orchestrator:<variant>")` passing `spec_context` through untouched. Routing discriminator is the variant string (not type field). State update before spawn (v4.8.0 hook contract): `current_skill` + `current_step` populated in sentinel-state.json before Agent dispatch.
- **`agents/core/sentinel.md`** — 5 spec pipeline checkpoints (`SPEC_DISCOVERY_CHECK`, `SPEC_FORMAT_PASSED`, `SPEC_CONTENT_REVIEW_DONE`, `LOOP_STATE_CONSISTENT (post_phase_2_to_3_spec)`, `SPEC_GRADE_CALCULABLE`) all guarded on `pipeline_variant.startsWith("spec-")` (D5). Phase_2_to_3 + spec variant uses spec override that validates tasks.md `[x]` completion.
- **`agents/quality/quality-gate-router.md`** — Step 1a SPEC MODE branch: when `spec_context.acceptance_criteria` is non-empty, generate 1 GIVEN/WHEN/THEN scenario per AC (traceable to `AC#1`, `AC#2`, ...). EARS form preserved verbatim; bullet form best-effort normalized with warning `"AC#N normalized from non-EARS source"`. Empty/null guard prevents fabrication.
- **`spec_context_scenarios` sub-field in QUALITY_GATE_APPROVED output** — records spec_mode flag, acs_covered list, bullet_normalized ids, normalization warnings.
- **`tests/unit/spec-classifier-detection.test.js` (NEW, 9 tests)** — guards 4-signal detection, D1 fallback, D2 collapse, ERR_SPEC_PATH_NOT_FOUND defensive throw, regression non-spec prose, PROSE_REGEX semantics.
- **`tests/unit/spec-routing-dispatch.test.js` (NEW, 5 tests)** — guards spec-* skill dispatch, audit-light/bugfix-light pass-through unchanged, variant-discriminates-not-type rule.
- **`tests/unit/spec-sentinel-checkpoints.test.js` (NEW, 5 tests)** — guards spec-only checkpoint activation, non-spec guard skip, phase_2_to_3 spec override, SSOT freeze.
- **`tests/unit/spec-ac-scenario-generation.test.js` (NEW, 5 tests)** — guards EARS preservation, bullet normalization with warning, empty/null/undefined defensive returns.

### Changed

- **`pipeline_variant` enum extended** — adds `spec-light`, `spec-heavy`, `spec-audit-only` (task-orchestrator ORCHESTRATOR_DECISION + pipeline-controller dispatch).
- **`FORCE_VARIANT` valid values extended** — adds `spec-light`, `spec-heavy`, `spec-audit-only` (D3 override pattern, parallel to existing light/heavy/feature-light/feature-heavy).
- **`pipeline-controller` Inline Invariants gate list** — adds 6 new spec gates: `SPEC_ARTIFACT_MISSING` (MANDATORY); `SPEC_FORMAT_GATE_FAIL`, `SPEC_CONTENT_REVIEW_NOGO`, `SPEC_AC_TRACEABILITY_GAP`, `SPEC_POST_IMPL_FAIL` (HARD); `ADVERSARIAL_LOOP_CHECKPOINT` (SOFT).
- **`agents/quality/quality-gate-router.md` TEST MINIMUMS table** — adds Spec row: "1 per AC (minimum) + 2 regression + 2 edge cases".
- **`references/audit-trail.md`** — appends new section "Verdict vs Gate Decision Vocabulary" disambiguating `final-validator` GO/CONDITIONAL/NO-GO (terminal verdict) from gate decisions PASS/FAIL/SKIPPED/RESOLVED/APPROVED/BLOCKED/STOPPED/RESET. Cross-reference table per producer. Note: `spec-closer.spec_grade` is COSMETIC, never replaces final-validator verdict.
- **`.claude-plugin/plugin.json`** — version 4.10.0 → 4.11.0; description prepended with Wave 3-spec summary.

### Notes

- **Backward compat invariant.** Non-spec pipelines (bugfix-*, implement-*, user-story-*, audit-*, ux-sim-*, DIRETO) route EXACTLY as v4.10.0. The dispatch block, sentinel checkpoints, and quality-gate-router branch all guard on `pipeline_variant.startsWith("spec-")` or `acceptance_criteria` non-empty respectively. Regression tests #3 (Bug Fix), #7 (audit-light pass-through), #8 (bugfix-light pass-through) catch drift.
- **Constraint compliance.** Wave 3-spec touches ONLY: 4 core agents (task-orchestrator + pipeline-controller + sentinel + quality-gate-router), 1 reference doc (audit-trail.md), 1 plugin config (plugin.json), 2 doc files (CHANGELOG.md + CLAUDE.md), and 4 new test files. ZERO changes to Wave 1 spec lifecycle agents (spec-format-gate, spec-content-reviewer, spec-post-impl-validator, spec-closer). ZERO changes to Wave 2 spec skill trees (skills/spec-light, skills/spec-heavy, skills/spec-audit-only). ZERO changes to commands/pipeline.md (Wave 5-spec scope).
- **Smoke fixture.** `.kiro/specs/test-spec-routing/` created as a working-state smoke test input (gitignored per CLAUDE.md invariant #4). Contains 4 stub files (requirements.md, design.md, tasks.md, spec.json) for manual E2E validation of Signal 1 path detection routing to spec-heavy.
- **Test count.** 24 new tests across 4 files, all GREEN. Total cumulative suite count: previous + 24.

---

## [4.10.0] - 2026-05-05

**Minor release WAVE 3 — COMPAT BASELINES**. Graduates the 5 compat regression fixtures (audit / bugfix / feature / hotfix / ux) from TEMPLATE → REAL baselines, removing the `--allow-templates-skipped` flag from the CI workflow. The Compat Regression Suite is now a genuine net rather than a placeholder — any change to the observable contract (classification, gates, agents, artifacts, verdict) of one of the 5 canonical scenarios fails CI with explicit diff.

### Added

- **`tests/compat/v4-baseline/scenarios/<name>/mock-output.json` × 5 (NEW)** — JSON fixtures mirroring each `expected.yaml`'s 5 observable fields. Used by `runner --mock` to validate parser + comparator + internal consistency without invoking the (still stubbed) real-mode CLI path.
- **`tests/unit/compat-baselines.test.js` (NEW, 6 tests)** — guards Wave 3 invariants:
  - All 5 fixtures have `baseline_method` starting with `"REAL"` (no fixture silently regresses to TEMPLATE).
  - All 5 mock-output.json files declare the 5 required observable fields with valid types.
  - `runner --all --mock` exits 0 naturally (no fallback flag needed).
  - Each fixture passes individually via `--scenario=<name>`.
  - `hotfix-fixture` preserves HOTFIX-specific contract markers (mode=hotfix, severity=Critical, HOTFIX_LOG.md present, FINAL_ADVERSARIAL_GATE.decision=SKIPPED, adversarial-architecture-critic + adversarial-quality-reviewer absent, adversarial-security-scanner present).
  - Report-only fixtures (audit, ux) omit TDD agents (quality-gate-router, pre-tester) and TDD_APPROVAL gate.

### Changed

- **`tests/compat/v4-baseline/scenarios/<name>/expected.yaml` × 5** — `baseline_method` rewritten from `"TEMPLATE — ..."` to `"REAL — captured 2026-05-05 ..."`. `baseline_version` bumped 4.5.0 → 4.10.0. `baseline_captured_at` populated with ISO-8601 timestamp. Two spec divergences corrected during dogfooding cross-reference: (a) `audit-fixture` FINAL_ADVERSARIAL_GATE.decision changed from PASS to SKIPPED (per `references/pipelines/audit-light.md` Phase 3 Note: report-only pipelines skip final-adversarial-orchestrator); (b) `feature-fixture` removed `feature-integration-validator` from agents_invoked (per `references/pipelines/implement-light.md:107`: SKIPPED in Light, handled inline by checkpoint-validator). Each expected.yaml now includes `confidence-score.yaml` in artifacts_produced (was missing previously).
- **`.github/workflows/compat-regression.yml`** — drops the v4.9.2 `--allow-templates-skipped` flag from the mock-mode invocation. Mock mode now relies entirely on REAL baselines for green CI; `0 PASS + N SKIPPED` reverts to the strict exit-1 semantics (which would surface a regression where someone re-introduces a TEMPLATE fixture without proper validation). Real-mode probe (gated by repo var `CLAUDE_CLI_AVAILABLE`) is unchanged but documented as a stub pending Slice 4-extended (see `designs/slice-0/SPIKE-CI-HARNESS.md`).
- **`tests/unit/compat-runner.test.js`** — removed 2 obsolete tests (v4.9.2 happy-paths that depended on TEMPLATE state which no longer exists). Retained 1 validation-guard test ensuring `--allow-templates-skipped` without `--mock` still exits 2 (defensive even though no fixture currently triggers the flag's other path). Net suite count: 76 → 80 (-2 + 6).
- **`.claude-plugin/plugin.json`** — version 4.9.2 → 4.10.0; description extended with Wave 3 summary.

### Notes

- **`tests/compat/runner.cjs` UNCHANGED** — Wave 3 honored Constraint #2 ("don't modify the runner"). The `--allow-templates-skipped` flag remains in code as a documented historical fallback. If a future contributor introduces a new fixture as TEMPLATE, the flag is still wired and testable; the v4.9.2 NIT-A path-guard semantics (rejection without `--mock`) is preserved.
- **Real-mode wiring deferred.** During Wave 3 it was confirmed that `executeReal()` in `runner.cjs` is a stub that throws unconditionally after the CLI probe. Per `designs/slice-0/SPIKE-CI-HARNESS.md` (2026-04-30), real-mode E2E with `claude --headless` is architecturally bottlenecked by `AskUserQuestion` (≥4 mandatory gates have no headless answer path). Resolving requires upstream `--ci-auto-confirm` in Claude Code or a wrapper. Tracking item: Slice 4-extended.
- **Method declaration honesty.** Each `baseline_method` field explicitly states the capture method: cross-reference of `input.md` against `commands/pipeline.md` + `references/pipelines/<variant>.md` + agent contracts at `agents/**/*.md`. The fixtures are not E2E captures (which are blocked); they are spec-anchored static contracts that future PRs must keep in sync. `mock-output.json` is the matching fixture.
- **HOTFIX fixture special invariants** captured: mode=hotfix, HOTFIX_LOG.md mandatory, 2-checklist adversarial scope (security only), FINAL_ADVERSARIAL_GATE skipped under emergency time pressure. Test `hotfix-fixture preserves HOTFIX-specific contract markers` is the regression net for these.
- **Iron Law respected.** Wave 3 only touches: 5 expected.yaml + 5 new mock-output.json + 1 unit test rewrite + 1 new test file + workflow yaml + plugin.json + CHANGELOG. Zero changes to `runner.cjs`, zero changes to `skills/`, zero changes to `agents/`, zero new agents.

---

## [4.8.0] - 2026-05-03

**Minor release HOOK ENFORCEMENT** — resolve consolidated.md §17.4 #8 ("hooks NÃO enforce SKILL.md frontmatter"). Os campos declarativos `sequence_lock`, `gates_at`, `sentinel_checkpoints`, e `agent_type` (per step) eram apenas documentação legível por humanos até v4.7.0 — drift teoricamente possível. Esta release implementa enforcement real via hooks Node, com roll-out 2-fases time-based para evitar quebras durante a janela de migração.

### Added

- **`.claude/hooks/skill-frontmatter-parser.cjs` (NEW)** — módulo compartilhado consumido pelos 3 hooks. Expõe: `parseYaml`, `parseFrontmatter`, `readSkillFrontmatter(skillName, repoRoot)`, `getCurrentSkill(state)`, `getEnforcementMode(today)` (warn vs deny baseado em data + override `PIPELINE_ENFORCEMENT={warn,deny}`), `logEnforcementDecision(repoRoot, decision)` (append-only em `gate-decisions.jsonl` com `gate: "ENFORCEMENT_WARN"|"ENFORCEMENT_DENY"`, `hardness: "AUDIT"`). YAML parser inline reutilizado de `tests/compat/runner.cjs`. ~210 linhas.
- **`.claude/hooks/__tests__/skill-frontmatter-parser.test.cjs` (NEW)** — 32 assertions cobrindo parser (valid/missing/malformed/non-string), readSkillFrontmatter (good/notfound/no-contract/invalid-name), getCurrentSkill (valid/missing variants), getEnforcementMode (before/after/boundary/override).
- **`.claude/hooks/__tests__/fixtures/skills/{feature-light-good,feature-light-bad-yaml,feature-light-no-contract}/SKILL.md` (NEW)** — fixtures sintéticos para testes dos 3 hooks.
- **`.claude/hooks/__tests__/force-pipeline-agents.test.cjs` (NEW)** — 13 assertions cobrindo enforcement de `gates_at` em UserPromptSubmit (5 cenários: no-skill / not-at-gate / no-evidence-warn / with-evidence / deny-mode).

### Changed

- **`.claude/hooks/sentinel-hook.cjs`** — adicionado `enforceSkillContract(state)` que valida `sentinel_checkpoints`. Quando `current_skill` + `current_step` populados em sentinel-state.json e step está em `sentinel_checkpoints`, verifica que `expected_next` está set. Modos: warn (logga em gate-decisions.jsonl + stderr) / deny (emite `permissionDecision: deny`). 9 novos testes (83/83 passing).
- **`.claude/hooks/dispatch-guard.cjs`** — agora também processa Agent calls (matcher `Skill|Agent` em hooks.json). Quando skill em flight, lê `skills/<name>/steps/0N-*.md` frontmatter e valida que `agent_type` declarado match com `subagent_type` da Agent call. Mismatch → warn/deny conforme modo. 4 novos cenários BDD (13/13 passing).
- **`.claude/hooks/force-pipeline-agents.cjs`** — adicionado `applyGateEnforcement()` chamado em UserPromptSubmit. Quando current step está em `gates_at`, verifica `gate-decisions.jsonl` por evidência de AskUserQuestion logado. Missing → warn/deny systemMessage (não bloqueia o prompt — UserPromptSubmit não pode deny — mas surface ao operador). 13 novos test assertions.
- **`hooks/hooks.json`** — matcher `Skill` → `Skill|Agent` para dispatch-guard; SessionStart prompt menciona v4.8.0.
- **`agents/core/pipeline-controller.md`** — adicionada subsection "State fields for skill enforcement (v4.8.0+)" documentando contrato: controller deve popular `current_skill` + `current_step` em sentinel-state.json antes de spawn Agent. Backward compat: hooks skipam quando ausentes.
- **`.claude-plugin/plugin.json`** — version 4.7.0 → 4.8.0; description estendida.

### Notes

- **Roll-out 2-fases:** Warn mode até **2026-05-17** (logga `ENFORCEMENT_WARN` em gate-decisions.jsonl com hardness AUDIT, não bloqueia). Deny mode auto-promove após (bloqueia via permissionDecision). 14 dias de janela permite operadores observarem warns + ajustarem state file pattern antes de blocking.
- **Override:** Set env var `PIPELINE_ENFORCEMENT=warn` ou `=deny` para forçar modo (útil em testing/CI).
- **Backward compat preservada:** Hooks skipam enforcement silently quando state não tem `current_skill` ou quando SKILL.md não declara o campo (sentinel_checkpoints / gates_at). Flows não-skill (`/pipeline` direto sem backing skill) continuam funcionando como antes.
- **Hardness AUDIT:** Entries de enforcement usam `hardness: "AUDIT"` para distinguir dos gates SOFT/HARD/MANDATORY/CIRCUIT_BREAKER existentes em gate-decisions.jsonl. Permite filtragem em queries.
- **Iron Law respected:** Apenas hooks JS + tests do plugin foram modificados. Consumer projects (e.g. `/pipeline-orchestrator:feature` invocação real) NÃO foram tocados.
- **Resolve §17.4 #8** do consolidated.md (hooks-not-enforce-frontmatter). Issue agora fechada.

---

## [4.7.0] - 2026-05-03

**Patch+minor release POLINDO Slice 3b** (sucessor de v4.6.1). Audit pós-correção identificou 11 findings — a v4.6.1 corrigiu a estrutura de pastas mas deixou os skills funcionalmente incompletos (frontmatter mínimo, tests placeholder, sem thin entry-point). Esta release fecha todos os 11 findings em batch único, mantendo Iron Law de "1:1 fidelity Pulsar nos prompts" (texto dos bodies intocado — apenas frontmatter contract foi adicionado).

### Added

- **`skills/feature/SKILL.md` CRIADO** — thin entry-point com `--light`/`--heavy` flag handling (espelha pattern de `skills/audit/SKILL.md` e `skills/bugfix/SKILL.md`). Permite `/pipeline-orchestrator:feature [task]` → auto-classify, `--light` → routing direto, `--heavy` → routing direto.
- **`references/feature-user-story-guidelines.md` CRIADO** — merged Pulsar TESTS_USER_STORY_LIGHT.md + TESTS_USER_STORY_HEAVY.md em 1 doc consumido pelo usuário antes de invocar feature-{light,heavy}. Conteúdo OLD dos tests files foi movido para cá.

### Changed

- **26 step files (`skills/feature-{light,heavy}/steps/*.md`)** — duplo frontmatter (`step_number/step_name/source` + `description/allowed-tools`) MERGED em single block + execution contract adicionado: `description`, `execution_mode` (inline|subagent), `agent_type` (FQN ou ""), `expected_inputs` (chained `from_step_NN`), `expected_outputs` (typed structure), `expected_next` (NN+1 ou "complete"), `gate_required` (bool), `gate_name` (4 gates: acceptance-matrix-approval, architecture-choice, plan-approval, tdd-tests-approval), `allowed_tools` (herdado de Pulsar + AskUserQuestion para gates). Bodies dos prompts INTOCADOS (1:1 fidelity Pulsar preservada).
- **`skills/feature-light/SKILL.md` + `skills/feature-heavy/SKILL.md`** — frontmatter mínimo expandido para contrato declarativo completo: `sequence: [1..13]`, `sequence_lock: true`, `gates_at: [3, 7, 9, 10]`, `sentinel_checkpoints: [pre_3, pre_10, pre_13]`, `stop_rule_max_failures: 2`, `disable-model-invocation: true`, `argument-hint`, `allowed-tools` ampliado. Body do SKILL.md adicionado: "Quando usar" + "Sequência canônica" + "Ownership por step" (5 agentes mapeados) + "Gates" (4 mandatory) + "Sentinel checkpoints" (3) + "Execution rules" (8 herdados de Slice 1.5 §21.3).
- **`skills/feature-{light,heavy}/tests/tests-feature-{light,heavy}.md`** — REESCRITOS de placeholder Pulsar TESTS_USER_STORY (diretrizes de tradução de user story, irrelevantes para o skill workflow) para tests reais do skill: smoke test scenarios + per-step contract assertions + frontmatter validation + gate assertions + sentinel assertions + STOP rule + anti-tests. Modelo: `skills/audit-heavy/tests/tests-audit-heavy.md`.
- **`references/pipelines/implement-{heavy,light}.md`** — deprecated headers corrigidos (v4.6.0 erroneamente apontavam para `references/pipelines/feature.md` que foi deletado em v4.6.1). Agora apontam corretamente para `skills/feature-{heavy,light}/SKILL.md` ou `skills/feature/SKILL.md` com flag.
- **`AGENTS.md`** header — `Total agents: 38` (errado, herdado de D1/D2 sem reality-check) → `19 agents (auditado 2026-05-03)` + nota explicando origem do drift.
- **`docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md`** + **`docs/superpowers/plans/2026-05-03-feature-pulsar-import-slice-3b.md`** — adicionado correction header explicando que docs foram escritos para v4.6.0 (single skill) mas implementação foi REVERTIDA em v4.6.1 e POLIDA em v4.7.0; usuário deve ler como histórico de design, não como spec canônica.
- `.claude-plugin/plugin.json` — version 4.6.1 → 4.7.0; description estendida com Slice 3b polish.
- `hooks/hooks.json` — SessionStart prompt menciona v4.7.0 + `/pipeline-orchestrator:feature` (thin shortcut).
- `CLAUDE.md` — lineage estendida + entry v1.5.
- `designs/pipeline-orchestrator-v5-consolidated.md` §12.2 status table (Slice 3b row v4.6.1 → v4.7.0 com nota "frontmatter contract completo + tests reais + thin entry-point") + §23 estendido com nota v4.7.0 polish + DoD checkboxes atualizados.

### Notes

- **1:1 fidelity Pulsar preservada:** Iron Law dos prompts INTOCADOS continua valendo. Nenhum texto de body de step foi alterado — apenas o frontmatter (que é metadata de contrato, não conteúdo do prompt) foi expandido.
- **Hooks ainda ADVISORY** (vide §17.4 #8). v4.7.0 não muda enforcement runtime — só completa a documentação declarativa que o controller deve respeitar.
- **Lição capturada:** entrega "estrutura correta + frontmatter mínimo" (v4.6.1) não é equivalente a "skill funcional pronto para uso". Próximas portabilidades de fonte canônica devem incluir frontmatter contract completo + thin entry-point + tests reais como parte do scope inicial, não como polish posterior.

## [4.6.1] - 2026-05-03

**Patch release CORRIGINDO Slice 3b**: a v4.6.0 inicial unificou Heavy + Light em **uma única skill `feature` com mode flag**, supostamente para reduzir contagem de arquivos. Decisão revertida: a fonte canônica Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) tem **2 pastas separadas** (`Heavy/` + `Ligth/`), e o port deve espelhar isso 1:1 — mesmo padrão de Slice 1.5 (bugfix) e Slice 3a (audit).

### Changed

- **`skills/feature/` REMOVIDO** (era a unificação errada; 15 arquivos deletados)
- **`skills/feature-light/` CRIADO** — 13 step files espelhando Pulsar `Ligth/LIGHT_NN_*.md` 1:1 + SKILL.md + tests
- **`skills/feature-heavy/` CRIADO** — 13 step files espelhando Pulsar `Heavy/HEAVY_NN_*.md` 1:1 + SKILL.md + tests
- `references/pipelines/feature.md` REMOVIDO; substituído por `feature-light.md` + `feature-heavy.md` (a serem criados via futuro touch quando precisarem)
- `commands/pipeline.md` — `--variant=feature` + `--mode` REMOVIDOS; entry-points são `/pipeline-orchestrator:feature-light` e `/pipeline-orchestrator:feature-heavy` (igual bugfix/audit)
- `agents/core/task-orchestrator.md` — `FORCE_VARIANT=feature` + `FORCE_MODE` REMOVIDOS; aceita `FORCE_VARIANT=feature-light` ou `feature-heavy` (igual bugfix-light/bugfix-heavy)
- `.claude-plugin/plugin.json` — version 4.6.0 → 4.6.1
- `hooks/hooks.json` — SessionStart prompt menciona `/pipeline-orchestrator:feature-light` e `/pipeline-orchestrator:feature-heavy`
- `CLAUDE.md` + `AGENTS.md` — versão + 2 roster entries (separadas)
- `designs/pipeline-orchestrator-v5-consolidated.md` §23 — reescrita explicando reversão; §17.3 #12 estendida com lição

### Notes

- **Lição capturada:** quando há fonte canônica com estrutura definida (2 pastas), port DEVE espelhar 1:1. Otimizações de file count via "padrões novos" (mode flag) que divergem da fonte = drift documental e re-trabalho. Decisão tomada via AskUserQuestion na sessão de bugfix-heavy 2026-05-03 com opção "Recomendado" — o "Recomendado" foi minha (assistant) preferência por compactação, não validade neutra. Próximas portabilidades devem espelhar 1:1 sem reinterpretar a estrutura da fonte.
- **Userstory + ux ports:** quando portados (Slice 3c/3d futuro), DEVEM espelhar igualmente a estrutura de pastas Pulsar.

## [4.6.0] - 2026-05-03

> **DEPRECATED — vide [4.6.1]:** esta release foi corrigida em [4.6.1] que reverteu a unificação. Mantida no histórico para rastreabilidade.

Minor release implementing **Slice 3b**: imports the prescriptive 13-step Pulsar `Implement_new_feature` workflow (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) as a Claude Code skill. **Pattern novo:** single skill `feature` com mode flag (`heavy|light`) controlando verbosidade de prompt — primeira vez que um port usa essa estrutura (vs 2 skills separadas em Slice 1.5/3a). Design: `designs/pipeline-orchestrator-v5-consolidated.md` §23 + spec mapping `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md`.

### Added

- `skills/feature/SKILL.md` — manifest com mode flag (heavy default, --mode=light override), sequence_lock, gates_at: [3, 7, 9, 10], sentinel_checkpoints: [pre_3, pre_10, pre_13]
- `skills/feature/steps/01..13-*.md` — 13 step files mode-aware (Heavy + Light prompts em seções separadas)
- `skills/feature/tests/tests-feature.md` — diretrizes user story (absorve TESTS_USER_STORY_{HEAVY,LIGHT}.md do Pulsar)
- `references/pipelines/feature.md` — reference single (substitui implement-*)
- 4 AskUserQuestion gates obrigatórios (steps 3 acceptance-matrix, 7 architecture-choice, 9 plan-approval com conditional skip, 10 tdd-tests-approval)

### Changed

- `agents/core/task-orchestrator.md` — aceita `FORCE_VARIANT=feature` + `FORCE_MODE={light,heavy}`
- `commands/pipeline.md` — adicionado `--variant=feature` + `--mode=light|heavy` na tabela de modes
- `references/pipelines/implement-{heavy,light}.md` — DEPRECATED como redirects para `feature.md`
- `.claude-plugin/plugin.json` — version 4.5.0 → 4.6.0
- `hooks/hooks.json` — SessionStart prompt menciona `/pipeline-orchestrator:feature`
- `CLAUDE.md` + `AGENTS.md` — versão + roster entry

### Reused (no new agents)

- `feature-vertical-slice-planner` (steps 3, 7, 9 — re-spawned 3x com TASK_CONTEXT diferente)
- `feature-implementer` (step 11)
- `feature-integration-validator` (step 12)
- `pre-tester` (step 10 — parametrized via `expected_inputs.pre_tester_artifacts`)
- `quality-gate-router` (step 10 — Phase 2 do pipeline)

### Notes

- **Hooks são ADVISORY:** campos do SKILL.md frontmatter (`sequence_lock`, `gates_at`, etc) são declarativos; controller respeita o contrato mas hooks NÃO parseiam SKILL.md (ver consolidated §17.4 #8)
- **Step 9 conditional skip:** se Phase 1.5 plan-architect rodou (filesystem check em `PIPELINE_DOC_PATH/05-plan-architect.md`), skill pula step 9 e usa output do plan-architect
- **TDD step 10 parametrizado:** Pulsar source usava paths Firebase-específicos (`functions/src/__tests__/`); skill recebe paths via `expected_inputs.pre_tester_artifacts` do agente `pre-tester`
- **Step 11 SEM gate skill-level:** executor-controller (Phase 2) já tem adversarial gate antes de Edits; double gate seria DRY violation
- **Pre-check absorvido por Phase 0:** `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` do Pulsar não vira step da skill — `information-gate` + `design-interrogator` da Phase 0 cobrem
- **Userstory + ux ports:** ainda pendentes (futuros v4.7.0 / v4.8.0 — sub-slices Slice 3c/3d)
- **v5.0 final:** continua bloqueado por Slice 4 verde (per consolidated §12.8.3)

## [4.5.0] - 2026-05-02

Minor release implementing **Slice 3a**: imports the prescriptive 9-step Heavy and 9-step Light audit workflows from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\`) as Claude Code skills. Audit pipelines are **REPORT-ONLY** by Iron Law — no production file modification at any step. Design: `designs/pipeline-orchestrator-v5-consolidated.md` §22.

### Added

- `skills/audit/SKILL.md` — thin entry-point skill with `--light`/`--heavy` variant flag handling; auto-classify fallback delegates to `pipeline-controller` with `PRE_CLASSIFIED_TYPE=Audit`
- `skills/audit-light/` — 9-step prescriptive workflow for SIMPLES/MEDIA audits (`SKILL.md` + 9 `steps/0X-*.md` + `tests/tests-audit-light.md`)
- `skills/audit-heavy/` — 9-step prescriptive workflow for COMPLEXA audits (`SKILL.md` + 9 `steps/0X-*.md` + `tests/tests-audit-heavy.md`)
- `references/glossary/audit.md` — domain glossary for the audit bounded context (finding, severity, surface area, threat model, intake, risk matrix, evidence tag, Pa de Cal, light_mode, escalation)
- 9-step canonical sequence per tier:
  - Step 1 — Intake + Spec + Inventory (`AuditIntake` / `AuditSnapshot`) — gate (scope approval)
  - Step 2 — Architecture + Boundaries + Dependencies (`DependencyImpactAudit` / `ArchitectureAudit`)
  - Step 3 — Domain + SSOT + Decisions (`DecisionSSOTAudit` / `DomainSSOTAudit`)
  - Step 4 — Contracts + APIs + Endpoints + Validations (`ContractGovernanceAudit` / `ContractAudit`)
  - Step 5 — Data + Migrations + Integrity + Security (`DataGovernanceAudit` / `DataAudit`)
  - Step 6 — Frontend + State + A11y + PWA (`FrontendDeepAudit` / `FrontendAudit`)
  - Step 7 — Backend + Errors + Auth + Observability (`BackendDeepAudit` / `BackendAudit`)
  - Step 8 — Governance + Tests + CI/CD + Documentation (`DeliveryGovernanceAudit` / `QualityOpsAudit`)
  - Step 9 — Pa de Cal + Risk Matrix (`AuditMasterSeal` / `AuditFinalSeal`) — gate (GO/CONDITIONAL/NO-GO; Light has 4th option ESCALATE-TO-HEAVY)
- 8 enforcement rules baked into skill+step frontmatter (`sequence_lock`, `execution_mode` lock, `agent_type` whitelist, output schema, AskUserQuestion gates at steps 1+9, STOP RULE, audit log, sentinel checkpoints `pre_1`/`pre_5`/`pre_9` for Heavy and `pre_1`/`pre_9` for Light)
- 9th invariant unique to audit: **Read-only enforcement** (`report_only: true` in manifest, `production_writes_allowed: false` in every step) — `edit-guard-hook.cjs` blocks any Edit/Write originating from audit-* steps or agents
- Light-tier escalation triggers (Critical severity / ≥30% `[HYPOTHESIS]` tags / cascade across 3+ areas / regulatory keyword) surface ESCALATE-TO-HEAVY as recommended option at step 9

### Changed

- `skills/audit/SKILL.md`: detects `--light`/`--heavy` flags + delegates to backing skill
- `references/pipelines/audit-heavy.md` and `audit-light.md`: header pointer "As of v4.5.0 (Slice 3a)" routes prescriptive procedure to the new skill while preserving team-composition reference
- `designs/pipeline-orchestrator-v5-consolidated.md`: §0 metadata bumped to v4.5.0; §12.2 sequência marca Slice 3a 🟢; §22 net-new design rationale + DoD
- `.claude-plugin/plugin.json` + `marketplace.json`: version 4.4.1 → 4.5.0
- `hooks/hooks.json`: SessionStart prompt mentions `/audit`, `/audit-light`, `/audit-heavy`

### Notes

- **No new agents required.** The 4 audit agents (`audit-intake`, `audit-domain-analyzer`, `audit-compliance-checker`, `audit-risk-matrix-generator`) already existed since before Slice 1; this slice wraps them with prescriptive step procedure + frontmatter contract.
- **No new hooks required.** Existing hooks (`dispatch-guard`, `sentinel-hook`, `edit-guard-hook`, `force-pipeline-agents`) cover the new skills via declarative contract.
- **Report-only.** Audit findings are advisory; remediation requires a downstream `/pipeline-orchestrator:bugfix [finding-AUDIT-NNN]` or `/feature` invocation.
- **Slice 3 (resto) — `/feature`, `/userstory`, `/ux`** remains pending; the same template is now battle-proven in two slices (1.5 + 3a) and is reusable.

## [4.4.0] - 2026-05-01

Minor release implementing **Slice 1.5**: imports the prescriptive 11-step Heavy and 8-step Light bugfix workflows from Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Bug_fix\`) as Claude Code skills, closing 6 audit gaps identified in v4.3.1 review. Design: `designs/pipeline-orchestrator-v5-consolidated.md` §21.

### Added

- `skills/bugfix-light/` — 8-step prescriptive workflow for SIMPLES/MEDIA bugs (`SKILL.md` + 8 `steps/0X-*.md` + `tests/`)
- `skills/bugfix-heavy/` — 11-step prescriptive workflow for COMPLEXA bugs (`SKILL.md` + 11 `steps/0X-*.md` + `tests/`)
- 6 audit gaps closed:
  - Heavy 3 (Domain Truth Model — invariants/property/transactional)
  - Heavy 9 (UX Journey post-fix E2E)
  - Heavy 11 (Final Validation distinct from Pa de Cal)
  - Light 3 (invariants BEFORE change)
  - Light 5 (RED→regression promotion)
  - Light 6 (Persistence Quick Check)
- 8 enforcement rules baked into skill+step frontmatter (`sequence_lock`, `execution_mode` lock, `agent_type` whitelist, output schema, AskUserQuestion gates, STOP RULE, audit log, sentinel checkpoints)

### Changed

- `skills/bugfix/SKILL.md`: detects `--light`/`--heavy` flags + delegates to backing skill
- `agents/core/pipeline-controller.md`: variant override + skill dispatch after Phase 1
- `agents/core/task-orchestrator.md` Step 1a: `force_variant` parallel to `force_type`
- `commands/pipeline.md`: `--light`/`--heavy` rows in Modes table
- `references/pipelines/bugfix-{light,heavy}.md`: pointer-header note to new skills
- `.claude-plugin/plugin.json`, `marketplace.json`, `hooks/hooks.json`: bumped to 4.4.0

### Backward compat

- `/pipeline-orchestrator:bugfix [task]` (no flag) keeps auto-classify behavior
- `/pipeline-orchestrator:pipeline [task]` keeps existing flags (`--simples`/`--media`/`--complexa`)
- 3 type-specific bugfix-* agents (`bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`) remain invocable in `pipeline-orchestrator:executor:type-specific:` namespace

## [4.3.1] - 2026-05-01

Patch release driven by adversarial review of v4.3.0 skill migration.
Two reviewers (`plugin-dev:skill-reviewer` + `plugin-dev:plugin-validator`)
returned READY-TO-SHIP / PASS verdicts with 1 MEDIUM and 1 WARNING for
polish. Both addressed here.

### Changed

- **`skills/bugfix/SKILL.md`** — removed the "Why this is a skill (not a
  command)" section (lines 38-46 in v4.3.0). The reviewer flagged it as
  design-decision/changelog content that belongs in CHANGELOG.md, not in
  execution guidance. SKILL.md should tell Claude what to do, not why
  the file structure was chosen. CHANGELOG.md [4.3.0] entry retains the
  full rationale.
- **`skills/pipeline/SKILL.md`** — added `disable-model-invocation: true`
  + `allowed-tools: Task` + `argument-hint: [task description]` to match
  the bugfix skill's manual-only posture. Same justification: every
  pipeline run has side effects (TDD-RED tests, code edits, commits) and
  must be consciously triggered. Previously v4.x relied on hook-level
  filtering; v4.3.1 makes it declarative, consistent across both skills.

### Notes

- Both changes are user-invisible. Same `/pipeline-orchestrator:pipeline`
  and `/pipeline-orchestrator:bugfix` UX.
- `commands/pipeline.md` deliberately kept (NOT deleted) — it serves as
  the inline-invariants reference. The plugin-validator suggested
  consolidating to skill-only in v4.4.0 alongside Slice 3. Decision:
  keep both for now; revisit when the 4 remaining entry-points
  (`/feature`, `/userstory`, `/audit`, `/ux`) are designed.

## [4.3.0] - 2026-05-01

Minor release migrating `/bugfix` from the legacy `commands/` flat-file format
to the idiomatic `skills/<name>/SKILL.md` directory format with
`disable-model-invocation: true`. Driven by re-reading the official Claude Code
documentation: *"Files in `.claude/commands/` still work and support the same
frontmatter. Skills are recommended since they support additional features like
supporting files."* — and the plugin structure table in
[/en/plugins](https://code.claude.com/docs/en/plugins) explicitly states
*"Use `skills/` for new plugins"*.

The user-facing invocation (`/pipeline-orchestrator:bugfix [task]`) is
**identical**. Only the file structure changed.

### Changed

- **Migrated** `commands/bugfix.md` → `skills/bugfix/SKILL.md`. The new
  SKILL.md adds:
  - `disable-model-invocation: true` — Claude can never auto-invoke the
    skill. Manual `/pipeline-orchestrator:bugfix` only. Same effect as the
    previous command but enforced declaratively in frontmatter rather than
    relying on hook-level filtering.
  - `argument-hint: [bug description with repro details]` — autocomplete
    hint when typing the slash command.
  - `allowed-tools: Task` — narrowest possible tool set; the skill only
    spawns the `pipeline-controller` agent and does nothing else.
- Deleted `commands/bugfix.md` (skill replaces it; no behavior change for
  the user).

### Why a skill (not a command)

Per the official docs, custom commands have been merged into skills in 2026.
A `commands/<name>.md` flat file and a `skills/<name>/SKILL.md` directory both
produce the same `/<name>` invocation. Skills are the recommended format for
new plugins because they:

1. Support a directory layout with supporting files (templates, examples,
   scripts) that can be loaded only when the skill runs — keeps SKILL.md focused
   on essentials. The 4 entry-points planned for Slice 3 (`/feature`,
   `/userstory`, `/audit`, `/ux`) will benefit from this when they need
   type-specific scaffolds.
2. Expose `disable-model-invocation: true` declaratively, removing the need
   for the hook-level "is this skill auto-invocable?" filter that v4.2 added.
3. Are listed alongside built-in skills like `/debug`, `/simplify`, `/loop`
   in `/help` output, matching the discovery experience of bundled skills.

The previous v4.2.x decision to ship `/bugfix` as a command was based on a
misreading of the doc — corrected here.

### Notes for downstream consumers

- `commands/` directory still contains `pipeline.md`. The full classifier
  remains a command for now (it has special inline-invariants behavior and
  is the v4 architectural anchor). It may migrate in a future release if
  there's a clear benefit; no plan to do so urgently.
- Plugin structure now shows both `commands/` (1 entry) and `skills/`
  (2 entries) coexisting — fully supported by the official Claude Code
  loader.

### Marketplace

- `.claude-plugin/marketplace.json`: pipeline-orchestrator pinned to
  `v4.3.0` with description summarizing the migration.

## [4.2.1] - 2026-04-30

Patch release closing 2 security findings identified by adversarial review of
v4.2.0. Both issues were bypass-class — they would let an attacker (or a
mistyping user) sidestep the v4 session-lock protection contract.

### Fixed

- **SEC-1 — Uppercase entry-point bypass (MEDIUM).** `session-lock-hook.cjs`
  `PIPELINE_REGEX` was case-sensitive while `force-pipeline-agents.cjs`
  `isPipelineSkill` was case-insensitive. A user typing `/BUGFIX algo` would
  receive `PIPELINE_SKILL_MESSAGE` but the session lock would NOT be created —
  pipeline ran without edit-guard, allowing direct edits during the "pipeline
  session". Fix: added `/i` flag to `PIPELINE_REGEX`.
- **SEC-2 — Namespace collision with foreign plugins (MEDIUM).**
  `force-pipeline-agents.cjs` `SKILL_PATTERNS` matched bare `/bugfix`,
  `/feature`, `/userstory`, `/audit`, `/ux` without requiring the
  `pipeline-orchestrator:` namespace. Foreign marketplace plugins with a
  same-named command (especially `/audit`, `/ux`) would be silently classified
  as pipeline-orchestrator skills, injecting `PIPELINE_SKILL_MESSAGE` into
  unrelated sessions. Fix: split `SKILL_PATTERNS` row 1 into a dedicated
  namespaced pattern; `isPipelineSkill` no longer matches the bare aliases.

### Hardened (proactive)

- **SEC-3 mitigation (LOW maintenance risk).** Added explicit comment block
  above `isPipelineSkill` documenting that case-insensitivity is enforced
  ONLY via the `/i` flag at that site. Future maintainers removing `/i`
  thinking `toLowerCase()` in `isSkillCommand` already canonicalizes would
  re-open SEC-1 partially. Comment prevents the regression.

### Tests

- Smoke validation 10/10 unit cases: `/PIPELINE-ORCHESTRATOR:BUGFIX foo`
  now creates a lock; bare `/audit`, `/feature`, `/ux` no longer hijacked;
  legacy `/pipeline` preserved; non-pipeline skills (`/commit`, `/test`)
  still receive `SKILL_MESSAGE` correctly.

### Open / deferred

- **ARCH-2 (HIGH) — Trust boundary on PRE_CLASSIFIED_TYPE prefix.**
  User invoking the full `/pipeline-orchestrator:pipeline` could manually
  inject `PRE_CLASSIFIED_TYPE=...` in their prompt to forge type. Decision:
  defer to Slice 3 when the 4 remaining entry-points ship. At that point
  the contract will be re-evaluated holistically, possibly moving from
  string prefix to a separate Agent-call metadata field.

## [4.2.0] - 2026-04-30

Minor release adding **thin entry-point commands** that skip type-classification
by pre-fixing `task_type`. Same pipeline-controller, same gates, same session
lock + edit-guard contract — the new commands are shortcuts, not bypasses.

### Added

- `commands/bugfix.md` — `/pipeline-orchestrator:bugfix [task]` shortcut for
  Bug Fix tasks. Delegates to `pipeline-controller` with prompt prefix
  `PRE_CLASSIFIED_TYPE=Bug Fix`. (Slice 1 of v5 roadmap.)
- `pipeline-controller.md` Step 1: documents `PRE_CLASSIFIED_TYPE=<Type>`
  prefix and lists invariants that still apply (information-gate,
  design-interrogator, all gates, sentinel checkpoints).
- `task-orchestrator.md` Step 1a: accepts the prefix, sets `type` directly,
  still computes complexity, pipeline_variant, ssot_status. Mirrors the
  existing `--simples/--media/--complexa` flag pattern but for type.

### Changed

- `session-lock-hook.cjs` `PIPELINE_REGEX` now matches all entry-points
  (`pipeline|bugfix|feature|userstory|audit|ux`). Without this patch, the
  new `/bugfix` would have bypassed the v4 protection contract — main-LLM
  could edit files directly during a `/bugfix` session. **Critical fix
  identified by adversarial review of the slice plan.**
- `force-pipeline-agents.cjs` `SKILL_PATTERNS` and `isPipelineSkill` regex
  recognize all entry-points. Cosmetic but keeps UX consistent.
- `hooks/hooks.json` SessionStart prompt advertises all 6 entry-points.
- `plugin.json` and `marketplace.json` bumped to 4.2.0.

### Forward-compat note

The regex and prefix vocabulary already accommodate the remaining 4
entry-points (`/feature`, `/userstory`, `/audit`, `/ux`), which arrive in
subsequent slices (v5 Slice 3). Adding them is now purely additive — same
pattern as `commands/bugfix.md`.

## [4.1.3] - 2026-04-29

Patch release fixing a class of bugs where the `edit-guard-hook` would refuse
to honor a freshly-written exec-window because the controller LLM authoring
the JSON had a stale internal clock and wrote `opened_at` in the wrong year.
The hook compared `expires_at` (also LLM-fabricated) against the real
`Date.now()` and treated the window as expired, forcing the user to manually
refresh the exec-window or delete the session lock to make progress.

### Fixed

- `edit-guard-hook.cjs` `getActiveExecWindow` now derives `opened_at` from
  `fs.statSync(path).mtimeMs` (filesystem authoritative). The JSON
  `opened_at`/`expires_at` fields are accepted for backward-compat with
  legacy windows but are IGNORED for liveness/expiration decisions. The
  effective TTL is taken from a new `ttl_minutes` field (preferred), or
  back-derived from legacy `expires_at - opened_at`, or defaults to 5.
- Pairing check in `getActiveExecWindow` accepts a match against either the
  filesystem mtime OR `JSON.opened_at`. This covers the common case where a
  controller LLM writes the same stale-clock timestamp into BOTH the
  exec-window and the audit-log entry — they pair against each other even
  though both disagree with the wall clock. Defense-in-depth (forging only
  one of the two) remains intact.

### Changed

- `agents/core/pipeline-controller.md` exec-window protocol section: the
  canonical schema written by controllers is now `{ session_id, ttl_minutes,
  purpose, spawning_agent }`. `opened_at`/`expires_at` are deprecated for
  controller-authored windows (still emitted by `openExecWindow` helper for
  backward-compat).
- `openExecWindow` helper now writes `ttl_minutes` alongside the legacy
  timestamp fields.

### Tests

- 4 new tests covering: LLM-fabricated past `opened_at` (1 year stale), LLM-
  fabricated future `opened_at` (1 year ahead), minimal-schema window (just
  `ttl_minutes`), and `ttl_minutes > MAX_TTL_MINUTES` rejection. Existing 53
  tests continue to pass — total: 57/57.

## [4.1.2] - 2026-04-28

Cosmetic-only release that catches up the user-visible version strings to
reflect the 4.1.1 fix. No behavioral changes, no test additions.

### Changed

- `hooks/hooks.json` `SessionStart` banner: `v4.1.0 loaded` → `v4.1.2 loaded`
  and includes a one-liner about the 4.1.1 stale-lock self-heal so users
  who upgrade can see the relevant change at a glance.
- `README.md` shields.io version badge: `version-4.1.0` → `version-4.1.2`.

### Marketplace

- `.claude-plugin/marketplace.json`: pipeline-orchestrator pinned to `v4.1.2`.

## [4.1.1] - 2026-04-27

Patch release fixing a long-standing failure mode where a session lock could
be orphaned across Claude Code crashes/force-quits and continue blocking
direct `Edit`/`Write` outside `.pipeline/` for up to 2 hours (the lock TTL).
The Stop-hook cleanup path is keyed on `lock.session_id === sessionId`, so
locks belonging to a crashed session were never reclaimed by subsequent
sessions and the only escape hatches were waiting out the 2h TTL or
manually deleting the `.lock` file.

### Fixed

- **Orphan-lock self-heal (HIGH).** Session locks now carry a `last_seen_at`
  heartbeat field. On every `UserPromptSubmit`, `session-lock-hook.cjs`
  refreshes the heartbeat for the calling session's own lock and marks any
  foreign lock whose `last_seen_at` is older than `STALE_THRESHOLD_MS`
  (10 minutes) as `status: "completed"` with `completed_reason: "stale_heartbeat"`.
  Crashed-session locks are reclaimed within ~10 minutes of the next prompt
  in any Claude Code session sharing the same `.pipeline/sessions/`, instead
  of surviving the full 2h TTL.

### Added

- **Defense-in-depth in `edit-guard-hook.cjs`.** `getActiveLock()` now skips
  active locks whose `last_seen_at` is older than `STALE_HEARTBEAT_MS`
  (10 minutes), even when the GC pass has not yet run. Exposed as
  `STALE_HEARTBEAT_MS` in the module exports.
- **`refreshHeartbeatAndGC(baseDir, currentSessionId)`** in
  `session-lock-hook.cjs`. Pure helper that scans `sessions/`, refreshes
  the calling session's lock and reaps stale foreign locks. Returns
  `{ refreshed, stale_marked }`. Never creates the sessions directory —
  that remains the responsibility of `createLock()` under a real pipeline
  invocation.

### Backwards compatibility

- Locks created before 4.1.1 (no `last_seen_at` field) are treated as
  "fresh" by both `refreshHeartbeatAndGC` and `getActiveLock`. The legacy
  `expires_at` + Stop-hook contract continues to govern them so an upgrade
  cannot silently invalidate a pipeline that was already in flight.
- No public API or schema removed. The lock JSON gained `last_seen_at` and
  optionally `completed_reason`; both are additive.

### Tests

- `.claude/hooks/__tests__/session-lock-hook.test.cjs`: +12 tests covering
  heartbeat presence on `createLock`, sessions-dir-not-created invariant,
  own-session refresh, foreign-stale GC, fresh-foreign no-op, legacy
  no-`last_seen_at` no-op, completed-lock no-op, malformed-JSON tolerance,
  and the two `handleUserPromptSubmit` call sites that now run heartbeat/GC
  even on non-pipeline prompts.
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs`: +3 tests pinning
  the `STALE_HEARTBEAT_MS` skip behavior and the legacy-lock fallback.
- Suite total: 89 tests (was 74) across `session-lock-hook` + `edit-guard-hook`.

### Files changed

- `.claude/hooks/session-lock-hook.cjs` (+98 / -10)
- `.claude/hooks/edit-guard-hook.cjs` (+13 / -1)
- `.claude/hooks/__tests__/session-lock-hook.test.cjs` (+198 / -1)
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs` (+67 / 0)

### Marketplace

- `.claude-plugin/marketplace.json`: pipeline-orchestrator pinned to `v4.1.1`.

## [4.1.0] - 2026-04-26

Promotes `4.1.0-rc.1` to stable. Includes the cold-start fix and version-drift
reconciliation merged in #3 — the pipeline-controller (v4 entry point) is now
in `BOOTSTRAP_AGENTS`, so `/pipeline-orchestrator:pipeline` works in any cwd
without prior `.pipeline/docs/Pre-*-action/`. No other behavioral changes
since `4.1.0-rc.1`.

### Fixed (from #3)

- **Cold-start break (HIGH):** `.claude/hooks/sentinel-hook.cjs` `BOOTSTRAP_AGENTS`
  whitelist now includes `pipeline-controller`. Previously the v4 entry point
  was blocked on cold start because the whitelist still only contained the v3
  entry point (`task-orchestrator`), contradicting `skills/pipeline/SKILL.md`.
- **Sentinel deny-message:** updated to point to the v4 invocation path
  (`/pipeline-orchestrator:pipeline`), not direct `task-orchestrator` spawn.
- **Version drift:**
  - `README.md` badge `version-3.8.0` → `version-4.1.0`.
  - `hooks/hooks.json` SessionStart prompt `v4.0.0-draft.1` → `v4.1.0`.
  - `agents/core/pipeline-controller.md` exec-window protocol header
    `(v4.0.0-draft.2)` → `(v4.1+)`.
  - `agents/core/pipeline-controller.md` security-limitations docstring
    `30-minute TTL` → `5-minute default TTL (60-minute hard cap)` to match
    the actual `MAX_TTL_MINUTES` constant introduced in v4.1.

### Added (from #3)

- Regression test `[6b]` in `.claude/hooks/__tests__/sentinel-hook.test.cjs`
  asserting cold-start dispatch of `pipeline-controller` is permitted.
  Sentinel-hook test count: 71 → 73.

### Marketplace

- `marketplace.json` pipeline-orchestrator entry: `version` and `ref` both
  bumped from `v4.1.0-rc.1` → `v4.1.0` (supply-chain pin updated).

### Discovery context

The cold-start bug existed since v4.0.0-rc.1 (when the controller was
introduced) but was masked because integration tests ran in a directory with
prior pipeline state. Found by dogfooding the pipeline against the plugin's
own audit findings.

## [4.1.0-rc.1] - 2026-04-24

### Changed (hardening — resolves 3 known limitations from v4.0.0-rc.1)

- **edit-guard-hook — NI-5**: exports `openExecWindow(dir, sessionId, opts)` and `closeExecWindow(dir, sessionId)` as programmatic helpers. Includes tmp+rename atomic write, error-path cleanup, and controller-prompt references. First explicit lifecycle-test covers the full `open → allow → close → block` sequence.

- **edit-guard-hook — NI-4**: TTL bounded on both write and read paths. Default TTL reduced from 30 min to 5 min. Hard maximum of 60 min enforced by `MAX_TTL_MINUTES` constant; windows claiming longer are rejected on `openExecWindow` (throw) and ignored on `getActiveExecWindow` (silent skip with stderr log). Added `Number.isFinite()` guard against NaN/Infinity, future-timestamp rejection (`opened_at > now + 5s skew`), and legacy-window rejection.

- **edit-guard-hook — NI-3**: pairing check — exec-windows now require a matching `EXEC_WINDOW_OPEN` entry in `gate-decisions.jsonl` with `session_id` match and `timestamp` within ±60 s of the window's `opened_at`. `openExecWindow` and `closeExecWindow` helpers automatically append the audit entries. Stale-OPEN-reuse after CLOSE is blocked: a new window cannot pair with an OPEN already followed by an intermediate CLOSE for the same session. `appendAuditEntry` fails closed if no `Pre-*-action/*/` folder exists (no auto-synthesized fake folders).

### Added

- `.claude/hooks/edit-guard-hook.cjs` exports: `openExecWindow`, `closeExecWindow`, `MAX_TTL_MINUTES` (constant).
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs`: 25 new tests (25 → 50). Breakdown:
  - 4 NI-5 lifecycle tests
  - 4 NI-5 fix-pass tests (lock-required, ttl>0, atomic cleanup, TTL contract)
  - 3 NI-4 MAX_TTL tests
  - 3 NI-4 fix-pass tests (future opened_at, NaN, legacy window)
  - 8 NI-3 pairing tests
  - 3 NI-3 fix-pass tests (stale-OPEN reuse, fail-closed on missing dir)

### Stderr diagnostics

Hooks now emit targeted stderr lines when silently skipping malformed/rejected data (missing opened_at, TTL > 60min, no pairing entry). Aids controller debugging without failing open.

### Known limitations remaining (deferred to v4.2)

- Unbounded growth of `gate-decisions.jsonl` over long project lifespans — no pruning policy yet.
- `buildBlockMessage` does not hint at pairing requirement; controllers using raw `Write` path get generic block message, must check stderr.

## [4.0.0-rc.2] - 2026-04-24

Resolves 2 LOW items from `v4.0.0-rc.1` Known limitations. No behavioral
changes to the pipeline workflow; hardening only.

### Changed (hardening)

- **session-lock-hook / session-cleanup-hook**: lock writes are now atomic via
  `.tmp`+`rename`. Eliminates the millisecond window where a concurrent reader
  could observe a truncated/empty lock file (resolves pre-existing LOW item
  from v4.0.0-rc.1 Known limitations).
- **session-cleanup-hook**: refuses to follow symlinks under
  `.pipeline/sessions/`. Before `readFileSync` / `unlinkSync`, `fs.lstatSync`
  verifies the entry is a regular file; non-regular entries are skipped with a
  stderr log (resolves LOW theoretical hardening item from v4.0.0-rc.1 Known
  limitations).

### Tests

- `session-lock-hook.test.cjs`: 14 → 15 (added `.tmp` leftover contract test).
- `session-cleanup-hook.test.cjs`: 8 → 9 (added symlink rejection test; self-
  skips on platforms without unprivileged symlink support).
- `edit-guard-hook.test.cjs`: 25 (unchanged).

### Remaining known limitations (deferred to v4.1)

NI-3, NI-4, NI-5 — see v4.0.0-rc.1 entry below.

## [4.0.0-rc.1] - 2026-04-24

Promoted from draft.2 — no code changes, docs only.

### Release candidate notes

This RC promotes `4.0.0-draft.2` after the final adversarial review pass. All
IMPORTANT and HIGH findings are closed; 5 LOW/MEDIUM items are deferred to v4.1
and documented under **Known limitations (deferred to v4.1)** in the draft.2
entry below.

### Closed findings summary

- **F-001 (HIGH):** edit-guard now honors exec-window cooperative authorization,
  allowing N2 executor agents to write production code under the controller.
- **F-002 (HIGH):** session-lock Stop hook marks locks as completed; stale locks
  no longer shadow fresh ones; block message no longer suggests `rm` first.
- **F-003 (MEDIUM):** smoke test anchors to plugin root via `BASH_SOURCE`.
- **F-004 (MEDIUM):** tighter `session_id` regex rejects leading `.`/`-`.
- **F-005 (LOW):** renumbered CRITICAL REMINDERS in controller prompt.
- **F-006 (HIGH):** edit-guard now matches `MultiEdit` tool.
- **NI-1 (HIGH):** `plugin.json` version reconciled with CHANGELOG (draft.2).
- **NI-2 (HIGH):** session-cleanup Stop hook now deletes exec-window files,
  covering crash/forgotten-close cases.

### Deferred items

See the `[4.0.0-draft.2]` Known limitations section for NI-3, NI-4, NI-5, and
the two LOW pre-existing items (non-atomic `.lock` writes, cleanup symlink
trust).

## [4.0.0-draft.2] - 2026-04-24

### Changed (breaking for scripts that bypassed via MultiEdit)

- **edit-guard-hook**: now also matches `MultiEdit` tool (F-006 fix).
- **edit-guard-hook**: introduces **exec-window cooperative authorization** (F-001 fix) — when `.pipeline/sessions/{session_id}.exec-window` exists, is non-expired, and its `session_id` matches the active lock, Edit/Write OUTSIDE `.pipeline/` is allowed. This enables N2 executor agents (e.g. `executor-implementer-task`, `executor-fix`, `feature-implementer`) to write production code when spawned by `pipeline-controller`. See the controller prompt for the open/close protocol.

### Security (additive)

- **session-lock**: added Stop hook that marks locks as `status: completed` automatically (F-002).
- **session-lock**: `getActiveLock` now sorts by `created_at` DESC so stale locks don't shadow fresh ones (F-002).
- **session-lock**: tighter `session_id` regex — no leading `.` or `-` (F-004).
- **block message**: rewritten to discourage `rm` as first recourse; now surfaces `/pipeline-orchestrator:pipeline continue` and the Stop-hook auto-cleanup before manual deletion (F-002).
- **exec-window is COOPERATIVE, not cryptographic.** A compromised main LLM could create this file itself. Mitigations: 30-min TTL, human-readable content visible in `git diff`, `gate-decisions.jsonl` audit trail for every open/close. v4 relies on user diff review for integrity, not hook-level enforcement of exec-window creation.

### Documentation

- Renumbered controller prompt CRITICAL REMINDERS section (F-005).
- Smoke test anchors to plugin root via `BASH_SOURCE` so it passes from any cwd (F-003).
- `docs/MIGRATION-v3-to-v4.md` gains a "Known cooperative limitation" section.

### Known limitations (deferred to v4.1)

1. **Exec-window pairing check (NI-3, MEDIUM):** The edit-guard does not verify
   that an `EXEC_WINDOW_OPEN` audit entry exists in `gate-decisions.jsonl`
   before trusting an exec-window file. Trade-off: cooperative model,
   documented in MIGRATION. Future work: require matching audit entry for
   non-cryptographic pairing.
2. **Exec-window TTL of 30 min (NI-4, LOW):** The TTL is not linked to the
   spawning N2 agent's actual lifetime. A short task (30s) leaves a 30-min
   authorization window if the controller forgets to close it. Stop hook now
   cleans it (d9503d8) so crash cases are handled. Future work: per-batch TTL
   configuration.
3. **Controller exec-window protocol is prompt-only (NI-5, LOW):** The
   `pipeline-controller` agent prompt documents the open-before-spawn /
   close-after-return contract, but no automated test verifies that a
   controller instance actually follows it. Future work: BDD scenario that
   asserts exec-window lifecycle.
4. **Non-atomic `.lock` writes (LOW, pre-existing) — RESOLVED in v4.0.0-rc.2:**
   `session-lock-hook.cjs` and `session-cleanup-hook.cjs` now write to a
   pid-suffixed `.tmp` sibling then `fs.renameSync` to the final path. rename
   is atomic on the same filesystem, so concurrent readers can no longer
   observe a truncated/empty lock.
5. **Cleanup loop trusts symlinks (LOW, theoretical) — RESOLVED in v4.0.0-rc.2:**
   `session-cleanup-hook.cjs` now calls `fs.lstatSync` before any read/unlink
   and skips non-regular-file entries with a stderr log. Misplaced symlinks
   under `.pipeline/sessions/` can no longer redirect I/O outside the
   sessions directory.

## [4.0.0-draft.1] - 2026-04-23

### BREAKING

- **Orchestration moved from SKILL.md to `pipeline-controller` agent.** Main LLM no longer orchestrates; it spawns the controller and waits for the final PIPELINE COMPLETE block.
- **Main LLM loses Edit/Write permissions during pipeline sessions.** New `edit-guard-hook` blocks direct file edits outside `.pipeline/` when a session lock is active. Intentional — eliminates the bypass observed in v3.8 where main LLM rationalized "this task is too small for pipeline" and edited directly.
- **SKILL.md shrunk from ~900 lines to ~30 lines.** Full workflow spec moved to `agents/core/pipeline-controller.md`. v3 SKILL preserved as `skills/pipeline/SKILL.v3-reference.md`.

### Added

- `agents/core/pipeline-controller.md` — N1 orchestrator agent, isolated context, tools: Read/Write(.pipeline/**)/Agent/AskUserQuestion
- `.claude/hooks/session-lock-hook.cjs` — UserPromptSubmit hook; creates `.pipeline/sessions/{id}.lock` on `/pipeline` invocation
- `.claude/hooks/edit-guard-hook.cjs` — PreToolUse(Edit|Write) hook; blocks edits outside `.pipeline/` when lock active
- `tests/test_pipeline_controller.md` — BDD scenarios for manual validation
- `.claude/hooks/__tests__/session-lock-hook.test.cjs` — 14 unit tests (TDD + adversarial fix pass)
- `.claude/hooks/__tests__/edit-guard-hook.test.cjs` — 15 unit tests (TDD + adversarial fix pass)
- `.claude/hooks/__tests__/smoke-hooks.sh` — 3 stdin-driven smoke tests for hooks integration
- `.claude/hooks/dispatch-guard.cjs` updated to register `pipeline-controller` FQN

### Unchanged

- All 37 N2 agents (task-orchestrator, information-gate, executor-controller, review-orchestrator, final-validator, etc.)
- All `references/*.md` (gates, audit-trail, confidence, complexity-matrix, sentinel-integration)
- Legacy hooks: `force-pipeline-agents.cjs`, `completion-checklist.cjs`, `sentinel-hook.cjs`, `dispatch-guard.cjs`

### Migration from v3.x

See `docs/MIGRATION-v3-to-v4.md` for upgrade path and rollback instructions.

## [3.8.0] - 2026-04-17

### Added
- **Inline `AskUserQuestion` examples in `commands/pipeline.md`** for all 4 user-decision touchpoints (Phase 1 proposal, TDD scenario approval, per-batch adversarial gate, final adversarial gate). Each example shows the complete structured call with options, `(Recomendado)` labels where applicable, and descriptions explaining trade-offs. Eliminates the prior pattern of "Ask via AskUserQuestion." as a bare reference without shape guidance.
- **USER INTERACTION PROTOCOL blocks added to 11 edge-case agents** (v3.7.0 covered 5 user-facing agents; v3.8.0 extends to agents that may ask in edge cases): `executor-controller`, `executor-implementer-task`, `executor-fix`, `feature-implementer`, `bugfix-diagnostic-agent`, `bugfix-root-cause-analyzer`, `bugfix-regression-tester`, `pre-tester`, `ux-simulator`, `ux-accessibility-auditor`, `ux-qa-validator`. Total coverage: **16 agents** with explicit protocol blocks.

### Fixed
- **Protocol coverage gap from v3.7.0 audit.** v3.7.0 mandated `AskUserQuestion` + recommendation-first globally, but only 5 agents had the detailed block in their spec. Edge-case agents (e.g. executor-implementer-task raising a micro-gate gap, or bugfix-root-cause-analyzer needing evidence-confirmation input) could fall back to prose under LLM improvisation. v3.8.0 closes this gap with targeted blocks in each agent's spec, tailored to its specific interaction mode.

### Notes
- No breaking changes. MINOR bump because the new inline examples and per-agent blocks extend the public contract surface of the controller spec.
- The 12 "pure output" agents (revisores, classificador, zero-context scanners, coordinators) were deliberately not updated — they return structured YAML to the controller and never prompt the user directly. Adding the block there would be misleading bloat. They remain as-is.
- Agent coverage inventory: `information-gate`, `design-interrogator`, `plan-architect`, `quality-gate-router`, `finishing-branch` (v3.7.0) + `executor-controller`, `executor-implementer-task`, `executor-fix`, `feature-implementer`, `bugfix-*` (3), `pre-tester`, `ux-*` (3) (v3.8.0) = 16 agents with USER INTERACTION PROTOCOL blocks.

## [3.7.0] - 2026-04-17

### Added
- **`USER INTERACTION PROTOCOL`** section near the top of `commands/pipeline.md` (right after AGENT DISPATCH PROTOCOL). Mandates that every user decision point in the pipeline use the `AskUserQuestion` tool to render arrow-key selectable options — NEVER free-form prose. For technical questions (multiple viable approaches with trade-offs), the first option must be the agent's recommendation labeled `(Recomendado)` with reasoning in the option description. For confirmation questions (binary yes/no), the recommendation is optional.
- **Agent-level USER INTERACTION PROTOCOL blocks** added to the 5 user-facing agents:
  - `information-gate` — technical vs factual gaps, both via `AskUserQuestion`
  - `design-interrogator` — always recommendation-first (every question is technical by design)
  - `plan-architect` — approve/adjust/reject with plan as recommendation
  - `quality-gate-router` — one `AskUserQuestion` per test scenario, approve as recommendation
  - `finishing-branch` — closeout options (commit/push/keep/discard) with context-dependent recommendation; double-confirm for destructive actions
- Glossary entry **`User Interaction Protocol (v3.7.0+)`** codifying the contract.

### Fixed
- **Prose-prompt anti-pattern** eliminated. Prior versions documented `Ask via AskUserQuestion` but did not explicitly forbid the text-answer alternative. In observed usage, agents occasionally rendered prompts like `"Qual opção prefere? (A / B / C)"` in markdown output and waited for a typed response — which is error-prone and breaks deterministic gate handling. v3.7.0 makes the prohibition explicit with an anti-pattern table.

### Notes
- No breaking changes. All existing `AskUserQuestion` usages continue to work. MINOR bump because the protocol section is a new public contract surface.
- The `(Recomendado)` suffix is Portuguese to match the existing localization convention (options are user-visible in the terminal).

## [3.6.0] - 2026-04-17

### Added
- **`.claude/hooks/dispatch-guard.cjs`** — new `PreToolUse:Skill` hook that intercepts LLM controllers invoking `Skill(<agent-leaf>)` when they meant `Agent(subagent_type: "pipeline-orchestrator:...:<agent-leaf>")`. Denies the call and returns a corrective message with the correct fully-qualified `subagent_type`. Prevents the Phase 0a stall where `Skill(task-orchestrator)` produced `Unknown skill: task-orchestrator` with no guidance on how to fix it.
- **`.claude/hooks/__tests__/dispatch-guard.test.cjs`** — BDD scenario suite (Given/When/Then format) with 7 scenarios and 20+ assertions covering: task-orchestrator deflection, all four folder classes (core, executor, type-specific, quality), legitimate third-party skills pass, plugin-namespaced skills pass, type-confusion guards, non-Skill tools ignored, corrective-message actionability.
- **`AGENT DISPATCH PROTOCOL`** section at the top of `commands/pipeline.md` — makes the dispatch contract visible before any flow instructions. Documents the correct `Agent(subagent_type: "pipeline-orchestrator:<folder>:<leaf>")` pattern with a table of common agent mappings, plus the three known wrong invocations (`Skill`, `SlashCommand`, missing prefix).
- **`hooks.json` PreToolUse:Skill matcher** wired to `dispatch-guard.cjs`.

### Fixed
- **Definitive fix for "Skill(task-orchestrator) → Unknown skill"** LLM-controller confusion observed in production use. Prior versions relied on agent-description prose like *"I'll use the task-orchestrator"* which LLMs occasionally interpreted as a Skill tool call. v3.6.0 addresses this with: (a) runtime hook that denies with actionable corrective message, (b) explicit AGENT DISPATCH PROTOCOL section at the top of the controller spec, (c) BDD test coverage proving the deflection works for all four agent folder classes.

### Notes
- No breaking changes. All existing Agent-tool invocations continue to work identically.
- MINOR bump 3.5.0 → 3.6.0: adds a new runtime hook capability + public protocol section. The AGENT_LEAF_TO_FQN table in `dispatch-guard.cjs` is the source of truth for the 37 agent mappings; adding/removing/moving an agent requires updating this table plus its regression-test entries.
- BDD format validation: each scenario reads as a behavioral specification. Assertions map 1:1 to Given/When/Then prose. No hidden steps.

## [3.5.0] - 2026-04-17

### Added
- **`references/audit-trail.md`** — extracted Phase Transition Summary block template + Gate Decision Log JSONL format (with 8 parse/sanitization rules) from `references/gates.md`. Definitions and operational mechanics now evolve independently. Resolves NAME-1 from v3.4.0 self-test.
- **Table of Contents** in `commands/pipeline.md` — 4-section orientation block with line anchors and reference-file mapping. Resolves QUAL-1 from v3.4.0 self-test.
- **Frontmatter exception doc** on `adversarial-review-coordinator.md` — documents why this `adversarial-*` agent is context-aware (dispatches zero-context children). Resolves ARCH-2 from v3.4.0 self-test per the glossary Agent Naming Convention.
- **`ref: v3.5.0`** field in `marketplace.json` source for pipeline-orchestrator — explicit git-tag pin for supply-chain safety. Partial resolution of SEC-B1-01 (other two plugins in the marketplace deferred).
- **Hook regression tests** expanded 54 → 73 assertions: corrupted-state WARN (RISK-2), `discoverStatePath()` happy path (TEST-1), suffix-match alias branch (TEST-2), extended type-confusion vectors (boolean, object with toString, nested array — SEC-B3-02 codification).

### Fixed
- **RISK-2**: `sentinel-hook.cjs` now emits `SENTINEL WARN` to stderr when the state file exists but cannot be parsed (partial write, concurrent-write race, corruption). Previously was silent fail-open. Still exits 0 for backwards compat.
- **SEC-1 (v3.5 round 2 self-fix)**: parse-error stderr WARN now uses `path.basename()` and the error `name` (e.g. `ParseError`) instead of the absolute path and full error message — avoids leaking secrets that could sit mid-rotation in a partial state file.
- **Test hygiene (QUAL-1 / SEC-3 v3.5)**: test 17 (`discoverStatePath` happy path) replaced a 50 ms busy-wait CPU spin with `fs.utimesSync` to set deterministic mtimes. Eliminates Windows NTFS mtime-granularity flake.
- **Test cleanup (QUAL-2 v3.5)**: `tempDir()` factory now registers a `process.on('exit')` handler that removes all `sentinel-hook-test-*` directories at the end of the run. Stops accumulating OS temp-dir debt across CI runs.
- **QUAL-1 / QUAL-2 (pipeline.md cleanup)**: CRITICAL REMINDERS consolidated from 25 items to 13 by grouping related invariants into 6 concern categories (Infrastructure, Process, Control flow, Review, Evidence, Sentinel). No invariant dropped.
- **CLAR-1 HOTFIX table contradiction**: the `User confirm` row for HOTFIX previously read `Auto-proceed` while the prose required a single emergency confirmation question. Row now reads `1 emergency-confirmation question only`.
- **DEAD-1**: HOTFIX row in the Phase 3b-pre recommendation table clarified with a note explaining that HOTFIX already reduces per-batch adversarial to 2 checklists.
- **ARCH-1 (v3.5 self-fix)**: "Controller-only writes" rule de-duplicated. Previously appeared in `gates.md`, `audit-trail.md`, AND `commands/pipeline.md`. Removed from `gates.md` (a definitions file should not host operational mechanics).
- **Controller self-label**: `PIPELINE CONTROLLER v3.4` → `v3.5` aligned with manifest version.
- **hooks.json SessionStart prompt**: `Pipeline Orchestrator v3.4.0 loaded` → `v3.5.0 loaded`.

### Changed
- **Doc structure:** `references/gates.md` is now definitions-only (Hardness Taxonomy + Gate Registry, 49 lines). Operational audit mechanics live in the new `references/audit-trail.md`. All Grep redirects in `commands/pipeline.md` updated to point at the correct file.
- **Inline Invariants scope (v3.4.0 SEC-1 extension):** now covers `references/audit-trail.md` alongside `references/gates.md` and `references/confidence.md`.
- `pipeline.md` grew from 909 to 938 lines net (+ToC, -consolidated reminders) but is materially more navigable.

### Notes
- No breaking changes. All existing `subagent_type` paths continue to work. Existing `gate-decisions.jsonl` format unchanged — the file moved between reference docs, not its schema.
- Version bump 3.4.0 → 3.5.0 (MINOR): adds new public reference file `references/audit-trail.md` consumed via Grep, plus documentation and test-coverage improvements. Backwards compatible.
- 15 deferred findings from v3.4.0 self-test addressed: 2 HIGH fixed (SEC-B1-01 partial, TEST-1), 6 MEDIUM fixed (RISK-2, QUAL-1, QUAL-2, CLAR-1, NAME-1, ARCH-2), 4 LOW fixed (DEAD-1, SEC-B3-02 codification, SEC-B3-03 review, partial others). Remaining LOW deferred to future releases.

## [3.4.0] - 2026-04-17

### Added
- **Inline Invariants block in `commands/pipeline.md`**: authoritative list of gate names + hardness that overrides any Grep-loaded content from `references/`. Closes SEC-1 from the v3.3.0 self-test (extraction refactor created an untrusted Grep-loaded surface).
- **`references/gates.md`**: SSOT for the Gate Hardness Taxonomy, the full 15-gate Registry, the Phase Transition Summary template, and the Gate Decision Log JSONL format with its 8 parse/sanitization rules. Extracted from `commands/pipeline.md`.
- **`references/confidence.md`**: SSOT for the confidence score calculation, scoring rules, per-phase update contract, and persistence format. Extracted from `commands/pipeline.md`.
- Glossary entries: `Zero-Context Agent`, `Agent Naming Convention` (adversarial-* ⇒ zero-context; executor-* ⇒ context-aware), and `Residual Risk: LLM Prompt Injection` (defense-in-depth rationale).
- `sentinel-hook.cjs` trust-assumption header comment documenting what the hook protects against and what is out-of-scope (expects controller to provide integrity tokens, file locking, etc.).
- Hook regression tests expanded 31 → 54 assertions: near-miss stdin inputs, type-confusion guards, string/number `schema_version` normalization, `AGENTS` constant block, `runHook` `opts.cwd` isolation.

### Fixed
- **SEC-3**: `sentinel-hook.cjs` now emits `SENTINEL WARN` to stderr on unknown `schema_version` instead of silently allowing. Backwards compatible (still exits 0). Operators now detect version mismatches and state-file corruption.
- **SEC-B3-01 (v3.4.0 self-fix)**: `schema_version` as JSON string (`"1"` vs `1`) no longer bypasses the version check. Normalized via `Number()`.
- **Type-confusion guard**: non-string `subagent_type` (numeric, array, object, null) no longer crashes the hook with `.startsWith()` on a non-string.
- **ARCH-002 (v3.3.0 self-test)**: `commands/pipeline.md` controller self-label `PIPELINE CONTROLLER v3.1` → `v3.3` → `v3.3`/v3.4 chain resolved; label now follows the manifest version.
- **ARCH-003 (v3.3.0 self-test)**: duplicate `Mode:` line in the `final-adversarial-orchestrator` OBSERVABILITY banner removed.
- **RISK-003 (v3.3.0 self-test)**: contradiction between the intensity table and Rule 3 in `final-adversarial-orchestrator.md` resolved — Rule 3 now tracks the table.
- **QUAL-2 (v3.3.0 self-test)**: `Step 2f` label (which lived inside Phase 3) renamed to `Step 3-pre`.
- **ARCH-2 (v3.4.0 self-fix)**: `Step 3b-post` renamed to `Step 3b-pre` because it runs BEFORE `Step 3b` (final-validator).
- **ARCH-1 / QUAL-1 (v3.4.0 self-fix)**: duplicated inline Gate Registry table in `pipeline.md` removed; the extracted SSOT in `references/gates.md` is now the single authoritative source.
- **ARCH-2 (v3.4.0 self-fix)**: dangling "Step 1c" cross-reference in `references/confidence.md` replaced with the step-name-independent "pre-decision validation step."
- **Stale threshold log text**: the stale-state warning previously said `threshold: 60s` but the constant was 300s; the text is now derived from the constant.
- **Test hygiene**: `process.chdir()` replaced with `spawnSync({ cwd })` in tests 6/7 — removes a global side effect that could leak across tests. Subagent type paths centralized in a frozen `AGENTS` constant object.

### Changed
- **Marketplace manifest**: `pipeline-orchestrator` source field `"./"` → pinned `{"source": "url", "url": "..."}` matching the other two plugins in the marketplace. Unpinned ref (commit SHA pinning) is deferred — consistent with marketplace convention.
- **Intensity table in `final-adversarial-orchestrator.md`**: headers translated from mixed PT/EN to pure English (`Disponível`/`Recomendação`/`Intensidade` → `Available`/`Recommendation`/`Intensity`).
- **Trust model (SEC-2)**: `sentinel-hook.cjs` header now documents explicit trust assumption on `sentinel-state.json` and the controller-level mitigations that are out-of-hook-scope. No runtime change; documentation-only.

### Notes
- No breaking changes. Existing pipelines and `subagent_type` paths continue to work. The Grep-redirect pattern in `commands/pipeline.md` means LLM controllers running the skill now perform one extra grep per gate/confidence lookup — negligible at these file sizes.
- `commands/pipeline.md` reduced from 999 → 909 lines (-9%). Remaining size largely comes from the 4-phase flow spec, CRITICAL REMINDERS, and output format templates — extracting those would require coordinated test updates and is deferred.
- Version bump 3.3.0 → 3.4.0 (MINOR): adds new public reference files (`references/gates.md`, `references/confidence.md`) consumed by Grep, plus backwards-compatible hook hardening. Nothing existing was renamed or removed in a breaking way.

## [3.3.0] - 2026-04-17

### Added
- **ARCH-003 / ADV-001**: New `adversarial-quality-reviewer` agent (`pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer`). Context-independent (ZERO prior context) quality-focused reviewer for maintainability, clarity, testability, dead-code detection, and naming. Paired with `adversarial-security-scanner` and `adversarial-architecture-critic` in the `final-adversarial-orchestrator` trio.
- Regression test suite at `.claude/hooks/__tests__/sentinel-hook.test.cjs` — 14 test cases / 31 assertions codifying the public contract of `sentinel-hook.cjs` (bootstrap whitelist, state-file divergence, circuit breaker, stale-state detection, new-agent routing). No external dependencies; runs under vanilla Node.

### Fixed
- **ADV-002**: `final-adversarial-orchestrator` no longer delegates to per-task / per-batch reviewers (`adversarial-batch`, `architecture-reviewer`, `executor-quality-reviewer`) which run WITH context. The three final-review slots now point to the three context-independent adversarial scanners: `adversarial-security-scanner`, `adversarial-architecture-critic`, `adversarial-quality-reviewer`. This eliminates the silent dependency on external-plugin agents (e.g., `code-review:code-reviewer`) that was observed in v3.2.1 when the LLM controller improvised to fill the missing quality slot.
- Architecture diagram in `commands/pipeline.md` updated to name the three final-review agents explicitly.

### Changed
- README Project Structure tree now shows `type-specific/` as 17 domain expert agents (was 16) and documents the four adversarial specialists (coordinator + security + architecture + quality).

### Notes
- No breaking changes. Existing pipelines continue to work. The new agent is only invoked by `final-adversarial-orchestrator`; per-batch review flows are unchanged.
- `sentinel-hook.cjs` source was not modified in this release — the root cause of the v3.2.1 `PreToolUse:Agent` blocked spawns was the spec depending on agents that did not exist, not the hook itself. The hook's narrow scope (intercepting only `pipeline-orchestrator:*` agents) is preserved as intentional.

## [3.2.1] - 2026-04-17

### Fixed
- **ARCH-002**: Corrected ambiguous executor agent count in README Project Structure tree. Line 254 now reads `# 5 + feature-implementer (type-specific/)` instead of `# 6 execution agents`, accurately reflecting that `feature-implementer.md` lives under `executor/type-specific/` for pipeline reuse rather than as a standalone executor.
- **DOC-003**: Aligned README `core/` tree with filesystem — added missing `adversarial-batch` entry (8/8 agents now listed).
- **DOC-004**: Aligned README `quality/` tree with filesystem — removed misplaced `adversarial-batch` (it lives in `core/`), added missing `final-adversarial-orchestrator` (7/7 agents now listed).
- **DOC-005**: Bumped README version badge from `version-3.2.0-blue` to `version-3.2.1-blue` to match the manifest version.

### Documentation
- Added missing release date to the `[3.2.0]` CHANGELOG entry per Keep a Changelog 1.1.0.

## [3.2.0] - 2026-04-16

- Initial public release tracked in this changelog. See git history for prior changes.
