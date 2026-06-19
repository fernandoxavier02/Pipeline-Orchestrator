---
step_number: 4
step_name: "refactor-plan-scope-lock"
execution_mode: inline
expected_inputs:
  - public_surface: from_step_1
  - restructure_goal: from_step_1
  - modules_in_scope: from_step_1
  - before_snapshot: from_step_3
  - characterization_status: from_step_3
expected_outputs:
  - change_contract: object
  - scope_lock_decision: "LOCKED | ABORT"
  - refactor_steps: list
  - askuserquestion_response: string
expected_next: 5
gate_required: true
allowed_tools: [AskUserQuestion, Read, Grep]
---

# Step 04 — Refactor Plan + REFACTOR_SCOPE_LOCK (signature gate, before first file touch)

## Objective

Produce the cross-module refactor plan and lock its scope with a signed CHANGE_CONTRACT **before any file is touched**. This is the signature gate of the Refactor workflow: `REFACTOR_SCOPE_LOCK` (HARD). It validates that the CHANGE_CONTRACT plan-block exists and is signed, and ABORTS the run if a forbidden change (new public API surface, changed error codes, changed output format, changed side-effects) is proposed. This is a **mandatory user-facing gate** (`gate_required: true`).

## Why this gate exists

A refactor's whole premise is "behavior does not change". For a cross-module restructure the scope-lock is doubly important: it bounds which modules and files may be touched and forbids any public-surface change, giving the step-6 IDENTICAL check, the step-8 adversarial reviewers, and the diff-discipline reviewer one explicit contract to enforce. The gate name is deliberately distinct from the CHANGE_CONTRACT plan-block it consumes, so the audit trail never confuses a gate decision with the plan artifact.

## Sentinel checkpoint

This step has a sentinel checkpoint declared in SKILL.md (`sentinel_checkpoints: [pre_4]`). The sentinel-hook validates state coherence before the gate runs (the before_snapshot from step 3 is present and `characterization_status: CHARACTERIZATION_CONFIRMED`). The first file touch is authorized only after this gate returns `LOCKED`.

## Inputs

- `public_surface`, `restructure_goal`, `modules_in_scope` (from step 1)
- `before_snapshot`, `characterization_status` (from step 3) — must be `CHARACTERIZATION_CONFIRMED` to enter this step

## Instructions

### 4.1 Assemble the CHANGE_CONTRACT plan-block

Reuse the existing `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` plan-block shape (see `references/implementation-discipline.md`). For a refactor it carries two behavior columns plus a signed-off flag:

- **Allowed changes:** rename, extract, inline, move, restructure internal data — anything that does not alter the public surface from step 1, across the in-scope modules.
- **Forbidden changes:** new public API surface, changed error codes, changed output format, changed side-effects.
- **allowed_files / allowed_new_files / forbidden_files:** the exact cross-module file scope.
- **signed_off:** the flag REFACTOR_SCOPE_LOCK checks.

### 4.2 Draft the refactor steps

List the concrete restructure steps (each a behavior-preserving transformation), ordered to keep the codebase building between steps where possible. Map each step to allowed-change categories and to the module it touches.

### 4.3 Forbidden-change check (ABORT condition)

If any drafted step would introduce a forbidden change (new public API, changed error code, changed output format, changed side-effect), the gate ABORTS — this is not a refactor and must be re-scoped or routed to Feature / Bug Fix. Do NOT proceed to step 5 on ABORT.

### 4.4 AskUserQuestion gate (mandatory — no prose substitute)

Per global rule, invoke AskUserQuestion to sign off the contract. The first option is the agent's recommendation labeled `(Recomendado)`:

```
header: "ScopeLock"
question: "Assinar o contrato de mudança e travar o escopo do refactor cross-module?"
multiSelect: false
options:
  - label: "Assinar e travar — LOCKED (Recomendado)"
    description: "Contrato fechado: <N> arquivos em <M> módulos permitidos, zero mudança de superfície pública. Libera o primeiro toque em arquivo."
  - label: "Revisar o contrato antes de travar"
    description: "Quero ajustar quais módulos/arquivos podem mexer antes de liberar a execução."
  - label: "Abortar — não é refactor"
    description: "O plano mexe na superfície pública (API/erro/saída/efeito); rotear para Feature ou Bug Fix."
```

The AskUserQuestion tool automatically appends an "Other" option for free text — do NOT add it manually.

### 4.5 Record the decision + fire REFACTOR_SCOPE_LOCK

- If the user signs: set `scope_lock_decision: LOCKED`, mark `change_contract.signed_off: true`.
- If the user aborts (or a forbidden change was detected in 4.3): set `scope_lock_decision: ABORT`.
- Append the REFACTOR_SCOPE_LOCK decision to `.pipeline/gate-decisions.jsonl` per enforcement rule 7, recording allowed/forbidden columns, file/module scope, and the signed flag.

## Done criteria

- CHANGE_CONTRACT plan-block assembled with allowed/forbidden columns + cross-module file scope + signed_off flag.
- Forbidden-change check performed (ABORT if any forbidden change proposed).
- AskUserQuestion invoked (not substituted with prose).
- REFACTOR_SCOPE_LOCK decision recorded and appended to the audit log.

## Outputs (handoff to step 5 OR abort)

```yaml
change_contract:
  allowed_changes: [rename, extract, inline, move, restructure-internal-data]
  forbidden_changes: [new-public-api, changed-error-codes, changed-output-format, changed-side-effects]
  allowed_files: [<file>, ...]
  modules_in_scope: [<module>, ...]
  signed_off: true
scope_lock_decision: <LOCKED | ABORT>
refactor_steps:
  - <behavior-preserving step (module)>
askuserquestion_response: <user's chosen option label>
```

## Next

If `LOCKED` → `steps/05-execute-minimal-diff.md` (first file touch is now authorized).
If `ABORT` → exit skill; re-scope the work or route to Feature / Bug Fix.
