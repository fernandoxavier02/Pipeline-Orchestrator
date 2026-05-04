# Test Strategy — Feature Heavy (13 prescriptive steps)

> **Note:** These are golden-run / contract tests that validate the SKILL workflow itself — they verify that the skill, the agents, and the gates behave deterministically and produce the declared outputs. They are NOT user-facing acceptance tests for a particular feature implementation.

## Source ancestry

The user-story translation guidelines that originally lived in this file (Pulsar `TESTS_USER_STORY_HEAVY.md`) have been moved to `references/feature-user-story-guidelines.md` (merged Light + Heavy versions). Those guidelines are still relevant per-feature work; this file now focuses on the contract layer of the imported skill.

## What gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares `step_number`, `step_name`, `source`, `description`, `execution_mode`, `agent_type`, `expected_inputs`, `expected_outputs`, `expected_next`, `gate_required`, `allowed_tools`. | Static parser walks all 13 step files. Hooks `dispatch-guard` + `sentinel-hook` enforce at runtime (advisory model — see §17.4 #8). |
| Sequence lock | Steps execute strictly 1→2→3→...→13. No skip, no reorder. | Golden run on a fixture repo. Audit log `.pipeline/gate-decisions.jsonl` shows linear step transitions. |
| Evidence vs assumption | Every step output declares `[EVIDENCIA]` (cited file:line) or `[ASSUNCAO]` (with "como confirmar"). | Static check: regex over the generated outputs — no unmarked claim survives. |
| Gate at step 3 (acceptance-matrix-approval) | `AskUserQuestion` invoked exactly once with the recommended option marked, before step 4 runs. | Golden run captures hook events; `gate-decisions.jsonl` has 1 entry tagged `pre_4`. |
| Gate at step 7 (architecture-choice) | `AskUserQuestion` invoked exactly once with 3 options + trade-offs, before step 8 runs. | `gate-decisions.jsonl` has 1 entry tagged `pre_8`. |
| Gate at step 9 (plan-approval) | `AskUserQuestion` invoked exactly once before TDD. | `gate-decisions.jsonl` has 1 entry tagged `pre_10`. |
| Gate at step 10 (tdd-tests-approval) | `AskUserQuestion` invoked once after full RED matrix written, before step 11 (execution). | `gate-decisions.jsonl` has 1 entry tagged `pre_11`. |
| Sentinel checkpoints | Sentinel state validates before steps 3, 10, 13 (`pre_3`, `pre_10`, `pre_13`). | `sentinel-hook` records validation events; test asserts 3 events per run. |
| STOP RULE | 2 consecutive failures (e.g., agent timeout, missing input field) halt the pipeline. | Inject failure into a fixture; expect halt + audit log entry tagged `stop_rule_triggered`. |
| Output schema | Each step's `expected_outputs` keys exist; the next step verifies inputs match. | Schema check on the JSON deliverable per step. |
| Agent dispatch | Steps 3, 7, 9 spawn `feature-vertical-slice-planner`; step 10 spawns `pre-tester`; step 11 spawns `feature-implementer`; step 12 spawns `feature-integration-validator`. | Golden run inspects Task tool invocations and matches `subagent_type`. |
| Inline steps | Steps 1, 2, 4, 5, 6, 8, 13 execute inline (no Task spawn). | Golden run asserts no Task call for these steps. |

## Smoke test scenarios

### Scenario A — Happy path (heavy feature, all gates approved)

1. Invoke `/pipeline-orchestrator:feature-heavy "implement subscription billing with Stripe; user story: as a user, I can subscribe, downgrade, cancel, and resume; DoD: idempotent webhook handling, atomic credit reconciliation, audit log per state change, rollback strategy for partial Stripe failures, multi-currency support"`.
2. Expect steps 1→2 inline (deep terrain recon), step 3 spawns planner + AskUserQuestion (Acceptance Matrix).
3. Approve → steps 4→6 inline (domain rules + SSOT + data model with migrations), step 7 spawns planner + AskUserQuestion (Architecture — 3 options).
4. Approve → step 8 inline (risk register with idempotency + atomicity strategies), step 9 spawns planner + AskUserQuestion (Plan).
5. Approve → step 10 spawns pre-tester (full coverage matrix) + AskUserQuestion (TDD RED).
6. Approve → step 11 spawns implementer (GREEN), step 12 spawns integration-validator (full suite), step 13 inline.
7. Final state: `gate-decisions.jsonl` has 4 gate entries; sentinel events for `pre_3`, `pre_10`, `pre_13`; every output carries `[EVIDENCIA]`/`[ASSUNCAO]` tags.

