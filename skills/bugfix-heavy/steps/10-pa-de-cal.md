---
step_number: 10
step_name: "pa-de-cal"
execution_mode: inline
expected_inputs:
  - fix_diff: from_step_6
  - all_tests_status: from_step_7
  - consolidated_blockers: from_step_8
  - post_fix_e2e_status: from_step_9
  - failure_scenarios: from_step_9
expected_outputs:
  - go_no_go: "GO | CONDITIONAL | NO-GO"
  - reasons: list
  - residual_risks: list
  - rollback_plan: string
  - observability_hooks: list
  - askuserquestion_response: string
expected_next: 11
gate_required: true
allowed_tools: [AskUserQuestion, Read, Grep, Bash]
---

# Step 10 — Pá de Cal (Final GO / CONDITIONAL / NO-GO Gate)

## Objective

Final, evidence-based GO / CONDITIONAL / NO-GO decision for merge / deploy. You are the auditor of last resort (Staff Engineer + Reliability + QA Lead). Do **not** re-implement anything. Verify, critique, and demand evidence. This is a **mandatory user-facing gate** (`gate_required: true`) and represents the synthesis of steps 1–9.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_10]`). The sentinel-hook validates that outputs from steps 6–9 are present before this gate runs.

## Inputs

- `fix_diff` (from step 6)
- `all_tests_status` (from step 7) — must be PASSING
- `consolidated_blockers` (from step 8) — should be empty or accepted-as-MAJOR
- `post_fix_e2e_status` (from step 9) — should be PASS

## Instructions

### 10.1 Context summary

State briefly:
- Implemented change (1–2 lines)
- Original problem / objective
- Target environment (dev / staging / prod)
- Components affected (backend / frontend / job / queue / DB / cache / integrations)

### 10.2 Mandatory verification checklist (PASS / FAIL / INCONCLUSIVE per item, with evidence)

For each item: declare status + evidence + action-if-fail.

**A) Functionality (user-facing)**
1. End-to-end user flow works (mobile-first)?
2. Clear UI states: loading / success / error / retry?
3. Duplicate actions prevented (double tap / spam click)?
4. Result matches expectation (content, formatting, audio, navigation)?

**B) Domain & business rules** (if applicable)
5. Business rules respected, no undue assumptions?
6. Domain invariants from step 3 preserved?
7. Domain edge cases considered (timezone, access, eligibility, backlog, limits)?

**C) Source of truth & cross-layer consistency**
8. Source of truth is clear and singular?
9. Frontend reads from the same source the backend writes?
10. No risk of stale cache / eventual consistency causing UI divergence (or mitigated)?

**D) Persistence & data integrity** (if applicable)
11. Data persisted at the correct moment?
12. No orphan / incomplete / inconsistent records?
13. Schema constraints / unique keys validated where needed?

**E) Idempotency & repetition** (if applicable)
14. What happens on 2x execution (retry, reprocess, duplicate job, double click)?
15. Dedup / upsert / unique key / lock / "already processed" markers in place?
16. Practical evidence of no duplication (test or simulation)?

**F) Atomicity & partial failure** (if applicable)
17. If operation fails mid-way, system stays consistent?
18. Transaction / safe state sequence / compensating action present?
19. No "intermediate state" leaked to the user?

**G) Regression & collateral impact**
20. Adjacent flows that may have been affected — listed and verified?
21. Tests covering those flows (unit / integration / E2E) — results?
22. Any change that should be feature-flagged?

**H) Observability & post-deploy support**
23. Logs with correlation context (userId, dateKey, jobRunId, requestId)?
24. Minimum metrics to detect failure (error rate, items generated, users without item)?
25. Alerts recommended? What to monitor in the first 24–72h?

**I) Security & compliance** (when applicable)
26. Permissions / authorization respected?
27. No undue exposure of sensitive data?
28. Inputs and integration failures validated?

### 10.3 Minimum non-negotiable test scenarios (require execution evidence)

- Happy path on mobile.
- Slow network / timeout / momentary offline.
- Double click / automatic retry.
- User without data (empty state).
- User with existing data (no duplication).
- Repeated execution (job or action).

For each: PASS / FAIL + evidence.

### 10.4 AskUserQuestion gate (mandatory — no prose substitute)

Per global rule, invoke AskUserQuestion. This gate has 3 outcomes (GO/CONDITIONAL/NO-GO):

```
header: "GO/NO-GO"
question: "Pá de Cal: aprovar este fix para integração / deploy?"
multiSelect: false
options:
  - label: "GO — aprovar e integrar"
    description: "Todos os checks passam; riscos residuais observaveis via telemetria recomendada."
  - label: "CONDITIONAL — aprovar com follow-up"
    description: "GO, mas requer follow-up em N dias para tratar major findings ou observabilidade."
  - label: "NO-GO — bloquear e voltar"
    description: "Falha em N: <especificar>; precisa <Z> antes de seguir. Workflow re-entra na etapa apropriada."
```

(The tool automatically appends "Other" for free text.)

### 10.5 Final decision (rigid format)

- **DECISION**: GO / CONDITIONAL / NO-GO
- **REASONS** (3–7 objective items)
- **BLOCKERS** (if NO-GO): exact list of what's missing.
- **RESIDUAL RISKS** (if GO/CONDITIONAL): known risks + mitigation/monitoring.
- **ROLLBACK PLAN**: how to revert (what to disable, what to roll back, how to validate).

Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7.

### 10.6 Closing rule

Any item left INCONCLUSIVE → declare which evidence is missing and how to get it quickly. Do not assume PASS without evidence.

## Done criteria

- 9-section checklist completed with PASS/FAIL/INCONCLUSIVE + evidence per item.
- Minimum non-negotiable scenarios declared with evidence.
- AskUserQuestion invoked (not substituted with prose).
- Final decision recorded in rigid format with reasons + blockers/residual risks + rollback plan.

## Outputs (handoff to step 11)

```yaml
go_no_go: GO | CONDITIONAL | NO-GO
reasons: [<list>]
residual_risks: [<list>]
rollback_plan: <text>
observability_hooks: [<list>]
askuserquestion_response: <text>
```

## Routing

- `GO` or `CONDITIONAL` → proceed to step 11 (final after-all sanity sweep).
- `NO-GO` → exit skill; re-enter at the appropriate earlier step (typically 4 or 6).

## Next

Proceed to `steps/11-final-validation-after-all.md` — the post-decision sanity sweep, **distinct** from this Pa de Cal gate.
