---
step_number: 8
step_name: "pa-de-cal"
execution_mode: inline
expected_inputs:
  - fix_diff: from_step_4
  - all_tests_status: from_step_5
  - regression_test_path: from_step_5
  - persistence_stable: from_step_6
  - gate_decision: from_step_7
expected_outputs:
  - go_no_go: "GO | NO-GO | CONDITIONAL"
  - reasons: list
  - residual_risks: list
  - observability_hooks: list
  - askuserquestion_response: string
expected_next: null
gate_required: true
allowed_tools: [AskUserQuestion, Read, Grep, Bash]
---

# Step 08 — Pá de Cal (Final GO/NO-GO Gate)

## Objective

Final, evidence-based GO / NO-GO decision on the fix. You are the reviewer of last resort, **not** an implementer. Do not re-implement anything. Verify and decide. This is a **mandatory user-facing gate** (`gate_required: true`).

## Inputs

- `fix_diff` (from step 4)
- `all_tests_status` (from step 5)
- `regression_test_path` (from step 5)
- `persistence_stable` (from step 6)
- `gate_decision` (from step 7) — must be `stay-light` to reach this step

## Instructions

### 8.1 Quick verification (PASS / FAIL / INCONCLUSIVE per item, with evidence)

Walk this checklist. For each item, state PASS / FAIL / INCONCLUSIVE and the evidence (test name, log snippet, file:line).

1. **Main flow works end-to-end** (as the user sees it).
   - Evidence: the regression test from step 5, plus a quick manual smoke if applicable.
2. **Basic UX is okay** (loading / success / error states make sense; no "no response" dead ends, when applicable).
3. **Minimal collateral impact** — verify 1-2 adjacent flows close to what was modified are still healthy.
4. **Conceptual checks** (decide YES / NO / N/A explicitly for each):
   - Are business rules involved? If yes — were they respected?
   - Is there a source of truth involved? If yes — does the UI read from the same source the backend writes?
   - Is there persistence? If yes — `persistence_stable` from step 6 should be `true`.
   - Can it run twice (double-click / retry / scheduled job)? If yes — is there idempotency / duplication protection?
   - Are there multi-step flows? If yes — atomicity / no orphan intermediate state?
5. **Build and tests sanity (minimum)** — build passes; lint / relevant tests pass.

### 8.2 AskUserQuestion (mandatory — no prose substitute)

Invoke AskUserQuestion. Use this shape (note: this is a binary CONFIRMATION gate per global rule "regra 2", so neither option needs `(Recomendado)` — but if the agent's verification surfaced a clear winner, the agent MAY mark it):

```
header: "GO/NO-GO"
question: "Aprovar este fix para integração?"
multiSelect: false
options:
  - label: "GO — aprovar e integrar"
    description: <1 line: "Todos os checks passam; X riscos residuais observáveis via Y">
  - label: "NO-GO — bloquear e voltar"
    description: <1 line: "Falha em N: <especificar>; precisa de Z antes de seguir">
  - label: "CONDITIONAL — aprovar com follow-up"
    description: <1 line: "GO mas requer follow-up em N dias para tratar X">
```

(The tool automatically adds "Other" for free text.)

### 8.3 Record final decision

- `go_no_go`: GO | NO-GO | CONDITIONAL.
- `reasons`: list, objective and short.
- If NO-GO: state precisely what is missing to flip to GO.
- If GO or CONDITIONAL: list 1-3 residual risks (if any) and quick observability hooks (logs / metrics) to monitor them post-merge.
- Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7.

## Done criteria

- 5-item checklist completed with PASS/FAIL/INCONCLUSIVE + evidence per item.
- AskUserQuestion invoked (not substituted).
- Final decision recorded with reasons + residual risks + observability hooks.

## Outputs (terminal step — handoff back to caller)

```yaml
go_no_go: <GO | NO-GO | CONDITIONAL>
reasons:
  - <reason 1>
  - <reason 2>
residual_risks:
  - <risk 1 or none>
observability_hooks:
  - <log/metric to watch>
askuserquestion_response: <user's chosen option label>
```

## Skill exit

This is the terminal step (`expected_next: null`). On `GO` or `CONDITIONAL`, the skill returns control to the caller (pipeline-controller or direct invoker) for closeout (commit, push, PR, post-fix monitoring as applicable). On `NO-GO`, the caller is expected to address the blockers and re-enter the workflow at the appropriate step.
