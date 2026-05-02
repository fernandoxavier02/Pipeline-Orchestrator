---
step_number: 3
step_name: "dominio-regras-ssot"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
agent_invocation_mode: "light_mode"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - ArchitectureAudit: from_step_2
expected_outputs:
  - domain_narrative: string
  - DomainSSOTAudit: object
  - domain_entities_guess: list
  - business_rules_locations: list
  - ssot_candidates: list
  - duplication_risks: list
  - quick_wins: list
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 03 — Domain + Business Rules + SSOT (Light)

## Objective

Quickly evaluate how the project handles domain and business rules. Define inline:

- **Domain** = "the real-world rules the system represents".
- **SSOT (single source of truth)** = "where the final decision is taken — DB, backend, config, etc."

Identify whether business rules live in the frontend, backend, or both, and whether there is risk of duplication / inconsistency. Identify SSOT candidates.

## Why subagent (audit-compliance-checker, light_mode continuation)

Same agent as step 2, fresh context for the domain pass. `light_mode: true` continues — findings related to layered domain modeling are tagged `[HYPOTHESIS]` if not directly evidenced.

## Inputs

- `AuditSnapshot` (from step 1)
- `ArchitectureAudit` (from step 2) — to anchor "where business logic should live" vs "where it actually lives".

## Instructions

### 3.1 Domain narrative (plain language)

Where do business rules appear to live (frontend? backend? both? duplicated?). Identify SSOT candidates per state concept. Cite file:line.

### 3.2 DomainSSOTAudit (typed JSON)

```yaml
DomainSSOTAudit:
  domain_entities_guess:
    - entity: <text>
      file: <path>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  business_rules_locations:
    - rule_summary: <text>
      file: <path>
      line: <int>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  ssot_candidates:
    - state_concept: <text>
      authoritative_source: <path or system>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  duplication_risks:
    - concept: <text>
      duplicated_in: [<file:line>]
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  quick_wins:
    - action: <text — small consolidation>
      effort: <S>
```

### 3.3 Constraints

- If rules cannot be located, say "not evidenced" rather than guessing.
- Light_mode tag on architecture-dependent findings (see step 2).

## Done criteria

- Domain narrative written.
- `DomainSSOTAudit` populated with all five fields.
- ≥1 SSOT candidate or explicit "no SSOT evidenced".
- Quick wins listed (or empty list with note).

## Outputs (handoff to step 4)

```yaml
DomainSSOTAudit: <JSON above>
domain_narrative: <text>
domain_entities_guess: <copied>
business_rules_locations: <copied>
ssot_candidates: <copied>
duplication_risks: <copied>
quick_wins: <copied>
```

## Next

Proceed to `steps/04-apis-endpoints-contratos.md`.
