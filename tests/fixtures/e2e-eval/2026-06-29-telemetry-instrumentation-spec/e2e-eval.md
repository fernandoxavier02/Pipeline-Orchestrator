# E2E Self-Evaluation — 2026-06-29-telemetry-instrumentation-spec

> How faithfully this run executed its intended workflow. Higher score = better. The fix proposals (human-gated) are produced by `/pipeline-orchestrator:self-eval`.

## Score

- **E2E score:** 30 / 100
- **Type / Complexity / Variant:** Spec / COMPLEXA / spec-heavy (workflow: Spec)
- **Glitches found:** 26

### Sub-scores (n/a = not applicable to this workflow; dropped + renormalized)

| Sub-score | Value | Weight |
|-----------|-------|--------|
| StepCompletion | n/a | 0.3 |
| GateCoverage (fidelity) | 0 | 0.3 |
| OrderIntegrity | n/a | 0.15 |
| ProcessHygiene | 0.6667 | 0.25 |

## Glitches

| Kind | Target | Severity | Detail |
|------|--------|----------|--------|
| missing_gate | STATE_FILE_INIT_FAIL | high | mandatory gate 'STATE_FILE_INIT_FAIL' never fired |
| missing_gate | INFO_GATE_BLOCKED | high | mandatory gate 'INFO_GATE_BLOCKED' never fired |
| missing_gate | TDD_APPROVAL | high | mandatory gate 'TDD_APPROVAL' never fired |
| missing_gate | CHECKPOINT_FAIL | high | mandatory gate 'CHECKPOINT_FAIL' never fired |
| missing_gate | COMPLEXITY_GATE | high | mandatory gate 'COMPLEXITY_GATE' never fired |
| missing_gate | CLOSEOUT_CONFIRM | high | mandatory gate 'CLOSEOUT_CONFIRM' never fired |
| missing_gate | PLAN_REJECTED | high | mandatory gate 'PLAN_REJECTED' never fired |
| missing_gate | ADVERSARIAL_GATE | high | mandatory gate 'ADVERSARIAL_GATE' never fired |
| missing_gate | ADVERSARIAL_BLOCK | high | mandatory gate 'ADVERSARIAL_BLOCK' never fired |
| missing_gate | MICRO_GATE_GAP | high | mandatory gate 'MICRO_GATE_GAP' never fired |
| missing_gate | STOP_RULE | high | mandatory gate 'STOP_RULE' never fired |
| missing_gate | ADVERSARIAL_LOOP_BREAKER | high | mandatory gate 'ADVERSARIAL_LOOP_BREAKER' never fired |
| missing_gate | FINAL_ADVERSARIAL_GATE | high | mandatory gate 'FINAL_ADVERSARIAL_GATE' never fired |
| missing_gate | FINAL_ADVERSARIAL_REWORK | high | mandatory gate 'FINAL_ADVERSARIAL_REWORK' never fired |
| missing_gate | FIX_LOOP_EXHAUSTED | high | mandatory gate 'FIX_LOOP_EXHAUSTED' never fired |
| missing_gate | ADVERSARIAL_GATE_MANDATORY | high | mandatory gate 'ADVERSARIAL_GATE_MANDATORY' never fired |
| missing_gate | SSOT_CONFLICT | high | mandatory gate 'SSOT_CONFLICT' never fired |
| missing_gate | STALE_CONTEXT | high | mandatory gate 'STALE_CONTEXT' never fired |
| missing_gate | SPEC_ARTIFACT_MISSING | high | mandatory gate 'SPEC_ARTIFACT_MISSING' never fired |
| missing_gate | SPEC_FORMAT_GATE_FAIL | high | mandatory gate 'SPEC_FORMAT_GATE_FAIL' never fired |
| missing_gate | SPEC_CONTENT_REVIEW_NOGO | high | mandatory gate 'SPEC_CONTENT_REVIEW_NOGO' never fired |
| missing_gate | SPEC_AC_TRACEABILITY_GAP | high | mandatory gate 'SPEC_AC_TRACEABILITY_GAP' never fired |
| missing_gate | SPEC_POST_IMPL_FAIL | high | mandatory gate 'SPEC_POST_IMPL_FAIL' never fired |
| missing_gate | ADVERSARIAL_LOOP_CHECKPOINT | high | mandatory gate 'ADVERSARIAL_LOOP_CHECKPOINT' never fired |
| hygiene_violation | DISPATCH_REQUEST | medium | spec-controller step 1 (explore/clarification); awaiting dispatch results |
| hygiene_violation | DISPATCH_SERVICE | medium | parent dispatching brainstorm-step-01-explore per Achado #7 protocol |

## See Also

- `e2e-eval.json` — machine-readable version of this report
- `fidelity-report.json` — the gate-coverage component
- `.pipeline/eval-log.jsonl` — cross-run evaluation dataset
