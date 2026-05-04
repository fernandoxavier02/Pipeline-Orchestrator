# Test Strategy — Feature Light (13 prescriptive steps)

> **Note:** These are golden-run / contract tests that validate the SKILL workflow itself — they verify that the skill, the agents, and the gates behave deterministically and produce the declared outputs. They are NOT user-facing acceptance tests for a particular feature implementation.

## Source ancestry

The user-story translation guidelines that originally lived in this file (Pulsar `TESTS_USER_STORY_LIGHT.md`) have been moved to `references/feature-user-story-guidelines.md` (merged Light + Heavy versions). Those guidelines are still relevant per-feature work; this file now focuses on the contract layer of the imported skill.

## What gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares `step_number`, `step_name`, `source`, `description`, `execution_mode`, `agent_type`, `expected_inputs`, `expected_outputs`, `expected_next`, `gate_required`, `allowed_tools`. | Static parser walks all 13 step files. Hooks `dispatch-guard` + `sentinel-hook` enforce at runtime (advisory model — see §17.4 #8). |
| Sequence lock | Steps execute strictly 1→2→3→...→13. No skip, no reorder. | Golden run on a fixture repo. Audit log `.pipeline/gate-decisions.jsonl` shows linear step transitions. |
| Gate at step 3 (acceptance-matrix-approval) | `AskUserQuestion` invoked exactly once with the recommended option marked, before step 4 runs. | Golden run captures hook events; `gate-decisions.jsonl` has 1 entry tagged `pre_4`. |
| Gate at step 7 (architecture-choice) | `AskUserQuestion` invoked exactly once with 2 options, before step 8 runs. | `gate-decisions.jsonl` has 1 entry tagged `pre_8`. |
| Gate at step 9 (plan-approval) | `AskUserQuestion` invoked exactly once before TDD. | `gate-decisions.jsonl` has 1 entry tagged `pre_10`. |
| Gate at step 10 (tdd-tests-approval) | `AskUserQuestion` invoked once after RED tests written, before step 11 (execution). | `gate-decisions.jsonl` has 1 entry tagged `pre_11`. |
| Sentinel checkpoints | Sentinel state validates before steps 3, 10, 13 (`pre_3`, `pre_10`, `pre_13`). | `sentinel-hook` records validation events; test asserts 3 events per run. |
| STOP RULE | 2 consecutive failures (e.g., agent timeout, missing input field) halt the pipeline. | Inject failure into a fixture; expect halt + audit log entry tagged `stop_rule_triggered`. |
| Output schema | Each step's `expected_outputs` keys exist; the next step verifies inputs match. | Schema check on the JSON deliverable per step. |
| Agent dispatch | Steps 3, 7, 9 spawn `feature-vertical-slice-planner`; step 10 spawns `pre-tester`; step 11 spawns `feature-implementer`; step 12 spawns `feature-integration-validator`. | Golden run inspects Task tool invocations and matches `subagent_type`. |
| Inline steps | Steps 1, 2, 4, 5, 6, 8, 13 execute inline (no Task spawn). | Golden run asserts no Task call for these steps. |

## Smoke test scenarios

### Scenario A — Happy path (small feature, all gates approved)

1. Invoke `/pipeline-orchestrator:feature-light "add dark-mode toggle to settings page; user story: as a user, I can toggle dark mode and the choice persists across sessions; DoD: toggle visible, persists in localStorage, applies on next load"`.
2. Expect steps 1→2 inline, step 3 spawns planner + AskUserQuestion (Escopo).
3. Approve → steps 4→6 inline, step 7 spawns planner + AskUserQuestion (Architecture).
4. Approve → step 8 inline, step 9 spawns planner + AskUserQuestion (Plan).
5. Approve → step 10 spawns pre-tester + AskUserQuestion (TDD RED).
6. Approve → step 11 spawns implementer (GREEN), step 12 spawns integration-validator, step 13 inline.
7. Final state: `gate-decisions.jsonl` has 4 gate entries; sentinel events for `pre_3`, `pre_10`, `pre_13`.

### Scenario B — Gate revise loop

1. Invoke as above.
2. At step 3 gate, choose "Revisar".
3. Step 3 re-runs; if user revises again twice in a row without progress → STOP RULE triggers.

### Scenario C — Escalate to heavy

1. Invoke `feature-light` with a request that includes "modificar schema do banco + integração com Stripe + concorrência multi-user".
2. Expect step 1 (intent) to flag scope as out-of-bounds for light, recommend `feature-heavy`.
3. User can abort and re-invoke `feature-heavy` (or pipeline-controller auto-escalates if dispatched via `/pipeline`).

## Per-step contract assertions

### Step 1 — Intent + Scope
- Output `intent_doc` non-empty; `applicability_assessment` lists which of {domain, ssot, persistence, idempotency, atomicity} apply.

### Step 2 — Terrain Recon
- Output `terrain_map` cites file paths; `existing_patterns` non-empty if codebase has any patterns.

### Step 3 — User Flow + UX **[GATE]**
- Output `acceptance_matrix` has ≥1 scenario in DADO/QUANDO/ENTAO format.
- Gate `acceptance-matrix-approval` invoked.

### Step 4 — Domain Rules
- Output `domain_rules` lists rules with explicit "applies / does not apply" tags.

### Step 5 — Source of Truth
- Output `ssot_mapping` identifies each state concept's owner (UI, backend, cache).

### Step 6 — Data Model + Persistence
- Output `data_model` defined OR explicit "no persistence needed".

### Step 7 — Architecture Design Options **[GATE]**
- Output `design_options` ≥2 options with trade-offs.
- Gate `architecture-choice` invoked.

### Step 8 — Risk Controls
- Output `risk_register` non-empty if step 7 chose architecture with idempotency/atomicity needs.

### Step 9 — Implementation Plan **[GATE]**
- Output `implementation_plan.increments` ≥1 increment with file targets.
- Gate `plan-approval` invoked.

### Step 10 — TDD Pre-Impl (RED) **[GATE]**
- Output `test_files` paths exist on disk.
- `red_status` confirms feature tests fail; regression tests pass.
- Gate `tdd-tests-approval` invoked.

### Step 11 — Execution Minimal Diff (GREEN)
- Output `code_diff` non-empty; `green_status` confirms ALL tests now pass.

### Step 12 — Testing Validation
- Output `test_results` shows full suite green; `sanity_report` flags any unrelated regressions.

### Step 13 — Release + Observability
- Output `release_notes`, `observability_plan`, `rollback_plan` all non-empty.

## Anti-tests (things this workflow MUST NOT do)

- Skip a gate or substitute it with prose — `gate_required: true` step that completes without a recorded `askuserquestion_response` triggers a failed assertion.
- Reorder steps — `sequence_lock: true` enforced.
- Spawn an unauthorized agent — `dispatch-guard` rejects.
- Modify production code at steps 1–10 — only step 11 has `Edit` in `allowed_tools`.
- Promote `[ASSUNCAO]` to `[EVIDENCIA]` without new evidence — diff between step outputs surfaces silent promotion.

## Reference docs

- Pulsar source playbook: `D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\Ligth\`
- User-story translation guidelines (Pulsar absorbed): `references/feature-user-story-guidelines.md`
- Heavy counterpart: `skills/feature-heavy/tests/tests-feature-heavy.md`
- Design rationale: `designs/pipeline-orchestrator-v5-consolidated.md` §23
