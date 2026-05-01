---
step_number: 4
step_name: "controlled-change-proposal"
execution_mode: inline
expected_inputs:
  - primary_root_cause: from_step_2
  - business_rules: from_step_3
  - source_of_truth_per_state: from_step_3
  - invariants: from_step_3
  - ambiguities_and_risks: from_step_3
expected_outputs:
  - minimal_change_proposal: object
  - affected_files_and_scope: list
  - guarantees: object
  - rollback_plan: string
  - residual_risks: list
  - gate_decision: "approved | revise | abort"
  - askuserquestion_response: string
expected_next: 5
gate_required: true
allowed_tools: [AskUserQuestion, Read, Grep]
---

# Step 04 — Controlled Change Proposal — REQUIRES APPROVAL

## Objective

Define the **smallest change** that resolves the bug, with closed scope, explicit impacts, and explicit guarantees (source of truth respected, invariants preserved, persistence/idempotency/atomicity addressed). This is the **first user-facing gate** of the heavy workflow (`gate_required: true`). REQUIRES APPROVAL via AskUserQuestion before any test or code is written.

## Why inline (not subagent)

This step synthesizes everything from steps 1–3 and converts it into a proposal the user must approve. It runs inline so the proposal is visible in the main thread for the gate.

## Sentinel checkpoint

Declared in SKILL.md (`sentinel_checkpoints: [pre_4]`). The sentinel-hook validates that outputs from steps 1–3 are present and structured before this gate runs.

## Inputs

- `primary_root_cause` (from step 2)
- `business_rules`, `source_of_truth_per_state`, `invariants`, `ambiguities_and_risks` (from step 3)

## Instructions

### 4.1 Minimal change proposal

Propose the smallest change that resolves the bug. Be explicit about:

- Files / functions / components affected.
- Behaviors that will change.
- Behaviors that must remain identical (regression contract).

### 4.2 Constraints (what MUST NOT change)

State explicitly what cannot be altered: architecture, public contracts, code style, existing UI patterns, etc.

### 4.3 Guarantees (when applicable)

For each applicable concept, declare how the proposal preserves it:

- **Source of truth**: which source is authoritative; how reads/writes will respect it.
- **Persistence**: when state is written, in what order, with which constraints.
- **Idempotency**: dedup keys, upserts, locks, "already-processed" markers — how repeated execution stays safe.
- **Atomicity**: transactions, sagas, or compensating actions — how partial failures stay consistent.
- **Invariants**: list each invariant from step 3 and confirm the proposal preserves it (the test pre-impl in step 5 will encode this as assertions).

### 4.4 Rollback plan

Describe how to revert the change cleanly — which commits to revert, which feature flag to flip, which DB migration to roll back, what to monitor for 24–72h post-rollback.

### 4.5 Residual risks

List risks the proposal does NOT eliminate (and that step 8 adversarial review should examine).

### 4.6 AskUserQuestion gate (mandatory — no prose substitute)

REQUIRES APPROVAL. Per global rule "Decisoes do Usuario — AskUserQuestion sempre", invoke AskUserQuestion with the agent's recommendation as option 1. Use this exact shape:

```
header: "Proposta"
question: "Aprovar a proposta de mudança controlada e prosseguir para os testes pre-implementacao (step 5)?"
multiSelect: false
options:
  - label: "Aprovar e seguir (Recomendado)"
    description: "Proposta minimal, escopo fechado, invariantes preservadas; testes pre-impl (step 5) encodificam as garantias."
  - label: "Revisar — me diga o que ajustar"
    description: "Proposta tem escopo/garantias que voce quer alterar antes de virar testes."
  - label: "Abortar — escalar/replanejar"
    description: "Hipotese principal pode estar errada ou escopo da mudanca eh maior do que cabe num bugfix; voltar a etapa 2 ou abrir um plano de feature."
```

The AskUserQuestion tool automatically appends an "Other" option for free text — do NOT add it manually.

If `ambiguities_and_risks` from step 3 is non-empty, surface them in the question body so the user can resolve them as part of the answer.

### 4.7 Record the decision

- `gate_decision`: `approved` | `revise` | `abort`.
- `askuserquestion_response`: user's option label (verbatim).
- Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7 (audit log).

### 4.8 Routing

- `approved` → proceed to step 5 (test pre-impl).
- `revise` → loop back: collect user's revision notes, regenerate the proposal, re-invoke AskUserQuestion. Two consecutive `revise`-without-progress trip the STOP RULE.
- `abort` → exit skill; hand control back. The orchestrator decides whether to re-enter at step 2 (root cause may be wrong) or to escalate to a feature plan.

## Done criteria

- Minimal change proposal stated; affected files listed; guarantees declared per applicable concept.
- Rollback plan and residual risks listed.
- AskUserQuestion invoked (not substituted with prose). REQUIRES APPROVAL was honored.
- Decision recorded and appended to audit log.

## Outputs (handoff to step 5 OR exit)

```yaml
minimal_change_proposal:
  description: <text>
  rationale: <text>
affected_files_and_scope:
  - file: <path>
    behavior_changes: [<list>]
    behavior_preserved: [<list>]
guarantees:
  source_of_truth: <text or "n/a">
  persistence: <text or "n/a">
  idempotency: <text or "n/a">
  atomicity: <text or "n/a">
  invariants_preserved: [<list>]
rollback_plan: <text>
residual_risks: [<list>]
gate_decision: <approved | revise | abort>
askuserquestion_response: <text>
```

## Next

If `approved` → `steps/05-test-pre-impl.md`.
If `revise` → reattempt this step.
If `abort` → exit skill.