### Scenario B — Architecture rejected at step 7

1. Invoke as above; approve through step 6.
2. At step 7 gate, choose "Revisar — me diga o que ajustar".
3. Step 7 re-runs with revision notes; new options presented.
4. Two consecutive `revise`-without-progress trip STOP RULE.

### Scenario C — Pre-tester finds plan gap

1. Invoke as above; approve through step 9.
2. At step 10, pre-tester reports the implementation plan from step 9 doesn't cover edge case X.
3. Pipeline halts at step 10 gate with revise option; user can backtrack to step 9 to refine plan.

## Per-step contract assertions

### Step 1 — Intent + Scope
- Output `intent_doc` non-empty; `applicability_assessment` lists which of {domain, ssot, persistence, idempotency, atomicity, concurrency} apply with EVIDENCIA/ASSUNCAO tag each.
- `evidence_vs_assumption` ≥1 entry.

### Step 2 — Terrain Recon
- Output `terrain_map` cites file paths; `existing_patterns` non-empty.
- `evidence_vs_assumption` ≥3 entries.

### Step 3 — User Flow + UX **[GATE]**
- Output `acceptance_matrix` has full matrix (entries × valid/invalid/edge × authn/anon × etc).
- Gate `acceptance-matrix-approval` invoked with detailed options.

### Step 4 — Domain Rules
- Output `domain_rules` ≥1 rule per business concept; `ambiguities` listed explicitly.
- `property_tests_plan` ≥1 entry if rules have many input domains.

### Step 5 — Source of Truth
- Output `ssot_mapping` identifies each state concept's owner; `divergence_risks` enumerates UI vs backend vs cache risks.

### Step 6 — Data Model + Persistence
- Output `data_model` includes entities, keys, invariants; `migration_tests_plan` non-empty if schema changes.

### Step 7 — Architecture Design Options **[GATE]**
- Output `design_options` ≥3 options with explicit trade-offs.
- Gate `architecture-choice` invoked.

### Step 8 — Risk Controls
- Output `risk_register` complete; `idempotency_strategy` + `atomicity_strategy` present if step 7 chose architecture needing them.

### Step 9 — Implementation Plan **[GATE]**
- Output `implementation_plan.increments` ≥2 increments with file targets + ordering.
- Gate `plan-approval` invoked.

### Step 10 — TDD Pre-Impl (RED) **[GATE]**
- Output `test_files` paths exist on disk; `coverage_matrix` covers FEATURE + INTEGRATION + REGRESSION + EDGE quadrants.
- `red_status` confirms feature tests fail; regression tests pass.
- Gate `tdd-tests-approval` invoked.

### Step 11 — Execution Minimal Diff (GREEN)
- Output `code_diff` non-empty; `green_status` confirms ALL tests pass.
- No-Invention rule: any "default value" must cite source (`.claude/rules/41-no-invention.md`).

### Step 12 — Testing Validation
- Output `test_results` shows full suite green (unit + integration + E2E if applicable); `integration_validation` confirms cross-system contracts.

### Step 13 — Release + Observability
- Output `release_notes`, `observability_plan`, `rollback_plan` all non-empty with concrete monitoring + rollback steps.

## Golden runs (suggested)

Maintain golden runs on three fixture repositories:

- **stripe-subscription-fixture** — exercises step 6 (data model + migration), step 8 (idempotency + atomicity), step 10 (full coverage matrix).
- **realtime-collab-fixture** — exercises step 5 (SSOT divergence), step 8 (concurrency), step 11 (multi-step atomic updates).
- **mobile-pwa-fixture** — exercises step 3 (mobile-first UX), step 6 (offline-first persistence), step 13 (rollback for native + PWA).

The runs assert the contract bullets above and freeze the deliverable shape so that future skill edits cannot silently break the schema.

## Anti-tests (things this workflow MUST NOT do)

- Skip a gate or substitute it with prose — `gate_required: true` step that completes without a recorded `askuserquestion_response` triggers a failed assertion.
- Reorder steps — `sequence_lock: true` enforced.
- Spawn an unauthorized agent — `dispatch-guard` rejects.
- Modify production code at steps 1–10 — only step 11 has `Edit` in `allowed_tools`.
- Promote `[ASSUNCAO]` to `[EVIDENCIA]` without new evidence — diff between step outputs surfaces silent promotion.
- Invent default values without citing source (Non-Invention rule).

## Reference docs

- Pulsar source playbook: `D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\Heavy\`
- User-story translation guidelines (Pulsar absorbed): `references/feature-user-story-guidelines.md`
- Light counterpart: `skills/feature-light/tests/tests-feature-light.md`
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §23
