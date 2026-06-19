---
step_number: 8
step_name: "pa-de-cal"
execution_mode: inline
expected_inputs:
  - refactor_diff: from_step_5
  - identical_verdict: from_step_6
  - change_contract: from_step_4
  - gate_decision: from_step_7
expected_outputs:
  - go_no_go: "GO | NO-GO | CONDITIONAL"
  - reasons: list
  - residual_risks: list
  - suggestions: list
  - askuserquestion_response: string
expected_next: null
gate_required: true
allowed_tools: [AskUserQuestion, Read, Grep, Bash]
---

# Step 08 — Pá de Cal (Final GO/NO-GO Gate)

## Objective

Final, evidence-based GO / NO-GO decision on the refactor. You are the reviewer of last resort, **not** an implementer. Do not re-implement anything. Verify behavior preservation and decide. This is a **mandatory user-facing gate** (`gate_required: true`).

## Inputs

- `refactor_diff` (from step 5)
- `identical_verdict` (from step 6) — must be `IDENTICAL` to reach a GO
- `change_contract` (from step 4) — the signed scope contract
- `gate_decision` (from step 7) — must be `stay-light` to reach this step

## Instructions

### 8.1 Quick verification (PASS / FAIL / INCONCLUSIVE per item, with evidence)

Walk this checklist. For each item, state PASS / FAIL / INCONCLUSIVE and the evidence.

1. **Behavior preserved** — the step-6 `identical_verdict` is `IDENTICAL`. Evidence: the before/after characterization snapshots match over the public surface.
2. **Scope respected** — every touched file is within `change_contract.allowed_files`; no forbidden change (no new public API, no changed error codes/output/side-effects) is present in the diff.
3. **Minimal diff** — no unrelated reformatting, reordering, or "drive-by" changes outside the restructure goal.
4. **Build + tests sanity (minimum)** — build passes; the characterization suite and any adjacent tests pass.
5. **Readability actually improved** — the restructure achieved the step-1 goal (the code is genuinely cleaner, not just moved around).

### 8.2 AskUserQuestion (mandatory — no prose substitute)

Invoke AskUserQuestion. This is a binary CONFIRMATION gate (global rule 2), so neither option needs `(Recomendado)` — but if verification surfaced a clear winner, the agent MAY mark it:

```
header: "GO/NO-GO"
question: "Aprovar este refactor para integração?"
multiSelect: false
options:
  - label: "GO — aprovar e integrar"
    description: <1 line: "IDENTICAL confirmado; escopo respeitado; build/testes verdes">
  - label: "NO-GO — bloquear e voltar"
    description: <1 line: "Falha em N: <especificar>; precisa de Z antes de seguir">
  - label: "CONDITIONAL — aprovar com follow-up"
    description: <1 line: "GO mas requer follow-up em N dias para tratar X">
```

(The tool automatically adds "Other" for free text.)

### 8.3 Record final decision

- `go_no_go`: GO | NO-GO | CONDITIONAL.
- `reasons`: list, objective and short.
- If NO-GO: state precisely what is missing to flip to GO (typically: a DIVERGED check to resolve, or a scope violation to revert).
- If GO or CONDITIONAL: list any residual risks and any collateral-improvement SUGGESTIONS you deferred during step 5 (so they are captured, not silently applied).
- Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7.

## Done criteria

- 5-item checklist completed with PASS/FAIL/INCONCLUSIVE + evidence per item.
- AskUserQuestion invoked (not substituted).
- Final decision recorded with reasons + residual risks + deferred suggestions.

## Outputs (terminal step — handoff back to caller)

```yaml
go_no_go: <GO | NO-GO | CONDITIONAL>
reasons:
  - <reason 1>
residual_risks:
  - <risk 1 or none>
suggestions:
  - <deferred collateral improvement or none>
askuserquestion_response: <user's chosen option label>
```

## Skill exit

This is the terminal step (`expected_next: null`). On `GO` or `CONDITIONAL`, the skill returns control to the caller (pipeline-controller or direct invoker) for closeout (commit, push, PR). On `NO-GO`, the caller addresses the blockers and re-enters the workflow at the appropriate step (typically step 5 to fix a DIVERGED or out-of-scope diff).
