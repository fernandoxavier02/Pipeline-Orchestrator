---
step_number: 1
step_name: "leitura-inicial-mapa-projeto"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-intake"
production_writes_allowed: false
expected_inputs:
  - audit_request: from_user
  - scope_definition: from_user
expected_outputs:
  - audit_snapshot_narrative: string
  - AuditSnapshot: object
  - stack_guess: object
  - project_map: object
  - entry_points: list
  - scripts: object
  - risk_hotspots_guess: list
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 2
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, Bash, AskUserQuestion]
---

# Step 01 — Initial Read + Project Map (Light) — REQUIRES SCOPE APPROVAL

## Objective

Open the audit by producing (a) a flowing-text report explaining what kind of system this is and how it is organized (frontend / backend / data / infra), in plain language with technical terms defined inline, and (b) a structured `AuditSnapshot` JSON with stack guess, project map, entry points, scripts, and probable risk hotspots.

**Evidence rule (same as Heavy):** every claim cites file paths; if it cannot be proven, declare "not evidenced".

This is the **first user-facing gate** (`gate_required: true`). REQUIRES SCOPE APPROVAL via AskUserQuestion before deeper steps run.

## Why subagent (audit-intake)

Same agent as audit-heavy step 1, but with a Light-flavored output (`AuditSnapshot` is the trimmed sibling of `AuditIntake`).

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_1, pre_9]`). Validates that `audit_request` and `scope_definition` are non-empty.

## Inputs

- `audit_request` (from user)
- `scope_definition` (from user) — Light expects ≤1 area + 1 depth level. If the scope is broader, the agent should flag it as an escalation candidate at step 9.

## Instructions

### 1.1 Snapshot narrative

Plain-language report:

- What kind of system is this? (web app, mobile, API, library, monorepo, …)
- How is it organized? (frontend / backend / data / infra — which folders cover which)
- Define each technical term in the same sentence it first appears.

Cite file:line for every claim.

### 1.2 AuditSnapshot (typed JSON)

```yaml
AuditSnapshot:
  stack_guess:
    frameworks: [<list>]
    runtime: <text>
    build: <text>
    evidence: [<file:line>]
  project_map:
    frontend_path: <path or null>
    backend_path: <path or null>
    data_path: <path or null>
    infra_path: <path or null>
  entry_points: [<list of paths>]
  scripts:
    lint: <command or null>
    test: <command or null>
    build: <command or null>
    dev: <command or null>
  risk_hotspots_guess:
    - location: <path>
      reason: <text>
      tag: <[HYPOTHESIS] | [VERIFIED]>
```

Start by reading README (if it exists), `package.json` (or equivalent: `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …), and the main directory tree.

### 1.3 AskUserQuestion gate (mandatory)

```
header: "Escopo"
question: "Aprovar AuditSnapshot e prosseguir para Architecture (step 2)?"
multiSelect: false
options:
  - label: "Aprovar e seguir (Recomendado)"
    description: "Snapshot mapeia stack, project_map e hotspots iniciais com evidencia."
  - label: "Revisar — me diga o que ajustar"
    description: "Quero estreitar/ampliar escopo, trocar areas antes de seguir."
  - label: "Abortar — escopo nao cabe em audit-light"
    description: "Cobertura precisa de audit-heavy (regulatorio, multi-axis); abortar e re-invocar."
```

(AskUserQuestion automatically appends "Other".)

### 1.4 Record the decision

- `gate_decision`: `approved | revise | abort`
- `askuserquestion_response`: user's option (verbatim)
- Append to `.pipeline/gate-decisions.jsonl`

### 1.5 Routing

- `approved` → step 2.
- `revise` → re-run this step.
- `abort` → exit skill.

## Done criteria

- Snapshot narrative written in plain language.
- `AuditSnapshot` populated with all five fields.
- AskUserQuestion invoked.
- Decision audit-logged.

## Outputs (handoff to step 2)

```yaml
AuditSnapshot: <full JSON above>
audit_snapshot_narrative: <text>
stack_guess: <copied>
project_map: <copied>
entry_points: <copied>
scripts: <copied>
risk_hotspots_guess: <copied>
gate_decision: <approved | revise | abort>
askuserquestion_response: <text>
```

## Next

If `approved` → `steps/02-arquitetura-organizacao-responsabilidades.md`.
