---
step_number: 7
step_name: "risk-consolidation"
execution_mode: inline
expected_inputs:
  - blast_radius: from_step_2
  - cross_module_couplings: from_step_2
  - regression_risk: from_step_2
  - identical_verdict: from_step_6
  - files_touched: from_step_5
expected_outputs:
  - adversarial_focus: list
  - residual_risks: list
  - rationale: string
expected_next: 8
gate_required: false
allowed_tools: [Read, Grep]
---

# Step 07 — Risk Consolidation (Complexity / Risk Confirmation, Heavy)

## Objective

Confirm the heavy ceremony is warranted and prepare the focus for the final adversarial review. Unlike the light variant — whose step 7 is an escalate-or-stay AskUserQuestion gate — the heavy variant is already the deepest tier, so there is nowhere to escalate. This step is a non-gated synthesis: it consolidates the risk picture and hands the adversarial trio (step 8) a sharpened focus list. (This is the inline confirmation analogue of bugfix-heavy's pre-adversarial consolidation.)

## Why this is NOT a gate (contrast with light)

In `refactor-light`, step 7 asks the user whether to stay light or escalate to heavy — a real AskUserQuestion gate. In `refactor-heavy` there is no higher tier, so a stay/escalate question would be meaningless; this step does no user-facing prompting. The user-facing gates in this variant are step 4 (REFACTOR_SCOPE_LOCK), step 8 (adversarial), and step 10 (Pa de Cal). Step 7 is `gate_required: false` by design — its job is risk consolidation, not gating, which is why this step is named `risk-consolidation`.

## Inputs

- `blast_radius`, `cross_module_couplings`, `regression_risk` (from step 2)
- `identical_verdict` (from step 6) — should be `IDENTICAL` to reach this step
- `files_touched` (from step 5)

## Instructions

### 7.1 Synthesize the risk picture

Summarize (2-4 sentences): how many files across how many modules were touched, which cross-module couplings the diff sits near, the regression risk, and confirmation that the IDENTICAL check passed. Be honest — this drives where the adversaries look.

### 7.2 Build the adversarial focus list

From the cross-module couplings and the diff, derive the specific angles the step-8 reviewers should probe:
- **Security focus** — any auth/data path the restructure moved through; any logging/error surface that shifted.
- **Architecture focus** — coupling/abstraction-leak risk introduced by moves; layering/dependency-direction after the restructure; SSOT/ordering/transaction couplings from step 2.
- **Quality focus** — readability actually improved? dead code left behind by inlines/moves? test placement still coherent after internal-test moves?

### 7.3 Capture residual risks

List any residual risks the IDENTICAL check cannot catch (e.g., behavior under concurrency not exercised by characterization tests, performance shifts from a move). These feed step 10's Pa de Cal.

## Done criteria

- Risk picture synthesized.
- Adversarial focus list built (security / architecture / quality angles).
- Residual risks captured.

## Outputs (handoff to step 8)

```yaml
adversarial_focus:
  security: [<angle>, ...]
  architecture: [<angle>, ...]
  quality: [<angle>, ...]
residual_risks:
  - <risk the IDENTICAL check cannot catch>
rationale: <2-4 sentence synthesis>
```

## Next

Proceed to `steps/08-adversarial-review.md` (3 parallel adversaries with the focus list).
