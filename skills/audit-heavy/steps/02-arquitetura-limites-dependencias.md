---
step_number: 2
step_name: "arquitetura-limites-dependencias"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-domain-analyzer"
production_writes_allowed: false
expected_inputs:
  - AuditIntake: from_step_1
  - repo_map: from_step_1
  - initial_hotspots: from_step_1
expected_outputs:
  - DependencyImpactAudit: object
  - module_boundaries_narrative: string
  - dependency_graph_guess: object
  - high_coupling_nodes: list
  - cascade_risk_paths: list
  - safe_extension_points: list
  - refactor_boundaries: list
expected_next: 3
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 02 — Architecture + Module Boundaries + Dependencies

## Objective

Audit the architecture with focus on **module boundaries** and **dependencies**. Apply four concepts explicitly:

- **Coupling** (tight dependency between modules) — where is the project tightly bound?
- **Cascade effect** (a change in one place causes regressions elsewhere) — which paths are dangerous?
- **Independence** (extensible without touching the core) — where can features be safely added?
- **Atomicity** (changes are small and reversible) — where is the project structurally hostile to atomic changes?

This step is read-only. Do NOT propose refactors yet — recommendations go to step 9 (Pa de Cal).

## Why subagent (audit-domain-analyzer)

This step runs in the `audit-domain-analyzer` subagent (read-only, opus model, IRON LAW enforced). The agent maps layers, traces dependencies via imports/refs, and identifies coupling hotspots. It produces a typed `DependencyImpactAudit` deliverable.

## Inputs

- `AuditIntake` (from step 1) — full intake report; the agent uses `repo_map` and `initial_hotspots` as starting anchors.
- `repo_map` (from step 1) — directory tree with roles.
- `initial_hotspots` (from step 1) — files flagged as central or sensitive at intake.

## Instructions

### 2.1 Module-boundaries narrative

Describe in flowing text:

- What is **UI / Presentation** in this repo? (which folders, which files)
- What is **Domain / Business Logic**? (where business rules live)
- What is **Infrastructure**? (data access, external integrations, config, env)
- What is **Data**? (schema, migrations, ORM models, queries)
- Where is there **leakage** of responsibility (e.g., DB queries in UI components, business rules in routes, infra concerns in domain)?

Cite file:line for each claim. If a layer is not evidenced, declare "not evidenced" — do not fabricate.

### 2.2 DependencyImpactAudit (typed JSON)

Produce the structured deliverable:

```yaml
DependencyImpactAudit:
  dependency_graph_guess:
    - from: <module/path>
      to: <module/path>
      via: <import statement evidence>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  high_coupling_nodes:
    - file: <path>
      imported_by_count: <int>
      imports_count: <int>
      reason: <why central>
      tag: <[VERIFIED]>
  cascade_risk_paths:
    - path: "<A> → <B> → <C>"
      risk: "<change in A breaks C because ...>"
      evidence: <file:line>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS]>
  safe_extension_points:
    - location: <path>
      reason: <why safe — plugin arch, isolated module, well-defined seam>
      tag: <[VERIFIED]>
  refactor_boundaries:
    - location: <path>
      reason: <why "do not refactor first" — too central, no test coverage, audit timeline>
      tag: <[VERIFIED] | [DESIGN]>
```

### 2.3 Constraints

- **Read-only.** Never propose code changes; this step records architecture facts and risks.
- **Evidence-bound.** Every claim cites file:line OR tags `[HYPOTHESIS]` / "not evidenced".
- **Scope-bound.** Only analyze what is within the audit spec from step 1. Out-of-scope axes are explicitly declared "not in audit scope".

## Done criteria

- Module-boundaries narrative written, citing file:line for each layer claim.
- `DependencyImpactAudit` JSON populated with all five fields.
- ≥1 cascade risk path documented (or explicit "no cascade risks evidenced" with reason).
- ≥1 safe extension point documented (or explicit "no safe extension points evidenced").
- All findings tagged `[VERIFIED]` / `[HYPOTHESIS]` / `[DESIGN]`.

## Outputs (handoff to step 3)

```yaml
DependencyImpactAudit: <full structured JSON above>
module_boundaries_narrative: <text>
dependency_graph_guess: <copied for convenience>
high_coupling_nodes: <copied>
cascade_risk_paths: <copied>
safe_extension_points: <copied>
refactor_boundaries: <copied>
```

## Next

Proceed to `steps/03-dominio-regras-ssot-decisoes.md`.
