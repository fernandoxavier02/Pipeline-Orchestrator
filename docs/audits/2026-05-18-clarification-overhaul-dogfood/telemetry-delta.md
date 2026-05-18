# Telemetry Delta — v6.0/v6.1 baseline vs v6.2 dogfood

## Baseline measured

Source: `D:/IFRS-16-po-eval/C1-brainstorm-handoff/.pipeline/docs/Pre-Medium-action/2026-05-10-audit-f04/gate-decisions.jsonl`

- **Total events:** 12
- **Distinct gate types:** 9 (ADVERSARIAL_GATE, CHECKPOINT_FAIL, FINAL_ADVERSARIAL_GATE, INFO_GATE_BLOCKED, PHASE_1_PROPOSAL, PHASE_3_PA_DE_CAL, PLAN_REJECTED, SSOT_CONFLICT, STEP_1_7_ROUTING)
- **Clarification gates:** **0** (legacy — pre-v6.2 plugin had no first-class telemetry for the brainstorm clarification step)
- **Brainstorm phase visibility:** ZERO. The brainstorm step-01-explore Q&A produced `02-explore.md` text but emitted **no JSONL events**. You could not query "how many questions did the agent ask?" or "which lenses were skipped vs. answered?" from telemetry alone.

## v6.2 dogfood telemetry (this run)

Source: `pipeline-runs/001-csv-export-contracts/00-brainstorm/gate-decisions.jsonl`

- **Total events from brainstorm phase alone:** 14
- **Distinct gate types added in v6.2:** 5 (CLARIFICATION_GAPS_DETECTED, CLARIFICATION_RESOLVED, CLARIFICATION_SKIPPED, ALTERNATIVES_PROPOSED, ALTERNATIVE_CHOSEN)
- **AUDIT-hardness events** (new level): 2 (gaps-detected + alternatives-proposed) — telemetry-only, no decision-blocking
- **Brainstorm phase visibility:** FULL. You can now answer:
  - How many gaps were detected per run? (CLARIFICATION_GAPS_DETECTED.detail count)
  - Which lenses got skipped because intake answered them? (CLARIFICATION_SKIPPED entries)
  - How many alternatives were proposed and which axis won? (ALTERNATIVES_PROPOSED + ALTERNATIVE_CHOSEN)
  - Was the implicit plan chosen or did the user pivot? (ALTERNATIVE_CHOSEN.decision)

## Delta summary

| Metric | Pre-v6.2 (baseline) | v6.2 (this run) | Δ |
|---|---|---|---|
| Brainstorm-phase JSONL events | 0 | 14 | +14 |
| Distinct gate types in registry | 22 | 27 | +5 |
| Hardness levels | 4 (MANDATORY/HARD/CIRCUIT_BREAKER/SOFT) | 5 (+ AUDIT) | +1 |
| Average evidence-citations per question | ~0.1 (incidental prose) | 1.0 (mandatory by contract) | +900% |
| Pre-question file reads | 0 | 4 (Phase A) | new |
| Anti-invention blockers surfaced at brainstorm | 0-1 | 4 in this scenario (streaming/PII/cap/timeout) | +3-4 |

## Downstream consequences

The new AUDIT-hardness events are explicitly **excluded from fidelity scoring** (per `references/gates.md` Mandatory Gates by Complexity table — they have no row), so they cannot break the fidelity-reporter math. They also do NOT apply confidence penalty when "skipped" because they're not skippable in the SOFT sense.

The two new HARD/SOFT events (CLARIFICATION_RESOLVED, ALTERNATIVE_CHOSEN) get small positive `confidence_impact` (+0.02, +0.05), nudging Pa de Cal toward HIGH zone when the brainstorm extracted clarifications. This is *deliberately* a small effect — it rewards thorough brainstorming without overwhelming the existing scoring.

## How to query the new telemetry

```bash
# Count gaps detected per run
jq 'select(.gate=="CLARIFICATION_GAPS_DETECTED")' gate-decisions.jsonl

# Find runs where the user picked a non-implicit alternative
jq 'select(.gate=="ALTERNATIVE_CHOSEN" and .decision!="IMPLICIT_PLAN")' gate-decisions.jsonl

# Which lenses get skipped most often (signal that intake template is improving)
jq 'select(.gate=="CLARIFICATION_SKIPPED") | .detail' gate-decisions.jsonl | sort | uniq -c
```

Note: these queries require `jq` (existing dev-tool convention in IFRS-16-po-eval's prior C1-C7 scenarios). No new tooling needed.
