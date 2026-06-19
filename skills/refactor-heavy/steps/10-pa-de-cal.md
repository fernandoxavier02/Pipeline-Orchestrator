---
step_number: 10
step_name: "pa-de-cal"
execution_mode: inline
expected_inputs:
  - refactor_diff: from_step_5
  - identical_verdict: from_step_6
  - change_contract: from_step_4
  - consolidated_blockers: from_step_8
  - journey_status: from_step_9
expected_outputs:
  - go_no_go: "GO | NO-GO | CONDITIONAL"
  - reasons: list
  - residual_risks: list
  - suggestions: list
  - askuserquestion_response: string
expected_next: 11
gate_required: true
allowed_tools: [AskUserQuestion, Read, Grep, Bash]
---

# Step 10 — Pá de Cal (GO / CONDITIONAL / NO-GO Gate)

## Objective

Final, evidence-based GO / NO-GO decision on the cross-module refactor, synthesizing all prior evidence: the IDENTICAL characterization verdict, the adversarial findings, and the UX journey result. You are the reviewer of last resort, **not** an implementer. Verify behavior preservation and decide. This is a **mandatory user-facing gate** (`gate_required: true`). It is a SUBJECTIVE synthesis — the mechanical after-all verification is the separate step 11.

## Inputs

- `refactor_diff` (from step 5)
- `identical_verdict` (from step 6) — must be IDENTICAL for a clean GO
- `change_contract` (from step 4) — the signed scope
- `consolidated_blockers` (from step 8) — adversarial BLOCKER/MAJOR findings
- `journey_status` (from step 9) — PRESERVED / SHIFTED / N/A

## Instructions

### 10.1 Quick verification (PASS / FAIL / INCONCLUSIVE per item, with evidence)

1. **Behavior preserved** — `identical_verdict` is IDENTICAL. Evidence: before/after snapshots match over the public surface.
2. **Scope respected** — every touched file is within `change_contract.allowed_files` and an in-scope module; no forbidden change in the diff.
3. **Adversarial clean** — `consolidated_blockers` has no unresolved BLOCKER; any MAJOR is either fixed or explicitly accepted as a documented follow-up.
4. **User journey intact** — `journey_status` is PRESERVED or N/A; if SHIFTED, the shift is understood and acceptable (or it is a NO-GO).
5. **Build + tests sanity** — build passes; characterization suite + adjacent tests pass.
6. **Readability improved** — the restructure achieved the step-1 goal (genuinely cleaner across modules).

### 10.2 AskUserQuestion gate (mandatory — no prose substitute)

Binary CONFIRMATION gate (global rule 2), so neither option needs `(Recomendado)` — but mark a clear winner if verification surfaced one:

```
header: "GO/NO-GO"
question: "Aprovar este refactor cross-module para integração?"
multiSelect: false
options:
  - label: "GO — aprovar e integrar"
    description: <1 line: "IDENTICAL confirmado; escopo respeitado; 0 blockers; jornada preservada">
  - label: "NO-GO — bloquear e voltar"
    description: <1 line: "Falha em N: <especificar>; precisa de Z antes de seguir">
  - label: "CONDITIONAL — aprovar com follow-up"
    description: <1 line: "GO mas requer follow-up em N dias para tratar X (MAJOR aceito)">
```

(The tool automatically adds "Other" for free text.)

### 10.3 Record final decision

- `go_no_go`: GO | NO-GO | CONDITIONAL.
- `reasons`: objective and short.
- If NO-GO: state precisely what is missing to flip to GO.
- If GO or CONDITIONAL: list residual risks and deferred collateral-improvement SUGGESTIONS from step 5.
- Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7.

## Done criteria

- 6-item checklist completed with PASS/FAIL/INCONCLUSIVE + evidence per item.
- AskUserQuestion invoked (not substituted).
- Final decision recorded with reasons + residual risks + deferred suggestions.

## Outputs (handoff to step 11)

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

## Next

If `GO` or `CONDITIONAL` → `steps/11-final-validation-after-all.md` (mechanical after-all sweep).
If `NO-GO` → address blockers and re-enter at the appropriate step (typically step 5 for a diff fix, or step 4 to re-scope).
