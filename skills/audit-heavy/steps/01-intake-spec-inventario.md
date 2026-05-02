---
step_number: 1
step_name: "intake-spec-inventario"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:audit-intake"
production_writes_allowed: false
expected_inputs:
  - audit_request: from_user
  - scope_definition: from_user
expected_outputs:
  - audit_spec: object
  - AuditIntake: object
  - stack_detected: list
  - repo_map: object
  - entry_points: list
  - data_flow_guess: list
  - scripts_and_environments: object
  - initial_hotspots: list
  - askuserquestion_response: string
  - gate_decision: "approved | revise | abort"
expected_next: 2
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, Bash, AskUserQuestion]
---

# Step 01 — Intake + Spec + Inventory — REQUIRES SCOPE APPROVAL

## Objective

Open the audit by producing (a) a written **audit spec** that defines objective, scope, and what "healthy project" means in this context, and (b) a structured `AuditIntake` JSON containing stack detection, repo map, entry points, data-flow guess, scripts/environments, and initial hotspots. **Every claim must cite repository evidence (file:line)**; if it cannot be proven, declare "not evidenced" — never invent.

This is the **first user-facing gate** of the heavy workflow (`gate_required: true`). REQUIRES SCOPE APPROVAL via AskUserQuestion before any deeper analysis runs.

## Why subagent (audit-intake)

This step runs in the `audit-intake` subagent (read-only by IRON LAW). The subagent does broad reading/grepping across the codebase and reports back a compact `AuditIntake` deliverable plus the audit spec narrative.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_1, pre_5, pre_9]`). The `sentinel-hook` validates that the user's `audit_request` and `scope_definition` are non-empty before this gate runs.

## Inputs

- `audit_request` (from user) — what to audit and why.
- `scope_definition` (from user) — boundaries: frontend, backend, data, infra, contracts, tests, governance. Free text is acceptable; the agent normalizes.

## Instructions

### 1.1 Audit spec (narrative)

Produce a flowing-text audit spec covering:

- **Objective**: what question the audit must answer.
- **Scope**: which axes are in (architecture / domain / contracts / data / frontend / backend / governance / security / observability) and which are explicitly out.
- **Definition of "healthy project"** in this context: what good looks like for this stack and this team.
- **Evidence rule**: every claim cites a file path; absence of evidence is recorded as "not evidenced".

### 1.2 AuditIntake (typed JSON)

Produce the structured JSON deliverable. Read README, package.json/lockfile (or equivalents — requirements.txt, Pipfile, pyproject.toml, Cargo.toml, go.mod, composer.json, Gemfile), and main configs (tsconfig, vite/next, docker-compose, CI configs).

```yaml
AuditIntake:
  stack_detected:
    languages: [<list>]
    frameworks: [<list>]
    databases: [<list>]
    infra: [<list>]
    evidence:
      - claim: <text>
        file: <path>
        line: <int or null>
  repo_map:
    - directory: <path>
      role: <text>
      subdirectories: [<recursive>]
  entry_points:
    - type: <application | api | event | cli | job>
      file: <path>
      description: <text>
  data_flow_guess:
    - <step from input to persistence to user-visible output>
  scripts_and_environments:
    scripts: {<name>: <command>}
    environments_evidenced: [<dev | stage | prod>]
  initial_hotspots:
    - file: <path>
      reason: <why sensitive>
      severity: <low | medium | high>
      tag: <[VERIFIED] | [HYPOTHESIS] | [DESIGN]>
```

### 1.3 Evidence classification framework

Establish the tagging vocabulary used across all subsequent steps:

- `[VERIFIED]` — evidence exists in the repo (file:line cited).
- `[HYPOTHESIS]` — plausible risk, not confirmed (mark "not evidenced").
- `[DESIGN]` — may be intentional (validate with stakeholder before recommending).

Every finding from steps 2–8 will carry one of these tags.

### 1.4 AskUserQuestion gate (mandatory — no prose substitute)

REQUIRES SCOPE APPROVAL. Per global rule "Decisoes do Usuario — AskUserQuestion sempre", invoke AskUserQuestion with the agent's recommendation as option 1. Use this exact shape:

```
header: "Escopo"
question: "Aprovar a spec de auditoria + AuditIntake e prosseguir para Architecture (step 2)?"
multiSelect: false
options:
  - label: "Aprovar e seguir (Recomendado)"
    description: "Spec cobre os eixos solicitados; AuditIntake mapeia stack, entry points e hotspots iniciais com evidencia file:line."
  - label: "Revisar — me diga o que ajustar"
    description: "Quero estreitar/ampliar escopo, trocar eixos, ou refinar a definicao de saudavel antes de seguir."
  - label: "Abortar — replanejar fora deste skill"
    description: "Auditoria precisa de pre-trabalho (e.g. coletar baseline historico, alinhar com stakeholder); voltar quando contexto estiver pronto."
```

The AskUserQuestion tool automatically appends an "Other" option for free text — do NOT add it manually.

### 1.5 Record the decision

- `gate_decision`: `approved` | `revise` | `abort`.
- `askuserquestion_response`: user's option label (verbatim).
- Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7 (audit log).

### 1.6 Routing

- `approved` → proceed to step 2 (architecture).
- `revise` → loop back: collect user's revision notes, regenerate the spec/AuditIntake, re-invoke AskUserQuestion. Two consecutive `revise`-without-progress trip the STOP RULE.
- `abort` → exit skill; hand control back. The orchestrator (or the user) decides when to re-enter.

## Done criteria

- Audit spec narrative written.
- `AuditIntake` JSON populated with all six top-level fields.
- Evidence classification framework declared.
- Every claim cites file:line OR is tagged `[HYPOTHESIS]` / "not evidenced".
- AskUserQuestion invoked (not substituted with prose). Decision recorded and audit-logged.

## Outputs (handoff to step 2)

```yaml
audit_spec: <narrative>
AuditIntake: <full structured JSON above>
stack_detected: <copied from AuditIntake.stack_detected for downstream convenience>
repo_map: <copied>
entry_points: <copied>
data_flow_guess: <copied>
scripts_and_environments: <copied>
initial_hotspots: <copied>
gate_decision: <approved | revise | abort>
askuserquestion_response: <user's chosen option label>
```

## Next

If `approved` → `steps/02-arquitetura-limites-dependencias.md`.
If `revise` → reattempt this step.
If `abort` → exit skill.
