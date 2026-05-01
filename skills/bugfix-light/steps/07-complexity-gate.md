---
step_number: 7
step_name: "complexity-gate"
execution_mode: inline
expected_inputs:
  - risk_signals: from_step_2
  - regression_risk: from_step_3
  - residual_risks: from_step_5
  - duplication_risk: from_step_6
  - persistence_stable: from_step_6
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

Honestly assess whether the bug truly belongs in the light tier, or whether evidence accumulated across steps 1-6 indicates this should escalate to `bugfix-heavy` (which adds Domain Truth Model, Adversarial Review, UX E2E, Pa de Cal with stronger evidence). This is a **mandatory user-facing gate** (`gate_required: true`).

## Why this gate exists

The light tier exists for SIMPLES/MEDIA bugs (≤2 files, ≤~50 lines diff, no cross-cutting concerns). If during analysis (steps 2-6) we discovered:

- High regression risk (step 3).
- Persistence side effects (step 6 → `persistence_stable: false`).
- High duplication risk (step 6 → `duplication_risk: high`).
- Touches business rules / source of truth / multi-user state.
- Repeated execution risk.

then the right answer is to escalate, not to proceed.

## Sentinel checkpoint

This step has a sentinel checkpoint declared in SKILL.md (`sentinel_checkpoints: [pre_7]`). The sentinel-hook validates state coherence before the gate runs (e.g., outputs from steps 1-6 are present).

## Inputs

- `risk_signals` (from step 2)
- `regression_risk` (from step 3)
- `residual_risks` (from step 5)
- `duplication_risk` (from step 6)
- `persistence_stable` (from step 6)

## Instructions

### 7.1 Synthesize the evidence

Briefly summarize for the user (1-3 sentences) what the accumulated risk picture looks like, citing the strongest signals from inputs above. Do NOT minimize; do NOT inflate.

### 7.2 Recommendation

Pick the recommendation based on a deterministic heuristic:

- Recommend `escalate-to-heavy` when ANY of:
  - `regression_risk == high`
  - `persistence_stable == false`
  - `duplication_risk == high`
  - Risk signals mention business rules / source of truth / concurrency / multi-user
- Otherwise recommend `stay-light`.

### 7.3 AskUserQuestion (mandatory — no prose substitute)

Invoke AskUserQuestion. Per global rule "Decisoes do Usuario — AskUserQuestion sempre", the FIRST option is the agent's recommendation labeled `(Recomendado)`. Use this exact shape:

```
header: "Tier"
question: "Manter no tier light ou escalar para bugfix-heavy?"
multiSelect: false
options:
  - label: "<Recomendado label>" (description: <why this is the recommendation, citing top 1-2 signals>)
  - label: "<Alternative label>" (description: <trade-off in plain language>)
```

Where the recommendation shapes the labels:

- If recommending `stay-light`:
  - Option 1: `"Manter light e prosseguir para Pa de Cal (Recomendado)"` — fix is contained, risk picture is benign.
  - Option 2: `"Escalar para bugfix-heavy"` — quero a malha completa (Adversarial Review + UX E2E + Domain Truth Model) mesmo que custe mais tempo.
- If recommending `escalate-to-heavy`:
  - Option 1: `"Escalar para bugfix-heavy (Recomendado)"` — citar signals que justificam (ex: "duplication_risk=high + persistence_stable=false").
  - Option 2: `"Manter light mesmo assim"` — assumir o risco residual; recomendado apenas se há urgência operacional e o risco é aceitável.

The AskUserQuestion tool automatically appends an "Other" option for free text — do NOT add it manually.

### 7.4 Record the decision

After the user answers:

- Record `gate_decision` as `stay-light` or `escalate-to-heavy`.
- Record the user's answer verbatim in `askuserquestion_response`.
- Append the decision to `.pipeline/gate-decisions.jsonl` per enforcement rule 7 (audit log).

### 7.5 Routing

- If `stay-light` → proceed to step 8 (Pa de Cal).
- If `escalate-to-heavy` → STOP this skill. Hand control back. The orchestrator/user invokes `bugfix-heavy` with all collected context. The work done so far (RED test, regression test, invariants, persistence findings) feeds into bugfix-heavy steps 1-3.

## Done criteria

- AskUserQuestion was invoked (not substituted with prose).
- Decision recorded and appended to audit log.
- Routing executed correctly per the decision.

## Outputs (handoff to step 8 OR exit to bugfix-heavy)

```yaml
gate_decision: <stay-light | escalate-to-heavy>
rationale: <1-3 sentences citing signals that drove the recommendation>
askuserquestion_response: <user's chosen option label>
```

## Next

If `stay-light` → `steps/08-pa-de-cal.md`.
If `escalate-to-heavy` → exit skill; reinvoke as `bugfix-heavy` with the accumulated context.
