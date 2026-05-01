---
step_number: 8
step_name: "adversarial-ux-tech-review"
execution_mode: subagent
agent_type: "parallel"
expected_inputs:
  - fix_diff: from_step_6
  - all_tests_status: from_step_7
  - invariants_preserved: from_step_6
  - persistence_guarantees_applied: from_step_6
  - residual_risks_and_monitoring: from_step_7
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

# Step 08 — Adversarial UX+Tech Review (3 parallel subagents) — GAP CLOSED

## Objective

Try to "break" the fix mentally from three independent expert angles in parallel, then surface the findings to the user as a gate. This is the explicit Heavy 8 gap closure: v4.3.1 had a single-agent adversarial pass; this step parallelizes three specialized adversaries (security, architecture, quality) for breadth + latency.

## Why subagent (parallel x3)

Three specialized subagents read the diff and surrounding code from independent adversarial perspectives. They run in PARALLEL: a single message containing three Task tool calls, one per agent. Latency = max(individual), not sum.

Parallel spawn pattern (single message, three Task calls):

```
Task → pipeline-orchestrator:executor:type-specific:adversarial-security-scanner
Task → pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic
Task → pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer
```

Each receives the fix_diff + context from steps 6–7 and reports back independent findings.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_8]`). The sentinel-hook validates that step 7 outputs are present and `all_tests_status: "PASSING"` before this gate runs.

## Inputs

- `fix_diff` (from step 6)
- `all_tests_status` (from step 7) — must be PASSING
- `invariants_preserved`, `persistence_guarantees_applied` (from step 6)
- `residual_risks_and_monitoring` (from step 7)

## Instructions

### 8.1 Spawn the three adversaries in parallel (single message)

Each agent has a distinct lens. Brief each with the same context bundle but different prompt focus:

**Security scanner** (`adversarial-security-scanner`):
- Authorization / authentication impact?
- Sensitive data exposure (logs, responses, error messages)?
- Input validation gaps?
- Injection / SSRF / path traversal vectors introduced?
- Secrets / credentials handled correctly?

**Architecture critic** (`adversarial-architecture-critic`):
- Implicit assumptions (domain, data, timing, network, UI)?
- Silent failure scenarios?
- Idempotency: what happens if it runs twice?
- Atomicity: what if it fails mid-operation?
- Concurrency: multiple devices/tabs/requests — what happens?
- Source-of-truth violation introduced?
- Layering / dependency inversion respected?

**Quality reviewer** (`adversarial-quality-reviewer`):
- UX failure modes: loading / error / retry / offline / latency states?
- Test coverage gaps (edges, properties, transactional paths)?
- Code quality regressions (readability, naming, dead code)?
- Documentation / comments missing?
- Telemetry sufficient for post-deploy debugging?

### 8.2 Consolidate findings

Each agent returns a list of findings classified as:
- **BLOCKER** — must fix before merge.
- **MAJOR** — should fix; can be conditional.
- **MINOR** — nice-to-have; defer.

Consolidate into a single ranked list (`consolidated_blockers` covers BLOCKER + MAJOR).

### 8.3 AskUserQuestion gate (mandatory — no prose substitute)

Per global rule, invoke AskUserQuestion. Use this shape:

```
header: "Adversarial"
question: "3 revisores adversariais retornaram <N> blockers + <M> major findings. Como prosseguir?"
multiSelect: false
options:
  - label: "Prosseguir — findings sao MAJOR/MINOR aceitaveis (Recomendado se 0 BLOCKERs)"
    description: "Seguir para step 9 (UX E2E pos-fix). Major/minor viram follow-ups documentados."
  - label: "Bloquear e corrigir — voltar a step 6"
    description: "Findings sao bloqueadores; voltar a implementar com diff minimo adicional, depois re-rodar 7-8."
  - label: "Bloquear e abortar — replanejar"
    description: "Findings revelam que a proposta de step 4 esta errada; abortar este skill e replanejar."
```

The AskUserQuestion tool automatically appends "Other" — do NOT add manually.

### 8.4 Record decision

- `gate_decision`: `proceed` | `block-and-fix` | `block-and-abort`.
- `askuserquestion_response`: user's option label.
- Append to `.pipeline/gate-decisions.jsonl`.

### 8.5 Routing

- `proceed` → step 9.
- `block-and-fix` → re-enter step 6 with the blockers as additional scope (still constrained by step 4 proposal). Then re-run 7 and 8.
- `block-and-abort` → exit skill; reopen at step 4 with revised proposal.

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
If `block-and-fix` → re-enter `steps/06-execute-minimal-diff.md`.
If `block-and-abort` → exit skill.
