# Confidence Score Reference

> **SSOT** for the confidence score calculation, persistence format, and advisory thresholds. `commands/pipeline.md` Grep-redirects here. The score is **purely advisory** — binary PASS/FAIL checks in `final-validator` always take precedence over the threshold guidelines below.

---

## Calculation

```yaml
CONFIDENCE:
  current: [0.0 - 1.0]
  breakdown:
    classification_clarity: [0.0-1.0]    # Phase 0a — clear type/complexity?
    info_completeness: [0.0-1.0]         # Phase 0b — all gaps resolved?
    design_alignment: [0.0-1.0 | null]   # Phase 0c — design decisions clear?
    plan_coverage: [0.0-1.0 | null]      # Phase 1.5 — plan covers all requirements?
    tdd_coverage: [0.0-1.0]              # Phase 2 TDD — tests adequate?
    implementation_quality: [0.0-1.0]    # Phase 2 reviews — code quality?
    gate_penalty: [0.0 to -0.5]          # Sum of confidence_impact from skipped gates
    sanity_pass: [0.0 | 1.0]             # Phase 3 — build/tests pass?
  threshold:
    GO: ">= 0.80"
    CONDITIONAL: ">= 0.60"
    NO_GO: "< 0.60"
```

---

## Scoring Rules

1. Each dimension starts at `1.0` (perfect) and is reduced based on issues found
2. All dimension values MUST be clamped to `[0.0, 1.0]` — values outside this range indicate a bug and must be clamped before computation
3. `null` means the dimension was not evaluated (skipped phase) — excluded from the average
4. `gate_penalty` is the sum of all `confidence_impact` values from gate-decisions.jsonl (differentiated: ADVERSARIAL_GATE skip = -0.15, FINAL_ADVERSARIAL_GATE skip = -0.15, CLOSEOUT_CONFIRM skip = -0.05, other SOFT = -0.10)
5. **Formula:** `current` = (sum of non-null dimensions / count of non-null dimensions) + gate_penalty. All dimensions have **equal weight** (1/N where N = count of non-null dimensions). This is an unweighted arithmetic mean plus gate penalty
6. The score is **purely advisory** — it informs the final-validator but does NOT force any decision. The thresholds (>= 0.80, >= 0.60, < 0.60) are **soft guidelines**, not mandatory gates. Binary PASS/FAIL checks always take precedence

---

## Who Updates the Score

- Phase 0a (task-orchestrator): sets `classification_clarity`
- Phase 0b (information-gate): sets `info_completeness`
- Phase 0c (design-interrogator): sets `design_alignment`
- Phase 1.5 (plan-architect): sets `plan_coverage`
- Phase 2 (quality-gate-router): sets `tdd_coverage`
- Phase 2 (review-orchestrator): updates `implementation_quality`
- Phase 3 (sanity-checker): sets `sanity_pass`
- Gate decisions: accumulate `gate_penalty`

---

## Persistence

The confidence score is stored at `{PIPELINE_DOC_PATH}/confidence-score.yaml`. Each agent that updates a dimension overwrites the file with the complete updated object. The `final-validator` reads this file during its pre-decision validation step. If the file does not exist, the confidence score is treated as unavailable (all dimensions = null, score = N/A). Edge case: if the file exists but every dimension is null, treat as N/A — do NOT attempt to compute a divide-by-zero mean.
