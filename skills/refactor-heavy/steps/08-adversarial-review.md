---
step_number: 8
step_name: "adversarial-review"
execution_mode: subagent
agent_type: "parallel"
expected_inputs:
  - refactor_diff: from_step_5
  - identical_verdict: from_step_6
  - change_contract: from_step_4
  - adversarial_focus: from_step_7
  - residual_risks: from_step_7
expected_outputs:
  - security_findings: list
  - architecture_findings: list
  - quality_findings: list
  - consolidated_blockers: list
  - gate_decision: "proceed | block-and-fix | block-and-abort"
  - askuserquestion_response: string
expected_next: 9
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 08 — Final Adversarial Review (3 parallel subagents)

## Objective

Subject the cross-module restructure to independent, zero-context scrutiny from three expert angles in parallel, then surface findings to the user as a gate. This is the heavy-tier addition the light variant does NOT have: even with an IDENTICAL characterization verdict, a cross-module move can introduce coupling leaks, layering violations, or quality regressions the snapshot does not catch. The reviewers receive the diff and the step-7 focus list with ZERO authoring context.

## Why subagent (parallel x3)

Three specialized subagents read the diff and surrounding code from independent adversarial perspectives. They run in PARALLEL: a single message containing three Task tool calls, one per agent. Latency = max(individual), not sum.

Parallel spawn pattern (single message, three Task calls):

```
Task → pipeline-orchestrator:executor:type-specific:adversarial-security-scanner
Task → pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic
Task → pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer
```

Each receives the `refactor_diff` + the `adversarial_focus` from step 7 and reports independent findings.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_8]`). The sentinel-hook validates that step 6 returned `identical_verdict: IDENTICAL` and step 7 produced an `adversarial_focus` before this gate runs.

## Inputs

- `refactor_diff` (from step 5)
- `identical_verdict` (from step 6) — must be IDENTICAL
- `change_contract` (from step 4) — the signed scope, so reviewers can verify the diff stayed inside it
- `adversarial_focus`, `residual_risks` (from step 7)

## Instructions

### 8.1 Spawn the three adversaries in parallel (single message)

Each agent has a distinct lens, briefed with the same diff bundle but its focus slice from step 7:

**Security scanner** (`adversarial-security-scanner`):
- Did a move shift an auth/authorization check, or relocate it past a guard?
- Did the restructure change what is logged or exposed in errors (even if output format is "identical")?
- Did extract/inline alter input-validation ordering?

**Architecture critic** (`adversarial-architecture-critic`):
- Coupling introduced or leaked by moves across module boundaries?
- Layering / dependency-direction still respected after the restructure?
- SSOT / ordering / transaction couplings from step 2 preserved?
- New abstraction added without a second use (YAGNI)? Unnecessary layer?

**Quality reviewer** (`adversarial-quality-reviewer`):
- Did readability actually improve, or just move around?
- Dead code left behind by an inline/move?
- Internal test placement still coherent after moves/renames?
- Naming consistent across the new structure?

### 8.2 Consolidate findings

Each agent returns findings classified as:
- **BLOCKER** — must fix before close-out.
- **MAJOR** — should fix; can be conditional.
- **MINOR** — nice-to-have; defer.

Consolidate into a single ranked list (`consolidated_blockers` covers BLOCKER + MAJOR).

### 8.3 AskUserQuestion gate (mandatory — no prose substitute)

Per global rule, invoke AskUserQuestion:

```
header: "Adversarial"
question: "3 revisores adversariais retornaram <N> blockers + <M> major findings sobre o refactor. Como prosseguir?"
multiSelect: false
options:
  - label: "Prosseguir — findings sao MAJOR/MINOR aceitaveis (Recomendado se 0 BLOCKERs)"
    description: "Seguir para step 9 (UX E2E pos-refactor). Major/minor viram follow-ups documentados."
  - label: "Bloquear e corrigir — voltar a step 5"
    description: "Findings sao bloqueadores; voltar a restruturar com diff minimo adicional dentro do contrato, depois re-rodar 6-8."
  - label: "Bloquear e abortar — replanejar"
    description: "Findings revelam que o plano de step 4 esta errado; abortar este skill e replanejar o escopo."
```

The AskUserQuestion tool automatically appends "Other" — do NOT add manually.

### 8.4 Record decision

- `gate_decision`: `proceed` | `block-and-fix` | `block-and-abort`.
- `askuserquestion_response`: user's option label.
- Append to `.pipeline/gate-decisions.jsonl`.

### 8.5 Routing

- `proceed` → step 9.
- `block-and-fix` → re-enter step 5 with the blockers as additional scope (still constrained by the step-4 contract). Then re-run 6 (IDENTICAL must still hold) and 8.
- `block-and-abort` → exit skill; reopen at step 4 with a revised contract.

## Done criteria

- Three adversaries spawned in parallel; all returned.
- Findings consolidated and classified.
- AskUserQuestion invoked (not substituted).
- Decision recorded and audit-logged.

## Outputs (handoff to step 9 OR loop/exit)

```yaml
security_findings:
  - severity: BLOCKER|MAJOR|MINOR
    finding: <text>
    location: <file:line>
architecture_findings:
  - severity: BLOCKER|MAJOR|MINOR
    finding: <text>
quality_findings:
  - severity: BLOCKER|MAJOR|MINOR
    finding: <text>
consolidated_blockers:
  - <blocker or major>
gate_decision: <proceed | block-and-fix | block-and-abort>
askuserquestion_response: <text>
```

## Next

If `proceed` → `steps/09-ux-user-journey-e2e.md`.
If `block-and-fix` → re-enter `steps/05-execute-minimal-diff.md`.
If `block-and-abort` → exit skill.
