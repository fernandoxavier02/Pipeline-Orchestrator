---
step_number: 3
step_name: "dominio-regras-ssot-decisoes"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-domain-analyzer"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - DependencyImpactAudit: from_step_2
  - module_boundaries_narrative: from_step_2
expected_outputs:
  - DecisionSSOTAudit: object
  - decision_narrative: string
  - domain_model_guess: object
  - business_rules_catalog: list
  - decision_points: list
  - ssot_map: object
  - inconsistency_risks: list
  - recommendations_top5: list
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 03 — Domain + Business Rules + SSOT + Decisions

## Objective

Audit the domain and decision layer. Identify:

- Domain entities and business rules.
- **Where decisions are taken** (frontend vs backend vs database vs config).
- **Single Source of Truth (SSOT)** candidates for each piece of state.
- Risk of duplicated or inconsistent rules.

This is the layer where "fixing the wrong thing" happens. The output here drives steps 4 (contracts) and 5 (data) — they verify that the contracts and persistence layers respect the SSOT identified here.

## Why subagent (audit-domain-analyzer, second invocation)

Same agent as step 2, fresh context for the domain pass. The agent produces a typed `DecisionSSOTAudit` deliverable.

## Inputs

- `AuditIntake` (from step 1).
- `DependencyImpactAudit` (from step 2) — particularly `high_coupling_nodes` and `cascade_risk_paths`, which often correlate with business-rule leakage.
- `module_boundaries_narrative` (from step 2) — to anchor "where business logic should live" vs "where it actually lives".

## Instructions

### 3.1 Decision narrative

Describe in flowing text "how the project decides what is valid":

- Are validations in the frontend, backend, database (constraints), or config?
- Are decisions duplicated across layers (e.g., min/max value enforced both in form validator AND in API DTO AND in DB constraint)?
- Where is the **authoritative** version? Which layer's decision wins on conflict?

Cite file:line for each claim.

### 3.2 DecisionSSOTAudit (typed JSON)

Produce the structured deliverable:

```yaml
DecisionSSOTAudit:
  domain_model_guess:
    entities:
      - name: <text>
        file: <path>
        relationships: [<text>]
        tag: <[VERIFIED]>
    bounded_contexts: [<list or "none evidenced">]
  business_rules_catalog:
    - rule: <one-sentence statement>
      type: <validation | access_control | calculation | invariant | state_transition>
      location_evidenced:
        - file: <path>
          line: <int>
      duplicated_in: [<file:line list or "none">]
      tag: <[VERIFIED] | [HYPOTHESIS]>
  decision_points:
    - decision: <text>
      where_taken: <frontend | backend | db | config | external>
      file: <path>
      line: <int>
      authoritative: <true | false | unknown>
      tag: <[VERIFIED]>
  ssot_map:
    <state_name>:
      authoritative_source: <file or system>
      duplicates:
        - file: <path>
          line: <int>
          divergent: <true | false>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  inconsistency_risks:
    - concept: <text>
      risk: <text — what breaks if these diverge>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommendations_top5:
    - recommendation: <text>
      justification: <text>
      risk_if_ignored: <text>
      effort_estimate: <S | M | L>
```

### 3.3 Constraints

- **Read-only.** Recommendations are advisory and feed into step 9's risk matrix. Do NOT modify code.
- **Evidence-bound.** Every business rule must have ≥1 file:line. Rules with no evidence are tagged `[HYPOTHESIS]` or "not evidenced".
- **SSOT bias.** When multiple sources disagree, the audit reports the divergence — choosing which side is "right" is a Bug Fix or Feature decision, not an audit one.

## Done criteria

- Decision narrative written.
- `DecisionSSOTAudit` JSON populated with all six top-level fields.
- ≥3 business rules cataloged (or explicit "fewer evidenced" with reason).
- ≥1 SSOT candidate identified per major state concept.
- Top-5 recommendations listed with justification + risk + effort.

## Outputs (handoff to step 4)

```yaml
DecisionSSOTAudit: <full structured JSON above>
decision_narrative: <text>
domain_model_guess: <copied>
business_rules_catalog: <copied>
decision_points: <copied>
ssot_map: <copied>
inconsistency_risks: <copied>
recommendations_top5: <copied>
```

## Next

Proceed to `steps/04-contratos-apis-endpoints-validacoes.md`.
