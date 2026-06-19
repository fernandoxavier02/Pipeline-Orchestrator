---
step_number: 7
step_name: "complexity-gate"
execution_mode: inline
expected_inputs:
  - blast_radius: from_step_2
  - regression_risk: from_step_2
  - identical_verdict: from_step_6
  - files_touched: from_step_5
expected_outputs:
  - gate_decision: "stay-light | escalate-to-heavy"
  - rationale: string
  - askuserquestion_response: string
expected_next: 8
gate_required: true
allowed_tools: [AskUserQuestion, Read]
---

# Step 07 — Complexity Gate (AskUserQuestion)

## Objective

Honestly assess whether the refactor truly belongs in the light tier, or whether evidence accumulated across steps 1-6 indicates this should escalate to `refactor-heavy` (which adds the final 3-parallel adversarial review, a post-refactor UX user-journey E2E, and an after-all sanity sweep). This is a **mandatory user-facing gate** (`gate_required: true`).

## Why this gate exists

The light tier exists for single-module, contained restructures (≤2 files, ≤~50 lines diff, no cross-module blast radius). If during analysis we discovered:

- Cross-module blast radius (step 2 → `blast_radius: cross-module`).
- High regression risk (step 2 → `regression_risk: high`).
- The restructure touched more files than a contained cleanup should.
- Subtle/implicit invariants that warrant independent adversarial review.

then the right answer is to escalate, not to proceed with light ceremony.

## Inputs

- `blast_radius` (from step 2)
- `regression_risk` (from step 2)
- `identical_verdict` (from step 6) — should be `IDENTICAL` to reach this step
- `files_touched` (from step 5)

## Instructions

### 7.1 Synthesize the evidence

Briefly summarize for the user (1-3 sentences) the accumulated picture: how many files were touched, whether the blast radius stayed single-module, the regression risk, and that the IDENTICAL check passed. Do NOT minimize; do NOT inflate.

### 7.2 Recommendation

Pick the recommendation based on a deterministic heuristic:

- Recommend `escalate-to-heavy` when ANY of:
  - `blast_radius == cross-module`
  - `regression_risk == high`
  - `files_touched` exceeds the light scope (more than ~2 files)
  - Invariants touched were subtle / implicit / cross-cutting
- Otherwise recommend `stay-light`.

### 7.3 AskUserQuestion (mandatory — no prose substitute)

Invoke AskUserQuestion. Per global rule, the FIRST option is the agent's recommendation labeled `(Recomendado)`:

- If recommending `stay-light`:
  - Option 1: `"Manter light e prosseguir para Pa de Cal (Recomendado)"` — restructure is contained, IDENTICAL passed, blast radius single-module.
  - Option 2: `"Escalar para refactor-heavy"` — quero a malha completa (revisão adversarial final + UX E2E pós-refactor + sweep after-all) mesmo custando mais tempo.
- If recommending `escalate-to-heavy`:
  - Option 1: `"Escalar para refactor-heavy (Recomendado)"` — citar signals (ex: "blast_radius=cross-module + regression_risk=high").
  - Option 2: `"Manter light mesmo assim"` — assumir o risco residual; recomendado só se há urgência e o risco é aceitável.

The AskUserQuestion tool automatically appends "Other" — do NOT add it manually.

### 7.4 Record the decision

- Record `gate_decision` as `stay-light` or `escalate-to-heavy`.
- Record the user's answer verbatim in `askuserquestion_response`.
- Append to `.pipeline/gate-decisions.jsonl` per enforcement rule 7.

### 7.5 Routing

- If `stay-light` → proceed to step 8 (Pa de Cal).
- If `escalate-to-heavy` → STOP this skill. Hand control back. The orchestrator/user invokes `refactor-heavy` with all collected context (the signed CHANGE_CONTRACT, the before/after snapshots, the IDENTICAL verdict) feeding into refactor-heavy steps 1-6.

## Done criteria

- AskUserQuestion was invoked (not substituted with prose).
- Decision recorded and appended to audit log.
- Routing executed correctly per the decision.

## Outputs (handoff to step 8 OR exit to refactor-heavy)

```yaml
gate_decision: <stay-light | escalate-to-heavy>
rationale: <1-3 sentences citing the signals that drove the recommendation>
askuserquestion_response: <user's chosen option label>
```

## Next

If `stay-light` → `steps/08-pa-de-cal.md`.
If `escalate-to-heavy` → exit skill; reinvoke as `refactor-heavy` with the accumulated context.
