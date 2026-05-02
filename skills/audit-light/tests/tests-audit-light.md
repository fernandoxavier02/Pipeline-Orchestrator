# Test Strategy — Audit Light (9 prescriptive steps)

> **Note:** Audit pipelines are **REPORT ONLY**. The "tests" below are golden-run / contract tests that validate the audit *workflow*.

## Source ancestry

Adapted from `D:\Projeto Pulsar\.claude\commands\Prompts\Audtiroria\light\TESTS_AUDITORIA_LIGHT.md` and refocused on the contract layer of the imported skill.

## What gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares all required fields incl. `production_writes_allowed: false`. | Static parser walks all 9 step files. |
| Sequence lock | Steps execute strictly 1→2→3→4→5→6→7→8→9. | Golden run; audit log shows linear transitions. |
| Iron Law (read-only) | No Edit / Write call originates from any audit-* agent or step body. | `edit-guard-hook.cjs`. |
| Light_mode marking | Steps 2–4 invoke `audit-compliance-checker` with `agent_invocation_mode: "light_mode"` and the agent annotates outputs accordingly. | Deliverable JSON contains `light_mode: true` and `domain_analysis_source: "inline (audit-domain-analyzer skipped)"`. |
| Gate at step 1 | AskUserQuestion `Escopo` invoked exactly once. | Hook event capture. |
| Gate at step 9 | AskUserQuestion `GO/NO-GO` invoked, with dynamic recommendation logic respected (escalate-to-heavy when triggers fire). | Golden runs across 3 fixture types. |
| Sentinel checkpoints | Sentinel state validates before steps 1 and 9 (`pre_1`, `pre_9`). | `sentinel-hook` events. |
| STOP RULE | 2 consecutive failures halt the pipeline. | Inject failure; expect halt. |
| Output schema | Each step's `expected_outputs` is well-typed. | Schema check on JSON deliverable. |
| Evidence rule | Every claim has file:line OR explicit tag. | Regex check on report text. |
| Escalation triggers | Step 9 correctly recommends ESCALATE-TO-HEAVY when ANY trigger fires. | Fixture seeded with critical severity / regulatory keyword surfaces escalation as option 1. |

## Per-step contract assertions (Light)

### Step 1 — Snapshot

- `AuditSnapshot` JSON has five top-level keys (`stack_guess`, `project_map`, `entry_points`, `scripts`, `risk_hotspots_guess`).
- Gate `Escopo` invoked.

### Step 2 — Architecture

- `ArchitectureAudit` JSON has four top-level keys.
- `light_mode: true` flag present.
- `recommendations_top3` ≤3 items.

### Step 3 — Domain / SSOT

- `DomainSSOTAudit` JSON has five top-level keys.
- ≥1 SSOT candidate or explicit "no SSOT evidenced".

### Step 4 — Contracts

- `ContractAudit` JSON has five top-level keys.
- `endpoints_found` non-empty if `entry_points` (step 1) included an API surface.

### Step 5 — Data

- `DataAudit` JSON has five top-level keys.
- `rollback_feasibility.level` ∈ `{high, medium, low}`.

### Step 6 — Frontend

- `FrontendAudit` JSON has six top-level keys.

### Step 7 — Backend

- `BackendAudit` JSON has six top-level keys.
- `error_handling_quality_guess` is one of `good | poor | mixed | "not evidenced"`.

### Step 8 — Quality Ops

- `QualityOpsAudit` JSON has six top-level keys.
- `how_to_run_tests` is non-empty (or explicit "not evidenced").

### Step 9 — Pa de Cal

- `AuditFinalSeal` JSON has eight top-level keys.
- `escalation_assessment.recommend_escalate_to_heavy` is boolean.
- `go_no_go` ∈ `{GO, CONDITIONAL, NO-GO, ESCALATE-TO-HEAVY}`.
- AskUserQuestion option 1 is dynamic (escalation when triggers fire).

## Golden runs (suggested)

- **simple-library-no-backend** — exercises N/A handling: `db_tech_guess: "no DB evidenced"`, `pwa_cache_findings: "n/a"`.
- **small-react-app** — exercises full 9 steps; expects clean GO.
- **regulatory-keyword-fixture** — seeds scope with "GDPR" → step 9 must recommend ESCALATE-TO-HEAVY.

## Anti-tests

- No code modification (Iron Law).
- No skip / reorder (sequence_lock).
- No prose substitute for AskUserQuestion (gate_required).
- No silent promotion of `[HYPOTHESIS]` to `[VERIFIED]`.
- No GO when escalation trigger fires (the workflow MAY allow user to override but it MUST be a conscious choice via the AskUserQuestion answer, not the agent's default).
