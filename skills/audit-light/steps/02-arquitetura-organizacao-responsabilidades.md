---
step_number: 2
step_name: "arquitetura-organizacao-responsabilidades"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-compliance-checker"
agent_invocation_mode: "light_mode"
production_writes_allowed: false
expected_inputs:
  - AuditSnapshot: from_step_1
  - project_map: from_step_1
  - risk_hotspots_guess: from_step_1
expected_outputs:
  - architecture_narrative: string
  - ArchitectureAudit: object
  - module_boundaries: list
  - coupling_hotspots: list
  - cascade_risk_areas: list
  - recommendations_top3: list
expected_next: 3
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 02 — Architecture + Organization + Responsibilities (Light)

## Objective

Lightweight architecture review focused on **whether folder/module organization follows a healthy criterion**. Apply the same four concepts as Heavy step 2 (coupling, cascade effect, atomicity, independence), but in **plain language** with shorter coverage. Do not propose code changes — recommendations feed step 9.

## Why subagent (audit-compliance-checker, light_mode)

In the Light tier, `audit-domain-analyzer` is SKIPPED (per `references/pipelines/audit-light.md`). Its work folds into `audit-compliance-checker`'s `light_mode` fallback (per the agent's frontmatter §"Light Mode Fallback"): the agent does inline domain discovery from `AuditSnapshot` directly and tags architecture-dependent findings as `[HYPOTHESIS]` to flag the absence of deeper verification.

## Inputs

- `AuditSnapshot` (from step 1)
- `project_map` (from step 1)
- `risk_hotspots_guess` (from step 1)

## Instructions

### 2.1 Architecture narrative (plain language)

Define each concept inline as it appears:

- **Coupling** = "tight dependency between modules — change here, break there".
- **Cascade effect** = "a change in one place that breaks others".
- **Atomicity** = "small, reversible changes".
- **Independence** = "extension without touching the core".

Then describe responsibility separation:

- UI / components — where?
- Routes / screens — where?
- Service / API client — where?
- Business rules — where?
- Data layer — where?
- Infra — where?

Cite file:line for each claim. If something is not evidenced, say so.

### 2.2 ArchitectureAudit (typed JSON)

```yaml
ArchitectureAudit:
  module_boundaries:
    - layer: <UI | routes | services | domain | data | infra>
      location: <path>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  coupling_hotspots:
    - file: <path>
      reason: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  cascade_risk_areas:
    - area: <path>
      reason: <text>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  recommendations_top3:
    - recommendation: <text>
      impact: <high | medium | low>
      effort: <S | M | L>
```

### 2.3 Light_mode marking

Annotate the JSON with `light_mode: true` and `domain_analysis_source: "inline (audit-domain-analyzer skipped)"` per the agent contract. All cascade / boundary findings start as `[HYPOTHESIS]` unless evidence is hard (explicit import graph, declared layers, framework convention).

### 2.4 Constraints

- Read-only.
- Evidence-bound.
- Scope-bound to the area declared at step 1. Out-of-scope axes get explicit "not in audit-light scope".

## Done criteria

- Architecture narrative written in plain language.
- `ArchitectureAudit` populated with all four fields.
- Top-3 recommendations listed with impact + effort.
- All entries tagged with evidence status.

## Outputs (handoff to step 3)

```yaml
ArchitectureAudit: <JSON above>
architecture_narrative: <text>
module_boundaries: <copied>
coupling_hotspots: <copied>
cascade_risk_areas: <copied>
recommendations_top3: <copied>
```

## Next

Proceed to `steps/03-dominio-regras-ssot.md`.
