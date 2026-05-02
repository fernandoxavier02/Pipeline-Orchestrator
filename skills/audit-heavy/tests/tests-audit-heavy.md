# Test Strategy — Audit Heavy (9 prescriptive steps)

> **Note:** Audit pipelines are **REPORT ONLY**. There are no production test artifacts created by the audit itself. The "tests" below are golden-run / contract tests that validate the audit *workflow* — they verify that the skill, the agents, and the gates behave deterministically and produce the declared outputs.

## Source ancestry

These guidelines are adapted from `D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\Heavy\TESTS_AUDITORIA_HEAVY.md` and refocused on the contract layer of the imported skill.

## What gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares `step_number`, `execution_mode`, `agent_type`, `expected_inputs`, `expected_outputs`, `expected_next`, `gate_required`, `production_writes_allowed: false`. | Static parser walks all 9 step files. Hooks `dispatch-guard` + `sentinel-hook` enforce at runtime. |
| Sequence lock | Steps execute strictly 1→2→3→4→5→6→7→8→9. No skip, no reorder. | Golden run on a fixture repo. Audit log `.pipeline/gate-decisions.jsonl` shows linear step transitions. |
| Iron Law (read-only) | No `Edit` / `Write` tool call originates from any audit-* agent or step body. | `edit-guard-hook.cjs` blocks. Test asserts hook fires when an audit step accidentally tries to write. |
| Gate at step 1 (scope approval) | `AskUserQuestion` is invoked exactly once with `header: "Escopo"` and 3 options before step 2 runs. | Golden run captures hook events; `gate-decisions.jsonl` has 1 entry tagged `pre_2`. |
| Gate at step 9 (Pa de Cal) | `AskUserQuestion` is invoked exactly once with `header: "GO/NO-GO"` and 3 options at the terminal step. | Golden run; `gate-decisions.jsonl` has the GO/CONDITIONAL/NO-GO entry. |
| Sentinel checkpoints | Sentinel state validates before steps 1, 5, 9 (`pre_1`, `pre_5`, `pre_9`). | `sentinel-hook` records validation events; test asserts 3 events per run. |
| STOP RULE | 2 consecutive failures (e.g., agent timeout, missing input field) halt the pipeline. | Inject failure into a fixture; expect halt + audit log entry tagged `stop_rule_triggered`. |
| Output schema | Each step's `expected_outputs` keys exist and are well-typed. The next step verifies inputs match. | Schema check on the JSON deliverable per step. |
| Evidence rule | Every claim in narrative + JSON cites `file:line` OR is tagged `[HYPOTHESIS]` / `[DESIGN]` / "not evidenced". | Static check: regex over the generated report — no untagged claim survives. |

## Per-step contract assertions

### Step 1 — Intake

- Output `AuditIntake` JSON has six top-level keys (`stack_detected`, `repo_map`, `entry_points`, `data_flow_guess`, `scripts_and_environments`, `initial_hotspots`).
- ≥1 entry in `stack_detected.languages`.
- ≥1 entry in `entry_points`.
- Gate `Escopo` invoked.

### Step 2 — Architecture

- Output `DependencyImpactAudit` JSON has five top-level keys.
- ≥1 entry in `dependency_graph_guess`.
- Either `cascade_risk_paths` is populated OR an explicit "no cascade risks evidenced" entry exists.

### Step 3 — Domain / SSOT

- Output `DecisionSSOTAudit` JSON has six top-level keys.
- ≥1 entry in `business_rules_catalog` per major business domain identified at intake.
- `ssot_map` covers each state concept named in `domain_model_guess.entities`.

### Step 4 — Contracts

- Output `ContractGovernanceAudit` JSON has six top-level keys.
- `endpoints_inventory` is non-empty if `entry_points` (step 1) included `type: api`.
- `backward_compatibility_assessment.versioning_strategy` is set (or explicit "none evidenced").

### Step 5 — Data

- Output `DataGovernanceAudit` JSON has six top-level keys.
- `db_stack.technology` is set (or explicit "no DB evidenced — stateless?").
- `rollback_strategy_assessment.reversibility` is one of `high | medium | low`.
- Sentinel `pre_5` checkpoint fired.

### Step 6 — Frontend

- Output `FrontendDeepAudit` JSON has seven top-level keys.
- Cross-check vs SSOT (step 3) and Contracts (step 4) is present in narrative.
- `pwa_cache_strategy.has_service_worker` is boolean (no nulls allowed).

### Step 7 — Backend

- Output `BackendDeepAudit` JSON has eight top-level keys.
- `authn_authz_model_guess.sensitive_endpoints_protected` is boolean or `partial`.
- `observability_assessment.logging.correlation_ids` is boolean.

### Step 8 — Governance / Tests / CI/CD

- Output `DeliveryGovernanceAudit` JSON has seven top-level keys.
- `test_strategy_inventory.how_to_run` is a non-empty string.
- `recommended_gates` ≥1 entry tagged `P0` if any HIGH severity finding exists in steps 5–7.

### Step 9 — Pá de Cal

- Output `AuditMasterSeal` JSON has all keys: `audit_id`, `scope`, `axes_covered`, `risk_matrix`, `priority_backlog`, `safe_change_strategy`, `contract_and_ssot_strategy`, `recommended_validation_suite`, `overall_assessment`.
- Risk matrix has ≥1 entry per `axes_covered` that produced findings.
- Every risk-matrix entry has `evidence` with `file:line` OR is tagged `[HYPOTHESIS]`.
- Gate `GO/NO-GO` invoked. Decision is one of `GO | CONDITIONAL | NO-GO`.
- All deduplication is logical (no duplicate finding IDs across the matrix).

## Golden runs (suggested)

Maintain golden runs on three fixture repositories, each exercising a different shape:

- **monorepo-frontend-backend** — exercises steps 4 (contracts), 6 (frontend), 7 (backend) with cross-checks.
- **data-heavy-service** — exercises step 5 (migrations, integrity) and step 7 (backend reliability) heavily.
- **library-no-backend** — exercises N/A handling: `entry_points` of type `cli` only; step 5 returns `db_stack: "no DB evidenced"`; step 6 `pwa_cache_strategy: n/a`.

The runs assert the contract bullets above and freeze the deliverable shape so that future skill edits cannot silently break the schema.

## Anti-tests

Things this workflow MUST NOT do (and tests must catch):

- Modify any production file — `edit-guard-hook` rejects.
- Skip a step or reorder — `sequence_lock: true` enforced.
- Substitute AskUserQuestion with prose — `gate_required: true` step that completes without a recorded `askuserquestion_response` triggers a failed assertion.
- Promote `[HYPOTHESIS]` to `[VERIFIED]` without new evidence — diff between step 8 outputs and step 9 risk matrix surfaces any silent promotion.
- Recommend a code-change as if it were the audit's deliverable — recommendations are advisory; remediation requires a downstream Bug Fix / Feature pipeline.
